/**
 * @fileoverview Relevance: only `supports` verdicts become citable, the call carries no
 * student text, mock mode supports everything, and failure is advisory.
 */

import type { LLMModule } from 'ubc-genai-toolkit-llm';
import type { GroundingExcerpt, RetrievalNeed } from '../course-material-mentions';
import { buildRelevancePairs, judgeRelevance, supportedByNeed } from '../material-relevance';

const needs: RetrievalNeed[] = [
    { id: 'stage:classify', kind: 'stage', label: 'Classification', query: 'q1', stageId: 'classify' },
    { id: 'function:theme', kind: 'language_function', label: 'Theme', query: 'q2' }
];
const excerpts: GroundingExcerpt[] = [
    { id: 'g1', text: 'Reports classify entities into types.', needIds: ['stage:classify', 'function:theme'], score: 0.9, published: true },
    { id: 'g2', text: 'Theme is the point of departure.', needIds: ['function:theme'], score: 0.8, published: true }
];

describe('material relevance', () => {
    const originalMock = process.env.MOCK_RESPONSE;
    afterEach(() => {
        if (originalMock === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = originalMock;
    });

    it('pairs each excerpt with every need that retrieved it', () => {
        expect(buildRelevancePairs(needs, excerpts).map((pair) => `${pair.needId}/${pair.excerptId}`))
            .toEqual(['stage:classify/g1', 'function:theme/g1', 'function:theme/g2']);
    });

    it('keeps only supports verdicts as citable', async () => {
        process.env.MOCK_RESPONSE = 'false';
        const pairs = buildRelevancePairs(needs, excerpts);
        const sendStructuredConversation = jest.fn(async (..._args: unknown[]) => ({
            parsed: { verdicts: [
                { pairId: pairs[0].pairId, verdict: 'supports' },
                { pairId: pairs[1].pairId, verdict: 'related' },
                { pairId: pairs[2].pairId, verdict: 'supports' }
            ] }
        }));
        const outcome = await judgeRelevance({ sendStructuredConversation } as unknown as LLMModule, pairs);
        const supported = supportedByNeed(pairs, outcome);
        expect([...supported.get('stage:classify') ?? []]).toEqual(['g1']);
        expect([...supported.get('function:theme') ?? []]).toEqual(['g2']);
        expect(sendStructuredConversation.mock.calls[0][2] as object).toMatchObject({ structuredOutputName: 'material_relevance' });
    });

    it('fails soft: a provider error leaves nothing citable', async () => {
        process.env.MOCK_RESPONSE = 'false';
        const sendStructuredConversation = jest.fn(async () => { throw new Error('provider down'); });
        const pairs = buildRelevancePairs(needs, excerpts);
        const outcome = await judgeRelevance({ sendStructuredConversation } as unknown as LLMModule, pairs);
        expect(outcome.failed).toBe(true);
        expect(supportedByNeed(pairs, outcome).size).toBe(0);
    });

    it('supports every pair in mock mode so deterministic runs still cite', async () => {
        process.env.MOCK_RESPONSE = 'true';
        const pairs = buildRelevancePairs(needs, excerpts);
        const outcome = await judgeRelevance(undefined, pairs);
        expect([...outcome.verdicts.values()].every((verdict) => verdict === 'supports')).toBe(true);
    });

    it('ignores verdicts for pair ids it never sent', async () => {
        process.env.MOCK_RESPONSE = 'false';
        const pairs = buildRelevancePairs(needs, excerpts);
        const sendStructuredConversation = jest.fn(async () => ({ parsed: { verdicts: [{ pairId: 'invented', verdict: 'supports' }] } }));
        const outcome = await judgeRelevance({ sendStructuredConversation } as unknown as LLMModule, pairs);
        expect(outcome.verdicts.has('invented')).toBe(false);
    });
});
