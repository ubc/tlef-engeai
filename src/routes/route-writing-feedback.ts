/**
 * Writing Feedback routes — staff-only HTTP boundary for the review workspace.
 *
 * Applies course RBAC and capability gates before coordinating assignment,
 * rubric, submission, PDF, Canvas-demo, approval, and release services.
 * Persistence and domain decisions remain in the Mongo delegate and services.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Course-scoped Writing Feedback API endpoints and safe request validation.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { requireCourseFeatureAPI, requireInstructorForCourseAPI, requireRosterManageAPI } from '../middleware/require-course-role';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { LocalDocumentExtractionService } from '../writing-feedback/document-extraction-service';
import { WritingFeedbackService } from '../writing-feedback/writing-feedback-service';
import { MockCanvasGateway, SafeCanvasReleaseService } from '../writing-feedback/canvas-release-service';
import type { WritingSourceType } from '../writing-feedback/contracts';
import { SafeCanvasImportService } from '../writing-feedback/canvas-import-service';
import { anchoredCommentsInputSchema } from '../writing-feedback/anchored-comments';
import {
    approveRubricDraft,
    buildRubricDraft,
    gradeMappingFromApprovedRubric,
    writingRubricDraftInputSchema
} from '../writing-feedback/rubric-schema';
import { canManageCourseRoster } from '../utils/course-staff';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_TEXT_CHARS = 30000;

function courseId(req: Request): string { return String(req.params.courseId); }
function cleanText(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Text is required');
    const text = value.replace(/\u0000/g, '').trim();
    if (!text) throw new Error('Text cannot be blank');
    if (text.length > MAX_TEXT_CHARS) throw new Error('Text exceeds the 30,000-character review limit');
    return text;
}
function cleanId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
    return value.trim().slice(0, 160);
}
function safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Writing feedback request failed';
    const safePrefixes = [
        'Text is required', 'Text cannot be blank', 'Text exceeds', 'Unsupported digital file type',
        'A file is required', 'assignmentId is required', 'studentId is required', 'canvasAssignmentId is required',
        'Writing assignment not found', 'Writing submission not found', 'Staff must verify',
        'Verified submission text is required', 'Feedback evidence did not match',
        'Generate feedback before', 'Staff approval is required', 'Numeric release is blocked',
        'A draft-ready submission is required', 'Released feedback cannot be edited',
        'Canvas import is not configured', 'Canvas release is not configured', 'Canvas demo assignment not found',
        'An approved rubric is required', 'Rubric changed after feedback generation',
        'Generate feedback before staff approval',
        'Feedback comments no longer match', 'Feedback comments failed validation',
        'Assignment title is required', 'Assignment deadline is invalid'
    ];
    return safePrefixes.some((prefix) => message.startsWith(prefix))
        ? message
        : 'Writing feedback request could not be completed.';
}

// Authorize course staff before checking capability state; feature flags never grant access.
router.use(
    '/:courseId/writing-feedback',
    requireInstructorForCourseAPI(['params']),
    requireCourseFeatureAPI('writingFeedback', ['params'])
);

router.get('/:courseId/writing-feedback/assignments', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const [assignments, counts] = await Promise.all([
        mongo.listWritingAssignments(courseId(req)),
        mongo.countWritingSubmissionsByAssignment(courseId(req))
    ]);
    res.json({
        success: true,
        data: assignments.map((assignment) => ({ ...assignment, submissionCount: counts[assignment.id] ?? 0 }))
    });
}));

router.post(
    '/:courseId/writing-feedback/assignments',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
            if (!title || title.length > 200) throw new Error('Assignment title is required and must be at most 200 characters');
            let dueAt: Date | undefined;
            if (req.body?.dueAt !== undefined && req.body?.dueAt !== null && req.body?.dueAt !== '') {
                const parsed = new Date(String(req.body.dueAt));
                if (Number.isNaN(parsed.getTime())) throw new Error('Assignment deadline is invalid');
                dueAt = parsed;
            }
            const mongo = await EngEAI_MongoDB.getInstance();
            const assignment = await mongo.createManualWritingAssignment(courseId(req), title, dueAt);
            res.status(201).json({ success: true, data: assignment });
        } catch (error) {
            res.status(400).json({ success: false, error: safeError(error) });
        }
    })
);

router.get('/:courseId/writing-feedback/workspace-context', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const currentCourse = await mongo.getActiveCourse(courseId(req));
    const globalUser = (req.session as any).globalUser;
    const canvas = await new SafeCanvasImportService(mongo).getStatus();
    res.json({
        success: true,
        data: {
            permissions: { canManageRubric: Boolean(currentCourse && canManageCourseRoster(currentCourse, globalUser)) },
            canvas
        }
    });
}));

router.get('/:courseId/writing-feedback/canvas/status', asyncHandlerWithAuth(async (_req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    res.json({ success: true, data: await new SafeCanvasImportService(mongo).getStatus() });
}));

router.get('/:courseId/writing-feedback/canvas/assignments', asyncHandlerWithAuth(async (_req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    res.json({ success: true, data: await new SafeCanvasImportService(mongo).listAssignments() });
}));

router.get('/:courseId/writing-feedback/canvas/assignments/:canvasAssignmentId/preview', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const preview = await new SafeCanvasImportService(mongo).previewAssignment(String(req.params.canvasAssignmentId));
        res.json({ success: true, data: preview });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/canvas/import', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const canvasAssignmentId = cleanId(req.body?.canvasAssignmentId, 'canvasAssignmentId');
        const mongo = await EngEAI_MongoDB.getInstance();
        const service = new SafeCanvasImportService(mongo);

        // Preview through the configured safe gateway before creating any local records.
        const preview = await service.previewAssignment(canvasAssignmentId);

        // Reuse the Canvas mapping when present so repeated imports remain assignment-idempotent.
        const existing = await mongo.getWritingAssignmentByCanvasId(courseId(req), canvasAssignmentId);
        const target = existing ?? await mongo.createCanvasWritingAssignment(
            courseId(req),
            canvasAssignmentId,
            preview.assignment.title,
            preview.assignment.dueAt ? new Date(preview.assignment.dueAt) : undefined
        );

        // Import local submission records only; this operation performs no Canvas write-back.
        const result = await service.importAssignment({
            courseId: courseId(req),
            targetAssignmentId: target.id,
            canvasAssignmentId
        });
        res.status(existing ? 200 : 201).json({
            success: true,
            data: { ...result, targetAssignment: target, rubricImport: 'not_imported' }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.get('/:courseId/writing-feedback/assignments/:assignmentId/rubric', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
    if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
    const currentCourse = await mongo.getActiveCourse(courseId(req));
    const globalUser = (req.session as any).globalUser;
    res.json({
        success: true,
        data: {
            approved: assignment.rubric,
            draft: assignment.rubricDraft,
            history: assignment.rubricHistory ?? [],
            permissions: { canEdit: Boolean(currentCourse && canManageCourseRoster(currentCourse, globalUser)) }
        }
    });
}));

router.put(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const parsed = writingRubricDraftInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: `Rubric validation failed: ${parsed.error.issues[0]?.message ?? 'check the required fields'}`
            });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        const globalUser = (req.session as any).globalUser;
        const version = assignment.rubricDraft?.version ?? assignment.rubric.version + 1;
        const draft = buildRubricDraft(parsed.data, version, globalUser.userId);

        // Saving is deliberately separate from approval and does not change the active rubric.
        const updated = await mongo.saveWritingRubricDraft(courseId(req), assignment.id, draft);
        res.json({ success: true, data: updated });
    })
);

router.delete(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const updated = await mongo.discardWritingRubricDraft(courseId(req), String(req.params.assignmentId));
        if (!updated) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        res.json({ success: true, data: updated });
    })
);

router.post(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/approve',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        if (!assignment.rubricDraft) {
            return res.status(409).json({ success: false, error: 'Save a rubric draft before approval' });
        }
        const globalUser = (req.session as any).globalUser;

        // Promote only the persisted draft version; the delegate rejects concurrent rubric changes.
        const approved = approveRubricDraft(assignment.rubricDraft, globalUser.userId);
        const updated = await mongo.approveWritingRubricDraft(
            courseId(req),
            assignment.id,
            approved,
            gradeMappingFromApprovedRubric(approved)
        );
        if (!updated) {
            return res.status(409).json({ success: false, error: 'The rubric changed while you were editing. Reload and try again.' });
        }
        res.json({ success: true, data: updated });
    })
);

router.delete('/:courseId/writing-feedback/assignments/:assignmentId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const { deleted, submissionCount } = await mongo.deleteWritingAssignment(courseId(req), String(req.params.assignmentId));
    if (deleted) return res.json({ success: true });
    if (submissionCount > 0) {
        return res.status(409).json({ success: false, error: 'Delete submissions before deleting this assignment' });
    }
    res.status(404).json({ success: false, error: 'Writing assignment not found' });
}));

/**
 * Creates a clearly labelled synthetic Canvas-text submission for local MVP
 * review. It never contacts Canvas and never represents a real student.
 */
