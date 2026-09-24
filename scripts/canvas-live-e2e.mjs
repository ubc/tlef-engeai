/**
 * Canvas live end-to-end check — instructor releases, student receives
 *
 * Drives the whole Writing Feedback release path against a real local Canvas, through the app's
 * own UI, and then verifies from the student's side of Canvas that the feedback and the grade
 * actually arrived. Unit tests pin every piece of this; only a run like this proves the pieces
 * are wired to each other and to Canvas.
 *
 * What it does, in order:
 *   1. Creates throwaway Canvas fixtures with the admin API — a course, a teacher whose
 *      `integration_id` matches the local fake instructor's PUID (the app refuses to connect a
 *      Canvas account that is not the signed-in instructor), a student, an assignment, a rubric,
 *      and a text submission made as the student.
 *   2. Connects Canvas OAuth as the instructor, links the Canvas course into EngE-AI, and enables
 *      the Writing Feedback capability.
 *   3. Instructor path through the app's own API, as the signed-in instructor: import the
 *      assignment and its submission, fill the writing profile, approve the rubric, generate
 *      feedback, save the staff-final grade, approve, preview, and release.
 *   4. Verifies in Canvas: the grade, the submission comment, the attached PDF, and the
 *      per-criterion rubric assessment.
 *   5. Student path in the browser: signs in as the student and confirms the grade and the
 *      attached feedback PDF are visible on their own submission page.
 *
 * Everything it creates is synthetic. It never touches a real course, a real student, or a real
 * credential, and it prints no token value.
 *
 * Prerequisites:
 *   - Docker Desktop running (Mongo), the local Canvas stack up on :9100, the app on :8020
 *     started with `SAML_AVAILABLE=false npm run dev`.
 *   - `CANVAS_ADMIN_API_KEY` in `../local-lms-dev/.env`, and Canvas OAuth env in the app `.env`.
 *   - Chromium from the Playwright cache. Never run `npx playwright install` on this machine —
 *     see the browser-pass notes in the session log.
 *
 * Usage (from the repository root):
 *   LD_LIBRARY_PATH=<nss prefix> node scripts/canvas-live-e2e.mjs
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: End-to-end Canvas release check across the instructor and student sides.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const APP = process.env.APP_URL ?? 'http://localhost:8020';
const CANVAS = process.env.CANVAS_URL ?? 'http://localhost:9100';
const CHROME = process.env.CHROMIUM_PATH
    ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1232/chrome-linux64/chrome`;
/**
 * Run id, unique per execution.
 *
 * The course name must differ every run: connecting a Canvas course refuses when EngE-AI already
 * holds an unconnected course of the same name, so a date alone would make the second run of a
 * day fail on its own leftovers.
 */
const STAMP = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Date.now().toString().slice(-5)}`;
const STUDENT_PASSWORD = 'Testing12345!';

/** Reads one key out of a dotenv-style file without pulling in a parser. */
function envValue(path, key) {
    const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
    if (!line) throw new Error(`${key} is missing from ${path}`);
    return line.slice(key.length + 1).trim();
}

/**
 * The infrastructure `.env` sits beside the repository in the workspace, but a git worktree lives
 * three directories deeper, so both positions are tried rather than assuming a checkout shape.
 */
function infrastructureEnv(key) {
    const candidates = [
        resolve(REPO, '../local-lms-dev/.env'),
        resolve(REPO, '../../../../local-lms-dev/.env')
    ];
    for (const path of candidates) {
        try { return envValue(path, key); } catch { /* try the next position */ }
    }
    throw new Error(`${key} not found in any of: ${candidates.join(', ')}`);
}

const ADMIN_KEY = process.env.CANVAS_ADMIN_API_KEY ?? infrastructureEnv('CANVAS_ADMIN_API_KEY');
const INSTRUCTOR_PASSWORD = process.env.FAKE_INSTRUCTOR_PASSWORD
    ?? envValue(resolve(REPO, '.env'), 'FAKE_INSTRUCTOR_PASSWORD');
/** The PUID the local fake instructor signs in with; the Canvas teacher must match it. */
const INSTRUCTOR_PUID = process.env.FAKE_INSTRUCTOR_PUID ?? 'FAKE_INSTRUCTOR_PUID_001';

const results = [];
function check(label, ok, detail = '') {
    results.push({ label, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Canvas admin API. `asUser` masquerades, which is how the student's submission is made. */
async function canvasApi(path, method = 'GET', body, asUser) {
    const url = new URL(`${CANVAS}/api/v1${path}`);
    if (asUser) url.searchParams.set('as_user_id', String(asUser));
    const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(parsed).slice(0, 300)}`);
    return parsed;
}

