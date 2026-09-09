/**
 * Rubric auto-fill — proposing a rubric draft from the assignment instructions
 *
 * Instructor material only; no student text is involved. The proposal is always a
 * draft, and how much of the grid it may rewrite depends on where the grid came from:
 * an instructor's imported rubric and the department's evaluation form both outrank
 * anything a model proposes.
 *
 * @author: @rdschrs
 * @date: 2026-08-23
 * @version: 1.0.0
 * @description: Builds the auto-fill prompt and merges its proposal into a draft.
 */

import { z } from 'zod';
import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { isMockResponse } from '../helpers/mock-response';
import { spaceBandsEvenly } from './rubric-bands';
import { stripNulls, type WithoutNull } from './strip-nulls';
import type {
    WritingAssignment,
    WritingFeedbackLens,
    WritingLevelId,
    WritingRubricCell,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingRubricLevel,
    WritingSflContextProfile
} from './contracts';

/** Where a draft's grid came from, which decides how much auto-fill may rewrite. */
export type RubricGridSource = 'canvas' | 'apsc182' | 'metafunctions';

/**
 * gridSourceFor - the merge-table row an assignment's grid falls under for a lens.
 *
 * Provenance is per lens. The technical grid is no longer always the department's APSC 182
 * form: an instructor's Canvas rubric for a lab report *is* the technical marking scheme, so
 * a lab report imported from Canvas seeds its technical lens from that rubric and this reads
 * `technicalRubricSource` rather than assuming the form.
 *
 * The writing lens reads `rubricSource`, which describes that lens only — and a lab report's
 * writing lens ignores it outright. A lab handout describes an experiment, not linguistic
 * expectations, so the three metafunctions always govern it no matter what Canvas supplied.
 *
 * A manually created writing assignment lands on `metafunctions` too. It and a lab report's
 * writing lens are the same case: the three criteria are fixed and auto-fill writes only what
 * they mean for this assignment, which keeps feedback comparable across an instructor's work.
 *
 * @param assignment - Assignment whose grid provenance is being classified
 * @param lens - Lens the draft being filled belongs to
 * @returns The grid source row that decides `autofillMergeRules`
 */
export function gridSourceFor(assignment: WritingAssignment, lens: WritingFeedbackLens): RubricGridSource {
    if (lens === 'technical') {
        return assignment.technicalRubricSource === 'canvas' ? 'canvas' : 'apsc182';
    }
    if (assignment.isLabReport) return 'metafunctions';
    return assignment.rubricSource === 'canvas' ? 'canvas' : 'metafunctions';
}

/** What auto-fill is permitted to change in one draft. */
export interface AutofillMergeRules {
    /** Whether a criterion the draft does not have may be appended. */
    mayAddRows: boolean;
    /** Whether an existing row's own description and weight may be rewritten. */
    mayWriteRow: boolean;
    /** Whether per-level bands and descriptors may be rewritten. */
    mayWriteCells: boolean;
}

/** Model proposal, already validated against the draft-input schema. */
export interface AutofillProposal {
    title: string;
    task: string;
    audience: string;
    purpose: string;
    constraints: string[];
    learningOutcomes: string[];
    gradingIntent: string;
    sflContext?: WritingSflContextProfile;
    criteria: WritingRubricCriterion[];
}

/**
 * autofillMergeRules - permissions for one grid source.
 *
 * @param source - Where the draft's grid came from
 * @returns What auto-fill may change
 */
export function autofillMergeRules(source: RubricGridSource): AutofillMergeRules {
    switch (source) {
        // An instructor's real rubric is never revised by a model.
        case 'canvas':
            return { mayAddRows: false, mayWriteRow: false, mayWriteCells: false };
        // The evaluation form's sections and weights belong to the department.
        case 'apsc182':
            return { mayAddRows: false, mayWriteRow: false, mayWriteCells: true };
        // The three metafunctions are the platform's own grid, not an instructor's, so their
        // meaning for this assignment is written while the rows themselves stay fixed. A lab
        // handout describes an experiment rather than linguistic expectations, and a manually
        // created assignment has no other grid to reason from — both land here, which is what
        // keeps feedback comparable across an instructor's assignments.
        case 'metafunctions':
            return { mayAddRows: false, mayWriteRow: true, mayWriteCells: true };
    }
}