router.post('/:courseId/writing-feedback/assignments/:assignmentId/canvas-import-fixture', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const result = await new SafeCanvasImportService(mongo).importAssignment({
        courseId: courseId(req),
        targetAssignmentId: String(req.params.assignmentId),
        canvasAssignmentId: 'demo-lled200-a2-description'
    });
    res.status(result.importedCount ? 201 : 200).json({ success: true, data: result, integration: 'mock_canvas' });
}));

router.get('/:courseId/writing-feedback/submissions', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const assignmentId = cleanId(req.query.assignmentId, 'assignmentId');
        const mongo = await EngEAI_MongoDB.getInstance();
        const submissions = await mongo.listWritingSubmissions(courseId(req), assignmentId);
        res.json({ success: true, data: submissions });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.get('/:courseId/writing-feedback/submissions/:submissionId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const detail = await new WritingFeedbackService(mongo).detail(courseId(req), String(req.params.submissionId));
        res.json({ success: true, data: detail });
    } catch (error) {
        const message = safeError(error);
        res.status(message === 'Writing submission not found' ? 404 : 400).json({ success: false, error: message });
    }
}));

router.delete('/:courseId/writing-feedback/submissions/:submissionId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const deleted = await mongo.deleteWritingSubmission(courseId(req), String(req.params.submissionId));
    if (!deleted) return res.status(404).json({ success: false, error: 'Writing submission not found' });
    res.json({ success: true });
}));

