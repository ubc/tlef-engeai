// public/scripts/feature/scenario-answer-flashcard.ts

/**
 * scenario-answer-flashcard.ts
 *
 * Deterministic parser that splits markdown answer keys into step-by-step flashcards
 * for instructor preview and student practice. No LLM.
 *
 * Card boundary: `# Title` (ATX h1) only. Body under each heading is
 * latex-supported markdown until the next `#`. Answer key must start with
 * `# Title`; leading prose or missing first title → no cards.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-09
 * @version: 1.4.0
 * @description: Parse answer-key markdown into navigable flashcard steps.
 */

/** One navigable flashcard step derived from markdown answer key. */
export interface FlashcardStep {
    index: number;
    title: string;
    bodyMarkdown: string;
}

/** Line-aware parse failure for instructor empty-state diagnostics. */
export interface FlashcardParseError {
    line: number;
    excerpt: string;
    reason: string;
}

/** Detailed parse result — steps on success, error when unrenderable. */
export type FlashcardParseResult =
    | { steps: FlashcardStep[]; error: null }
    | { steps: []; error: FlashcardParseError };

/** Soft background tone count for `sg-*-flashcard--tone-{n}` classes. */
export const FLASHCARD_TONE_COUNT = 5;

const PART_ID_CHARS = ['a', 'b', 'c', 'd'] as const;

/** Human-readable label for subquestion type pills. */
export const SUB_QUESTION_TYPE_LABELS: Record<string, string> = {
    calculation: 'Calculation',
    troubleshoot: 'Troubleshoot',
    action: 'Action',
    corrective: 'Corrective'
};

/**
 * parseAnswerKeyFlashcardsDetailed
 *
 * Only `# Title` headings become cards. The answer key must begin with `#`;
 * leading prose (missing first-card title) returns an error with line + excerpt.
 *
 * @param markdown - Raw model answer markdown
 * @returns Steps or a line-aware parse error
 */
export function parseAnswerKeyFlashcardsDetailed(markdown: string): FlashcardParseResult {
    const trimmed = markdown.trim();
    if (!trimmed) {
        return {
            steps: [],
            error: { line: 1, excerpt: '', reason: 'Answer key is empty' }
        };
    }

    const normalized = trimmed.replace(/\n{3,}/g, '\n\n');
    if (!/^#\s+/.test(normalized)) {
        const { line, excerpt } = firstNonEmptyLine(trimmed);
        return {
            steps: [],
            error: {
                line,
                excerpt,
                reason: 'First card must start with `# Title`'
            }
        };
    }

    return { steps: toSteps(splitByH1Cards(normalized)), error: null };
}

/**
 * parseAnswerKeyToFlashcards
 *
 * Thin wrapper for callers that only need steps.
 *
 * @param markdown - Raw model answer markdown
 * @returns Ordered flashcard steps (empty when invalid / no `#` cards)
 */
export function parseAnswerKeyToFlashcards(markdown: string): FlashcardStep[] {
    return parseAnswerKeyFlashcardsDetailed(markdown).steps;
}

/** Tone class suffix 0..FLASHCARD_TONE_COUNT-1 for a step index. */
export function flashcardToneIndex(stepIndex: number): number {
    return ((stepIndex % FLASHCARD_TONE_COUNT) + FLASHCARD_TONE_COUNT) % FLASHCARD_TONE_COUNT;
}

/** Split on ATX h1 (`# Title`). Does not match `##` / `###`. Caller guarantees starts with `#`. */
function splitByH1Cards(text: string): string[] {
    return text.split(/(?=^#\s+)/m).map(s => s.trim()).filter(Boolean);
}

function firstNonEmptyLine(text: string): { line: number; excerpt: string } {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const excerpt = lines[i].trim();
        if (excerpt) return { line: i + 1, excerpt: excerpt.slice(0, 120) };
    }
    return { line: 1, excerpt: '' };
}

function cleanCardTitle(raw: string, fallback: string): string {
    return raw
        .replace(/^(?:Card|Step)\s+\d+[.:]?\s*/i, '')
        .trim() || fallback;
}

function toSteps(segments: string[]): FlashcardStep[] {
    return segments.map((segment, i) => {
        const fallback = `Step ${i + 1}`;
        const h1Match = segment.match(/^#\s+([^\n]+)/);
        if (!h1Match) {
            // ponytail: parse already requires leading #; keep guard for safety
            return { index: i, title: fallback, bodyMarkdown: segment };
        }
        return {
            index: i,
            title: cleanCardTitle(h1Match[1], fallback),
            bodyMarkdown: segment.replace(/^#\s+[^\n]+\n?/, '').trim()
        };
    });
}

/** Map part index → ScenarioPartId letter (`0→a`, `1→b`, … beyond `d` via char code). */
export function partIdFromIndex(index: number): string {
    return PART_ID_CHARS[index] ?? String.fromCharCode(97 + index);
}

/** Display label for part header e.g. "Part A: Calculation". */
export function formatPartHeader(partId: string, subQuestionType: string): string {
    const typeLabel = SUB_QUESTION_TYPE_LABELS[subQuestionType] ?? subQuestionType;
    return `Part ${partId.toUpperCase()}: ${typeLabel}`;
}