/**
 * reconcileProposedCells - overrides model-authored numeric bands with weight-derived
 * ones, keeping only the model's descriptor text.
 *
 * `buildAutofillPrompt` never tells the model a criterion's points weight, so its band
 * numbers are unreliable: observed failures include scaling every row to an assumed
 * 100-point total and collapsing every band to zero. Numeric point values are never
 * the model's to invent (D-063); the same deterministic split "Space points evenly"
 * uses (`spaceBandsEvenly`) is applied here instead. A level id the model invented —
 * not part of `levels` — is passed through unchanged so the shared draft validator
 * still rejects it.
 *
 * @param modelCells - Cells the model proposed, keyed by level id
 * @param points - The criterion's resolved weight after this merge, if any
 * @param levels - Rubric's performance levels, used only to derive bands
 * @returns Cells with weight-correct numeric bands and the model's descriptor text
 */
function reconcileProposedCells(
    modelCells: Record<WritingLevelId, WritingRubricCell>,
    points: number | undefined,
    levels: ReadonlyArray<WritingRubricLevel>
): Record<WritingLevelId, WritingRubricCell> {
    if (points === undefined) return modelCells;
    const derived = spaceBandsEvenly(points, levels);
    const reconciled: Record<WritingLevelId, WritingRubricCell> = {};
    for (const [levelId, cell] of Object.entries(modelCells)) {
        const band = derived[levelId];
        reconciled[levelId] = band
            ? { ...band, ...(cell.descriptor ? { descriptor: cell.descriptor } : {}) }
            : cell;
    }
    return reconciled;
}

/**
 * mergeAutofill - applies a proposal to a draft under the given rules.
 *
 * Details are always written. Rows are never removed: an instructor who added a
 * criterion keeps it regardless of what the model proposes.
 *
 * @param draft - Current draft rubric
 * @param proposal - Validated model proposal
 * @param rules - Permissions from autofillMergeRules
 * @returns A new draft. Status and version are untouched.
 */
export function mergeAutofill(
    draft: WritingRubricDefinition,
    proposal: AutofillProposal,
    rules: AutofillMergeRules
): WritingRubricDefinition {
    const proposed = new Map(proposal.criteria.map((criterion) => [criterion.id, criterion]));

    const criteria = draft.criteria.map((criterion) => {
        const match = proposed.get(criterion.id);
        if (!match) return criterion;
        // The weight this row will actually carry after this merge: the model's
        // proposed points only where rows are writable, otherwise the row's own.
        // Cell bands are always reconciled against this value, never the model's.
        const nextPoints = rules.mayWriteRow && match.points !== undefined ? match.points : criterion.points;
        return {
            ...criterion,
            // The row's own text and weight move together: where rows are fixed, the
            // description belongs to whoever authored the row, not to the model.
            ...(rules.mayWriteRow && match.description ? { description: match.description } : {}),
            ...(rules.mayWriteRow && match.points !== undefined ? { points: match.points } : {}),
            ...(rules.mayWriteCells && match.cells
                ? { cells: reconcileProposedCells(match.cells, nextPoints, draft.levels) }
                : {})
        };
    });

    if (rules.mayAddRows) {
        const existing = new Set(draft.criteria.map((criterion) => criterion.id));
        proposal.criteria
            .filter((criterion) => !existing.has(criterion.id))
            .forEach((criterion) => criteria.push({
                ...criterion,
                ...(criterion.cells
                    ? { cells: reconcileProposedCells(criterion.cells, criterion.points, draft.levels) }
                    : {})
            }));
    }

    return {
        ...draft,
        title: proposal.title || draft.title,
        task: proposal.task || draft.task,
        audience: proposal.audience || draft.audience,
        purpose: proposal.purpose || draft.purpose,
        constraints: proposal.constraints.length ? proposal.constraints : draft.constraints,
        learningOutcomes: proposal.learningOutcomes.length ? proposal.learningOutcomes : draft.learningOutcomes,
        gradingIntent: proposal.gradingIntent || draft.gradingIntent,
        ...(proposal.sflContext ? { sflContext: proposal.sflContext } : {}),
        criteria
    };
}