const rubricCriterion = (description, longDescription, points) => ({
    description,
    long_description: longDescription,
    points,
    ratings: {
        0: { description: 'Excellent', long_description: 'Fully meets the expectation.', points },
        1: { description: 'Proficient', long_description: 'Meets the expectation with minor gaps.', points: Math.round(points * 0.75) },
        2: { description: 'Developing', long_description: 'Partly meets the expectation.', points: Math.round(points * 0.5) },
        3: { description: 'Beginning', long_description: 'Does not yet meet the expectation.', points: Math.round(points * 0.25) }
    }
});

const SUBMISSION_TEXT = [
    'Early in the term our team had to choose between a belt drive and a chain drive for the test rig.',
    'I argued for the belt because the rig runs indoors beside the acoustics bench, and the chain we priced was louder than the noise budget allowed.',
    'The chain was cheaper and easier to service, and one teammate pointed out that our load estimate had a wide margin, so a belt might slip under the worst case.',
    'We resolved it by measuring the actual torque on the bench mock-up rather than arguing from the estimate, and the measured peak sat well inside what the belt could carry.',
    'Looking back, the useful part was not the choice itself but that we stopped arguing from assumptions and spent an afternoon measuring.',
    'If I did it again I would ask for the measurement first, because both of us were confident and only one of us could have been right.'
].join(' ');

/**
 * ensureFixtureTeacher - the Canvas teacher the app will accept as the signed-in instructor.
 *
 * Canvas enforces one account per `integration_id`, and the app will only connect an account
 * whose `integration_id` is the signed-in instructor's PUID. So this teacher is a singleton
 * across runs: reused when it already exists, with its password reset so the run can sign in.
 *
 * @returns The Canvas user, carrying the `login_id` the OAuth step signs in with
 */
async function ensureFixtureTeacher() {
    const login = 'wf.e2e.instructor@example.invalid';
    // Search on the stable prefix: an account created by an earlier run may carry a dated login.
    const found = await canvasApi('/accounts/1/users?search_term=wf.e2e.instructor');
    const existing = Array.isArray(found) ? found[0] : undefined;
    if (existing) {
        // Reused as-is: the admin key cannot reset a login password, and this account was created
        // by an earlier run of this script with the fixture password. If sign-in later fails, the
        // fix is to delete this Canvas user and let the run recreate it.
        const logins = await canvasApi(`/users/${existing.id}/logins`).catch(() => []);
        const primary = Array.isArray(logins) ? logins[0] : undefined;
        return { ...existing, login_id: existing.login_id ?? primary?.unique_id ?? login };
    }
    return canvasApi('/accounts/1/users', 'POST', {
        user: { name: 'E2E Test Instructor', short_name: 'E2E Instructor', terms_of_use: true, skip_registration: true },
        pseudonym: {
            unique_id: login,
            password: STUDENT_PASSWORD,
            integration_id: INSTRUCTOR_PUID,
            send_confirmation: false
        },
        communication_channel: { skip_confirmation: true }
    });
}

