/**
 * SFL foundation runtime resource — curated analyzer rules and prompt versions
 *
 * Packages the paraphrased analyzer contracts from the shared SFL knowledge
 * foundation into a compact runtime allowlist. It contains stable ids, gates,
 * expectedness priors, and source locators only; raw source texts and student
 * submissions never enter this resource.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.0.0
 * @description: Owns the Writing Feedback V2 SFL rule/source allowlists.
 */

import {
    SFL_FOUNDATION_VERSION,
    WRITING_FEEDBACK_SCHEMA_V2,
    type WritingFoundedGenreId,
    type WritingFunctionTag,
    type WritingLanguageLevel
} from './contracts';

/** Analyzer prompt contract version stamped on V2 linguistic feedback runs. */
export const SFL_ANALYZER_PROMPT_VERSION = 'sfl-analyzer-v2.0.0';

/** Feedback-writer prompt contract version stamped on V2 linguistic feedback runs. */
export const SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v2.1.0';

/** Course-material mention resolver contract version stamped on V2 runs. */
export const COURSE_MATERIAL_RESOLVER_VERSION = 'course-material-mentions-v2.0.0';

/** Expectedness codes copied from the curated Ferreira rule catalog. */
export type SflExpectednessCode = 'O' | 'E' | 'P' | 'R';

/** One compact, source-backed analyzer rule available to the V2 pipeline. */
export interface SflAnalyzerRule {
    ruleId: string; // stable rule id from the curated feature-rule catalog
    summary: string; // paraphrased diagnostic proposition
    primaryFunction: WritingFunctionTag; // Content, Interpersonal, or Organizational
    crossFunctions: WritingFunctionTag[]; // secondary metafunctions used for synthesis
    languageLevel: WritingLanguageLevel; // text, section, or clause/word scale
    expectedness: Record<WritingFoundedGenreId, SflExpectednessCode>; // DR/DC/PS priors only
    gates: string[]; // applicability gates that must pass before feedback
    sourceIds: string[]; // staff-only source locators from the curated foundation
    dedupeKey?: string; // shared key for findings that must not double-penalize
}

const SOURCE_PREFIX = 'SRC-FERREIRA-2026-AI-FEEDBACK';

/**
 * Complete 42-rule Ferreira allowlist.
 *
 * Summaries are paraphrased from the curated local knowledge foundation; they are
 * operational labels, not raw source excerpts and not hidden rubric criteria.
 */
