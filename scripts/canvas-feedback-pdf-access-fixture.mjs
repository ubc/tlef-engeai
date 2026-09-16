#!/usr/bin/env node
/**
 * Creates a local Canvas fixture for checking Writing Feedback PDF attachment access.
 *
 * The script creates a synthetic Canvas course, student, assignment, and submission, then attaches
 * a small annotated PDF to the submission comment. It prints the throwaway student login details
 * and verifies the attachment downloads as PDF bytes from the configured Canvas URL.
 *
 * Usage:
 *   npm run canvas:feedback-pdf-fixture
 *
 * Optional environment:
 *   CANVAS_URL=http://localhost:9100
 *   CANVAS_ADMIN_API_KEY=...
 *   CANVAS_FIXTURE_STUDENT_PASSWORD=...
 */

import PDFDocument from 'pdfkit';
import { createWriteStream, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CANVAS = (process.env.CANVAS_URL ?? 'http://localhost:9100').replace(/\/$/, '');
const STUDENT_PASSWORD = process.env.CANVAS_FIXTURE_STUDENT_PASSWORD ?? 'CanvasTest123!';
const PDF_FILENAME = 'enge-ai-feedback-annotated.pdf';

function parseEnv(path) {
    const env = {};
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        env[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return env;
}

function infrastructureEnv(key) {
    if (process.env[key]) return process.env[key];
    const candidates = [
        resolve(REPO, '../local-lms-dev/.env'),
        resolve(REPO, '../../../../local-lms-dev/.env')
    ];
    for (const path of candidates) {
        try {
            const value = parseEnv(path)[key];
            if (value) return value;
        } catch {
            // Try the next checkout shape.
        }
    }
    throw new Error(`${key} not found in the environment or local-lms-dev/.env`);
}

const ADMIN_KEY = infrastructureEnv('CANVAS_ADMIN_API_KEY');

function form(params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            for (const item of value) body.append(key, item);
        } else if (value !== undefined && value !== null) {
            body.append(key, String(value));
        }
    }
    return body;
}

async function canvasApi(method, endpoint, bodyParams) {
    const response = await fetch(`${CANVAS}${endpoint}`, {
        method,
        headers: {
            Authorization: `Bearer ${ADMIN_KEY}`,
            ...(bodyParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
        },
        body: bodyParams ? form(bodyParams) : undefined
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* leave parsed null */ }
    if (!response.ok) {
        throw new Error(`${method} ${endpoint} -> ${response.status}: ${text.slice(0, 500)}`);
    }
    return parsed;
}

function wireUrlForCanvas(target) {
    const requested = new URL(target, CANVAS);
    const local = new URL(CANVAS);
    if (requested.origin === local.origin) {
        return { url: requested, headers: {} };
    }
    return {
        url: new URL(`${requested.pathname}${requested.search}`, local),
        headers: { Host: requested.host }
    };
}

async function generateAnnotatedPdf(path) {
    await new Promise((resolvePromise, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 72 });
        const stream = createWriteStream(path);
        stream.on('finish', resolvePromise);
        stream.on('error', reject);
        doc.on('error', reject);
        doc.pipe(stream);

        doc.fontSize(16).text('EngE-AI synthetic feedback PDF');
        doc.moveDown();
        doc.fontSize(11).text(
            'This synthetic feedback file contains PDF annotations so local Canvas file access can be checked without using DocViewer.',
            { width: 460 }
        );
        const y = 176;
        doc.moveDown(2);
        doc.text('Hover or open the note annotation beside this highlighted feedback sentence.', 72, y);
        doc.highlight(72, y, 330, 18);
        doc.note(420, y - 2, 20, 20, 'Synthetic annotation popup for local Canvas access testing.');
        doc.end();
    });

    const data = readFileSync(path);
    if (data.subarray(0, 5).toString() !== '%PDF-' || !data.includes(Buffer.from('/Annot'))) {
        throw new Error('Generated PDF fixture is missing the PDF signature or annotation object.');
    }
    return data;
}

