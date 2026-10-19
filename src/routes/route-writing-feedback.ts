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

import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler, asyncHandlerWithAuth } from '../middleware/async-handler';
import { requireCourseFeatureAPI, requireInstructorForCourseAPI } from '../middleware/require-course-role';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { LocalDocumentExtractionService } from '../writing-feedback/sources/document-extraction-service';
import { listPublishedCourseMaterialTitles } from '../writing-feedback/materials/course-material-catalog';
import {
    APPROVE_WHILE_GENERATING_MESSAGE,
    REDRAFT_NOT_DRAFT_READY_MESSAGE,
    REVIEW_WHILE_GENERATING_MESSAGE,
    WritingFeedbackService
} from '../writing-feedback/service/writing-feedback-service';
import { BATCH_ERRORS, WritingBatchGenerationService } from '../writing-feedback/generation/batch-generation';
import { summaryEditsInputSchema } from '../writing-feedback/review/summary-edits';
import { SUMMARY_REDRAFT_FAILED_MESSAGE } from '../writing-feedback/generation/summary-redraft-engine';
import { MockCanvasGateway, SafeCanvasReleaseService } from '../writing-feedback/release/canvas-release-service';
import type { CanvasRubricRow, WritingSourceType } from '../writing-feedback/contracts';
import { SafeCanvasImportService } from '../writing-feedback/canvas/canvas-import-service';
import {
    isLiveCanvasCourse,
    resolveCanvasCourseId,
    resolveCanvasImportService,
    resolveCanvasImportStatus
} from '../writing-feedback/canvas/canvas-import-resolver';
import { LiveCanvasReleaseService } from '../writing-feedback/release/live-canvas-release-service';
import { REPLACEMENT_CONFLICTS, REPLACEMENT_ERRORS, SubmissionReplacementService } from '../writing-feedback/intake/submission-replacement';
import type { CanvasReleaseService } from '../writing-feedback/contracts';
import { canvasConfig, resolveUserKey } from '../lms/canvas-config';
import { ensureCanvasIdentityVerified } from '../lms/canvas-identity-once';
import { handleCanvasIdentityError } from '../lms/canvas-identity-response';
import { canvas as canvasProvider } from '@ubc/ubc-genai-toolkit-lms-integration';
import { anchoredCommentsInputSchema } from '../writing-feedback/review/anchored-comments';
import { staffAssessmentDraftInputSchema, staffFinalAssessmentInputSchema } from '../writing-feedback/review/staff-final-assessment';
import {
    approveRubricDraft,
    assertRetiredIdsNotReused,
    buildRubricDraft,
    gradeMappingFromApprovedRubric,
    requireCompleteRubricCells,
    rubricContentEquals,
    writingRubricDraftInputSchema
} from '../writing-feedback/rubric/rubric-schema';
import { requireCompleteSflProfile } from '../writing-feedback/language/sfl-analysis';
import { listCriterionLibrary } from '../writing-feedback/rubric/criterion-library';
import { isCourseStaff } from '../utils/course-staff';
import { parseLens, rubricGridSource, selectRubric, storedGridSource } from '../writing-feedback/rubric/rubric-lens';
import { seedRubricForLens } from '../writing-feedback/rubric/rubric-seed';
import {
    AssignmentTypeService,
    CHOOSE_TYPE_BEFORE_APPROVAL_MESSAGE,
    assignmentTypeErrorStatus,
    isAssignmentTypeChoice
} from '../writing-feedback/rubric/assignment-type';
import { mapCanvasRubric } from '../writing-feedback/canvas/canvas-rubric-mapping';
import {
    autofillMergeRules,
    gridSourceForStored,
    mergeAutofill,
    proposeRubricFromInstructions,
    type RubricGridSource
} from '../writing-feedback/rubric/rubric-autofill';
import type { ImportedRubricShape, WritingFeedbackLens, WritingRubricDefinition } from '../writing-feedback/contracts';
import { ModelSelectionService } from '../dashboard-setting/model-selection-service';
import { RELEASE_REFUSAL_PREFIXES } from '../writing-feedback/release/release-refusals';
import {
    RUBRIC_SOURCE_ERRORS,
    gradedGridState,
    isSourceChange,
    parseRubricSourceChoice,
    gridSourceKind,
    seedGrid,
    withGrid,
    type RubricSourceChoice
} from '../writing-feedback/rubric/rubric-source-choice';
import {
    convertExtractedRubric,
    extractRubricsFromMaterial,
    type ExtractedRubricRefusal
} from '../writing-feedback/sources/source-rubric-extraction';
import { suggestScale } from '../writing-feedback/rubric/rubric-scale-presets';
import {
    countProposedCells,
    proposeCellDescriptions,
    type ProposalContext,
    type ProposalTargets
} from '../writing-feedback/rubric/rubric-cell-proposals';
import type { RubricProvenanceUpdate } from '../db/mongo/writing-feedback-mongo';
import { gradedLensFor } from '../writing-feedback/review/staff-final-assessment';
import {
    type AutofillSource,
    AUTOFILL_SOURCE_ERRORS,
    MAX_AUTOFILL_SOURCE_CHARS,
    composeAutofillMaterial,
    listAutofillSources,
    selectAutofillSources
} from '../writing-feedback/sources/autofill-sources';
import {
    MAX_SOURCE_MATERIALS,
    SOURCE_MATERIAL_ERRORS,
    editedSourceText,
    extractPastedSource,
    extractSourceFile
} from '../writing-feedback/sources/source-material-extraction';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
/**
 * Source material arrives as multipart for both files and pastes: HTML copied from Word can
 * run to megabytes, past the app-wide JSON body limit, and this keeps its own limit.
 */
const sourceMaterialUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, fieldSize: 2 * 1024 * 1024, files: 1, fields: 4 }
});
/**
 * Proposes descriptions for rows a rubric's source left undescribed, and says what happened.
 * A failed proposal leaves the rows empty with a note, never the whole fill.
 */
async function describeRows(
    shape: ImportedRubricShape,
    targets: ProposalTargets,
    context: ProposalContext
): Promise<{ shape: ImportedRubricShape; notes: string[] }> {
    if (!targets.cells.length && !targets.descriptions.length) return { shape, notes: [] };
    const missing = [targets.descriptions.length ? 'criterion' : '', targets.cells.length ? 'rating' : '']
        .filter(Boolean).join(' and ');
    try {
        const result = await proposeCellDescriptions(shape, targets, context);
        return {
            shape: result.shape,
            notes: result.proposed
                ? [`EngE-AI suggested the ${missing} descriptions this rubric did not give; they are marked "Suggested". Check each one before approving.`]
                : [`This rubric gives no ${missing} descriptions. Write them in the grid before approving.`]
        };
    } catch {
        return { shape, notes: [`EngE-AI could not suggest ${missing} descriptions this time. Write them in the grid, or extract the assignment details again.`] };
    }
}

/** The draft with every suggestion marker cleared, as approval records it. */
function withProposalsAccepted(draft: WritingRubricDefinition): WritingRubricDefinition {
    return {
        ...draft,
        criteria: draft.criteria.map(({ descriptionOrigin: _descriptionOrigin, ...criterion }) => (criterion.cells
            ? {
                ...criterion,
                cells: Object.fromEntries(Object.entries(criterion.cells).map(([levelId, cell]) => [
                    levelId,
                    cell.origin === 'proposed' ? (({ origin: _origin, ...rest }) => rest)(cell) : cell
                ]))
            }
            : criterion))
    };
}

/** What a fill did to the graded grid, as the rubric page reports it. */
type FillGridOutcome = 'unchanged' | 'applied' | 'needs_confirmation' | 'needs_decision' | 'not_found' | 'refused' | 'failed';

/** Why a rubric found in staff material could not become a grid, in words staff can act on. */
function extractedRubricRefusalMessage(refusal: ExtractedRubricRefusal | undefined, label: string): string {
    switch (refusal) {
        case 'too_many_criteria':
            return `The rubric in ${label} has more than 10 criteria, more than a rubric grid can hold. The grid is unchanged.`;
        case 'too_many_levels':
            return `The rubric in ${label} has more than 8 levels, more than a rubric grid can hold. The grid is unchanged.`;
        default:
            return `The rubric in ${label} has no criteria to build a grid from. The grid is unchanged.`;
    }
}