/**
 * buildAutofillPrompt - instructs the model to describe the assignment as a rubric.
 *
 * @param instructions - Instructor-authored assignment directions
 * @param draft - Current draft, supplying the criteria and levels to describe
 * @returns Prompt text. Never logged.
 */
export function buildAutofillPrompt(instructions: string, draft: WritingRubricDefinition): string {
    const criteria = draft.criteria
        .map((criterion) => `- ${criterion.id}: ${criterion.label}`)
        .join('\n');
    const levels = [...draft.levels]
        .sort((left, right) => left.rank - right.rank)
        .map((level) => `- ${level.id}: ${level.label}`)
        .join('\n');

    return [
        'You are preparing a marking rubric for a university instructor.',
        'Read the assignment instructions and describe what the assignment asks for.',
        '',
        'Rules:',
        '- Use only what the instructions state. Do not invent requirements.',
        '- Write for an instructor. No hedging, no meta-commentary.',
        '- Each descriptor says what work at that level looks like for that criterion,',
        '  in one sentence, specific to this assignment.',
        '- Do not add, remove, or rename criteria or levels. Use exactly the ids given.',
        '- Also propose an SFL context profile for the assignment. Treat genre as a staged social purpose, not a format label.',
        '- If the assignment is unfamiliar or composite, set genreState to custom or composite and do not invent Ferreira DR/DC/PS stages.',
        '- Include task, purpose, audience, field, tenor, mode, actual evaluator, production conditions, explicit stages, embedded genres, task requirements, and learning outcomes.',
        '- Keep each of task, audience, purpose, and grading intent under 1000 characters.',
        '- Keep each criterion description and each descriptor to one or two sentences.',
        '',
        'Criteria:',
        criteria,
        '',
        'Levels, worst to best:',
        levels,
        '',
        'Assignment instructions:',
        instructions
    ].join('\n');
}

/**
 * Shape the model must return. Anything else is discarded rather than repaired.
 *
 * Exported only so __tests__/structured-output-schema.test.ts can pin its generated
 * JSON schema against the provider's no-typeless-node rule.
 */
export const autofillProposalSchema = z.object({
    title: z.string().trim().max(160),
    task: z.string().trim().max(2000),
    audience: z.string().trim().max(2000),
    purpose: z.string().trim().max(2000),
    constraints: z.array(z.string().trim().min(1).max(300)).max(12),
    learningOutcomes: z.array(z.string().trim().min(1).max(400)).max(12),
    gradingIntent: z.string().trim().max(2000),
    sflContext: z.object({
        // .nullish() (optional + nullable), not .optional(): OpenAI's structured-output
        // JSON-schema mode requires every non-required field to accept null explicitly.
        genreId: z.string().trim().min(1).max(120).nullish(),
        genreLabel: z.string().trim().min(1).max(160),
        genreState: z.enum(['declared', 'staff_confirmed', 'custom', 'composite', 'needs_staff_input']),
        task: z.string().trim().min(1).max(2000),
        purpose: z.string().trim().min(1).max(2000),
        audience: z.string().trim().min(1).max(2000),
        field: z.string().trim().min(1).max(2000),
        tenor: z.string().trim().min(1).max(2000),
        mode: z.string().trim().min(1).max(2000),
        actualEvaluator: z.string().trim().min(1).max(2000),
        productionConditions: z.string().trim().min(1).max(2000),
        stages: z.array(z.object({
            id: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/),
            label: z.string().trim().min(1).max(120),
            purpose: z.string().trim().min(1).max(600),
            required: z.boolean().nullish(),
            order: z.number().int().min(1).max(50).nullish()
        })).min(1).max(20),
        embeddedGenres: z.array(z.string().trim().min(1).max(160)).max(12),
        taskRequirements: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
        learningOutcomes: z.array(z.string().trim().min(1).max(400)).min(1).max(20),
        approvedGlossaryTerms: z.array(z.string().trim().min(1).max(80)).max(30).nullish()
    }).nullish(),
    criteria: z.array(z.object({
        id: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(80),
        description: z.string().trim().max(2000),
        points: z.number().finite().min(0).max(1000).nullish(),
        cells: z.record(z.object({
            min: z.number().finite().min(0).max(1000),
            max: z.number().finite().min(0).max(1000),
            descriptor: z.string().trim().max(400).nullish()
        })).nullish()
    })).max(10)
});

