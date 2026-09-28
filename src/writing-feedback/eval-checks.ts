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

/** Loose view of engine output; every field optional so baseline output fits. */
export interface EvalRunOutput {
    verifiedText: string;
    result: {
        gateDecision?: string;
        criteria?: Array<{ evidence?: Array<{ quote?: string; courseMaterialMention?: { id: string; label: string }; supportingExcerptId?: string; sflFindingIds?: string[] }> }>;
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
 * @returns One result per check, in a fixed order
 */
export function runEvalChecks(output: EvalRunOutput, fixture: EvalFixture): EvalCheckResult[] {
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

    return [
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