/** Shown when switching the grid's source would bring back a criterion an approved version retired. */
const GRID_REUSES_RETIRED_IDS = 'This grid uses a criterion or level name that an earlier approved version of this rubric removed, so it cannot replace the current grid. Edit the grid by hand instead.';
/** Shown when an uploaded file is valid in type but the parser cannot read it. */
const SOURCE_FILE_UNREADABLE = 'This file could not be read. Check that it opens, or paste its text instead.';
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
function cleanOptionalText(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new Error(`${field} must be text`);
    const text = value.replace(/\u0000/g, '').trim();
    if (!text) return undefined;
    if (text.length > MAX_TEXT_CHARS) throw new Error(`${field} exceeds the 30,000-character limit`);
    return text;
}
function cleanBoundedText(value: unknown, field: string, max: number): string {
    if (typeof value !== 'string') throw new Error(`${field} is required`);
    const text = value.replace(/\u0000/g, '').trim();
    if (!text) throw new Error(`${field} is required`);
    if (text.length > max) throw new Error(`${field} exceeds the ${max}-character limit`);
    return text;
}
function isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null
        && 'code' in error
        && (error as { code?: unknown }).code === 11000;
}
/** Shown when manual intake would give a student a second submission for one assignment. */
const DUPLICATE_STUDENT_SUBMISSION = 'This student already has a submission for this assignment';

function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
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
        'Canvas import is not configured', 'Canvas release is not configured',
        'Canvas assignment not found', 'Canvas demo assignment not found',
        'Canvas assignment uses anonymous grading', 'Canvas release is not available',
        'Canvas release requires', 'Canvas assignment points do not match',
        'Canvas returned inconsistent posting policy', 'Preview this exact Canvas release',
        'Preview the release again', 'Canvas release preview expired',
        'Canvas release requires reconciliation', 'Canvas feedback attachment failed',
        'This submission was not imported from Canvas', 'This submission\'s feedback has already been released',
        'Preview this release before sending it to Canvas', 'Canvas returned an uncertain result',
        'Canvas has a newer submission attempt',
        'Canvas returned a different submission', 'Final grading',
        'An approved rubric is required', 'Rubric changed after feedback generation',
        'Generate feedback before staff approval',
        'Feedback comments no longer match', 'Feedback comments failed validation',
        'Assignment title is required', 'Assignment deadline is invalid',
        'Assignment instructions must be text', 'Assignment instructions exceeds',
        'Complete the genre and register profile', 'Confirm the genre and register profile',
        'Add at least one section', 'Add task requirements',
        'Complete the rubric grid before approving', 'Give every criterion its points',
        // The rubric-cell gate's refusals, which staff have to be able to read and act on.
        'Fill each criterion\'s ratings from the weakest upwards', 'Give every criterion at least',
        'Describe every rating you have given points to',
        'Glossary term is required', 'Glossary definition is required',
        'Glossary term exceeds', 'Glossary definition exceeds',
        'The assignment type has already been chosen', 'Only a lab report has a technical rubric',
        'Choose the assignment type before approving',
        'The summary can only be redrafted before approval', 'The summary changed since you opened it',
        'Summary edits failed validation', 'The summary could not be updated from your annotations',
        'This assignment is not linked to Canvas', DUPLICATE_STUDENT_SUBMISSION, 'decision must be',
        ...Object.values(SOURCE_MATERIAL_ERRORS), SOURCE_FILE_UNREADABLE,
        REVIEW_WHILE_GENERATING_MESSAGE, APPROVE_WHILE_GENERATING_MESSAGE,
        ...Object.values(REPLACEMENT_ERRORS),
        ...Object.values(BATCH_ERRORS),
        ...RELEASE_REFUSAL_PREFIXES
    ];
    return safePrefixes.some((prefix) => message.startsWith(prefix))
        ? message
        : 'Writing feedback request could not be completed.';
}

/**
 * Attaches an authenticated Canvas client, but only for a course that came from Canvas.
 *
 * A course with no `lmsLink` has nothing to read from Canvas, so demanding a Canvas
 * authorization for it would block the local demo workflow behind an OAuth flow that could not
 * help. A linked course does reach the package's `requireAuth`, which responds `401` with a
 * `connectUrl` the workspace turns into a "Connect Canvas" action — deliberately not a silent
 * fallback to synthetic data, which would look like the course's real submissions.
 *
 * Once the client is attached, the connected Canvas account must be the signed-in staff member's.
 * That is checked at most once per connection (`lms/canvas-identity-once.ts`); a refusal answers
 * `403` with its reason. The stored connection is kept even on a mismatch, because roster sync
 * for courses this person imported runs under it; reconnecting replaces it.
 *
 * Uses the plain `asyncHandler`, not the auth variant: the router-level guards below already
 * establish staff access, and the auth variant would re-run the scheduled-publish sweep on
 * every Canvas call in the workspace.
 */
const requireCanvasAuth = canvasConfig ? canvasProvider.requireAuth(canvasConfig) : null;
const withCanvasClientWhenLinked = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    if (!requireCanvasAuth || !(await isLiveCanvasCourse(mongo, courseId(req)))) {
        return next();
    }
    return requireCanvasAuth(req, res, ((error?: unknown) => {
        if (error) return next(error);
        void verifyConnectedCanvasAccount(req, res, next, mongo);
    }) as NextFunction);
});

/** Runs the once-per-connection Canvas identity check, answering a refusal itself. */
async function verifyConnectedCanvasAccount(req: Request, res: Response, next: NextFunction, mongo: EngEAI_MongoDB): Promise<void> {
    try {
        await ensureCanvasIdentityVerified({
            api: (req as any).canvasApi,
            mongo,
            userKey: await resolveUserKey(req),
            courseId: courseId(req),
            // isLiveCanvasCourse already found the link, so the course id is present.
            canvasCourseId: (await resolveCanvasCourseId(mongo, courseId(req)))!
        });
        next();
    } catch (error) {
        if (await handleCanvasIdentityError(error, req, res)) return;
        next(error);
    }
}

// Authorize course staff before checking capability state; feature flags never grant access.
//
// This router-level pair is the complete authorization for every Writing Feedback
// route. `requireInstructorForCourseAPI` resolves to `isCourseStaff`, so instructors,
// platform admins, and teaching assistants all pass. Per D-049 teaching assistants
// have full workspace parity here — assignments, rubrics, review, approval, release —
// so no route layers a narrower guard on top. Enabling or disabling the capability for
// a course is course settings rather than feature operation and remains
// instructor/admin, enforced where that toggle lives, not here.
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
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
            if (!title || title.length > 200) throw new Error('Assignment title is required and must be at most 200 characters');
            const instructions = cleanOptionalText(req.body?.instructions, 'Assignment instructions');
            let dueAt: Date | undefined;
            if (req.body?.dueAt !== undefined && req.body?.dueAt !== null && req.body?.dueAt !== '') {
                const parsed = new Date(String(req.body.dueAt));
                if (Number.isNaN(parsed.getTime())) throw new Error('Assignment deadline is invalid');
                dueAt = parsed;
            }
            const mongo = await EngEAI_MongoDB.getInstance();
            const assignment = await mongo.createManualWritingAssignment(courseId(req), title, instructions, dueAt);
            res.status(201).json({ success: true, data: assignment });
        } catch (error) {
            res.status(400).json({ success: false, error: safeError(error) });
        }
    })
);

router.post(
    '/:courseId/writing-feedback/instructions/extract',
    upload.single('file'),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            if (!req.file) throw new Error('A file is required');
            const extracted = await new LocalDocumentExtractionService().extract({
                buffer: req.file.buffer,
                fileName: req.file.originalname
            });
            res.json({ success: true, data: { text: cleanText(extracted.text), fileName: extracted.fileName } });
        } catch (error) {
            res.status(400).json({ success: false, error: safeError(error) });
        }
    })
);

/**
 * Accepts one source-material upload, answering multer's own limit errors in words staff can act on.
 */
function acceptSourceMaterial(req: Request, res: Response, next: NextFunction): void {
    sourceMaterialUpload.single('file')(req, res, (error?: unknown) => {
        if (error instanceof multer.MulterError) {
            res.status(400).json({
                success: false,
                error: error.code === 'LIMIT_FILE_SIZE'
                    ? 'This file is larger than 10 MB. Upload a smaller file, or paste the relevant part.'
                    : 'This paste is too large. Paste only the instructions and the rubric, or upload the file instead.'
            });
            return;
        }
        next(error as Error | undefined);
    });
}