router.post('/:courseId/writing-feedback/submissions', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const assignmentId = cleanId(req.body?.assignmentId, 'assignmentId');
        const studentId = cleanId(req.body?.studentId, 'studentId');
        const originalText = cleanText(req.body?.text);
        const attempt = Number.isInteger(req.body?.attempt) && req.body.attempt > 0 ? req.body.attempt : 1;
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), assignmentId);
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        const submission = await mongo.createWritingSubmission({
            courseId: courseId(req), assignmentId, studentId,
            studentLabel: typeof req.body?.studentLabel === 'string' ? req.body.studentLabel.slice(0, 100) : undefined,
            attempt, sourceType: 'manual', originalText, verifiedText: originalText,
            requiresVerification: false, status: 'imported'
        });
        res.status(201).json({ success: true, data: submission });
    } catch (error) {
        const message = safeError(error);
        res.status(message.includes('duplicate') ? 409 : 400).json({ success: false, error: message });
    }
}));

router.post('/:courseId/writing-feedback/submissions/file', upload.single('file'), asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        if (!req.file) throw new Error('A file is required');
        const assignmentId = cleanId(req.body?.assignmentId, 'assignmentId');
        const studentId = cleanId(req.body?.studentId, 'studentId');

        // Extract locally without entering the course-material RAG/Qdrant ingestion path.
        const extraction = await new LocalDocumentExtractionService().extract({ buffer: req.file.buffer, fileName: req.file.originalname });
        const originalText = cleanText(extraction.text);
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), assignmentId);
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        const submission = await mongo.createWritingSubmission({
            courseId: courseId(req), assignmentId, studentId,
            studentLabel: typeof req.body?.studentLabel === 'string' ? req.body.studentLabel.slice(0, 100) : undefined,
            attempt: Number.isInteger(Number(req.body?.attempt)) && Number(req.body.attempt) > 0 ? Number(req.body.attempt) : 1,
            sourceType: 'digital_file' as WritingSourceType,
            originalText,
            requiresVerification: true,
            status: 'verification_needed'
        });
        res.status(201).json({ success: true, data: submission });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/verify', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const result = await mongo.updateVerifiedWritingText(courseId(req), String(req.params.submissionId), cleanText(req.body?.verifiedText));
        if (!result) return res.status(404).json({ success: false, error: 'Writing submission not found' });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/generate', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const result = await new WritingFeedbackService(mongo).generate(courseId(req), String(req.params.submissionId));
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/reviews', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const studentFeedback = cleanText(req.body?.studentFeedback);
        const feedbackRunId = cleanId(req.body?.feedbackRunId, 'feedbackRunId');
        let comments;

        // Validate every optional text anchor before appending the immutable staff revision.
        if (req.body?.comments !== undefined) {
            const parsedComments = anchoredCommentsInputSchema.safeParse(req.body.comments);
            if (!parsedComments.success) {
                return res.status(400).json({
                    success: false,
                    error: `Feedback comments failed validation: ${parsedComments.error.issues[0]?.message ?? 'check the comment fields'}`
                });
            }
            comments = parsedComments.data;
        }
        const globalUser = (req.session as any).globalUser;
        const mongo = await EngEAI_MongoDB.getInstance();
        const revision = await new WritingFeedbackService(mongo).appendReview(courseId(req), String(req.params.submissionId), {
            feedbackRunId,
            staffUserId: globalUser.userId,
            studentFeedback,
            internalNote: typeof req.body?.internalNote === 'string' ? req.body.internalNote.slice(0, 4000) : undefined,
            comments
        });
        res.status(201).json({ success: true, data: revision });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/approve', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const globalUser = (req.session as any).globalUser;
    try {
        const updated = await new WritingFeedbackService(mongo).approve(
            courseId(req),
            String(req.params.submissionId),
            globalUser.userId,
            globalUser.name
        );
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(409).json({ success: false, error: safeError(error) });
    }
}));