async function uploadCommentFile(courseId, assignmentId, userId, attempt, pdfData) {
    const ticket = await canvasApi(
        'POST',
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}/comments/files`,
        {
            name: PDF_FILENAME,
            size: pdfData.length,
            content_type: 'application/pdf'
        }
    );

    const destination = wireUrlForCanvas(ticket.upload_url);
    const uploadForm = new FormData();
    for (const [key, value] of Object.entries(ticket.upload_params ?? {})) {
        uploadForm.append(key, String(value));
    }
    uploadForm.append('file', new Blob([pdfData], { type: 'application/pdf' }), PDF_FILENAME);

    const uploadResponse = await fetch(destination.url, {
        method: 'POST',
        headers: destination.headers,
        body: uploadForm,
        redirect: 'manual'
    });
    const location = uploadResponse.headers.get('location');
    if (![200, 201, 301, 302, 303].includes(uploadResponse.status)) {
        throw new Error(`upload bytes -> ${uploadResponse.status}: ${(await uploadResponse.text()).slice(0, 500)}`);
    }

    let fileRecord;
    if (location) {
        const confirm = wireUrlForCanvas(location);
        const confirmResponse = await fetch(confirm.url, {
            headers: {
                Authorization: `Bearer ${ADMIN_KEY}`,
                ...confirm.headers
            }
        });
        const confirmText = await confirmResponse.text();
        if (!confirmResponse.ok) {
            throw new Error(`confirm upload -> ${confirmResponse.status}: ${confirmText.slice(0, 500)}`);
        }
        fileRecord = JSON.parse(confirmText);
    } else {
        fileRecord = await uploadResponse.json();
    }

    const fileId = String(fileRecord.id ?? fileRecord.attachment?.id ?? '');
    if (!fileId) throw new Error('Canvas upload did not return a file id.');

    await canvasApi('PUT', `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`, {
        'comment[text_comment]': 'Synthetic EngE-AI feedback PDF attached for local access testing.',
        'comment[file_ids][]': fileId,
        'comment[attempt]': attempt
    });
    return fileId;
}

async function verifyPdfDownload(url) {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${ADMIN_KEY}` },
        redirect: 'follow'
    });
    const data = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
        throw new Error(`feedback PDF download -> ${response.status}: ${data.toString('utf8', 0, 300)}`);
    }
    if (data.subarray(0, 5).toString() !== '%PDF-') {
        throw new Error(`feedback PDF download did not return PDF bytes; content-type=${response.headers.get('content-type') ?? ''}`);
    }
    return {
        contentType: response.headers.get('content-type') ?? '',
        bytes: data.length,
        annotationsPresent: data.includes(Buffer.from('/Annot'))
    };
}

async function main() {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const pdfPath = join(tmpdir(), `engeai-feedback-pdf-fixture-${stamp}.pdf`);
    const pdfData = await generateAnnotatedPdf(pdfPath);
    const studentLogin = `engeai_pdf_student_${stamp}@example.com`;

    const course = await canvasApi('POST', '/api/v1/accounts/1/courses', {
        'course[name]': `EngE-AI PDF Access Test ${stamp}`,
        'course[course_code]': `PDF-${stamp}`,
        offer: 'true'
    });
    const student = await canvasApi('POST', '/api/v1/accounts/1/users', {
        'user[name]': 'EngE-AI PDF Test Student',
        'pseudonym[unique_id]': studentLogin,
        'pseudonym[password]': STUDENT_PASSWORD,
        'pseudonym[send_confirmation]': '0',
        'communication_channel[type]': 'email',
        'communication_channel[address]': studentLogin,
        'communication_channel[skip_confirmation]': '1'
    });
    await canvasApi('POST', `/api/v1/courses/${course.id}/enrollments`, {
        'enrollment[user_id]': student.id,
        'enrollment[type]': 'StudentEnrollment',
        'enrollment[enrollment_state]': 'active'
    });
    await canvasApi('POST', `/api/v1/courses/${course.id}/enrollments`, {
        'enrollment[user_id]': 1,
        'enrollment[type]': 'TeacherEnrollment',
        'enrollment[enrollment_state]': 'active'
    });

    const assignment = await canvasApi('POST', `/api/v1/courses/${course.id}/assignments`, {
        'assignment[name]': `EngE-AI PDF Feedback Test ${stamp}`,
        'assignment[published]': 'true',
        'assignment[points_possible]': '10',
        'assignment[submission_types][]': 'online_text_entry'
    });
    await canvasApi('POST', `/api/v1/courses/${course.id}/assignments/${assignment.id}/submissions?as_user_id=${student.id}`, {
        'submission[submission_type]': 'online_text_entry',
        'submission[body]': '<p>This is a synthetic student submission for testing Canvas feedback PDF access.</p>'
    });

    const submission = await canvasApi(
        'GET',
        `/api/v1/courses/${course.id}/assignments/${assignment.id}/submissions/${student.id}?include[]=submission_comments`
    );
    const attempt = submission.attempt || 1;
    const fileId = await uploadCommentFile(course.id, assignment.id, student.id, attempt, pdfData);
    const after = await canvasApi(
        'GET',
        `/api/v1/courses/${course.id}/assignments/${assignment.id}/submissions/${student.id}?include[]=submission_comments`
    );
    const latestComment = (after.submission_comments ?? []).at(-1) ?? {};
    const attachment = (latestComment.attachments ?? []).find((item) => String(item.id) === fileId)
        ?? latestComment.attachments?.[0]
        ?? {};
    const attachmentUrl = attachment.url ?? `${CANVAS}/files/${fileId}/download?download_frd=1`;
    const download = await verifyPdfDownload(attachmentUrl);

    console.log(JSON.stringify({
        canvasLoginUrl: `${CANVAS}/login/canvas`,
        canvasAssignmentUrl: `${CANVAS}/courses/${course.id}/assignments/${assignment.id}`,
        canvasSubmissionUrl: `${CANVAS}/courses/${course.id}/assignments/${assignment.id}/submissions/${student.id}`,
        studentLogin,
        studentPassword: STUDENT_PASSWORD,
        courseId: String(course.id),
        assignmentId: String(assignment.id),
        studentCanvasUserId: String(student.id),
        submissionAttempt: String(attempt),
        feedbackFileId: fileId,
        attachmentUrl,
        attachmentDisplayName: attachment.display_name ?? attachment.filename ?? null,
        generatedPdfPath: pdfPath,
        downloadVerification: download
    }, null, 2));
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