/** A multipart text field, or undefined when absent or not text. */
function optionalField(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/**
 * Lists the instructor material (uploaded files and pastes) held for an assignment, with the
 * text extracted from each.
 */
router.get(
    '/:courseId/writing-feedback/assignments/:assignmentId/source-materials',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        const materials = await mongo.listWritingSourceMaterials(courseId(req), assignment.id);
        res.json({ success: true, data: materials });
    })
);

/**
 * Adds one source material to an assignment: an uploaded `file`, or a paste sent as `text`
 * with the clipboard's `html` when the browser supplied it. Tables are kept wherever the source
 * had them. Material that is empty, too long, or over the per-assignment count is refused
 * rather than cut. The text is instructor material; it is never logged or sent to the RAG index.
 */
router.post(
    '/:courseId/writing-feedback/assignments/:assignmentId/source-materials',
    acceptSourceMaterial,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const mongo = await EngEAI_MongoDB.getInstance();
            const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
            if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });

            // Step 1: extract, keeping the parser's own failures out of the response.
            let extracted: { text: string; hasTables: boolean; fileName?: string };
            if (req.file) {
                const file = req.file;
                extracted = await extractSourceFile({ buffer: file.buffer, fileName: file.originalname })
                    .catch((error: unknown) => {
                        const known = Object.values(SOURCE_MATERIAL_ERRORS) as string[];
                        throw error instanceof Error && known.includes(error.message) ? error : new Error(SOURCE_FILE_UNREADABLE);
                    });
            } else {
                extracted = extractPastedSource({ text: optionalField(req.body?.text), html: optionalField(req.body?.html) });
            }

            // Step 2: store it, unless the assignment already holds the maximum.
            const globalUser = (req.session as any).globalUser;
            const material = await mongo.addWritingSourceMaterial({
                courseId: courseId(req),
                assignmentId: assignment.id,
                kind: req.file ? 'file' : 'paste',
                ...(extracted.fileName ? { fileName: extracted.fileName } : {}),
                text: extracted.text,
                hasTables: extracted.hasTables,
                addedBy: globalUser.userId
            }, MAX_SOURCE_MATERIALS);
            if (!material) return res.status(409).json({ success: false, error: SOURCE_MATERIAL_ERRORS.tooMany });
            res.status(201).json({ success: true, data: material });
        } catch (error) {
            res.status(400).json({ success: false, error: safeError(error) });
        }
    })
);

/**
 * Replaces one source material's text with staff's corrections, sent as a multipart `text`
 * field so a full-length correction is not cut off by the JSON body limit. The corrected text
 * is held to the same limits as new material. Like all material text, it is never logged.
 */
router.patch(
    '/:courseId/writing-feedback/assignments/:assignmentId/source-materials/:materialId',
    (req: Request, res: Response, next: NextFunction) => {
        sourceMaterialUpload.none()(req, res, (error?: unknown) => {
            if (error instanceof multer.MulterError) {
                res.status(400).json({ success: false, error: SOURCE_MATERIAL_ERRORS.tooLong });
                return;
            }
            next(error as Error | undefined);
        });
    },
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const text = optionalField(req.body?.text) ?? '';
        if (!text.trim()) {
            return res.status(400).json({ success: false, error: 'The text cannot be empty. To stop using this material, remove it instead.' });
        }
        let edited: { text: string; hasTables: boolean };
        try {
            edited = editedSourceText(text);
        } catch (error) {
            return res.status(400).json({ success: false, error: safeError(error) });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const globalUser = (req.session as any).globalUser;
        const material = await mongo.updateWritingSourceMaterialText(
            courseId(req),
            String(req.params.assignmentId),
            String(req.params.materialId),
            { ...edited, editedBy: globalUser.userId }
        );
        if (!material) return res.status(404).json({ success: false, error: 'Source material not found' });
        res.json({ success: true, data: material });
    })
);

/** Removes one source material from an assignment. */
router.delete(
    '/:courseId/writing-feedback/assignments/:assignmentId/source-materials/:materialId',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const removed = await mongo.deleteWritingSourceMaterial(
            courseId(req),
            String(req.params.assignmentId),
            String(req.params.materialId)
        );
        if (!removed) return res.status(404).json({ success: false, error: 'Source material not found' });
        res.json({ success: true });
    })
);

router.get('/:courseId/writing-feedback/workspace-context', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const currentCourse = await mongo.getActiveCourse(courseId(req));
    const globalUser = (req.session as any).globalUser;
    const canvas = await resolveCanvasImportStatus(req, mongo, courseId(req));
    res.json({
        success: true,
        data: {
            permissions: { canManageRubric: Boolean(currentCourse && isCourseStaff(currentCourse, globalUser)) },
            canvas
        }
    });
}));

/**
 * Published course materials staff may name on an annotation.
 *
 * @route GET /api/courses/:courseId/writing-feedback/course-materials
 * @returns {CourseMaterialTitle[]} Titles in course order; no excerpt text, no file names
 * @response 200 - Pickable titles, empty when the course has published none
 */
router.get('/:courseId/writing-feedback/course-materials', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const course = await mongo.getActiveCourse(courseId(req));
    res.json({ success: true, data: listPublishedCourseMaterialTitles(course) });
}));

router.get('/:courseId/writing-feedback/glossary', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 120) : undefined;
    res.json({ success: true, data: await mongo.listWritingGlossaryEntries(courseId(req), search) });
}));

router.post('/:courseId/writing-feedback/glossary', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        const mongo = await EngEAI_MongoDB.getInstance();
        const entry = await mongo.createWritingGlossaryEntry({
            courseId: courseId(req),
            term: cleanBoundedText(req.body?.term, 'Glossary term', 80),
            definition: cleanBoundedText(req.body?.definition, 'Glossary definition', 600),
            actorUserId: globalUser.userId
        });
        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        res.status(isDuplicateKey(error) ? 409 : 400).json({
            success: false,
            error: isDuplicateKey(error)
                ? 'A glossary entry for that term already exists'
                : safeError(error)
        });
    }
}));

router.put('/:courseId/writing-feedback/glossary/:entryId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const expectedVersion = Number(req.body?.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return res.status(400).json({ success: false, error: 'A glossary version is required' });
        }
        if (req.body?.confirmDefinitionChange !== true) {
            return res.status(409).json({
                success: false,
                error: 'Confirm glossary definition changes before updating',
                needsConfirmation: true
            });
        }
        const globalUser = (req.session as any).globalUser;
        const mongo = await EngEAI_MongoDB.getInstance();
        const updated = await mongo.updateWritingGlossaryEntry(
            courseId(req),
            String(req.params.entryId),
            {
                term: cleanBoundedText(req.body?.term, 'Glossary term', 80),
                definition: cleanBoundedText(req.body?.definition, 'Glossary definition', 600),
                expectedVersion,
                actorUserId: globalUser.userId
            }
        );
        if (!updated) {
            return res.status(409).json({ success: false, error: 'The glossary entry changed while you were editing. Reload and try again.' });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(isDuplicateKey(error) ? 409 : 400).json({
            success: false,
            error: isDuplicateKey(error)
                ? 'A glossary entry for that term already exists'
                : safeError(error)
        });
    }
}));

// Status must never require a Canvas credential: it is what tells the workspace to offer one.
router.get('/:courseId/writing-feedback/canvas/status', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    res.json({ success: true, data: await resolveCanvasImportStatus(req, mongo, courseId(req)) });
}));

router.get('/:courseId/writing-feedback/canvas/assignments', withCanvasClientWhenLinked, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const service = await resolveCanvasImportService(req, mongo, courseId(req));
    res.json({ success: true, data: await service.listAssignments() });
}));

