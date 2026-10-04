/**
 * Plain-language contract — student-reader rules, SFL translations and a prose lint
 *
 * Vantage One LLED 200 students read feedback in English as an additional language
 * (about IELTS 5.5–6.5). The analyzer works in SFL terms on purpose; this module keeps
 * those terms out of what students read, and measures whether a draft did.
 *
 * @author: @rdschrs
 * @date: 2026-10-03
 * @version: 1.0.0
 * @description: Shared student-reader prompt contract and deterministic plain-language lint.
 */

import type { WritingSflContextProfile } from './contracts';

export const PLAIN_LANGUAGE_VERSION = 'plain-language-v1.0.0';

const MAX_SENTENCE_WORDS = 25;

/**
 * Standard lab-report vocabulary students use in their own reports. The technical lens
 * may use these without a gloss; explaining "uncertainty" to a lab student talks down.
 */
export const LAB_REPORT_FAMILIAR_TERMS: ReadonlyArray<string> = [
    'hypothesis', 'independent variable', 'dependent variable', 'controlled variable', 'trial',
    'uncertainty', 'percent error', 'percent difference', 'standard deviation', 'mean',
    'trendline', 'line of best fit', 'slope', 'R-squared', 'outlier', 'error bars',
    'calibration', 'significant figures', 'literature value', 'theoretical value', 'experimental value',
    'sample calculation', 'systematic error', 'random error', 'precision', 'accuracy'
];

/** Internal concept → wording the student sees. Order is the order the prompt lists them. */
export const SFL_PLAIN_TRANSLATIONS: ReadonlyArray<readonly [string, string]> = [
    ['Theme / thematic progression', '"the start of your sentence" / "what your sentences start with"'],
    ['relational process or clause', '"verbs such as is, has, consists of"'],
    ['material process or temporal sequence', '"describing steps in time order (first, then, finally)"'],
    ['timeless present', '"present tense (is, are), because these facts are always true"'],
    ['entity or participant', 'the name of the thing itself, e.g. "sound", "volcanoes"'],
    ['classification or composition stage', 'the stage label if it is a known term, or "a sentence that names the main types (or parts) of X"'],
    ['impersonal stance or tenor', '"write about the topic itself rather than about we or you"'],
    ['modality, hedging or calibration', '"how sure your sentence sounds (can, may, always)"'],
    ['evaluative language or appraisal', '"words that give your opinion, such as very dangerous"'],
    ['register', '"the formal style this assignment needs"'],
    ['cohesion or cohesive ties', '"words that link your sentences (this, these types, however)"'],
    ['nominalization', '"turning a verb into a noun (decide → decision)"'],
    ['positions the reader', '"makes the reader feel…" or "tells the reader…"']
];

/** Banned analysis terms: label shown to staff, and the pattern that finds it. */
const BANNED_TERMS: ReadonlyArray<readonly [string, RegExp]> = [
    // Capitalized mid-sentence only, so "theme" in everyday use passes.
    ['Theme', /(?<![.!?]\s)(?<!^)\bThemes?\b/],
    ['Rheme', /\brhemes?\b/i],
    ['relational process', /\brelational (process|processes|clause|clauses|verb|verbs)\b/i],
    ['material process', /\bmaterial process(es)?\b/i],
    ['mental process', /\bmental process(es)?\b/i],
    ['participant', /\bparticipants?\b/i],
    ['circumstance', /\bcircumstances?\b/i],
    ['entity', /\bentit(y|ies)\b/i],
    ['clause', /\bclauses?\b/i],
    ['nominalization', /\bnominali[sz]ations?\b/i],
    ['metafunction', /\bmetafunctions?\b/i],
    ['ideational', /\bideational\b/i],
    ['interpersonal', /\binterpersonal\b/i],
    ['textual', /\btextual\b/i],
    ['thematic', /\bthematic\b/i],
    ['positioning', /\bposition(s|ing|ed)? (the|a) reader\b|\bpositioning\b/i],
    ['calibrated', /\bcalibrat(e|ed|es|ing|ion)\b/i],
    ['register', /\bregister\b/i],
    ['modality', /\bmodality\b/i],
    ['hedging', /\bhedg(e|es|ed|ing)\b/i],
    ['stance', /\bstances?\b/i],
    ['appraisal', /\bappraisal\b/i],
    ['evaluative', /\bevaluative\b/i],
    ['foreground', /\bforeground(s|ed|ing)?\b/i],
    ['construe', /\bconstru(e|es|ed|ing)\b/i],
    ['tenor', /\btenor\b/i],
    ['technicality', /\btechnicality\b/i],
    ['cohesive ties', /\bcohesive\b|\bcohesion\b/i],
    ['lexical', /\blexical\b/i],
    ['grammatical metaphor', /\bgrammatical metaphor\b/i],
    ['timeless present', /\btimeless[- ]present\b/i],
    ['congruent', /\bcongruent\b/i]
];

