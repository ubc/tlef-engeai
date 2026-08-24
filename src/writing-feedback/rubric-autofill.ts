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
import { LLMModule } from 'ubc-genai-toolkit-llm';
import { isMockResponse } from '../helpers/mock-response';
import type {
    WritingAssignment,
    WritingFeedbackLens,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingSflContextProfile
} from './contracts';

/** Where a draft's grid came from, which decides how much auto-fill may rewrite. */
export type RubricGridSource = 'canvas' | 'apsc182' | 'metafunctions_lab' | 'metafunctions_plain';

/**
 * gridSourceFor - the merge-table row an assignment's grid falls under for a lens.
 *
 * The technical grid is always the department's APSC 182 form: `buildLabReportRubric`
 * is its only source, and it is never Canvas-seeded, so the lens is checked first and
 * a Canvas-sourced assignment does not leak into the technical branch. `rubricSource`
 * is assignment-wide rather than per-lens and is consulted only for the writing lens,
 * where it distinguishes an instructor's imported grid from a generated one.
 *
 * @param assignment - Assignment whose grid provenance is being classified
 * @param lens - Lens the draft being filled belongs to
 * @returns The grid source row that decides `autofillMergeRules`
 */
export function gridSourceFor(assignment: WritingAssignment, lens: WritingFeedbackLens): RubricGridSource {
    if (lens === 'technical') return 'apsc182';
    if (assignment.rubricSource === 'canvas') return 'canvas';
    return assignment.isLabReport ? 'metafunctions_lab' : 'metafunctions_plain';
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
        // A lab handout describes an experiment, not linguistic expectations, so the
        // metafunctions stay fixed and only their meaning for this lab is written.
        case 'metafunctions_lab':
            return { mayAddRows: false, mayWriteRow: true, mayWriteCells: true };
        case 'metafunctions_plain':
            return { mayAddRows: true, mayWriteRow: true, mayWriteCells: true };
    }
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
        return {
            ...criterion,
            // The row's own text and weight move together: where rows are fixed, the
            // description belongs to whoever authored the row, not to the model.
            ...(rules.mayWriteRow && match.description ? { description: match.description } : {}),
            ...(rules.mayWriteRow && match.points !== undefined ? { points: match.points } : {}),
            ...(rules.mayWriteCells && match.cells ? { cells: match.cells } : {})
        };
    });

    if (rules.mayAddRows) {
        const existing = new Set(draft.criteria.map((criterion) => criterion.id));
        proposal.criteria
            .filter((criterion) => !existing.has(criterion.id))
            .forEach((criterion) => criteria.push({ ...criterion }));
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

/** Shape the model must return. Anything else is discarded rather than repaired. */
const autofillProposalSchema = z.object({
    title: z.string().trim().max(160),
    task: z.string().trim().max(2000),
    audience: z.string().trim().max(2000),
    purpose: z.string().trim().max(2000),
    constraints: z.array(z.string().trim().min(1).max(300)).max(12),
    learningOutcomes: z.array(z.string().trim().min(1).max(400)).max(12),
    gradingIntent: z.string().trim().max(2000),
    sflContext: z.object({
        genreId: z.string().trim().min(1).max(120).optional(),
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
            required: z.boolean().optional(),
            order: z.number().int().min(1).max(50).optional()
        })).min(1).max(20),
        embeddedGenres: z.array(z.string().trim().min(1).max(160)).max(12),
        taskRequirements: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
        learningOutcomes: z.array(z.string().trim().min(1).max(400)).min(1).max(20),
        approvedGlossaryTerms: z.array(z.string().trim().min(1).max(80)).max(30).optional()
    }).optional(),
    criteria: z.array(z.object({
        id: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(80),
        description: z.string().trim().max(2000),
        points: z.number().finite().min(0).max(1000).optional(),
        cells: z.record(z.object({
            min: z.number().finite().min(0).max(1000),
            max: z.number().finite().min(0).max(1000),
            descriptor: z.string().trim().max(400).optional()
        })).optional()
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

    const response = await llm.sendMessage(buildAutofillPrompt(instructions, draft), {});
    const raw = String((response as { content?: unknown }).content ?? '');

    // Models wrap JSON in prose or fences often enough that the object must be located
    // rather than assumed to be the whole response.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Auto-fill response was not usable');

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
        // The caught error can quote the response body; it is deliberately not reused.
        throw new Error('Auto-fill response was not usable');
    }

    const validated = autofillProposalSchema.safeParse(parsed);
    if (!validated.success) throw new Error('Auto-fill response was not usable');

    // The model is told not to invent criteria. Anything it invented anyway is dropped
    // here, so the merge rules only ever see ids the draft already has.
    const known = new Set(draft.criteria.map((criterion) => criterion.id));
    const sflContext = validated.data.sflContext
        ? {
            ...validated.data.sflContext,
            task: clipToDraftLimit(validated.data.sflContext.task),
            purpose: clipToDraftLimit(validated.data.sflContext.purpose),
            audience: clipToDraftLimit(validated.data.sflContext.audience),
            field: clipToDraftLimit(validated.data.sflContext.field),
            tenor: clipToDraftLimit(validated.data.sflContext.tenor),
            mode: clipToDraftLimit(validated.data.sflContext.mode),
            actualEvaluator: clipToDraftLimit(validated.data.sflContext.actualEvaluator),
            productionConditions: clipToDraftLimit(validated.data.sflContext.productionConditions)
        }
        : undefined;
    return {
        ...validated.data,
        // The proposal schema allows more length than the draft validator does (see
        // `clipToDraftLimit`); clip here so a verbose response degrades to a slightly
        // shortened draft instead of being refused outright by the route's later check.
        task: clipToDraftLimit(validated.data.task),
        audience: clipToDraftLimit(validated.data.audience),
        purpose: clipToDraftLimit(validated.data.purpose),
        gradingIntent: clipToDraftLimit(validated.data.gradingIntent),
        ...(sflContext ? { sflContext } : {}),
        criteria: validated.data.criteria
            .filter((criterion) => known.has(criterion.id))
            .map((criterion) => ({ ...criterion, description: clipToDraftLimit(criterion.description) }))
    };
}
