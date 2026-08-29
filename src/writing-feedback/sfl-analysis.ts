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
import { SFL_PROFILE_PLACEHOLDERS } from './default-rubric-profile';
import { createQuoteRelocator, MAX_EVIDENCE_QUOTE_LENGTH } from './feedback-schema';
import { stripNulls } from './strip-nulls';

const foundedGenres = new Set<WritingFoundedGenreId>([
    'descriptive_report',
    'data_commentary',
    'problem_solution'
]);

const idSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

// The model is asked for the quote only. It cannot count UTF-16 code units, and nothing
// downstream reads model-supplied offsets: anchored-comments.ts derives every stored
// offset itself with indexOf against the verified text. Asking for them only produced
// unverifiable values that failed the mandatory lens. SflEvidenceSpan keeps the optional
// fields so previously stored V2 runs still read back.
//
// .nullish() (optional + nullable), not .optional(): OpenAI's structured-output
// JSON-schema mode requires every non-required field to accept null explicitly.
// Capped at the same limit the feedback writer enforces (D-018). The writer is told to
// copy a quote verbatim from a validated span, so a longer span here would produce a
// writer result its own schema rejects.
const evidenceSpanSchema = z.object({
    quote: z.string().min(1).max(MAX_EVIDENCE_QUOTE_LENGTH)
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
    abstentionReason: z.string().trim().min(1).max(800).nullish(),
    stageId: z.string().trim().min(1).max(80).nullish()
});

/**
 * Structured output schema for the analyzer LLM call. `schemaVersion`/`foundationVersion`
 * are accepted from the model only to satisfy the structured-output contract; both are
 * always overwritten with the server's own constants in `validateSflAnalysis`'s return,
 * so no `.default()` (and no normalization) is needed for either.
 */
export const sflAnalysisSchema = z.object({
    schemaVersion: z.string().trim().min(1).nullish(),
    foundationVersion: z.string().trim().min(1).nullish(),
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

/**
 * Content-free description of why one evidence span failed validation.
 *
 * Carries only which check failed plus lengths/offsets — never a quote, never
 * student text — so the service debug boundary can log it verbatim.
 */
export interface SflEvidenceDiagnostic {
    reason:
        | 'quote_not_substring' // model quote is absent from the verified text entirely
        | 'offset_inverted' // endOffset <= startOffset
        | 'offset_out_of_range' // endOffset beyond the verified text
        | 'offset_mismatch'; // quote present, but not at the offsets the model supplied
    quoteLength: number;
    verifiedTextLength: number;
    startOffset?: number;
    endOffset?: number;
}

/**
 * spanFailure - classifies an evidence span against the verified text.
 *
 * @param span - Model-supplied evidence span
 * @param verifiedText - Staff-verified student text
 * @returns A content-free diagnostic when the span is invalid, otherwise undefined
 */
function spanFailure(
    span: { quote: string; startOffset?: number; endOffset?: number },
    verifiedText: string
): SflEvidenceDiagnostic | undefined {
    const base = {
        quoteLength: span.quote.length,
        verifiedTextLength: verifiedText.length,
        ...(span.startOffset === undefined ? {} : { startOffset: span.startOffset }),
        ...(span.endOffset === undefined ? {} : { endOffset: span.endOffset })
    };
    if (!verifiedText.includes(span.quote)) return { reason: 'quote_not_substring', ...base };
    if (span.startOffset === undefined || span.endOffset === undefined) return undefined;
    if (span.endOffset <= span.startOffset) return { reason: 'offset_inverted', ...base };
    if (span.endOffset > verifiedText.length) return { reason: 'offset_out_of_range', ...base };
    if (verifiedText.slice(span.startOffset, span.endOffset) !== span.quote) {
        return { reason: 'offset_mismatch', ...base };
    }
    return undefined;
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
    // The structured-output schema accepts explicit `null` on every optional field (the
    // API requires it); stripNulls omits those keys entirely so this matches the plain
    // absent-means-unset contract SflAnalysis/SflFinding/SflEvidenceSpan use.
    const parsed = stripNulls(sflAnalysisSchema.parse(analysis));
    const relocate = createQuoteRelocator(verifiedText);
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
        // Repair cosmetic quote drift against the verified text, exactly as the feedback
        // writer does. A quote that still cannot be located is a paraphrase or an
        // invention and must fail the run rather than reach a student.
        finding.evidence = finding.evidence.map((span) => {
            const exact = relocate(span.quote);
            if (exact === undefined) {
                // `diagnostic` is content-free (check name plus lengths) and is rendered by
                // describeFailureSafely at the service logging boundary.
                const error = new Error('SFL analysis evidence did not match the verified submission text');
                (error as Error & { diagnostic?: SflEvidenceDiagnostic }).diagnostic = {
                    reason: 'quote_not_substring',
                    quoteLength: span.quote.length,
                    verifiedTextLength: verifiedText.length
                };
                throw error;
            }
            return { ...span, quote: exact };
        });
        const residualFailure = finding.evidence
            .map((span) => spanFailure(span, verifiedText))
            .find((failure): failure is SflEvidenceDiagnostic => failure !== undefined);
        if (residualFailure) {
            const error = new Error('SFL analysis evidence did not match the verified submission text');
            (error as Error & { diagnostic?: SflEvidenceDiagnostic }).diagnostic = residualFailure;
            throw error;
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
    if (!profile) throw new Error('Complete the genre and register profile before approving the writing rubric');
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
        throw new Error('Complete the genre and register profile before approving the writing rubric');
    }
    if (profile.genreState === 'needs_staff_input') {
        throw new Error('Confirm the genre and register profile before approving the writing rubric');
    }
    const placeholders: Array<[string, string]> = [
        [profile.genreLabel, SFL_PROFILE_PLACEHOLDERS.genreLabel],
        [profile.task, SFL_PROFILE_PLACEHOLDERS.task],
        [profile.purpose, SFL_PROFILE_PLACEHOLDERS.purpose],
        [profile.audience, SFL_PROFILE_PLACEHOLDERS.audience],
        [profile.field, SFL_PROFILE_PLACEHOLDERS.field],
        [profile.tenor, SFL_PROFILE_PLACEHOLDERS.tenor],
        [profile.mode, SFL_PROFILE_PLACEHOLDERS.mode],
        [profile.productionConditions, SFL_PROFILE_PLACEHOLDERS.productionConditions]
    ];
    if (placeholders.some(([value, placeholder]) => value.trim() === placeholder)) {
        throw new Error('Complete the genre and register profile before approving the writing rubric — some fields still show their starting placeholder text');
    }
    if (!profile.stages.length || profile.stages.some((stage) => !stage.id.trim() || !stage.label.trim() || !stage.purpose.trim())) {
        throw new Error('Add at least one reviewed stage before approving the writing rubric');
    }
    if (!profile.taskRequirements.length || !profile.learningOutcomes.length) {
        throw new Error('Add task requirements and learning outcomes to the genre and register profile before approving the writing rubric');
    }
}