/** Step 1: the throwaway Canvas course, people, assignment, rubric, and submission. */
async function seedCanvas() {
    const course = await canvasApi('/accounts/1/courses', 'POST', {
        course: { name: `WF Live E2E ${STAMP}`, course_code: `WFE2E${STAMP}`, is_public: false },
        offer: true
    });
    const teacher = await ensureFixtureTeacher();
    const student = await canvasApi('/accounts/1/users', 'POST', {
        user: { name: 'E2E Test Student', short_name: 'E2E Student', terms_of_use: true, skip_registration: true },
        pseudonym: {
            unique_id: `wf.e2e.student.${STAMP}.${Date.now()}@example.invalid`,
            password: STUDENT_PASSWORD,
            send_confirmation: false
        },
        communication_channel: { skip_confirmation: true }
    });
    for (const [userId, type] of [[teacher.id, 'TeacherEnrollment'], [student.id, 'StudentEnrollment']]) {
        await canvasApi(`/courses/${course.id}/enrollments`, 'POST', {
            enrollment: { user_id: userId, type, enrollment_state: 'active', notify: false }
        });
    }
    const assignment = await canvasApi(`/courses/${course.id}/assignments`, 'POST', {
        assignment: {
            name: 'Reflective design memo (live E2E)',
            description: '<p>Write a 400-word reflective memo about one design decision you made this term, addressed to your project supervisor.</p>',
            submission_types: ['online_text_entry'],
            points_possible: 100,
            grading_type: 'points',
            published: true,
            post_manually: false
        }
    });
    await canvasApi(`/courses/${course.id}/rubrics`, 'POST', {
        rubric: {
            title: 'Reflective memo rubric',
            points_possible: 100,
            free_form_criterion_comments: true,
            criteria: {
                0: rubricCriterion('Organization', 'Stages the memo so a supervisor can follow the decision.', 30),
                1: rubricCriterion('Content', 'Explains the decision, the alternatives, and the evidence.', 40),
                2: rubricCriterion('Interpersonal positioning', 'Addresses the supervisor with appropriate stance.', 30)
            }
        },
        rubric_association: {
            association_id: assignment.id,
            association_type: 'Assignment',
            purpose: 'grading',
            use_for_grading: false
        }
    });
    await canvasApi(`/courses/${course.id}/assignments/${assignment.id}/submissions`, 'POST', {
        submission: { submission_type: 'online_text_entry', body: `<p>${SUBMISSION_TEXT}</p>` }
    }, student.id);

    check('Canvas fixtures created', true, `course ${course.id}, assignment ${assignment.id}, student ${student.id}`);
    return { canvasCourseId: String(course.id), assignmentId: assignment.id, studentId: student.id, teacher, student };
}

/** Signs a page into the app as the local fake instructor. */
async function signInToApp(page) {
    await page.goto(`${APP}/auth/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="username"]', 'instructor');
    await page.fill('input[name="password"]', INSTRUCTOR_PASSWORD);
    await Promise.all([
        page.waitForLoadState('networkidle'),
        page.click('button[type="submit"], input[type="submit"]')
    ]);
}

/** Runs one same-origin request inside the signed-in page, returning status and parsed body. */
function appApi(page) {
    return (path, method = 'GET', body) => page.evaluate(async ([p, m, b]) => {
        const r = await fetch(p, {
            method: m,
            headers: b ? { 'content-type': 'application/json' } : {},
            body: b ? JSON.stringify(b) : undefined
        });
        const t = await r.text();
        try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t.slice(0, 300) }; }
    }, [path, method, body]);
}

/** Step 2: Canvas OAuth, the course link, and the capability. */
async function connectCourse(page, fixtures) {
    await page.goto(`${APP}/api/lms/canvas/auth/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    if (page.url().startsWith(CANVAS) && await page.locator('#pseudonym_session_unique_id').count()) {
        await page.fill('#pseudonym_session_unique_id', fixtures.teacher.login_id);
        await page.fill('#pseudonym_session_password', STUDENT_PASSWORD);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('button[type="submit"], input[type="submit"]')
        ]);
        await page.waitForTimeout(1200);
    }
    const authorize = page.locator('button:has-text("Authorize"), input[value="Authorize"]').first();
    if (await authorize.count()) {
        await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}), authorize.click()]);
        await page.waitForTimeout(2000);
    }
    const api = appApi(page);
    const courses = await api('/api/lms/canvas/courses');
    check('Canvas OAuth connected', courses.status === 200 && Array.isArray(courses.body),
        `${Array.isArray(courses.body) ? courses.body.length : 0} Canvas courses visible`);

    const linked = await api('/api/lms/canvas/connect-course', 'POST', { canvasCourseId: fixtures.canvasCourseId });
    const courseId = linked.body?.courseId;
    check('Canvas course linked into EngE-AI', linked.status === 200 && Boolean(courseId),
        courseId ?? JSON.stringify(linked.body).slice(0, 200));
    // Everything after this addresses the course by id, so a failure here can only produce
    // confusing downstream failures. Stop with the reason Canvas or the app gave.
    if (!courseId) throw new Error(`Course link failed: ${JSON.stringify(linked.body).slice(0, 300)}`);

    // A freshly connected course is not set up, and every instructor page redirects into the
    // setup wizard until it is. The workspace is unreachable otherwise.
    await completeCourseSetup(page, courseId);

    const enabled = await api(`/api/courses/${courseId}/features/writing-feedback`, 'PATCH', { enabled: true });
    check('Writing Feedback enabled for the course', enabled.status === 200);

    const context = await api(`/api/courses/${courseId}/writing-feedback/workspace-context`);
    check('Workspace reports live Canvas', context.body?.data?.canvas?.integration === 'canvas',
        context.body?.data?.canvas?.mode);
    return courseId;
}