router.get('/:courseId/writing-feedback/submissions/:submissionId/feedback.pdf', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();

        // Legacy `specific` (pre-annotated flat comment list) maps to the annotated document.
        const rawInclude = req.query.include === 'specific' ? 'annotated' : req.query.include;
        const include = rawInclude === 'annotated' || rawInclude === 'both' ? rawInclude : 'general';
        const pdf = await new WritingFeedbackService(mongo).renderPdf(courseId(req), String(req.params.submissionId), include);
        const filename = include === 'annotated' ? 'writing-feedback-annotated.pdf'
            : include === 'both' ? 'writing-feedback-complete.pdf'
            : 'writing-feedback.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdf);
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

function releaseService(mongo: EngEAI_MongoDB): SafeCanvasReleaseService {
    // Bind release persistence to payload fingerprints so retries reconcile instead of duplicating.
    return new SafeCanvasReleaseService(
        new MockCanvasGateway(),
        (fingerprint) => mongo.findWritingReleaseByFingerprint(fingerprint),
        (release) => mongo.createWritingRelease(release),
        (fingerprint, update) => mongo.finalizeWritingRelease(fingerprint, update)
    );
}

router.post('/:courseId/writing-feedback/submissions/:submissionId/release-preview', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();

        // Keep demo and future live Canvas modes technically distinct before preparing a payload.
        const canvasStatus = await new SafeCanvasImportService(mongo).getStatus();
        if (!canvasStatus.canImport || canvasStatus.integration !== 'mock_canvas') {
            throw new Error('Canvas release is not configured');
        }
        const release = await new WritingFeedbackService(mongo).previewRelease(courseId(req), String(req.params.submissionId), releaseService(mongo));
        res.json({ success: true, data: release, integration: 'mock_canvas' });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/release', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();

        // Refuse external-style release unless the explicitly labelled local mock is active.
        const canvasStatus = await new SafeCanvasImportService(mongo).getStatus();
        if (!canvasStatus.canImport || canvasStatus.integration !== 'mock_canvas') {
            throw new Error('Canvas release is not configured');
        }
        const release = await new WritingFeedbackService(mongo).release(courseId(req), String(req.params.submissionId), releaseService(mongo));
        res.json({ success: true, data: release, integration: 'mock_canvas' });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

/**
 * Course-scoped Writing Feedback router.
 *
 * Mount under `/api/courses`; its shared prefix middleware guarantees staff
 * authorization followed by explicit course-capability authorization.
 */
export default router;