router.get('/:courseId/writing-feedback/canvas/assignments/:canvasAssignmentId/preview', withCanvasClientWhenLinked, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const service = await resolveCanvasImportService(req, mongo, courseId(req));
        const preview = await service.previewAssignment(String(req.params.canvasAssignmentId));
        // Preview is staff-facing but must not ship raw source internals to the browser:
        // attachment download URLs are Canvas-authenticated and the record key is an
        // ephemeral identity input, neither of which the UI has any use for.
        res.json({
            success: true,
            data: {
                assignment: preview.assignment,
                submissions: preview.submissions.map((submission) => ({
                    studentLabel: submission.studentLabel,
                    attempt: submission.attempt,
                    submittedAt: submission.submittedAt,
                    contentKind: submission.contentKind,
                    attachmentNames: submission.attachments.map((attachment) => attachment.fileName),
                    synthetic: submission.synthetic
                }))
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/canvas/import', withCanvasClientWhenLinked, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const canvasAssignmentId = cleanId(req.body?.canvasAssignmentId, 'canvasAssignmentId');
        const mongo = await EngEAI_MongoDB.getInstance();
        const service = await resolveCanvasImportService(req, mongo, courseId(req));

        // Preview through the configured safe gateway before creating any local records.
        const preview = await service.previewAssignment(canvasAssignmentId);

        // The rubric is read before the assignment exists because it seeds that assignment's
        // first draft rather than sitting beside it. A rubric Canvas cannot express within the
        // grid contract maps to null, and the built-in profile seeds the draft instead.
        const context = await service.loadAssignmentContext(canvasAssignmentId);
        const mapping = mapCanvasRubric(context?.rubric);
        const seedGrid = mapping.shape ?? undefined;

        // The assignment brief is what becomes the local assignment instructions, and the
        // two gateways carry it in different places: the demo gateway puts it on the summary,
        // while the live one reads Canvas\u2019s rich-editor HTML in loadAssignmentContext and
        // returns it already converted to plain text. Preferring the converted text means a
        // live import arrives with instructions rather than an empty field \u2014 without them
        // auto-fill refuses outright, since it has nothing to propose a rubric from.
        const importedInstructions = context?.details?.descriptionText?.trim()
            || preview.assignment.description?.trim()
            || undefined;

        // Reuse the Canvas mapping when present so repeated imports remain assignment-idempotent.
        const existing = await mongo.getWritingAssignmentByCanvasId(courseId(req), canvasAssignmentId);
        const target = existing ?? await mongo.createCanvasWritingAssignment(
            courseId(req),
            canvasAssignmentId,
            preview.assignment.title,
            importedInstructions,
            preview.assignment.dueAt ? new Date(preview.assignment.dueAt) : undefined,
            seedGrid,
            mapping.refusal,
            mapping.ids,
            mapping.shortened
        );

        // The brief is stored whether or not the assignment is new: an instructor who edited it
        // in Canvas expects a re-import to bring the current text across.
        if (context?.details) {
            await mongo.saveCanvasAssignmentDetails(courseId(req), target.id, context.details);
        }

        // Import local submission records only; this operation performs no Canvas write-back.
        const result = await service.importAssignment({
            courseId: courseId(req),
            targetAssignmentId: target.id,
            canvasAssignmentId
        });
        // Re-read: the brief was written after the assignment was fetched or created.
        const imported = await mongo.getWritingAssignment(courseId(req), target.id) ?? target;
        res.status(existing ? 200 : 201).json({
            success: true,
            data: {
                ...result,
                targetAssignment: imported,
                /*
                 * How the Canvas rubric was treated. `seeded_draft` means it became this
                 * assignment's unapproved rubric draft and still needs staff approval before it
                 * can reach the model. `unrepresentable` means Canvas held a rubric outside the
                 * grid contract (over 10 criteria, or not 2-8 ratings) and the built-in profile
                 * seeded the draft instead — a distinction staff need, since the rubric they see
                 * is then not the one they authored.
                 */
                rubricImport: existing
                    ? 'existing_assignment'
                    : seedGrid
                        ? 'seeded_draft'
                        : context?.rubric
                            ? 'unrepresentable'
                            : 'no_canvas_rubric'
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));


/**
 * Imports submissions added in Canvas since the assignment was last imported.
 *
 * New students are added to the queue. A newer attempt from a student who already has a
 * submission is held beside it until staff choose which to keep, so the response reports
 * `heldCount` separately. Reads Canvas only; nothing is written back.
 */
router.post('/:courseId/writing-feedback/assignments/:assignmentId/canvas-sync', withCanvasClientWhenLinked, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        if (!assignment.canvasAssignmentId) throw new Error('This assignment is not linked to Canvas');
        const service = await resolveCanvasImportService(req, mongo, courseId(req));
        const result = await service.importAssignment({
            courseId: courseId(req),
            targetAssignmentId: assignment.id,
            canvasAssignmentId: assignment.canvasAssignmentId
        });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

/**
 * Applies the staff choice between a submission and the newer Canvas attempt held beside it.
 *
 * Body: `{ decision: 'use_newer' | 'keep_current' }`. Returns the student's active submission.
 * Answers 409 while the choice cannot apply yet (generation or release running, or the rows
 * changed); the workspace shows the confirmation before calling this.
 */
router.post('/:courseId/writing-feedback/submissions/:submissionId/replacement', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const decision = req.body?.decision;
        if (decision !== 'use_newer' && decision !== 'keep_current') {
            throw new Error('decision must be use_newer or keep_current');
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const submission = await new SubmissionReplacementService(mongo)
            .resolve(courseId(req), String(req.params.submissionId), decision);
        res.json({ success: true, data: submission });
    } catch (error) {
        const message = safeError(error);
        const status = message === REPLACEMENT_ERRORS.notFound ? 404
            : REPLACEMENT_CONFLICTS.includes(message) ? 409
                : 400;
        res.status(status).json({ success: false, error: message });
    }
}));

router.get('/:courseId/writing-feedback/assignments/:assignmentId/rubric', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    let lens: WritingFeedbackLens;
    try {
        lens = parseLens(req.query.lens);
    } catch {
        return res.status(400).json({ success: false, error: 'Unknown feedback lens' });
    }
    const mongo = await EngEAI_MongoDB.getInstance();
    const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
    if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
    if (lens === 'technical' && !assignment.isLabReport) {
        return res.status(409).json({ success: false, error: 'Mark this assignment as a lab report before editing its technical rubric' });
    }
    const selected = selectRubric(assignment, lens);
    const currentCourse = await mongo.getActiveCourse(courseId(req));
    const globalUser = (req.session as any).globalUser;
    // What approving a newer version of this rubric would cost: the unreleased feedback generated
    // with the version approved now, all of which would need regenerating. Feedback is only ever
    // generated against an approved rubric, so a rubric never approved has none.
    const feedbackStaleOnApproval = selected.approved
        ? await mongo.countFeedbackStaleOnApproval(courseId(req), assignment.id, lens, selected.approved.version)
        : 0;
    res.json({
        success: true,
        data: {
            lens,
            approved: selected.approved,
            // A draft identical to the approved rubric is not a change. Drafts like this were
            // left behind by approvals that saved first, and reporting one would show staff
            // unapproved changes that do not exist.
            draft: rubricContentEquals(selected.draft, selected.approved) ? undefined : selected.draft,
            history: selected.history,
            // The optional criterion library applies to the linguistic lens only.
            library: lens === 'linguistic' ? listCriterionLibrary() : [],
            permissions: { canEdit: Boolean(currentCourse && isCourseStaff(currentCourse, globalUser)) },
            feedbackStaleOnApproval
        }
    });
}));

router.put(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        let lens: WritingFeedbackLens;
        try {
            lens = parseLens(req.query.lens);
        } catch {
            return res.status(400).json({ success: false, error: 'Unknown feedback lens' });
        }
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
        if (lens === 'technical' && !assignment.isLabReport) {
            return res.status(409).json({ success: false, error: 'Mark this assignment as a lab report before editing its technical rubric' });
        }
        const selected = selectRubric(assignment, lens);
        const currentApproved = selected.approved;
        if (currentApproved) {
            try {
                assertRetiredIdsNotReused([currentApproved, ...(selected.history ?? [])], parsed.data);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'That name was used by a removed criterion'
                });
            }
        }
        const globalUser = (req.session as any).globalUser;
        const version = selected.draft?.version
            ?? (currentApproved ? currentApproved.version + 1 : 1);
        // Where the grid came from is the server's to record, not the editor's, so a draft saved
        // from the page keeps the source of the version it was edited from.
        const keptSource = (selected.draft ?? currentApproved)?.gridSource;
        const draft = {
            ...buildRubricDraft(parsed.data, version, globalUser.userId),
            ...(keptSource ? { gridSource: keptSource } : {})
        };

        // A draft that says the same as the approved rubric is no change at all -- staff who
        // undo their own edits land here. Storing it would leave the page reporting unapproved
        // changes, so any existing draft is removed instead and the approved rubric stands.
        if (currentApproved && rubricContentEquals(draft, currentApproved)) {
            const cleared = selected.draft
                ? await mongo.discardWritingRubricDraft(courseId(req), assignment.id, lens)
                : assignment;
            return res.json({ success: true, data: cleared });
        }

        // Saving is deliberately separate from approval and does not change the active rubric.
        const updated = await mongo.saveWritingRubricDraft(courseId(req), assignment.id, draft, lens);
        res.json({ success: true, data: updated });
    })
);