export const SFL_FERREIRA_RULES: ReadonlyArray<SflAnalyzerRule> = [
    { ruleId: 'C01', summary: 'Stage work fits the approved genre profile.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['genre_profile', 'stage_profile'], sourceIds: [`${SOURCE_PREFIX}#table-2-r02`], dedupeKey: 'GENRE_STAGING' },
    { ruleId: 'C02', summary: 'Knowledge develops across the text rather than appearing as disconnected facts.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['genre_profile', 'purpose'], sourceIds: [`${SOURCE_PREFIX}#table-2-r03`] },
    { ruleId: 'C03', summary: 'Information progression follows the genre logic confirmed by staff.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'E', problem_solution: 'O' }, gates: ['genre_profile', 'stage_profile'], sourceIds: [`${SOURCE_PREFIX}#table-2-r04`] },
    { ruleId: 'C04', summary: 'A required or supplied title identifies topic and purpose.', primaryFunction: 'content', crossFunctions: ['organizational', 'interpersonal'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['title_required'], sourceIds: [`${SOURCE_PREFIX}#table-2-r05`] },
    { ruleId: 'C05', summary: 'Sections perform the communicative work assigned to their stage.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['stage_profile', 'section_boundaries'], sourceIds: [`${SOURCE_PREFIX}#table-2-r06`] },
    { ruleId: 'C06', summary: 'Paragraphs or stage-equivalent units develop one coherent idea or claim.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['paragraph_units'], sourceIds: [`${SOURCE_PREFIX}#table-2-r07`] },
    { ruleId: 'C07', summary: 'New concepts are introduced or defined when the audience and task require it.', primaryFunction: 'content', crossFunctions: ['interpersonal'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'E', problem_solution: 'E' }, gates: ['concept_new_for_audience', 'definition_required'], sourceIds: [`${SOURCE_PREFIX}#table-2-r08`] },
    { ruleId: 'C08', summary: 'Logical relations support the section purpose.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['relation_resolvable'], sourceIds: [`${SOURCE_PREFIX}#table-2-r09`] },
    { ruleId: 'C09', summary: 'Examples, figures, data, or sources are integrated where the task provides or requires them.', primaryFunction: 'content', crossFunctions: ['interpersonal', 'organizational'], languageLevel: 'section', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['evidence_object_available'], sourceIds: [`${SOURCE_PREFIX}#table-2-r10`] },
    { ruleId: 'C10', summary: 'Participants are specific enough for the local purpose.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'E', problem_solution: 'O' }, gates: ['participant_detail_relevant'], sourceIds: [`${SOURCE_PREFIX}#table-2-r11`] },
    { ruleId: 'C11', summary: 'Processes match the clause purpose and participant roles.', primaryFunction: 'content', crossFunctions: ['interpersonal'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['clause_purpose_resolved'], sourceIds: [`${SOURCE_PREFIX}#table-2-r12`] },
    { ruleId: 'C12', summary: 'Definitions use an effective defining pattern for the move.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'P', problem_solution: 'E' }, gates: ['definition_move'], sourceIds: [`${SOURCE_PREFIX}#table-2-r13`] },
    { ruleId: 'C13', summary: 'Nominalization supports useful technical abstraction when appropriate.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'E', problem_solution: 'O' }, gates: ['technical_abstraction_relevant'], sourceIds: [`${SOURCE_PREFIX}#table-2-r14`] },
    { ruleId: 'C14', summary: 'Circumstances express relevant time, cause, purpose, condition, or location.', primaryFunction: 'content', crossFunctions: ['organizational'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['circumstance_relevant'], sourceIds: [`${SOURCE_PREFIX}#table-2-r15`] },
    { ruleId: 'I01', summary: 'Academic stance fits genre, audience, purpose, field, and tenor.', primaryFunction: 'interpersonal', crossFunctions: ['content', 'organizational'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['register_context'], sourceIds: [`${SOURCE_PREFIX}#table-3-r02`] },
    { ruleId: 'I02', summary: 'Certainty and evaluation match the claim and available evidence.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'text', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['claim_and_evidence_resolved'], sourceIds: [`${SOURCE_PREFIX}#table-3-r03`] },
    { ruleId: 'I03', summary: 'The text reflects supplied disciplinary expectations for evidence and objectivity.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['disciplinary_expectations_supplied'], sourceIds: [`${SOURCE_PREFIX}#table-3-r04`] },
    { ruleId: 'I04', summary: 'Support-requiring claims are linked to suitable evidence.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['support_requiring_claim', 'evidence_available'], sourceIds: [`${SOURCE_PREFIX}#table-3-r05`] },
    { ruleId: 'I05', summary: 'Claims are interpreted or evaluated in stages where the profile calls for that work.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'P', data_commentary: 'O', problem_solution: 'O' }, gates: ['evaluative_stage'], sourceIds: [`${SOURCE_PREFIX}#table-3-r06`] },
    { ruleId: 'I06', summary: 'The writer guides readers toward the intended interpretation where guidance is needed.', primaryFunction: 'interpersonal', crossFunctions: ['content', 'organizational'], languageLevel: 'section', expectedness: { descriptive_report: 'P', data_commentary: 'O', problem_solution: 'O' }, gates: ['reader_guidance_needed'], sourceIds: [`${SOURCE_PREFIX}#table-3-r07`] },
    { ruleId: 'I07', summary: 'Sources support key non-general claims where source use is required or permitted.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'E', problem_solution: 'O' }, gates: ['sources_required_or_used'], sourceIds: [`${SOURCE_PREFIX}#table-3-r08`] },
    { ruleId: 'I08', summary: 'Alternatives or limitations are acknowledged where the task or claim scope expects them.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'R', data_commentary: 'P', problem_solution: 'O' }, gates: ['limitations_expected'], sourceIds: [`${SOURCE_PREFIX}#table-3-r09`] },
    { ruleId: 'I09', summary: 'Used sources appear in the required end reference section.', primaryFunction: 'interpersonal', crossFunctions: ['organizational'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['sources_used', 'reference_list_required'], sourceIds: [`${SOURCE_PREFIX}#table-3-r10`] },
    { ruleId: 'I10', summary: 'Hedging and boosting match the strength of evidence.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'P', data_commentary: 'E', problem_solution: 'O' }, gates: ['contestable_claim'], sourceIds: [`${SOURCE_PREFIX}#table-3-r11`] },
    { ruleId: 'I11', summary: 'Attitudinal language remains appropriate for the academic context.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['academic_context_known'], sourceIds: [`${SOURCE_PREFIX}#table-3-r12`] },
    { ruleId: 'I12', summary: 'Tense, modality, and reporting verbs position knowledge and sources appropriately.', primaryFunction: 'interpersonal', crossFunctions: ['content', 'organizational'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['knowledge_status_represented'], sourceIds: [`${SOURCE_PREFIX}#table-3-r13`] },
    { ruleId: 'I13', summary: 'APA in-text citation and reference conventions are followed when required.', primaryFunction: 'interpersonal', crossFunctions: ['organizational'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['apa_required', 'citations_or_references_present'], sourceIds: [`${SOURCE_PREFIX}#table-3-r14`] },
    { ruleId: 'I14', summary: 'Vocabulary is formal, precise, and audience-appropriate for the field.', primaryFunction: 'interpersonal', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['field_and_audience_known'], sourceIds: [`${SOURCE_PREFIX}#table-3-r15`] },
    { ruleId: 'O01', summary: 'Stage sequence and boundaries fit the approved genre profile.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['genre_profile', 'stage_profile'], sourceIds: [`${SOURCE_PREFIX}#table-4-r02`], dedupeKey: 'GENRE_STAGING' },
    { ruleId: 'O02', summary: 'The opening previews organization where the task and length make that useful.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'P', problem_solution: 'O' }, gates: ['opening_preview_expected'], sourceIds: [`${SOURCE_PREFIX}#table-4-r03`] },
    { ruleId: 'O03', summary: 'The closing stage completes the genre-specific work expected by the profile.', primaryFunction: 'organizational', crossFunctions: ['content', 'interpersonal'], languageLevel: 'text', expectedness: { descriptive_report: 'P', data_commentary: 'P', problem_solution: 'O' }, gates: ['closing_stage_expected'], sourceIds: [`${SOURCE_PREFIX}#table-4-r04`] },
    { ruleId: 'O04', summary: 'Reference entries correspond to in-text citations when sources are used.', primaryFunction: 'organizational', crossFunctions: ['interpersonal'], languageLevel: 'text', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['citations_or_references_present'], sourceIds: [`${SOURCE_PREFIX}#table-4-r05`] },
    { ruleId: 'O05', summary: 'Paragraphs or stage-equivalent units maintain a clear thematic focus.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['paragraph_units'], sourceIds: [`${SOURCE_PREFIX}#table-4-r06`] },
    { ruleId: 'O06', summary: 'Information flows logically across adjacent sentences or paragraphs.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['multi_sentence_span'], sourceIds: [`${SOURCE_PREFIX}#table-4-r07`] },
    { ruleId: 'O07', summary: 'Logical transitions are signaled without formulaic overuse.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'E', data_commentary: 'E', problem_solution: 'O' }, gates: ['relation_needs_signaling'], sourceIds: [`${SOURCE_PREFIX}#table-4-r08`] },
    { ruleId: 'O08', summary: 'Cohesive resources make key ideas and participants trackable.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['discourse_span_trackable'], sourceIds: [`${SOURCE_PREFIX}#table-4-r09`] },
    { ruleId: 'O09', summary: 'Abstract claims or ideas are expanded enough for the audience.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'section', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['abstract_idea_needs_expansion'], sourceIds: [`${SOURCE_PREFIX}#table-4-r10`] },
    { ruleId: 'O10', summary: 'Theme choices provide effective points of departure in context.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['theme_analysis_reliable'], sourceIds: [`${SOURCE_PREFIX}#table-4-r11`] },
    { ruleId: 'O11', summary: 'New information develops toward clause endings where end-focus is relevant.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['end_focus_relevant'], sourceIds: [`${SOURCE_PREFIX}#table-4-r12`] },
    { ruleId: 'O12', summary: 'Background information comes before the main message where that helps the reader.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'E', data_commentary: 'O', problem_solution: 'O' }, gates: ['background_first_helpful'], sourceIds: [`${SOURCE_PREFIX}#table-4-r13`] },
    { ruleId: 'O13', summary: 'Clause structures are readable and suitable for formal written academic English.', primaryFunction: 'organizational', crossFunctions: ['content', 'interpersonal'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['formal_written_mode'], sourceIds: [`${SOURCE_PREFIX}#table-4-r14`] },
    { ruleId: 'O14', summary: 'Punctuation supports cohesion, readability, and information structure.', primaryFunction: 'organizational', crossFunctions: ['content'], languageLevel: 'clause_word', expectedness: { descriptive_report: 'O', data_commentary: 'O', problem_solution: 'O' }, gates: ['punctuation_affects_meaning'], sourceIds: [`${SOURCE_PREFIX}#table-4-r15`] }
];

/** Fast rule lookup by id for validation and prompt assembly. */
export const SFL_RULES_BY_ID = new Map(SFL_FERREIRA_RULES.map((rule) => [rule.ruleId, rule]));

/** Known source-id prefixes that analyzer and writer output may reference. */
export const SFL_SOURCE_PREFIXES = [
    SOURCE_PREFIX,
    'SRC-EGGINS-2004-SFL',
    'SRC-WALSH-MARR-F2F',
    'SRC-WALSH-MARR-THESIS-CH3',
    'SRC-WALSH-MARR-THESIS-CH5',
    'SRC-WALSH-MARR-THESIS-DISCUSSION'
] as const;

/** Stable V2 resource summary inserted into prompts without raw source text. */
export function sflFoundationPromptResource(): string {
    return JSON.stringify({
        schemaVersion: WRITING_FEEDBACK_SCHEMA_V2,
        foundationVersion: SFL_FOUNDATION_VERSION,
        rules: SFL_FERREIRA_RULES.map((rule) => ({
            id: rule.ruleId,
            summary: rule.summary,
            primaryFunction: rule.primaryFunction,
            crossFunctions: rule.crossFunctions,
            languageLevel: rule.languageLevel,
            expectedness: rule.expectedness,
            gates: rule.gates,
            sourceIds: rule.sourceIds,
            dedupeKey: rule.dedupeKey
        })),
        globalRules: [
            'Use official assignment profile and rubric before the general framework.',
            'Keep observation, interpretation, rubric evaluation, and confidence separate.',
            'Do not extrapolate DR/DC/PS expectedness codes to custom or composite genres.',
            'Exact student evidence is required for every finding that can reach feedback.',
            'C01 and O01 share GENRE_STAGING and must not double-penalize one issue.',
            'Abstain when context, source access, or evidence is insufficient.'
        ]
    });
}
