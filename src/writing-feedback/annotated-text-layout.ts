/**
 * Annotated-text layout — exact PDF geometry for verified submission spans
 *
 * Word-wraps the staff-verified submission text into positioned lines while preserving the
 * UTF-16 code-unit offset of every drawn character. Anchored comments address spans of the
 * verified text by those same offsets, so the renderer can convert a comment span into exact
 * page rectangles (PDF `/Highlight` QuadPoints) by intersecting it with the drawn lines.
 *
 * Kept free of PDFKit so the wrapping/offset arithmetic is unit-testable with a fake
 * measuring function.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Maps verified-text offsets to wrapped PDF lines and highlight rectangles.
 */

/** Rendering constraints used to lay verified text across one or more PDF pages. */
export interface AnnotatedLayoutOptions {
    /** Wrap measure in PDF points. */
    maxWidth: number;
    /** Vertical distance between consecutive line tops. */
    lineHeight: number;
    /** Top y (PDFKit top-left coordinates) of the first line on the first page. */
    startY: number;
    /** Top y for the first line of every subsequent page. */
    pageTopY: number;
    /** A line whose top would exceed this y starts a new page. */
    pageBottomY: number;
    /** Extra vertical gap inserted between paragraphs (on top of lineHeight). */
    paragraphGap: number;
}

/** One rendered line tied back to its exact source-text offset and PDF position. */
export interface AnnotatedLayoutLine {
    /** Exact characters drawn on this line: `text.slice(sourceStart, sourceStart + text.length)`. */
    text: string;
    /** UTF-16 offset of the first drawn character in the source text. */
    sourceStart: number;
    /** Zero-based page index relative to the first layout page. */
    page: number;
    /** Top y of the line in PDFKit top-left coordinates. */
    y: number;
}

/** Injected font-width measurement keeps layout deterministic and PDFKit-independent. */
export type MeasureFn = (segment: string) => number;

interface Cursor {
    page: number;
    y: number;
}

/**
 * Lay out `text` into wrapped, positioned lines.
 *
 * Guarantees:
 * - Every non-whitespace character of the source appears on exactly one line.
 * - `line.text === text.slice(line.sourceStart, line.sourceStart + line.text.length)` always holds.
 * - Newlines (`\n`, `\r\n`) break paragraphs; blank source lines produce vertical space, not lines.
 * - A single token wider than `maxWidth` is split at character boundaries.
 *
 * @param text - Staff-verified text whose UTF-16 offsets must be preserved
 * @param measure - Width calculator configured with the renderer's active font
 * @param options - Page bounds, line advance, and paragraph spacing
 * @returns Positioned lines that retain exact source slices
 */