/**
 * completeCourseSetup - marks the freshly connected course as set up.
 *
 * Uses the same endpoint the setup wizard posts to, rather than clicking through five wizard
 * screens: the wizard has its own coverage, and what this check is about starts afterwards. The
 * structure choices are the wizard's own defaults, and Writing Feedback is enabled here because
 * the wizard's feature checkboxes default to off.
 *
 * @param page - The signed-in instructor page
 * @param courseId - EngE-AI course id just connected from Canvas
 */
async function completeCourseSetup(page, courseId) {
    const api = appApi(page);
    const done = await api(`/api/courses/${courseId}/complete-course-setup`, 'POST', {
        frameType: 'byWeek',
        tilesNumber: 12,
        features: { writingFeedback: { enabled: true } }
    });
    check('Course setup completed', done.status === 200,
        done.status === 200 ? 'byWeek, 12 sections' : JSON.stringify(done.body).slice(0, 200));
}

/**
 * Steps 3a–3b go through the app's HTTP API, like the steps that follow.
 *
 * Driving the workspace's own controls was tried first and proved timing-bound: the
 * course-summary modal opens over the page on its own schedule, and a run that dismisses it a
 * moment too early or too late stalls on an invisible button. What this check exists to prove is
 * the Canvas round trip, not the workspace's click targets, which the design-guard and source
 * tests already cover and which were driven by hand when this script was written.
 */

/** Step 3a: import the Canvas assignment and its submission. */
async function importFromCanvas(page, courseId) {
    const api = appApi(page);
    const listed = await api(`/api/courses/${courseId}/writing-feedback/canvas/assignments`);
    const target = (listed.body?.data ?? []).find((a) => /live E2E/.test(a.title ?? a.name ?? ''));
    check('Canvas assignment visible to the workspace', Boolean(target),
        target ? `${target.title ?? target.name}` : JSON.stringify(listed.body).slice(0, 200));
    if (!target) throw new Error('The Canvas assignment was not listed for import');

    const imported = await api(`/api/courses/${courseId}/writing-feedback/canvas/import`, 'POST', {
        canvasAssignmentId: String(target.canvasAssignmentId ?? target.id)
    });
    // A new assignment answers 201 and an existing one 200; both are successful imports.
    const summary = imported.body?.data ?? {};
    const created = summary.importedCount ?? 0;
    check('Canvas assignment and submission imported', [200, 201].includes(imported.status) && created >= 1,
        `imported ${created}, skipped ${summary.skippedCount ?? 0}, rubric ${summary.rubricImport ?? '—'}`);
}

/**
 * Step 3b: complete the writing profile from the assignment instructions, then approve.
 *
 * The profile is filled by the same auto-fill the rubric page offers rather than typed in, so a
 * broken proposal surfaces here instead of at generation, where it would read as a model failure.
 */
