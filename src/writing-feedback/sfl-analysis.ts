/**
 * SFL analysis validation — exact evidence and rule/source gates
 *
 * Validates the dedicated analyzer call before any feedback prose is written.
 * The checks enforce the V2 boundary: observations are exact and descriptive,
 * functional interpretations are separate, and Ferreira expectedness is used
 * only for supported staff-confirmed genre profiles.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.0.0
 * @description: Owns Writing Feedback V2 analyzer schemas and deterministic validation.
 */

import { z } from 'zod';
import {
    SFL_FOUNDATION_VERSION,
    WRITING_FEEDBACK_SCHEMA_V2,
    type SflAnalysis,
    type SflFinding,
    type WritingFoundedGenreId,
    type WritingSflContextProfile
} from './contracts';
import { SFL_RULES_BY_ID, SFL_SOURCE_PREFIXES } from './sfl-foundation';

const foundedGenres = new Set<WritingFoundedGenreId>([
    'descriptive_report',
    'data_commentary',
    'problem_solution'
]);

const idSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

const evidenceSpanSchema = z.object({
    quote: z.string().min(1).max(4000),
    startOffset: z.number().int().min(0).optional(),
    endOffset: z.number().int().min(1).optional()
});

const findingSchema = z.object({
    id: idSchema,
    evidence: z.array(evidenceSpanSchema).min(1).max(4),
    observation: z.string().trim().min(1).max(1200),
    functionalInterpretation: z.string().trim().min(1).max(1600),
    primaryFunction: z.enum(['content', 'interpersonal', 'organizational']),
    crossFunctions: z.array(z.enum(['content', 'interpersonal', 'organizational'])).max(2),
    languageLevel: z.enum(['text', 'section', 'clause_word']),
    ruleIds: z.array(z.string().trim().min(1).max(12)).max(6),
    sourceIds: z.array(z.string().trim().min(1).max(120)).max(8),
    confidence: z.number().min(0).max(1),
    alternatives: z.array(z.string().trim().min(1).max(500)).max(5),
    abstentionReason: z.string().trim().min(1).max(800).optional(),
    stageId: z.string().trim().min(1).max(80).optional()
});

/** Structured output schema for the analyzer LLM call. */
export const sflAnalysisSchema = z.object({
    schemaVersion: z.string().trim().min(1).default(WRITING_FEEDBACK_SCHEMA_V2),
    foundationVersion: z.string().trim().min(1).default(SFL_FOUNDATION_VERSION),
    profileGenreState: z.enum(['declared', 'staff_confirmed', 'custom', 'composite', 'needs_staff_input']),
    findings: z.array(findingSchema).max(18),
    abstentions: z.array(z.string().trim().min(1).max(800)).max(12),
    internalFlags: z.array(z.string().trim().min(1).max(300)).max(12)
});

function isFoundedGenre(profile: WritingSflContextProfile): profile is WritingSflContextProfile & { genreId: WritingFoundedGenreId } {
    return typeof profile.genreId === 'string' && foundedGenres.has(profile.genreId as WritingFoundedGenreId);
}

function sourceAllowed(sourceId: string): boolean {
    return SFL_SOURCE_PREFIXES.some((prefix) => sourceId === prefix || sourceId.startsWith(`${prefix}#`));
}

function exactSpan(span: { quote: string; startOffset?: number; endOffset?: number }, verifiedText: string): boolean {
    if (!verifiedText.includes(span.quote)) return false;
    if (span.startOffset === undefined || span.endOffset === undefined) return true;
    return span.endOffset > span.startOffset
        && span.endOffset <= verifiedText.length
        && verifiedText.slice(span.startOffset, span.endOffset) === span.quote;
}

/**
 * validateSflAnalysis - validates analyzer output before feedback writing.
 *
 * @param analysis - Parsed analyzer output
 * @param verifiedText - Staff-verified student text used for exact evidence
 * @param profile - Approved assignment genre/register profile
 * @returns Validated analysis with normalized schema/foundation versions
 * @throws Error when evidence, rule ids, source ids, profile applicability, or
 *         observation/interpretation separation fails
 */