// Matches `compactText`'s cap in rubric-schema.ts (task/audience/purpose/gradingIntent/
// criterion description). `autofillProposalSchema` deliberately allows more headroom
// than this so a good-faith model response is not refused outright for length; see
// `clipToDraftLimit`, which reconciles the gap after validation instead.
const DRAFT_TEXT_LIMIT = 1200;

/**
 * clipToDraftLimit - trims text to the draft validator's character cap on a word boundary.
 *
 * The auto-fill schema accepts longer text than the draft validator (`writingRubricDraftInputSchema`,
 * `rubric-schema.ts`) allows, so a verbose but otherwise good model response would
 * otherwise pass proposal validation and then fail draft validation outright. These
 * are draft fields a staff member reviews and edits before approval, so a clipped
 * proposal beats a refused one.
 *
 * @param text - Validated proposal text, already within the proposal schema's own cap
 * @returns Text at or under the draft limit, cut at the last whole word when clipped
 */
function clipToDraftLimit(text: string): string {
    if (text.length <= DRAFT_TEXT_LIMIT) return text;
    const clipped = text.slice(0, DRAFT_TEXT_LIMIT);
    const lastSpace = clipped.lastIndexOf(' ');
    return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
}

/**
 * deterministicAutofillProposal - mock-mode substitute for a real model call.
 *
 * Mirrors `deterministicFeedback` in `feedback-engine.ts`: under `MOCK_RESPONSE` the
 * system must never reach a feature LLM, so this echoes the draft's own criteria and
 * details back verbatim (falling back to a labelled placeholder for anything blank)
 * rather than inventing content.
 *
 * @param draft - Draft supplying the criteria, levels, and any existing text to echo
 * @returns A deterministic proposal usable by `mergeAutofill` under any rule set
 */
function deterministicAutofillProposal(draft: WritingRubricDefinition): AutofillProposal {
    return {
        title: draft.title || '[MOCK] Assignment title',
        task: draft.task || '[MOCK] Assessed task.',
        audience: draft.audience || '[MOCK] Intended reader.',
        purpose: draft.purpose || '[MOCK] Communicative purpose.',
        constraints: draft.constraints.length ? [...draft.constraints] : ['[MOCK] Constraint'],
        learningOutcomes: draft.learningOutcomes.length ? [...draft.learningOutcomes] : ['[MOCK] Learning outcome'],
        gradingIntent: draft.gradingIntent || '[MOCK] Formative.',
        ...(draft.sflContext ? {
            sflContext: {
                ...draft.sflContext,
                stages: draft.sflContext.stages.map((stage) => ({ ...stage })),
                embeddedGenres: [...draft.sflContext.embeddedGenres],
                taskRequirements: [...draft.sflContext.taskRequirements],
                learningOutcomes: [...draft.sflContext.learningOutcomes],
                ...(draft.sflContext.approvedGlossaryTerms
                    ? { approvedGlossaryTerms: [...draft.sflContext.approvedGlossaryTerms] }
                    : {})
            }
        } : {}),
        criteria: draft.criteria.map((criterion) => ({
            ...criterion,
            description: criterion.description || `[MOCK] ${criterion.label} description.`
        }))
    };
}

/**
 * proposeRubricFromInstructions - asks the model to describe the assignment as a rubric.
 *
 * Drops any criterion id the model invented, since the prompt tells it to use exactly
 * the draft's existing ids and nothing else should reach the merge step. That also
 * means `mayAddRows` currently has no proposals to act on: the rule and its tests
 * exist ahead of the prompt/review work that would let the model add a genuinely new
 * row, which is deliberately out of scope for this change.
 *
 * Never calls a feature LLM under `MOCK_RESPONSE`, mirroring `RubricWritingFeedbackEngine`:
 * an injected module always wins (the seam tests use this), otherwise mock mode short-
 * circuits to a deterministic proposal before any `LLMModule` is even constructed.
 *
 * @param instructions - Instructor-authored assignment directions
 * @param draft - Draft supplying the criteria and levels the model must describe
 * @param llmModule - Optional injected LLM adapter for tests or controlled composition
 * @returns A validated proposal. The caller decides how much of it may be applied.
 * @throws Error with no model text when the response cannot be parsed or validated,
 *         because model errors and responses can echo the prompt body
 */