async function approveRubric(page, courseId) {
    const api = appApi(page);
    const assignments = await api(`/api/courses/${courseId}/writing-feedback/assignments`);
    const assignment = (assignments.body?.data ?? []).find((a) => /live E2E/.test(a.title));
    if (!assignment) throw new Error('The imported assignment is missing');

    const filled = await api(`/api/courses/${courseId}/writing-feedback/assignments/${assignment.id}/rubric-draft/fill`, 'POST', {});
    check('Writing profile auto-filled', filled.status === 200,
        filled.status === 200 ? '' : JSON.stringify(filled.body).slice(0, 200));

    const approved = await api(`/api/courses/${courseId}/writing-feedback/assignments/${assignment.id}/rubric-draft/approve`, 'POST', {});
    check('Rubric approved', approved.status === 200,
        approved.status === 200 ? `v${approved.body?.data?.rubric?.version ?? '?'}` : JSON.stringify(approved.body).slice(0, 200));
}

/**
 * requireSubmissionId - the single imported submission this run works on.
 *
 * @param api - Bound app API caller
 * @param courseId - EngE-AI course id
 * @returns The submission's id and its assignment's id
 */
async function requireSubmissionId(api, courseId) {
    const assignments = await api(`/api/courses/${courseId}/writing-feedback/assignments`);
    const assignment = (assignments.body?.data ?? []).find((a) => /live E2E/.test(a.title));
    if (!assignment) throw new Error('The imported assignment is missing');
    const submissions = await api(
        `/api/courses/${courseId}/writing-feedback/submissions?assignmentId=${encodeURIComponent(assignment.id)}`
    );
    const submission = (submissions.body?.data ?? [])[0];
    if (!submission) throw new Error('The imported submission is missing');
    return { assignmentId: assignment.id, submissionId: submission.id, assignment };
}

/**
 * Steps 3c–3e run through the app's own HTTP API rather than its controls.
 *
 * The instructor UI for review, grading, approval and release is covered by the design-guard and
 * source tests, and was driven by hand during the session that added this script. What is not
 * covered anywhere else is the sequence itself against a live Canvas — generate, grade, approve,
 * preview, queue, and the worker's write — so that is what this drives, without depending on
 * selectors that shift whenever the review page is restyled.
 */

/** Step 3c: generate the feedback draft and wait for the run to land. */
async function generateFeedback(page, courseId) {
    const api = appApi(page);
    const { submissionId } = await requireSubmissionId(api, courseId);
    // Generation is retried once. A draft can fail for a reason that says nothing about the
    // release path this check exists to prove: the evidence guard rejects the run when the
    // model's SFL analysis quotes text that is not an exact substring of the verified
    // submission, which is the guard working, and which the next attempt usually clears.
    let status = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const queued = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}/generate`, 'POST', {});
        if (queued.status !== 202) {
            check('Feedback draft generated', false, JSON.stringify(queued.body).slice(0, 200));
            return submissionId;
        }
        for (let i = 0; i < 40; i += 1) {
            await page.waitForTimeout(5000);
            const detail = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}`);
            status = detail.body?.data?.submission?.status ?? '';
            if (status === 'draft_ready' || status === 'failed') break;
        }
        if (status === 'draft_ready') break;
    }
    check('Feedback draft generated', status === 'draft_ready', `status ${status || 'unknown'}`);
    return submissionId;
}

/**
 * Step 3d: save the staff-final grade and approve.
 *
 * The grade is 80% of each criterion's weight — a number a marker could plausibly award, and one
 * that sits inside no single rating band, which is exactly the case that decides whether Canvas
 * gets points without a highlighted cell.
 */