export function layoutVerifiedText(
    text: string,
    measure: MeasureFn,
    options: AnnotatedLayoutOptions
): AnnotatedLayoutLine[] {
    const lines: AnnotatedLayoutLine[] = [];
    const cursor: Cursor = { page: 0, y: options.startY };

    const advance = (gap: number): void => {
        cursor.y += gap;
        if (cursor.y > options.pageBottomY) {
            cursor.page += 1;
            cursor.y = options.pageTopY;
        }
    };

    const pushLine = (lineText: string, sourceStart: number): void => {
        lines.push({ text: lineText, sourceStart, page: cursor.page, y: cursor.y });
        advance(options.lineHeight);
    };

    // Step 1: split into paragraphs on newlines, tracking each paragraph's source offset.
    const paragraphs: Array<{ start: number; content: string }> = [];
    let paragraphStart = 0;
    for (let index = 0; index <= text.length; index += 1) {
        const char = text[index];
        if (index === text.length || char === '\n') {
            let content = text.slice(paragraphStart, index);
            // \r\n: the \r belongs to the break, never drawn.
            if (content.endsWith('\r')) content = content.slice(0, -1);
            paragraphs.push({ start: paragraphStart, content });
            paragraphStart = index + 1;
        }
    }

    // Step 2: greedy word-wrap each paragraph.
    let firstParagraph = true;
    for (const paragraph of paragraphs) {
        if (!firstParagraph) advance(options.paragraphGap);
        firstParagraph = false;
        if (!paragraph.content.trim()) continue; // blank line: vertical space only

        let lineStart = 0; // offsets within paragraph.content
        let lineEnd = 0;   // exclusive end of committed content on the current line
        let scan = 0;
        while (scan < paragraph.content.length) {
            // Take the next token: run of non-space characters plus its leading spaces.
            const tokenStart = scan;
            while (scan < paragraph.content.length && paragraph.content[scan] === ' ') scan += 1;
            while (scan < paragraph.content.length && paragraph.content[scan] !== ' ') scan += 1;
            const candidate = paragraph.content.slice(lineStart, scan);
            if (measure(candidate) <= options.maxWidth || lineEnd === lineStart) {
                if (measure(candidate) <= options.maxWidth) {
                    lineEnd = scan;
                    continue;
                }
                // Preserve source offsets by splitting oversized tokens at UTF-16 boundaries.
                let split = tokenStart;
                while (split < scan) {
                    let take = split + 1;
                    while (
                        take < scan
                        && measure(paragraph.content.slice(lineStart, take + 1)) <= options.maxWidth
                    ) take += 1;
                    pushLine(paragraph.content.slice(lineStart, take), paragraph.start + lineStart);
                    split = take;
                    lineStart = take;
                    lineEnd = take;
                }
                continue;
            }
            // Token does not fit: commit the current line, restart from the token.
            pushLine(paragraph.content.slice(lineStart, lineEnd), paragraph.start + lineStart);
            // Skip the spaces that separated the wrapped token — they are swallowed by the break.
            let nextStart = lineEnd;
            while (nextStart < paragraph.content.length && paragraph.content[nextStart] === ' ') nextStart += 1;
            lineStart = nextStart;
            lineEnd = nextStart;
            scan = nextStart;
        }
        if (lineEnd > lineStart) {
            pushLine(paragraph.content.slice(lineStart, lineEnd), paragraph.start + lineStart);
        }
    }
    return lines;
}

/** One visible highlight band in PDFKit's top-left coordinate system. */
export interface HighlightRect {
    page: number; // zero-based layout page used to target buffered PDF pages
    x: number; // left edge in PDFKit's coordinate system
    /** Top y in PDFKit top-left coordinates. */
    y: number;
    width: number; // exact measured width of the intersected source slice
    height: number; // glyph-height band kept independent from line advance
}

/**
 * Convert a comment span `[startOffset, endOffset)` into one rectangle per intersected line.
 * `originX` is the left edge lines are drawn at. `rectHeight` is intentionally independent
 * of layout line advance so highlighted text keeps a visible gap between wrapped lines.
 * Zero-width intersections are skipped.
 *
 * @param lines - Positioned lines produced for the same verified text
 * @param startOffset - Inclusive UTF-16 anchor offset
 * @param endOffset - Exclusive UTF-16 anchor offset
 * @param measure - Width calculator configured with the renderer's active font
 * @param originX - Left edge at which every line is drawn
 * @param rectHeight - Visible band height, independent from line advance
 * @returns One exact-width rectangle for each intersected line
 */
export function highlightRectsForSpan(
    lines: AnnotatedLayoutLine[],
    startOffset: number,
    endOffset: number,
    measure: MeasureFn,
    originX: number,
    rectHeight: number
): HighlightRect[] {
    const rects: HighlightRect[] = [];
    for (const line of lines) {
        const lineStart = line.sourceStart;
        const lineEnd = line.sourceStart + line.text.length;
        const from = Math.max(startOffset, lineStart);
        const to = Math.min(endOffset, lineEnd);
        if (to <= from) continue;
        const prefix = line.text.slice(0, from - lineStart);
        const covered = line.text.slice(from - lineStart, to - lineStart);
        if (!covered.length) continue;
        rects.push({
            page: line.page,
            x: originX + measure(prefix),
            y: line.y,
            width: measure(covered),
            height: rectHeight
        });
    }
    return rects;
}