/** The `sourceIds` a fill request names, or undefined when it names none (read every source). */
function requestedSourceIds(body: unknown): string[] | undefined {
    const value = (body as { sourceIds?: unknown } | undefined)?.sourceIds;
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value) || value.length > 20 || value.some((id) => typeof id !== 'string' || id.length > 64)) {
        throw new Error('sourceIds must be a list of source ids');
    }
    return value as string[];
}

/**
 * Lists the material "Fill these in for me" can read for an assignment: its instructions,
 * the Canvas description when it differs from them, and every uploaded file or paste, each
 * with its text, plus the character limit one fill may read. Also reports the graded grid's
 * current source, the imported Canvas rubric's size, and whether replacing the grid needs
 * staff to confirm first.
 */
router.get(
    '/:courseId/writing-feedback/assignments/:assignmentId/autofill-sources',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        const materials = await mongo.listWritingSourceMaterials(courseId(req), assignment.id);
        res.json({
            success: true,
            data: {
                sources: listAutofillSources(assignment, materials),
                maxCharacters: MAX_AUTOFILL_SOURCE_CHARS,
                rubric: gradedGridState(assignment)
            }
        });
    })
);

/**
 * Fills the assignment details from the assignment material and, when asked, replaces the
 * graded grid with the Canvas rubric or EngE-AI's default.
 *
 * Body:
 * - `sourceIds` names which sources to read (see the `autofill-sources` route); without it
 *   every source is read.
 * - `rubricFrom` is `keep` (the default), `canvas`, or `default`. Only the lens that carries
 *   the grade takes a source other than `keep`.
 * - `replaceGrid: true` confirms replacing a grid that has an approved version or staff
 *   edits. Without it such a grid is kept, the details are still filled, and the answer's
 *   `grid` is `needs_confirmation`.
 *
 * How much of the grid the model's proposal may then reword depends on where the grid comes
 * from; it never changes points. Never touches the approved rubric; approval stays the gate
 * that lets a rubric reach the model. Answers `{ assignment, grid }`, where `grid` is
 * `unchanged`, `applied`, or `needs_confirmation`.
 */
router.post(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/fill',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        let lens: WritingFeedbackLens;
        try {
            lens = parseLens(req.query.lens);
        } catch {
            return res.status(400).json({ success: false, error: 'Unknown feedback lens' });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        if (lens === 'technical' && !assignment.isLabReport) {
            return res.status(409).json({ success: false, error: 'Mark this assignment as a lab report before editing its technical rubric' });
        }
        // Step 1: the grid source asked for, refused before any model call when unusable.
        let rubricFrom: RubricSourceChoice;
        try {
            rubricFrom = parseRubricSourceChoice(req.body?.rubricFrom);
        } catch (error) {
            return res.status(400).json({ success: false, error: error instanceof Error ? error.message : RUBRIC_SOURCE_ERRORS.invalid });
        }
        if (rubricFrom !== 'keep' && lens !== gradedLensFor(assignment)) {
            return res.status(400).json({ success: false, error: RUBRIC_SOURCE_ERRORS.notGraded });
        }
        if (rubricFrom === 'canvas' && !assignment.canvasRubricImport?.shape.criteria.length) {
            return res.status(409).json({ success: false, error: RUBRIC_SOURCE_ERRORS.noCanvas });
        }

        // Step 2: the material this fill reads, refused before any model call when unusable.
        let material: string;
        let sources: AutofillSource[];
        try {
            const sourceIds = requestedSourceIds(req.body);
            sources = listAutofillSources(assignment, await mongo.listWritingSourceMaterials(courseId(req), assignment.id));
            material = composeAutofillMaterial(selectAutofillSources(sources, sourceIds));
        } catch (error) {
            const known = Object.values(AUTOFILL_SOURCE_ERRORS) as string[];
            const message = error instanceof Error ? error.message : '';
            return known.includes(message)
                ? res.status(409).json({ success: false, error: message })
                : res.status(400).json({ success: false, error: 'sourceIds must be a list of source ids' });
        }

        const selected = selectRubric(assignment, lens);
        const globalUser = (req.session as any).globalUser;
        // Prefer the current draft; failing that, continue from the approved rubric
        // (matching the version computation the sibling PUT handler uses above) rather
        // than discarding an instructor's approved grid for a freshly seeded one. Only
        // an assignment with neither a draft nor an approval falls back to the seed.
        let draft: WritingRubricDefinition = selected.draft
            ?? (selected.approved
                ? { ...selected.approved, status: 'draft', version: selected.approved.version + 1 }
                : seedRubricForLens({ lens, actorUserId: globalUser.userId }));
        const retiredIdsOk = (candidate: WritingRubricDefinition): boolean => {
            if (!selected.approved) return true;
            try {
                assertRetiredIdsNotReused([selected.approved, ...(selected.history ?? [])], candidate);
                return true;
            } catch {
                return false;
            }
        };

        // Step 3: what is to happen to the grid. A replacement that would set aside an approved
        // grid or staff edits waits for staff to confirm, and then no rubric is extracted.
        const target = isSourceChange(rubricFrom, storedGridSource(assignment, lens)) ? rubricFrom : undefined;
        const rubricMaterial = target && typeof target === 'object'
            ? sources.find((source) => source.id === target.sourceId && (source.kind === 'file' || source.kind === 'paste'))
            : undefined;
        if (target && typeof target === 'object' && !rubricMaterial) {
            return res.status(409).json({ success: false, error: RUBRIC_SOURCE_ERRORS.sourceGone });
        }
        const awaitingConfirmation = Boolean(target)
            && req.body?.replaceGrid !== true
            && gradedGridState(assignment).replaceNeedsConfirmation;

        let gridOutcome: FillGridOutcome = awaitingConfirmation ? 'needs_confirmation' : 'unchanged';
        let gridMessage: string | undefined;
        let provenance: RubricProvenanceUpdate = {};
        // Canvas and the default are known before any model call, so the details proposal can
        // word the new grid; a rubric from material is only known once extraction returns. The
        // source is recorded on the draft itself, so discarding the draft takes it away again.
        if (target && typeof target !== 'object' && !awaitingConfirmation) {
            const seeded: WritingRubricDefinition = {
                ...withGrid(draft, seedGrid(assignment, lens, target)),
                gridSource: { kind: gridSourceKind(target) }
            };
            if (!retiredIdsOk(seeded)) return res.status(409).json({ success: false, error: GRID_REUSES_RETIRED_IDS });
            draft = seeded;
            provenance = { pendingRubricExtraction: null };
            gridOutcome = 'applied';
        }

        try {
            // Step 4: the model work, run together: the details always; the rubric when one is
            // to be built from material. A failed extraction leaves the grid alone, not the fill.
            let extractionFailed = false;
            const [proposal, extracted] = await Promise.all([
                proposeRubricFromInstructions(material, draft),
                rubricMaterial && !awaitingConfirmation
                    ? extractRubricsFromMaterial(rubricMaterial.text).catch(() => { extractionFailed = true; return undefined; })
                    : Promise.resolve(undefined)
            ]);

            // Step 5: the rubric from material, if any, becomes the grid or is held for a choice.
            let extractedGrid: { shape: ImportedRubricShape; deductions: string[]; notes: string[] } | undefined;
            if (rubricMaterial && !awaitingConfirmation) {
                const label = rubricMaterial.label;
                const scaleChoice = typeof target === 'object' ? target.scale ?? 'suggested' : 'suggested';
                const converted = (extracted ?? []).map((rubric) => convertExtractedRubric(
                    rubric,
                    scaleChoice === 'suggested' ? suggestScale(rubric.shape, rubricMaterial.text) : scaleChoice
                ));
                const usable = converted.filter((candidate) => candidate.shape);
                if (extractionFailed) {
                    gridOutcome = 'failed';
                    gridMessage = `The rubric in ${label} could not be read. The rubric grid is unchanged.`;
                } else if (converted.length === 0) {
                    gridOutcome = 'not_found';
                    gridMessage = `No rubric was found in ${label}. The rubric grid is unchanged.`;
                } else if (usable.length === 0) {
                    gridOutcome = 'refused';
                    gridMessage = extractedRubricRefusalMessage(converted[0]!.refusal, label);
                } else if (usable.length > 1) {
                    gridOutcome = 'needs_decision';
                    provenance = {
                        pendingRubricExtraction: {
                            lens,
                            sourceLabel: label,
                            candidates: usable.map((candidate) => ({
                                title: candidate.title,
                                shape: candidate.shape!,
                                notes: candidate.notes,
                                deductions: candidate.deductions,
                                needsDescriptions: candidate.needsDescriptions,
                                needsCriterionDescriptions: candidate.needsCriterionDescriptions
                            })),
                            createdAt: new Date()
                        }
                    };
                } else {
                    // Rows the source left undescribed get proposed descriptions, written for the
                    // assignment the details proposal just described.
                    const described = await describeRows(usable[0]!.shape!, {
                        cells: usable[0]!.needsDescriptions,
                        descriptions: usable[0]!.needsCriterionDescriptions
                    }, {
                        title: proposal.title || draft.title,
                        task: proposal.task || draft.task,
                        audience: proposal.audience || draft.audience,
                        purpose: proposal.purpose || draft.purpose
                    });
                    extractedGrid = {
                        shape: described.shape,
                        deductions: usable[0]!.deductions,
                        notes: [...usable[0]!.notes, ...described.notes]
                    };
                }
            }

            // Step 6: the details, merged under the rules of the source the grid will have.
            const mergeSource: RubricGridSource = gridSourceForStored(
                extractedGrid ? 'uploaded' : rubricGridSource(draft, assignment, lens),
                assignment,
                lens
            );
            let merged = mergeAutofill(draft, proposal, autofillMergeRules(mergeSource));
            if (extractedGrid && rubricMaterial) {
                const withExtracted: WritingRubricDefinition = {
                    ...withGrid(merged, extractedGrid.shape, extractedGrid.deductions),
                    gridSource: { kind: 'uploaded', label: rubricMaterial.label, notes: extractedGrid.notes }
                };
                if (!retiredIdsOk(withExtracted)) {
                    gridOutcome = 'failed';
                    gridMessage = GRID_REUSES_RETIRED_IDS;
                } else if (!writingRubricDraftInputSchema.safeParse(withExtracted).success) {
                    gridOutcome = 'failed';
                    gridMessage = `The rubric in ${rubricMaterial.label} could not be turned into a rubric grid. The grid is unchanged.`;
                } else {
                    merged = withExtracted;
                    gridOutcome = 'applied';
                    provenance = { pendingRubricExtraction: null };
                }
            }

            // Reuse the same validation the PUT path enforces (band ordering, cells keyed
            // to real levels) rather than writing a second one; a proposal that would leave
            // the draft invalid is refused before it is ever saved.
            if (!writingRubricDraftInputSchema.safeParse(merged).success) {
                throw new Error('Auto-fill response was not usable');
            }

            const saved = await mongo.saveWritingRubricDraft(courseId(req), assignment.id, merged, lens, provenance);
            res.json({ success: true, data: { assignment: saved, grid: gridOutcome, ...(gridMessage ? { gridMessage } : {}) } });
        } catch {
            // Model errors and responses can carry the prompt body, which includes the
            // instructions. Never log or return them; staff see a fixed, generic message.
            res.status(502).json({ success: false, error: 'Could not read the assignment material. Fill the rubric in by hand.' });
        }
    })
);

