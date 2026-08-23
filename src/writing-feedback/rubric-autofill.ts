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
    WritingRubricDefinition
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
    return {
        ...validated.data,
        criteria: validated.data.criteria.filter((criterion) => known.has(criterion.id))
    };
}
