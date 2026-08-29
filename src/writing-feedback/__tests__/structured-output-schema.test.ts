/**
 * Structured-output JSON-schema contract tests.
 *
 * The provider rejects a response_format schema containing a typeless node. Reusing one
 * Zod object instance at two points in a schema makes zod-to-json-schema emit a `$ref`
 * back to the definition being defined, paired with `{"not":{}}` for the optional branch:
 *
 *   400 Invalid schema for response_format 'writing_feedback_v2':
 *   In context=('anyOf','0','not'), schema must have a 'type' key.
 *
 * These tests pin the generated schema shape so the failure is caught without a model call.
 *
 * @author: @rdschrs
 * @date: 2026-08-25
 */

import { zodResponseFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';
import { buildFeedbackSchema } from '../feedback-schema';
import { sflAnalysisSchema } from '../sfl-analysis';
import { autofillProposalSchema } from '../rubric-autofill';
import { describeFailureSafely } from '../writing-feedback-service';
import type { WritingRubricDefinition } from '../contracts';

const rubric = {
    version: 1,
    status: 'approved',
    criteria: [
        { id: 'organization', label: 'Organization', description: 'How the text is staged.' },
        { id: 'content', label: 'Content', description: 'How the subject is developed.' },
        { id: 'interpersonal_positioning', label: 'Interpersonal Positioning', description: 'Stance.' }
    ],
    levels: [
        { id: 'weak', label: 'Weak', description: 'w', rank: 1 },
        { id: 'developing', label: 'Developing', description: 'd', rank: 2 },
        { id: 'proficient', label: 'Proficient', description: 'p', rank: 3 },
        { id: 'exemplary', label: 'Exemplary', description: 'e', rank: 4 }
    ]
} as unknown as WritingRubricDefinition;

/** Collects the JSON path of every `not` node, which is always typeless in this encoding. */
function findNotNodes(node: unknown, path: string[] = []): string[] {
    if (Array.isArray(node)) {
        return node.flatMap((entry, index) => findNotNodes(entry, [...path, String(index)]));
    }
    if (!node || typeof node !== 'object') return [];
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => (
        key === 'not' ? [[...path, key].join('.')] : findNotNodes(value, [...path, key])
    ));
}

/** Finds the nested `definitions` map wherever the response-format wrapper places it. */
function findDefinitions(node: unknown): Record<string, unknown> | undefined {
    if (!node || typeof node !== 'object') return undefined;
    const entries = node as Record<string, unknown>;
    if (entries.definitions && typeof entries.definitions === 'object') {
        return entries.definitions as Record<string, unknown>;
    }
    for (const value of Object.values(entries)) {
        const found = findDefinitions(value);
        if (found) return found;
    }
    return undefined;
}

/** Collects definition names whose own subtree `$ref`s back to that same definition. */
function findSelfReferences(schema: unknown): string[] {
    const definitions = findDefinitions(schema);
    if (!definitions) return [];
    return Object.entries(definitions)
        .filter(([name, value]) => JSON.stringify(value).includes(`#/definitions/${name}"`))
        .map(([name]) => name);
}

function generatedSchema(schema: ZodType<unknown>, name: string): unknown {
    return JSON.parse(JSON.stringify(zodResponseFormat(schema, name)));
}

describe('structured-output JSON schemas', () => {
    it('emits no typeless `not` node for the feedback writer schema', () => {
        const schema = generatedSchema(buildFeedbackSchema(rubric) as ZodType<unknown>, 'writing_feedback_v2');
        expect(findNotNodes(schema)).toEqual([]);
    });

    it('emits no self-referential definition for the feedback writer schema', () => {
        const schema = generatedSchema(buildFeedbackSchema(rubric) as ZodType<unknown>, 'writing_feedback_v2');
        expect(findSelfReferences(schema)).toEqual([]);
    });

    it('emits no typeless `not` node for the SFL analyzer schema', () => {
        const schema = generatedSchema(sflAnalysisSchema as ZodType<unknown>, 'sfl_analysis');
        expect(findNotNodes(schema)).toEqual([]);
    });

    it('emits no typeless `not` node for the rubric auto-fill schema', () => {
        const schema = generatedSchema(autofillProposalSchema as ZodType<unknown>, 'rubric_autofill');
        expect(findNotNodes(schema)).toEqual([]);
    });

    it('holds for a single-criterion rubric, where dedup pressure is highest', () => {
        const minimal = {
            ...rubric,
            criteria: [{ id: 'content', label: 'Content', description: 'Only criterion.' }]
        } as unknown as WritingRubricDefinition;
        const schema = generatedSchema(buildFeedbackSchema(minimal) as ZodType<unknown>, 'writing_feedback_v2');
        expect(findNotNodes(schema)).toEqual([]);
        expect(findSelfReferences(schema)).toEqual([]);
    });
});

describe('describeFailureSafely', () => {
    const STUDENT_TEXT = 'The centrifugal pump was tested at three impeller speeds.';

    it('withholds a model/SDK error message that could echo the prompt', () => {
        const error = Object.assign(
            new Error(`Invalid request. Received prompt: ${STUDENT_TEXT}`),
            { code: 400, status: 400, type: 'invalid_request_error' }
        );

        const described = describeFailureSafely(error);

        expect(described).not.toContain(STUDENT_TEXT);
        expect(described).toContain('message withheld');
        expect(described).toContain('400');
    });

    it('keeps a fixed developer-authored message and its content-free diagnostic', () => {
        const error = Object.assign(
            new Error('SFL analysis evidence did not match the verified submission text'),
            { diagnostic: { reason: 'quote_not_substring', quoteLength: 12, verifiedTextLength: 900 } }
        );

        const described = describeFailureSafely(error);

        expect(described).toContain('SFL analysis evidence did not match the verified submission text');
        expect(described).toContain('quote_not_substring');
    });

    it('reports Zod issue paths and codes without any offending value', () => {
        const schema = buildFeedbackSchema(rubric);
        const parsed = schema.safeParse({ criteria: [], strengths: [], revisionGoals: [], internalFlags: [] });
        expect(parsed.success).toBe(false);

        const described = describeFailureSafely((parsed as { error: unknown }).error);

        expect(described).toContain('criteria');
        expect(described).not.toContain(STUDENT_TEXT);
    });
});