router.delete(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        let lens: WritingFeedbackLens;
        try {
            lens = parseLens(req.query.lens);
        } catch {
            return res.status(400).json({ success: false, error: 'Unknown feedback lens' });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const updated = await mongo.discardWritingRubricDraft(courseId(req), String(req.params.assignmentId), lens);
        if (!updated) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        res.json({ success: true, data: updated });
    })
);

/**
 * Finishes a held extraction: replaces the graded grid with the version staff chose from the
 * rubrics found in their material, and records the source. Never touches the approved rubric.
 */
router.post(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/from-extraction',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        const pending = assignment.pendingRubricExtraction;
        if (!pending) return res.status(409).json({ success: false, error: RUBRIC_SOURCE_ERRORS.noPending });
        const index = req.body?.candidateIndex;
        const chosen = Number.isInteger(index) ? pending.candidates[index as number] : undefined;
        if (!chosen) return res.status(400).json({ success: false, error: 'candidateIndex must name one of the held versions' });

        const lens = pending.lens;
        const selected = selectRubric(assignment, lens);
        const globalUser = (req.session as any).globalUser;
        const base: WritingRubricDefinition = selected.draft
            ?? (selected.approved
                ? { ...selected.approved, status: 'draft', version: selected.approved.version + 1 }
                : seedRubricForLens({ lens, actorUserId: globalUser.userId }));
        // Descriptions are proposed only now, for the version staff chose, not for every one held.
        const described = await describeRows(chosen.shape, {
            cells: chosen.needsDescriptions ?? [],
            descriptions: chosen.needsCriterionDescriptions ?? []
        }, base);
        const draft: WritingRubricDefinition = {
            ...withGrid(base, described.shape, chosen.deductions),
            gridSource: { kind: 'uploaded', label: pending.sourceLabel, notes: [...chosen.notes, ...described.notes] }
        };
        if (selected.approved) {
            try {
                assertRetiredIdsNotReused([selected.approved, ...(selected.history ?? [])], draft);
            } catch {
                return res.status(409).json({ success: false, error: GRID_REUSES_RETIRED_IDS });
            }
        }
        if (!writingRubricDraftInputSchema.safeParse(draft).success) {
            return res.status(409).json({ success: false, error: `This version of the rubric in ${pending.sourceLabel} could not be turned into a rubric grid.` });
        }
        const saved = await mongo.saveWritingRubricDraft(courseId(req), assignment.id, draft, lens, { pendingRubricExtraction: null });
        res.json({ success: true, data: saved });
    })
);

/** Drops held rubric versions, leaving the grid as it is. */
router.delete(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/pending-extraction',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const updated = await mongo.clearPendingRubricExtraction(courseId(req), String(req.params.assignmentId));
        if (!updated) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        res.json({ success: true, data: updated });
    })
);

router.post(
    '/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/approve',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        let lens: WritingFeedbackLens;
        try {
            lens = parseLens(req.query.lens);
        } catch {
            return res.status(400).json({ success: false, error: 'Unknown feedback lens' });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const assignment = await mongo.getWritingAssignment(courseId(req), String(req.params.assignmentId));
        if (!assignment) return res.status(404).json({ success: false, error: 'Writing assignment not found' });
        // A pending assignment has no settled type, so which rubric it is graded on is not
        // known yet. Refused here so a direct link cannot approve around the modal (D-123).
        if (assignment.assignmentTypePending === true) {
            return res.status(409).json({ success: false, error: CHOOSE_TYPE_BEFORE_APPROVAL_MESSAGE });
        }
        if (lens === 'technical' && !assignment.isLabReport) {
            return res.status(409).json({ success: false, error: 'Mark this assignment as a lab report before editing its technical rubric' });
        }
        const selected = selectRubric(assignment, lens);
        // With an approved rubric in place, no draft means nothing has changed: saving removes
        // a draft identical to the approved rubric. An identical draft still on file (left by
        // an earlier save) is refused the same way, because approving it would create a new
        // version that says nothing new and put every feedback draft generated with the
        // current version out of date.
        if (selected.approved && (!selected.draft || rubricContentEquals(selected.draft, selected.approved))) {
            return res.status(409).json({
                success: false,
                error: `Nothing has changed since approved v${selected.approved.version}.`
            });
        }
        if (!selected.draft) {
            return res.status(409).json({ success: false, error: 'Save a rubric draft before approval' });
        }
        const globalUser = (req.session as any).globalUser;

        // Promote only the persisted draft version; the delegate rejects concurrent rubric changes.
        try {
            if (lens === 'linguistic') requireCompleteSflProfile(selected.draft.sflContext);
            requireCompleteRubricCells(selected.draft);
        } catch (error) {
            return res.status(400).json({ success: false, error: safeError(error) });
        }
        // Descriptions EngE-AI wrote reach students only after staff say they have read them.
        const proposedCells = countProposedCells(selected.draft.criteria);
        if (proposedCells > 0 && req.body?.acknowledgeProposed !== true) {
            return res.status(409).json({
                success: false,
                error: `${proposedCells} ${proposedCells === 1 ? 'description was' : 'descriptions were'} suggested by EngE-AI. Review them, then confirm to approve.`
            });
        }

        // Approval is that review, so the suggestion markers end here.
        const approved = approveRubricDraft(withProposalsAccepted(selected.draft), globalUser.userId);
        const updated = await mongo.approveWritingRubricDraft(
            courseId(req),
            assignment.id,
            approved,
            lens === 'linguistic' ? gradeMappingFromApprovedRubric(approved) : undefined,
            lens
        );
        if (!updated) {
            return res.status(409).json({ success: false, error: 'The rubric changed while you were editing. Reload and try again.' });
        }
        res.json({ success: true, data: updated });
    })
);