export async function proposeRubricFromInstructions(
    instructions: string,
    draft: WritingRubricDefinition,
    llmModule?: LLMModule
): Promise<AutofillProposal> {
    const llm = llmModule ?? (isMockResponse()
        ? undefined
        : new LLMModule({
            provider: (process.env.LLM_PROVIDER || 'ollama') as never,
            apiKey: process.env.LLM_API_KEY,
            endpoint: process.env.LLM_ENDPOINT,
            defaultModel: process.env.LLM_DEFAULT_MODEL
        }));

    if (!llm) {
        const known = new Set(draft.criteria.map((criterion) => criterion.id));
        const mocked = deterministicAutofillProposal(draft);
        return { ...mocked, criteria: mocked.criteria.filter((criterion) => known.has(criterion.id)) };
    }

    // sendStructuredConversation enforces JSON output at the API level (schema/function-
    // calling mode, provider-dependent) and returns already-validated data. Earlier code
    // used the plain sendMessage API with a prose-only prompt that never asked for JSON,
    // so a real model would sometimes answer in prose with no JSON at all.
    const messages: Message[] = [
        { role: 'user', content: buildAutofillPrompt(instructions, draft) }
    ];
    let validatedData: WithoutNull<z.infer<typeof autofillProposalSchema>>;
    try {
        const response = await llm.sendStructuredConversation(messages, autofillProposalSchema, {
            structuredOutputName: 'rubric_autofill'
        });
        // The structured-output schema accepts explicit `null` on every optional field
        // (the API requires it); stripNulls omits those keys entirely rather than
        // leaving them undefined, so this matches the plain absent-means-unset contract
        // WritingSflContextProfile/WritingRubricCriterion use, and never leaves an
        // undefined-valued key for MongoDB to serialize back as a stored null on write.
        validatedData = stripNulls(response.parsed);
    } catch {
        // Model errors and responses can echo the prompt body; never reuse the message.
        throw new Error('Auto-fill response was not usable');
    }

    // The model is told not to invent criteria. Anything it invented anyway is dropped
    // here, so the merge rules only ever see ids the draft already has.
    const known = new Set(draft.criteria.map((criterion) => criterion.id));
    const sflContext = validatedData.sflContext
        ? {
            ...validatedData.sflContext,
            task: clipToDraftLimit(validatedData.sflContext.task),
            purpose: clipToDraftLimit(validatedData.sflContext.purpose),
            audience: clipToDraftLimit(validatedData.sflContext.audience),
            field: clipToDraftLimit(validatedData.sflContext.field),
            tenor: clipToDraftLimit(validatedData.sflContext.tenor),
            mode: clipToDraftLimit(validatedData.sflContext.mode),
            actualEvaluator: clipToDraftLimit(validatedData.sflContext.actualEvaluator),
            productionConditions: clipToDraftLimit(validatedData.sflContext.productionConditions)
        }
        : undefined;
    return {
        title: validatedData.title,
        constraints: validatedData.constraints,
        learningOutcomes: validatedData.learningOutcomes,
        // The proposal schema allows more length than the draft validator does (see
        // `clipToDraftLimit`); clip here so a verbose response degrades to a slightly
        // shortened draft instead of being refused outright by the route's later check.
        task: clipToDraftLimit(validatedData.task),
        audience: clipToDraftLimit(validatedData.audience),
        purpose: clipToDraftLimit(validatedData.purpose),
        gradingIntent: clipToDraftLimit(validatedData.gradingIntent),
        sflContext,
        criteria: validatedData.criteria
            .filter((criterion) => known.has(criterion.id))
            .map((criterion) => ({ ...criterion, description: clipToDraftLimit(criterion.description) }))
    };
}
