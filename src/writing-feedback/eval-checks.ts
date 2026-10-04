/**
 * Writing Feedback eval checks — fixed pass/fail rules for the live eval
 *
 * Reads engine output structurally, so the same checks run on the baseline (which lacks
 * the diagnosis fields) and on the new pipeline. A missing field fails its check; it
 * never throws, because the baseline report is the point.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Pure scoring of one eval fixture's engine output.
 */

import type { EvalFixture } from './__tests__/fixtures/eval/eval-fixtures';
import { lintFeedbackProse } from './plain-language';

/** Loose view of engine output; every field optional so baseline output fits. */
export interface EvalRunOutput {
    verifiedText: string;
    result: {
        gateDecision?: string;
        criteria?: Array<{ explanation?: string; evidence?: Array<{ quote?: string; rationale?: string; revisionGuidance?: string; courseMaterialMention?: { id: string; label: string }; supportingExcerptId?: string; sflFindingIds?: string[] }> }>;
        strengths?: string[];
        revisionGoals?: Array<{ skillTag?: string; goal?: string; action?: string; guidedQuestion?: string }>;
        globalRevision?: { diagnosisStatement?: string; whatToKeep?: string[]; rewriteDirection?: string };
    };
    runTrace?: {
        gateDecision?: string;
        textDiagnosis?: {
            stages?: Array<{ stageId: string; status: string }>;
            contradictingFeatures?: Array<{ quote: string }>;
        };
        flags?: string[];
        sflAnalysis?: { findings?: Array<{ ruleIds?: string[] }> };
        supportedExcerptIds?: string[];
    };
    /** Annotations the student would see under the effective mode; absent on baseline. */
    studentComments?: Array<{ quote: string }>;
}

export interface EvalCheckResult {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    detail: string;
}

const THEME_RULES = new Set(['O10', 'O11', 'O05']);

function check(name: string, applies: boolean, passed: boolean, detail: string): EvalCheckResult {
    return { name, status: applies ? (passed ? 'pass' : 'fail') : 'skip', detail };
}

function normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * runEvalChecks - scores one fixture's engine output against its expectations.
 *
 * @param output - Engine result, trace and student-facing comments for one fixture
 * @param fixture - The fixture that produced it
 * @param knownTerms - Course terms students were taught; allowed by the plainLanguage check
 * @returns One result per check, in a fixed order
 */
export function runEvalChecks(output: EvalRunOutput, fixture: EvalFixture, knownTerms: string[] = []): EvalCheckResult[] {
    const { result, runTrace } = output;
    const expectation = fixture.expect;
    const mode = runTrace?.gateDecision ?? result.gateDecision;
    const stages = new Map((runTrace?.textDiagnosis?.stages ?? []).map((stage) => [stage.stageId, stage.status]));
    const contradicting = (runTrace?.textDiagnosis?.contradictingFeatures ?? []).map((feature) => normalize(feature.quote));
    const evidence = (result.criteria ?? []).flatMap((criterion) => criterion.evidence ?? []);
    const cited = evidence.filter((item) => item.courseMaterialMention);
    const supported = new Set(runTrace?.supportedExcerptIds ?? []);
    const goals = result.revisionGoals ?? [];

    const stageMismatches = Object.entries(expectation.stageStatuses ?? {})
        .filter(([stageId, status]) => stages.get(stageId) !== status)
        .map(([stageId, status]) => `${stageId}: expected ${status}, got ${stages.get(stageId) ?? 'absent'}`);

    // Plain language: the student sees rewrite feedback only when the run was gated to it.
    const plain = lintFeedbackProse({
        criteria: (result.criteria ?? []).map((criterion) => ({ explanation: criterion.explanation, evidence: criterion.evidence ?? [] })),
        strengths: result.strengths ?? [],
        revisionGoals: goals.map((goal) => ({ goal: goal.goal ?? '', action: goal.action, guidedQuestion: goal.guidedQuestion })),
        ...(mode === 'global_revision' && result.globalRevision ? { globalRevision: result.globalRevision } : {})
    }, knownTerms);
    const bannedPer100 = plain.words ? (100 * plain.bannedHits) / plain.words : 0;
    const longShare = plain.sentences ? plain.longSentences / plain.sentences : 0;

    return [
        check(
            'plainLanguage',
            plain.words > 0,
            bannedPer100 <= 1 && longShare <= 0.05,
            `${bannedPer100.toFixed(1)} analysis terms/100 words (${plain.bannedTerms.join(', ') || 'none'}); ${(longShare * 100).toFixed(0)}% sentences over 25 words`
        ),
        check('mode', Boolean(expectation.mode), mode === expectation.mode, `expected ${expectation.mode ?? '-'}, got ${mode ?? 'absent'}`),
        check('stageStatuses', Boolean(expectation.stageStatuses), stageMismatches.length === 0, stageMismatches.join('; ') || 'all match'),
        check(
            'strengthsGuard',
            true,
            !(result.strengths ?? []).some((strength) => contradicting.some((quote) => normalize(strength).includes(quote))),
            `${result.strengths?.length ?? 0} strengths against ${contradicting.length} contradicting features`
        ),
        check(
            'citationsSupported',
            true,
            cited.every((item) => item.supportingExcerptId !== undefined && supported.has(item.supportingExcerptId)),
            `${cited.length} citations, ${cited.filter((item) => item.supportingExcerptId && supported.has(item.supportingExcerptId)).length} supported`
        ),
        check(
            'minSupportedCitations',
            expectation.minSupportedCitations !== undefined,
            cited.filter((item) => item.supportingExcerptId && supported.has(item.supportingExcerptId)).length >= (expectation.minSupportedCitations ?? 0),
            `need ${expectation.minSupportedCitations ?? 0}`
        ),
        check(
            'noLocalAnnotationsInGlobal',
            expectation.mode === 'global_revision',
            output.studentComments !== undefined && output.studentComments.length === 0,
            `${output.studentComments?.length ?? 'unknown'} student-facing annotations`
        ),
        check('goalsHaveAction', true, goals.length > 0 && goals.every((goal) => Boolean(goal.action?.trim())), `${goals.filter((goal) => goal.action).length}/${goals.length} goals with action`),
        check(
            'firstGoalAddressesStage',
            Boolean(expectation.firstGoalAddressesStage),
            goals[0]?.skillTag === expectation.firstGoalAddressesStage,
            `first goal skillTag ${goals[0]?.skillTag ?? 'absent'}`
        ),
        check(
            'themeFinding',
            Boolean(expectation.expectThemeFinding),
            (runTrace?.sflAnalysis?.findings ?? []).some((finding) => (finding.ruleIds ?? []).some((ruleId) => THEME_RULES.has(ruleId))),
            'looks for O05/O10/O11'
        ),
        check('quotesExact', true, evidence.every((item) => !item.quote || output.verifiedText.includes(item.quote)), `${evidence.length} evidence quotes`),
        check(
            'flags',
            Boolean(expectation.flags?.length),
            (expectation.flags ?? []).every((flag) => runTrace?.flags?.includes(flag)),
            `expected ${(expectation.flags ?? []).join(', ') || '-'}`
        )
    ];
}