/**
 * Records the one-time assignment type (D-123).
 *
 * `lab_report` also moves an imported Canvas grid to the technical rubric and returns the
 * writing rubric to the default profile. Refused with 409 once the type has been chosen.
 */
router.put(
    '/:courseId/writing-feedback/assignments/:assignmentId/type',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const type = req.body?.type;
        if (!isAssignmentTypeChoice(type)) {
            return res.status(400).json({ success: false, error: 'type must be writing or lab_report' });
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        const globalUser = (req.session as any).globalUser;
        try {
            const updated = await new AssignmentTypeService(mongo)
                .choose(courseId(req), String(req.params.assignmentId), type, globalUser.userId);
            res.json({ success: true, data: updated });
        } catch (error) {
            res.status(assignmentTypeErrorStatus(error)).json({ success: false, error: safeError(error) });
        }
    })
);

/**
 * Seeds a lab report's technical rubric draft when it has none.
 *
 * Idempotent; never resets the writing rubric. Refused with 409 for an assignment that is
 * not a lab report.
 */
router.post(
    '/:courseId/writing-feedback/assignments/:assignmentId/technical-rubric/seed',
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const globalUser = (req.session as any).globalUser;
        try {
            const updated = await new AssignmentTypeService(mongo)
                .seedTechnicalRubric(courseId(req), String(req.params.assignmentId), globalUser.userId);
            res.json({ success: true, data: updated });
        } catch (error) {
            res.status(assignmentTypeErrorStatus(error)).json({ success: false, error: safeError(error) });
        }
    })
);

/**
 * Deletes an assignment together with all of its submissions, drafts, reviews, and release
 * records. The workspace confirms the counts first. Canvas is not changed.
 */
router.delete('/:courseId/writing-feedback/assignments/:assignmentId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const { deleted, blockedByWork } = await mongo.deleteWritingAssignment(courseId(req), String(req.params.assignmentId));
    if (deleted) return res.json({ success: true });
    if (blockedByWork) {
        return res.status(409).json({
            success: false,
            error: 'Wait for feedback generation and Canvas releases to finish before deleting this assignment'
        });
    }
    res.status(404).json({ success: false, error: 'Writing assignment not found' });
}));

/** Batch generation over the façade, queuing each submission through the usual single-submission path. */
function batchService(mongo: EngEAI_MongoDB): WritingBatchGenerationService {
    const service = new WritingFeedbackService(mongo);
    return new WritingBatchGenerationService(mongo, (course, submissionId) => service.enqueueGeneration(course, submissionId));
}

/** Maps a batch refusal to its status: missing assignment 404, blocked batch 409. */
function batchErrorStatus(message: string): number {
    if (message === BATCH_ERRORS.notFound) return 404;
    return message === BATCH_ERRORS.rubricNotApproved || message === BATCH_ERRORS.profileIncomplete ? 409 : 400;
}

/**
 * Previews batch generation for the confirmation modal: how many submissions fall in each
 * category, and why the batch cannot run when it cannot. Changes nothing.
 */
router.get('/:courseId/writing-feedback/assignments/:assignmentId/batch-generation', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const preview = await batchService(mongo).preview(courseId(req), String(req.params.assignmentId));
        res.json({ success: true, data: preview });
    } catch (error) {
        const message = safeError(error);
        res.status(batchErrorStatus(message)).json({ success: false, error: message });
    }
}));

/**
 * Starts batch generation: confirms file transcripts that pass the automatic check, then queues
 * one generation job per submission with no draft or a failed one. `includeStale: true` also
 * regenerates feedback made with an older rubric version. Returns `202`; the worker drafts the
 * submissions one at a time and the workspace follows their statuses.
 */
router.post('/:courseId/writing-feedback/assignments/:assignmentId/batch-generation', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const result = await batchService(mongo).start(courseId(req), String(req.params.assignmentId), {
            includeStale: req.body?.includeStale === true
        });
        res.status(202).json({ success: true, data: result });
    } catch (error) {
        const message = safeError(error);
        res.status(batchErrorStatus(message)).json({ success: false, error: message });
    }
}));

/**
 * Stops batch generation: removes the assignment's generation jobs that have not started and
 * returns those submissions to their previous state. A submission already generating finishes.
 */
router.post('/:courseId/writing-feedback/assignments/:assignmentId/batch-generation/stop', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const result = await batchService(mongo).stop(courseId(req), String(req.params.assignmentId));
        res.json({ success: true, data: result });
    } catch (error) {
        const message = safeError(error);
        res.status(batchErrorStatus(message)).json({ success: false, error: message });
    }
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
        canvasAssignmentId: 'demo-technical-description'
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
        if (isDuplicateKeyError(error)) return res.status(409).json({ success: false, error: DUPLICATE_STUDENT_SUBMISSION });
        res.status(400).json({ success: false, error: safeError(error) });
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
        if (isDuplicateKeyError(error)) return res.status(409).json({ success: false, error: DUPLICATE_STUDENT_SUBMISSION });
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/verify', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    let verifiedText: string;
    try {
        verifiedText = cleanText(req.body?.verifiedText);
    } catch (error) {
        return res.status(400).json({ success: false, error: safeError(error) });
    }
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const submission = await new WritingFeedbackService(mongo).confirmTranscript(
            courseId(req),
            String(req.params.submissionId),
            verifiedText
        );
        res.json({ success: true, data: submission });
    } catch (error) {
        const message = safeError(error);
        res.status(message === 'Writing submission not found' ? 404 : 409).json({ success: false, error: message });
    }
}));

/**
 * Replaces a submission's confirmed text with a staff correction.
 *
 * Feedback generated for the old text is left in history but must be generated again before
 * approval; the submission returns to `imported`. Unchanged text is accepted and changes nothing.
 */
router.post('/:courseId/writing-feedback/submissions/:submissionId/transcript', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    let text: string;
    try {
        text = cleanText(req.body?.text);
    } catch (error) {
        return res.status(400).json({ success: false, error: safeError(error) });
    }
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const submission = await new WritingFeedbackService(mongo).editTranscript(
            courseId(req),
            String(req.params.submissionId),
            text
        );
        res.json({ success: true, data: submission });
    } catch (error) {
        const message = safeError(error);
        res.status(message === 'Writing submission not found' ? 404 : 409).json({ success: false, error: message });
    }
}));

/**
 * Queues a feedback draft for every lens the assignment requires.
 *
 * The queued job stores only internal ids; the worker reloads verified text
 * inside the Writing Feedback boundary. Clients poll submission detail until
 * the status reaches `draft_ready` or `failed`.
 */