export function validateSflAnalysis(
    analysis: unknown,
    verifiedText: string,
    profile: WritingSflContextProfile
): SflAnalysis {
    const parsed = sflAnalysisSchema.parse(analysis);
    const ids = new Set<string>();
    const stageIds = new Set(profile.stages.map((stage) => stage.id));
    const founded = isFoundedGenre(profile);
    const dedupeByEvidence = new Set<string>();

    parsed.findings.forEach((finding: SflFinding, index: number) => {
        if (ids.has(finding.id)) {
            throw new Error('SFL analysis reused a finding id');
        }
        ids.add(finding.id);

        if (finding.observation.trim() === finding.functionalInterpretation.trim()) {
            throw new Error('SFL observation and interpretation must remain separate');
        }
        if (finding.stageId && !stageIds.has(finding.stageId)) {
            throw new Error('SFL analysis referenced a stage outside the approved profile');
        }
        if (finding.evidence.some((span) => !exactSpan(span, verifiedText))) {
            throw new Error('SFL analysis evidence did not match the verified submission text');
        }
        if (!founded && finding.ruleIds.length > 0) {
            throw new Error('Ferreira expectedness rules cannot be extrapolated to a custom genre');
        }
        finding.ruleIds.forEach((ruleId) => {
            if (!SFL_RULES_BY_ID.has(ruleId)) {
                throw new Error('SFL analysis referenced an unknown rule id');
            }
        });
        finding.sourceIds.forEach((sourceId) => {
            if (!sourceAllowed(sourceId)) {
                throw new Error('SFL analysis referenced an unknown source id');
            }
        });

        const dedupeKeys = finding.ruleIds
            .map((ruleId) => SFL_RULES_BY_ID.get(ruleId)?.dedupeKey)
            .filter((key): key is string => Boolean(key));
        for (const key of dedupeKeys) {
            const evidenceKey = `${key}:${finding.evidence.map((span) => span.quote).join('|')}`;
            if (dedupeByEvidence.has(evidenceKey)) {
                throw new Error('SFL analysis duplicated a genre-staging finding');
            }
            dedupeByEvidence.add(evidenceKey);
        }

        // Record the index in the error path by throwing after deterministic checks,
        // while keeping the message content-free.
        if (index >= 18) throw new Error('SFL analysis returned too many findings');
    });

    return {
        ...parsed,
        schemaVersion: WRITING_FEEDBACK_SCHEMA_V2,
        foundationVersion: SFL_FOUNDATION_VERSION,
        profileGenreState: profile.genreState
    };
}

/**
 * requireCompleteSflProfile - approval/generation gate for linguistic V2.
 *
 * Drafts may be incomplete while staff are editing. Approval and generation require
 * enough profile context to avoid hidden genre/register requirements.
 *
 * @param profile - Candidate rubric profile
 * @throws Error with a staff-facing message when required context is missing
 */
export function requireCompleteSflProfile(profile: WritingSflContextProfile | undefined): asserts profile is WritingSflContextProfile {
    if (!profile) throw new Error('Complete the SFL assignment profile before approving the writing rubric');
    const requiredText = [
        profile.genreLabel,
        profile.task,
        profile.purpose,
        profile.audience,
        profile.field,
        profile.tenor,
        profile.mode,
        profile.actualEvaluator,
        profile.productionConditions
    ];
    if (requiredText.some((value) => !value.trim())) {
        throw new Error('Complete the SFL assignment profile before approving the writing rubric');
    }
    if (profile.genreState === 'needs_staff_input') {
        throw new Error('Confirm the assignment genre/register profile before approving the writing rubric');
    }
    if (!profile.stages.length || profile.stages.some((stage) => !stage.id.trim() || !stage.label.trim() || !stage.purpose.trim())) {
        throw new Error('Add at least one reviewed SFL stage before approving the writing rubric');
    }
    if (!profile.taskRequirements.length || !profile.learningOutcomes.length) {
        throw new Error('Add SFL task requirements and learning outcomes before approving the writing rubric');
    }
}