/**
 * knownTermsFor - terms the course has taught for this assignment.
 *
 * @param sflContext - Staff-approved writing profile; absent on some technical rubrics
 * @returns Glossary terms, stage labels and the genre label, in that order
 */
export function knownTermsFor(
    sflContext?: Pick<WritingSflContextProfile, 'approvedGlossaryTerms' | 'stages' | 'genreLabel'>
): string[] {
    if (!sflContext) return [];
    return [
        ...(sflContext.approvedGlossaryTerms ?? []),
        ...(sflContext.stages ?? []).map((stage) => stage.label),
        ...(sflContext.genreLabel ? [sflContext.genreLabel] : [])
    ].map((term) => term.trim()).filter(Boolean);
}

/**
 * buildStudentReaderContract - rules every student-facing writer follows.
 *
 * @param knownTerms - Course terms students have been taught for this assignment; glossed on first use
 * @param familiarTerms - Everyday terms of the discipline, used freely without a gloss
 * @returns Prompt section; contains no student text
 */
export function buildStudentReaderContract(knownTerms: string[], familiarTerms: ReadonlyArray<string> = []): string {
    return [
        '<student_reader>',
        'The student is the final reader. They are a capable first-year university student writing in English as an additional language (about IELTS 5.5–6.5). Staff will review your text, but write it for the student.',
        'Plain does not mean simple. Keep the precise point and the correct course terms, and never talk down. No exclamation marks, no "Great job".',
        `- Address the student as "you". Use active voice. One idea per sentence. Aim for 20 words or fewer; never more than ${MAX_SENTENCE_WORDS} words.`,
        '- Use everyday words. Prefer verbs to abstract nouns: "you explain how sound travels", not "the text represents sound as a process".',
        '- Name the actual thing ("sound", "volcanoes"), never "the entity" or "the topic".',
        '- A rationale says what the quoted words do and what that means for the reader, in at most two sentences.',
        '- Revision guidance starts with a verb and gives one action the student can take on that passage, in at most two sentences.',
        '- A criterion explanation is at most three sentences.',
        '- Make each point once, in the place it fits best. Do not repeat the same advice under another criterion, goal, or the rewrite direction.',
        '- In a rewrite direction, write numbered steps, one per line, each one short sentence.',
        ...(familiarTerms.length
            ? [`- Standard terms the students use in their own reports (use them freely, no explanation needed): ${familiarTerms.map((term) => `"${term}"`).join(', ')}.`]
            : []),
        knownTerms.length
            ? `- Known course terms you may use: ${knownTerms.map((term) => `"${term}"`).join(', ')}. Give each one a short plain explanation the first time you use it, e.g. "a general statement (your first sentence, which says what X is)".`
            : familiarTerms.length ? '- No other course terms are listed.' : '- No course terms are listed. Use plain words only.',
        '- Your inputs (analysis findings, the profile, the rubric) use linguistics terms. Never copy them. Translate each one:',
        ...SFL_PLAIN_TRANSLATIONS.map(([internal, plain]) => `  ${internal} → ${plain}`),
        '- Never use these words with the student unless they are known course terms: Theme, clause, entity, participant, process, register, stance, modality, hedging, calibrated, positioning, interpersonal, evaluative, foreground, nominalization.',
        '</student_reader>'
    ].join('\n');
}

/** Removes quoted spans so student words and titles are not counted. */
function stripQuotes(text: string): string {
    return text.replace(/"[^"]*"|“[^”]*”|(?<!\w)'[^']+'(?!\w)|‘[^’]*’/g, ' ');
}

/** Splits on sentence ends, ignoring decimals and common abbreviations. */
function sentencesOf(text: string): string[] {
    const masked = text
        .replace(/\b(e\.g|i\.e|etc|vs|cf)\./gi, (match) => match.replace(/\./g, '\u0000'))
        .replace(/(\d)\.(\d)/g, '$1\u0000$2');
    return masked
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.replace(/\u0000/g, '.').trim())
        .filter((sentence) => /\w/.test(sentence));
}

