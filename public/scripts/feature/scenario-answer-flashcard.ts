// public/scripts/feature/scenario-answer-flashcard.ts

/**
 * scenario-answer-flashcard.ts
 *
 * Deterministic parser that splits markdown answer keys into step-by-step flashcards
 * for instructor preview and student practice. No LLM.
 *
 * Card boundary (preferred): `# Card N` / `# Step N` (ATX h1).
 * Inside a card: `## Topic`, `### Highlight` stay in the body (not new cards).
 * Fallbacks: `##` headings, numbered lists, bold **Step N**, then paragraphs.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-09
 * @version: 1.1.0
 * @description: Parse answer-key markdown into navigable flashcard steps.
 */

/** One navigable flashcard step derived from markdown answer key. */
export interface FlashcardStep {
    index: number;
    title: string;
    bodyMarkdown: string;
}

const PART_ID_CHARS = ['a', 'b', 'c', 'd'] as const;

/** Human-readable label for subquestion type pills. */
export const SUB_QUESTION_TYPE_LABELS: Record<string, string> = {
    calculation: 'Calculation',
    troubleshoot: 'Troubleshoot',
    action: 'Action',
    corrective: 'Corrective'
};

/**
 * parseAnswerKeyToFlashcards
 *
 * @param markdown - Raw model answer markdown
 * @returns Ordered flashcard steps
 */
export function parseAnswerKeyToFlashcards(markdown: string): FlashcardStep[] {
    const normalized = markdown.trim().replace(/\n{3,}/g, '\n\n');
    if (!normalized) return [];

    // Preferred: `# Card N` / `# …` (h1 only — `##` / `###` stay inside the card)
    const byH1 = splitByH1Cards(normalized);
    if (byH1.length > 1) return toSteps(byH1);

    // Legacy: `## Step` headings
    const byH2 = splitByH2Headings(normalized);
    if (byH2.length > 1) return toSteps(byH2);

    const byOrderedList = splitByOrderedList(normalized);
    if (byOrderedList.length > 1) return toSteps(byOrderedList);

    const byBoldSteps = splitByBoldSteps(normalized);
    if (byBoldSteps.length > 1) return toSteps(byBoldSteps);

    return toSteps(splitByParagraphs(normalized));
}

/** Split on ATX h1 (`# Title`). Does not match `##` / `###`. */
function splitByH1Cards(text: string): string[] {
    const parts = text.split(/(?=^#\s+)/m).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return parts;
    // Drop leading preamble that isn't a card heading
    if (!/^#\s+/.test(parts[0])) parts.shift();
    return parts.length ? parts : [];
}

/** Legacy split on `##` headings (kept for existing answer keys). */
function splitByH2Headings(text: string): string[] {
    const parts = text.split(/(?=^##\s+)/m).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return parts;
    if (!/^##\s+/.test(parts[0])) parts.shift();
    return parts.length ? parts : [];
}

function splitByOrderedList(text: string): string[] {
    const lines = text.split('\n');
    const segments: string[] = [];
    let current: string[] = [];

    for (const line of lines) {
        if (/^\d+\.\s/.test(line) && current.length > 0) {
            segments.push(current.join('\n').trim());
            current = [line];
        } else {
            current.push(line);
        }
    }
    if (current.length) segments.push(current.join('\n').trim());
    return segments.filter(Boolean);
}

function splitByBoldSteps(text: string): string[] {
    const parts = text.split(/(?=\*\*(?:Step\s+\d+|[0-9]+\.)[^*]*\*\*)/i).map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [];
}

function splitByParagraphs(text: string): string[] {
    const paragraphs = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
    const merged: string[] = [];

    for (const para of paragraphs) {
        if (para.length < 40 && merged.length > 0) {
            merged[merged.length - 1] += '\n\n' + para;
        } else {
            merged.push(para);
        }
    }
    return merged.length ? merged : [text];
}

function cleanCardTitle(raw: string, fallback: string): string {
    return raw
        .replace(/^(?:Card|Step)\s+\d+[.:]?\s*/i, '')
        .trim() || fallback;
}

function toSteps(segments: string[]): FlashcardStep[] {
    return segments.map((segment, i) => {
        const fallback = `Step ${i + 1}`;
        // h1 `# Card` first — `^#\s+` does not match `##`
        const h1Match = segment.match(/^#\s+(.+?)(?:\n|$)/);
        const h2Match = segment.match(/^##\s+(.+?)(?:\n|$)/);
        const boldMatch = segment.match(/^\*\*(.+?)\*\*/);
        let title = fallback;
        let bodyMarkdown = segment;

        if (h1Match) {
            title = cleanCardTitle(h1Match[1], fallback);
            bodyMarkdown = segment.replace(/^#\s+.+?\n?/, '').trim();
        } else if (h2Match) {
            title = cleanCardTitle(h2Match[1], fallback);
            bodyMarkdown = segment.replace(/^##\s+.+?\n?/, '').trim();
        } else if (boldMatch) {
            title = cleanCardTitle(boldMatch[1], fallback);
            bodyMarkdown = segment.replace(/^\*\*.+?\*\*\s*/, '').trim();
        }

        return { index: i, title, bodyMarkdown };
    });
}

/** Map part index 0–3 to ScenarioPartId letter. */
export function partIdFromIndex(index: number): string {
    return PART_ID_CHARS[index] ?? String.fromCharCode(97 + index);
}

/** Display label for part header e.g. "Part A: Calculation". */
export function formatPartHeader(partId: string, subQuestionType: string): string {
    const typeLabel = SUB_QUESTION_TYPE_LABELS[subQuestionType] ?? subQuestionType;
    return `Part ${partId.toUpperCase()}: ${typeLabel}`;
}
