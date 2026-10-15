/**
 * Material relevance — decides which retrieved course text may be cited
 *
 * Vector similarity finds text about the same words, not text that teaches the point.
 * One batched call judges each excerpt against the curated need that retrieved it, and
 * only `supports` makes an excerpt citable. The call sees course text and curated labels;
 * student writing never reaches it.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Relevance pairs, the batched relevance call, and the supported-excerpt map.
 */

import { z } from 'zod';
import type { LLMModule, LLMOptions, Message } from 'ubc-genai-toolkit-llm';
import { isMockResponse } from '../helpers/mock-response';
import type { GroundingExcerpt, RetrievalNeed } from './course-material-mentions';

export type RelevanceVerdict = 'supports' | 'related' | 'irrelevant';

export interface RelevancePair {
    pairId: string;
    needId: string;
    needLabel: string;
    excerptId: string;
    excerptText: string;
}

export interface RelevanceOutcome {
    verdicts: Map<string, RelevanceVerdict>;
    failed: boolean;
}

/** Bounded so one call stays small: 14 genre needs or 8 finding clusters × a few excerpts. */
export const MAX_RELEVANCE_PAIRS = 60;

export const materialRelevanceSchema = z.object({
    verdicts: z.array(z.object({
        pairId: z.string().trim().min(1).max(40),
        verdict: z.enum(['supports', 'related', 'irrelevant'])
    })).max(MAX_RELEVANCE_PAIRS)
});

/**
 * buildRelevancePairs - one pair per (need, excerpt) that retrieval connected.
 *
 * @param needs - Needs that were queried
 * @param excerpts - Excerpts retrieved for them
 * @returns Pairs in excerpt order, capped at {@link MAX_RELEVANCE_PAIRS}
 */
export function buildRelevancePairs(needs: RetrievalNeed[], excerpts: GroundingExcerpt[]): RelevancePair[] {
    const labels = new Map(needs.map((need) => [need.id, need.label]));
    const pairs: RelevancePair[] = [];
    excerpts.forEach((excerpt) => excerpt.needIds.forEach((needId) => {
        const needLabel = labels.get(needId);
        if (!needLabel) return;
        pairs.push({ pairId: `p${pairs.length + 1}`, needId, needLabel, excerptId: excerpt.id, excerptText: excerpt.text });
    }));
    return pairs.slice(0, MAX_RELEVANCE_PAIRS);
}

function relevanceSystemPrompt(): string {
    return [
        'You check whether course material teaches a specific writing point, for a staff feedback workspace.',
        'For each pair, read the need (a writing expectation) and the excerpt (course text) and return one verdict:',
        '- "supports": the excerpt explains, defines, or models this exact expectation, so a student sent to it would learn how to meet it.',
        '- "related": same topic, but it would not teach this expectation.',
        '- "irrelevant": it does not address the expectation.',
        'Be strict: a shared keyword is not support. Return one verdict per pairId you were given, and no others.'
    ].join('\n');
}

/**
 * judgeRelevance - one batched structured call over every pair.
 *
 * @param llm - Model adapter; undefined in mock mode
 * @param pairs - Pairs to judge; contain no student text
 * @param llmCallOptions - Per-course model options
 * @returns Verdicts by pair id; `failed` when the call could not be made or parsed
 */
export async function judgeRelevance(
    llm: LLMModule | undefined,
    pairs: RelevancePair[],
    llmCallOptions?: LLMOptions
): Promise<RelevanceOutcome> {
    if (!pairs.length) return { verdicts: new Map(), failed: false };
    if (isMockResponse() || !llm) {
        return { verdicts: new Map(pairs.map((pair) => [pair.pairId, 'supports' as const])), failed: false };
    }
    try {
        const messages: Message[] = [
            { role: 'system', content: relevanceSystemPrompt() },
            {
                role: 'user',
                content: `<pairs>${JSON.stringify(pairs.map(({ pairId, needLabel, excerptText }) => ({ pairId, need: needLabel, excerpt: excerptText })))}</pairs>`
            }
        ];
        const response = await llm.sendStructuredConversation(messages, materialRelevanceSchema, {
            structuredOutputName: 'material_relevance',
            ...llmCallOptions
        });
        const known = new Set(pairs.map((pair) => pair.pairId));
        const verdicts = new Map<string, RelevanceVerdict>();
        materialRelevanceSchema.parse(response.parsed).verdicts.forEach(({ pairId, verdict }) => {
            if (known.has(pairId)) verdicts.set(pairId, verdict);
        });
        return { verdicts, failed: false };
    } catch {
        return { verdicts: new Map(), failed: true };
    }
}

/**
 * supportedByNeed - excerpt ids judged `supports`, grouped by need.
 *
 * @param pairs - Pairs that were judged
 * @param outcome - Verdicts from {@link judgeRelevance}
 * @returns Map from need id to supporting excerpt ids; needs with none are absent
 */
export function supportedByNeed(pairs: RelevancePair[], outcome: RelevanceOutcome): Map<string, Set<string>> {
    const supported = new Map<string, Set<string>>();
    pairs.forEach((pair) => {
        if (outcome.verdicts.get(pair.pairId) !== 'supports') return;
        const set = supported.get(pair.needId) ?? new Set<string>();
        set.add(pair.excerptId);
        supported.set(pair.needId, set);
    });
    return supported;
}