async function gradeAndApprove(page, courseId, submissionId) {
    const api = appApi(page);
    const detail = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}`);
    const run = detail.body?.data?.feedbackRun;
    const { assignment } = await requireSubmissionId(api, courseId);
    const rubric = assignment.rubric;
    const criteria = (rubric?.criteria ?? [])
        .filter((criterion) => typeof criterion.points === 'number' && criterion.points > 0)
        .map((criterion) => ({ criterionId: criterion.id, points: Math.round(criterion.points * 0.8) }));
    const total = criteria.reduce((sum, entry) => sum + entry.points, 0);

    const saved = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}/reviews`, 'POST', {
        feedbackRunId: run?.id,
        studentFeedback: 'Staff-reviewed feedback released by the live end-to-end check.',
        finalAssessment: { rubricVersion: rubric.version, criteria }
    });
    // A review revision is appended, so the route answers 201.
    check('Staff-final grade saved', saved.status === 201,
        saved.status === 201 ? `total ${total}` : JSON.stringify(saved.body).slice(0, 200));

    const approved = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}/approve`, 'POST', {});
    check('Feedback approved', approved.status === 200,
        approved.status === 200 ? '' : JSON.stringify(approved.body).slice(0, 200));
    return total;
}

/** Step 3e: preview, then release through the job queue, polling until Canvas confirms. */
async function release(page, courseId, submissionId) {
    const api = appApi(page);
    const preview = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}/release-preview`, 'POST', {});
    check('Live release preflight succeeded', preview.status === 200,
        preview.status === 200 ? `grade ${preview.body?.data?.grade}` : JSON.stringify(preview.body).slice(0, 200));

    const queued = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}/release`, 'POST', {});
    check('Release accepted for the queue', queued.status === 202, `job ${queued.body?.data?.jobId ?? '—'}`);

    let state = '';
    let jobError = '';
    for (let i = 0; i < 30; i += 1) {
        await page.waitForTimeout(3000);
        const status = await api(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}/release-status`);
        state = status.body?.data?.release?.status ?? '';
        jobError = status.body?.data?.jobError ?? '';
        if (state === 'released' || state === 'reconciled' || state === 'reconciliation_required') break;
        if (status.body?.data?.jobState === 'failed') break;
    }
    check('Queued release reached Canvas', state === 'released' || state === 'reconciled',
        `release ${state || 'unknown'}${jobError ? `, job error: ${jobError}` : ''}`);
}

/** Step 4: what actually reached Canvas. */
async function verifyCanvas(fixtures, expectedTotal) {
    const submission = await canvasApi(
        `/courses/${fixtures.canvasCourseId}/assignments/${fixtures.assignmentId}/submissions/${fixtures.studentId}`
        + '?include[]=submission_comments&include[]=rubric_assessment'
    );
    check('Canvas grade matches the staff-final total', Number(submission.score) === expectedTotal,
        `score ${submission.score}, state ${submission.workflow_state}`);

    const comments = submission.submission_comments ?? [];
    const attachment = comments.flatMap((c) => c.attachments ?? []).find((a) => /\.pdf$/i.test(a.display_name ?? ''));
    check('Feedback PDF attached to the submission comment', Boolean(attachment),
        attachment ? `${attachment.display_name}, ${attachment.size} bytes` : 'no PDF found');

    const assessment = submission.rubric_assessment ?? {};
    const scored = Object.values(assessment).filter((entry) => typeof entry?.points === 'number');
    check('Per-criterion rubric assessment written', scored.length > 0,
        scored.map((entry) => entry.points).join(' + '));
    return attachment;
}

/** Step 5: the student's own view of the release. */
async function verifyStudent(browser, fixtures, expectedTotal) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${CANVAS}/login/canvas`, { waitUntil: 'domcontentloaded' });
    await page.fill('#pseudonym_session_unique_id', fixtures.student.login_id);
    await page.fill('#pseudonym_session_password', STUDENT_PASSWORD);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('button[type="submit"], input[type="submit"]')
    ]);
    await page.goto(
        `${CANVAS}/courses/${fixtures.canvasCourseId}/assignments/${fixtures.assignmentId}/submissions/${fixtures.studentId}`,
        { waitUntil: 'networkidle' }
    );
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    check('Student sees the grade', text.includes(`${expectedTotal} / 100`),
        text.split('\n').find((l) => /Grade:/.test(l))?.trim());
    check('Student sees the attached feedback PDF', /writing-feedback-complete\.pdf/.test(text));
    await context.close();
}

(async () => {
    const fixtures = await seedCanvas();
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await signInToApp(page);
        const courseId = await connectCourse(page, fixtures);
        await importFromCanvas(page, courseId);
        await approveRubric(page, courseId);
        const submissionId = await generateFeedback(page, courseId);
        const total = await gradeAndApprove(page, courseId, submissionId);
        await release(page, courseId, submissionId);
        await verifyCanvas(fixtures, total);
        await verifyStudent(browser, fixtures, total);
    } finally {
        await browser.close();
    }
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})().catch((error) => {
    console.error('E2E run failed:', error.message);
    process.exit(1);
});