function wordCount(text: string): number {
    return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

/**
 * lintStudentProse - plain-language issues in one student-facing string.
 *
 * @param text - Generated prose; quoted spans are ignored
 * @param knownTerms - Course terms that are allowed
 * @param maxSentences - Sentence ceiling for this field, if any
 * @returns Banned terms found, long-sentence and size counts
 */
export function lintStudentProse(text: string, knownTerms: string[], maxSentences?: number): PlainLanguageIssue {
    const known = knownTerms.map((term) => term.toLowerCase());
    const unquoted = stripQuotes(text);
    const bannedTerms = BANNED_TERMS
        // A known term wins over the ban, whether it contains the label or the pattern matches it.
        .filter(([label, pattern]) => !known.some((term) => term.includes(label.toLowerCase()) || pattern.test(term)))
        .filter(([, pattern]) => sentencesOf(unquoted).some((sentence) => pattern.test(sentence)))
        .map(([label]) => label);
    const sentences = sentencesOf(text);
    return {
        bannedTerms,
        longSentences: sentences.filter((sentence) => wordCount(sentence) > MAX_SENTENCE_WORDS).length,
        sentences: sentences.length,
        words: wordCount(text),
        tooManySentences: maxSentences !== undefined && sentences.length > maxSentences
    };
}

/**
 * lintFeedbackProse - aggregates the lint across every student-facing field.
 *
 * @param result - Writer, technical or redraft output
 * @param knownTerms - Course terms that are allowed
 * @returns Totals; holds term names and counts only
 */
export function lintFeedbackProse(result: LintableFeedback, knownTerms: string[]): PlainLanguageReport {
    const fields: Array<[string | undefined, number | undefined]> = [
        ...result.criteria.flatMap((criterion) => [
            [criterion.explanation, 3] as [string | undefined, number],
            ...criterion.evidence.flatMap((item) => [[item.rationale, 2], [item.revisionGuidance, 2]] as Array<[string | undefined, number]>)
        ]),
        ...result.strengths.map((strength) => [strength, undefined] as [string, undefined]),
        ...result.revisionGoals.flatMap((goal) => [goal.goal, goal.action, goal.guidedQuestion]
            .filter((text): text is string => Boolean(text))
            .map((text) => [text, undefined] as [string, undefined])),
        ...[result.globalRevision?.diagnosisStatement, result.globalRevision?.rewriteDirection]
            .filter((text): text is string => Boolean(text))
            .map((text) => [text, undefined] as [string, undefined])
    ];
    const issues = fields
        .filter((field): field is [string, number | undefined] => Boolean(field[0]?.trim()))
        .map(([text, max]) => lintStudentProse(text, knownTerms, max));
    return {
        bannedTerms: [...new Set(issues.flatMap((issue) => issue.bannedTerms))],
        bannedHits: issues.reduce((sum, issue) => sum + issue.bannedTerms.length, 0),
        longSentences: issues.reduce((sum, issue) => sum + issue.longSentences, 0),
        sentences: issues.reduce((sum, issue) => sum + issue.sentences, 0),
        words: issues.reduce((sum, issue) => sum + issue.words, 0),
        overLongComments: issues.filter((issue) => issue.tooManySentences).length
    };
}

/**
 * plainLanguageFlag - staff-only internal flag line, or nothing when clean.
 *
 * @param report - Aggregated lint
 * @returns A flag naming terms and counts, never prose
 */
export function plainLanguageFlag(report: PlainLanguageReport): string | undefined {
    if (!report.bannedHits && !report.longSentences && !report.overLongComments) return undefined;
    const terms = report.bannedTerms.length ? ` (${report.bannedTerms.join(', ')})` : '';
    return `Plain language: ${report.bannedHits} analysis term(s) students may not know${terms}; ${report.longSentences} sentence(s) over ${MAX_SENTENCE_WORDS} words; ${report.overLongComments} comment(s) over length.`;
}

/** One string's lint result. */
export interface PlainLanguageIssue {
    bannedTerms: string[];
    longSentences: number;
    sentences: number;
    words: number;
    tooManySentences: boolean;
}

/** Lint totals across a result. */
export interface PlainLanguageReport {
    bannedTerms: string[];
    bannedHits: number;
    longSentences: number;
    sentences: number;
    words: number;
    overLongComments: number;
}

/** Structural view of any student-facing result the lint reads. */
export interface LintableFeedback {
    criteria: Array<{ explanation?: string; evidence: Array<{ rationale?: string; revisionGuidance?: string }> }>;
    strengths: string[];
    revisionGoals: Array<{ goal: string; action?: string; guidedQuestion?: string }>;
    globalRevision?: { diagnosisStatement?: string; rewriteDirection?: string };
}