router.post('/:courseId/writing-feedback/submissions/:submissionId/generate', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const job = await new WritingFeedbackService(mongo).enqueueGeneration(courseId(req), String(req.params.submissionId));
        res.status(202).json({
            success: true,
            data: {
                status: 'queued',
                jobId: job.id,
                submissionId: String(req.params.submissionId)
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

/**
 * Redrafts the summary of every changed lens from the final annotations (D-125).
 *
 * Synchronous: the annotations are unsaved student-derived text, so they are never queued.
 * Model failures return a fixed message; nothing from the prompt, response, or annotations is
 * logged or returned.
 */
router.post('/:courseId/writing-feedback/submissions/:submissionId/summary-redraft', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const parsedComments = anchoredCommentsInputSchema.safeParse(req.body?.comments);
    if (!parsedComments.success) {
        return res.status(400).json({
            success: false,
            error: `Feedback comments failed validation: ${parsedComments.error.issues[0]?.message ?? 'check the comment fields'}`
        });
    }
    const lenses: WritingFeedbackLens[] = Array.isArray(req.body?.lenses)
        ? req.body.lenses.filter((lens: unknown): lens is WritingFeedbackLens => lens === 'linguistic' || lens === 'technical')
        : [];
    if (!lenses.length) {
        return res.status(400).json({ success: false, error: 'lenses must name at least one feedback lens' });
    }
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const result = await new WritingFeedbackService(mongo)
            .redraftSummary(courseId(req), String(req.params.submissionId), { comments: parsedComments.data, lenses });
        res.json({ success: true, data: result });
    } catch (error) {
        const message = safeError(error);
        const status = message === REDRAFT_NOT_DRAFT_READY_MESSAGE
            ? 409
            : message === SUMMARY_REDRAFT_FAILED_MESSAGE ? 502 : 400;
        res.status(status).json({ success: false, error: message });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/reviews', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const studentFeedback = cleanText(req.body?.studentFeedback);
        const feedbackRunId = cleanId(req.body?.feedbackRunId, 'feedbackRunId');
        let comments;
        let finalAssessment;

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
        if (req.body?.finalAssessment !== undefined) {
            const parsedAssessment = staffFinalAssessmentInputSchema.safeParse(req.body.finalAssessment);
            if (!parsedAssessment.success) {
                return res.status(400).json({
                    success: false,
                    error: `Final grading failed validation: ${parsedAssessment.error.issues[0]?.message ?? 'check every criterion score'}`
                });
            }
            finalAssessment = parsedAssessment.data;
        }
        let assessmentDraft;
        if (req.body?.assessmentDraft !== undefined) {
            const parsedDraft = staffAssessmentDraftInputSchema.safeParse(req.body.assessmentDraft);
            if (!parsedDraft.success) {
                return res.status(400).json({
                    success: false,
                    error: `Final grading failed validation: ${parsedDraft.error.issues[0]?.message ?? 'check the criterion scores'}`
                });
            }
            assessmentDraft = parsedDraft.data;
        }
        let summaryEdits;
        if (req.body?.summaryEdits !== undefined) {
            const parsedEdits = summaryEditsInputSchema.safeParse(req.body.summaryEdits);
            if (!parsedEdits.success) {
                return res.status(400).json({
                    success: false,
                    error: `Summary edits failed validation: ${parsedEdits.error.issues[0]?.message ?? 'check the summary fields'}`
                });
            }
            summaryEdits = parsedEdits.data;
        }
        // Sent only when staff changed "Hold back annotations"; absent keeps the current choice.
        if (req.body?.holdBackAnnotations !== undefined && typeof req.body.holdBackAnnotations !== 'boolean') {
            return res.status(400).json({ success: false, error: 'holdBackAnnotations must be true or false' });
        }
        const holdBackAnnotations: boolean | undefined = req.body?.holdBackAnnotations;
        const globalUser = (req.session as any).globalUser;
        const mongo = await EngEAI_MongoDB.getInstance();
        const revision = await new WritingFeedbackService(mongo).appendReview(courseId(req), String(req.params.submissionId), {
            feedbackRunId,
            staffUserId: globalUser.userId,
            studentFeedback,
            internalNote: typeof req.body?.internalNote === 'string' ? req.body.internalNote.slice(0, 4000) : undefined,
            comments,
            finalAssessment,
            assessmentDraft,
            summaryEdits,
            // Omitted unless staff changed the checkbox: Mongo would store undefined as null.
            ...(typeof holdBackAnnotations === 'boolean' ? { holdBackAnnotations } : {}),
            technicalFeedbackRunId: typeof req.body?.technicalFeedbackRunId === 'string'
                ? req.body.technicalFeedbackRunId.slice(0, 64)
                : undefined
        }, globalUser.name);
        res.status(201).json({ success: true, data: revision });
    } catch (error) {
        const message = safeError(error);
        const conflict = message.startsWith('The summary changed since you opened it') || message === REVIEW_WHILE_GENERATING_MESSAGE;
        res.status(conflict ? 409 : 400).json({ success: false, error: message });
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
        const lens = req.query.lens === 'technical' ? 'technical' : 'writing';
        const effectiveInclude = lens === 'technical' ? 'general' : include;
        const pdf = await new WritingFeedbackService(mongo).renderPdf(
            courseId(req),
            String(req.params.submissionId),
            effectiveInclude,
            lens
        );
        const filename = lens === 'technical' ? 'technical-feedback.pdf'
            : include === 'annotated' ? 'writing-feedback-annotated.pdf'
            : include === 'both' ? 'writing-feedback-complete.pdf'
            : 'writing-feedback.pdf';
        // Inline by default: staff read this PDF far more often than they archive one, and a
        // forced download meant a reviewer could not simply look at what they had just written.
        // `?download=1` is the explicit save.
        const disposition = req.query.download === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
        res.send(pdf);
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

/**
 * resolveReleaseService — binds the correct release adapter for this request.
 *
 * Resolved per request rather than from a default-constructed service, because the
 * adapter must follow the active Canvas integration and the signed-in staff member's
 * OAuth client. Live courses use exact-attempt Canvas release; demo courses stay on
 * the clearly labelled local mock.
 *
 * @throws Error when neither live Canvas nor the synthetic mock is configured
 */
async function resolveReleaseService(
    req: Request,
    mongo: EngEAI_MongoDB
): Promise<{ service: CanvasReleaseService; integration: 'mock_canvas' | 'canvas' }> {
    const status = await resolveCanvasImportStatus(req, mongo, courseId(req));
    if (status.integration === 'canvas') {
        const canvasCourseId = await resolveCanvasCourseId(mongo, courseId(req));
        const client = (req as any).canvasApi;
        if (!canvasCourseId || !client) throw new Error('Canvas release is not configured');
        return {
            integration: 'canvas',
            service: new LiveCanvasReleaseService(
                client,
                canvasCourseId,
                (fingerprint) => mongo.findWritingReleaseByFingerprint(fingerprint),
                (release) => mongo.createWritingRelease(release),
                (fingerprint, update, expectedStatuses) => mongo.finalizeWritingRelease(fingerprint, update, expectedStatuses)
            )
        };
    }
    if (!status.canImport || status.integration !== 'mock_canvas') {
        throw new Error('Canvas release is not configured');
    }
    return { integration: 'mock_canvas', service: releaseService(mongo) };
}

function releaseService(mongo: EngEAI_MongoDB): SafeCanvasReleaseService {
    // Bind release persistence to payload fingerprints so retries reconcile instead of duplicating.
    return new SafeCanvasReleaseService(
        new MockCanvasGateway(),
        (fingerprint) => mongo.findWritingReleaseByFingerprint(fingerprint),
        (release) => mongo.createWritingRelease(release),
        (fingerprint, update, expectedStatuses) => mongo.finalizeWritingRelease(fingerprint, update, expectedStatuses)
    );
}

router.post('/:courseId/writing-feedback/submissions/:submissionId/release-preview', withCanvasClientWhenLinked, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();

        const resolved = await resolveReleaseService(req, mongo);
        const release = await new WritingFeedbackService(mongo).previewRelease(
            courseId(req),
            String(req.params.submissionId),
            resolved.service
        );
        res.json({ success: true, data: release, integration: resolved.integration });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.post('/:courseId/writing-feedback/submissions/:submissionId/release', withCanvasClientWhenLinked, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        // One staff action (D-128): the dry-run preview is prepared here, then the write is queued.
        // Queued rather than performed here: a live release uploads the feedback PDF, posts a comment,
        // and starts a Canvas grade job, and a request that outlives its connection leaves staff
        // unable to tell whether the student received anything.
        const resolved = await resolveReleaseService(req, mongo);
        const job = await new WritingFeedbackService(mongo).releaseToCanvas(
            courseId(req),
            String(req.params.submissionId),
            resolved.service,
            await resolveUserKey(req)
        );
        res.status(202).json({
            success: true,
            data: {
                status: 'queued',
                jobId: job.id,
                submissionId: String(req.params.submissionId)
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
}));

router.get('/:courseId/writing-feedback/submissions/:submissionId/release-status', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        const submissionId = String(req.params.submissionId);
        const release = await mongo.getLatestWritingRelease(courseId(req), submissionId);
        // The job state is what distinguishes "waiting for a worker" from "the preview is sitting
        // there and nobody has asked for a release", and a failed job carries the only
        // explanation of why nothing reached the student. Its error text is sanitized at the
        // point it is stored, so no student content can travel with it.
        const job = await mongo.findLatestWritingJob(courseId(req), submissionId, 'release');
        res.json({
            success: true,
            data: {
                release,
                jobState: job?.state ?? null,
                jobError: job?.state === 'failed' ? job.sanitizedError : undefined
            }
        });
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
