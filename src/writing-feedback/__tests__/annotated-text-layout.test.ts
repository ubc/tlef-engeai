/**
 * Annotated text layout tests — source offsets, wrapping, and highlight geometry
 *
 * Uses a deterministic text measure to verify that PDF layout preserves exact
 * UTF-16 source positions across wrapping, paragraph breaks, and page boundaries.
 *
 * @author: @rdschrs
 * @date: 2026-07-23
 * @version: 1.0.0
 * @description: Geometry regression coverage for sentence-level PDF annotations.
 */

import {
    layoutVerifiedText,
    highlightRectsForSpan,
    type AnnotatedLayoutOptions
} from '../annotated-text-layout';

/** Keep layout assertions deterministic by assigning every UTF-16 code unit a 10pt width. */
const measure = (segment: string): number => segment.length * 10;

const options: AnnotatedLayoutOptions = {
    maxWidth: 100, // Ten code units per line makes every expected wrap explicit.
    lineHeight: 14,
    startY: 100,
    pageTopY: 50,
    pageBottomY: 700,
    paragraphGap: 6
};

describe('layoutVerifiedText', () => {
    it('wraps at the measure and preserves offset fidelity for every line', () => {
        const text = 'alpha beta gamma delta';
        const lines = layoutVerifiedText(text, measure, options);
        expect(lines.map((line) => line.text)).toEqual(['alpha beta', 'gamma', 'delta']);
        for (const line of lines) {
            expect(text.slice(line.sourceStart, line.sourceStart + line.text.length)).toBe(line.text);
        }
    });

    it('advances y by lineHeight and stays on page 0 while space remains', () => {
        const lines = layoutVerifiedText('alpha beta gamma', measure, options);
        expect(lines[0]).toMatchObject({ page: 0, y: 100 });
        expect(lines[1]).toMatchObject({ page: 0, y: 114 });
    });

    it('swallows the wrap-point space without shifting later offsets', () => {
        const text = 'alpha beta gamma';
        const lines = layoutVerifiedText(text, measure, options);
        // 'gamma' starts at offset 11 (after 'alpha beta' + swallowed space).
        expect(lines[1].sourceStart).toBe(11);
        expect(text[10]).toBe(' ');
    });

    it('breaks paragraphs on \\n and \\r\\n and inserts the paragraph gap', () => {
        const text = 'one\r\ntwo\nthree';
        const lines = layoutVerifiedText(text, measure, options);
        expect(lines.map((line) => line.text)).toEqual(['one', 'two', 'three']);
        expect(lines[0].y).toBe(100);
        expect(lines[1].y).toBe(100 + 14 + 6);
        // \r never drawn; offsets still slice back exactly.
        for (const line of lines) {
            expect(text.slice(line.sourceStart, line.sourceStart + line.text.length)).toBe(line.text);
        }
    });

    it('renders blank source lines as vertical space, not empty lines', () => {
        const lines = layoutVerifiedText('one\n\ntwo', measure, options);
        expect(lines.map((line) => line.text)).toEqual(['one', 'two']);
        expect(lines[1].y).toBeGreaterThan(lines[0].y + 14);
    });

    it('splits a token wider than the measure at character boundaries', () => {
        const text = 'abcdefghijklmnopqrstuvwxyz';
        const lines = layoutVerifiedText(text, measure, options);
        expect(lines.map((line) => line.text)).toEqual(['abcdefghij', 'klmnopqrst', 'uvwxyz']);
        for (const line of lines) {
            expect(text.slice(line.sourceStart, line.sourceStart + line.text.length)).toBe(line.text);
        }
    });

    it('starts a new page when a line would pass pageBottomY', () => {
        const tight = { ...options, startY: 690, pageBottomY: 700 };
        const lines = layoutVerifiedText('alpha beta gamma delta', measure, tight);
        expect(lines[0]).toMatchObject({ page: 0, y: 690 });
        expect(lines[1]).toMatchObject({ page: 1, y: 50 });
        expect(lines[2]).toMatchObject({ page: 1, y: 64 });
    });

    it('returns no lines for empty or whitespace-only text', () => {
        expect(layoutVerifiedText('', measure, options)).toEqual([]);
        expect(layoutVerifiedText('   \n \n', measure, options)).toEqual([]);
    });
});

describe('highlightRectsForSpan', () => {
    const text = 'alpha beta gamma delta';
    const lines = layoutVerifiedText(text, measure, options);

    it('produces a single rect for a span inside one line', () => {
        // 'beta' occupies offsets 6..10 on line 0.
        const rects = highlightRectsForSpan(lines, 6, 10, measure, 40, 14);
        expect(rects).toEqual([{ page: 0, x: 40 + 60, y: 100, width: 40, height: 14 }]);
    });

    it('produces one rect per line for a span crossing a wrap', () => {
        // 'beta gamma' = offsets 6..16 crosses lines 0 and 1.
        const rects = highlightRectsForSpan(lines, 6, 16, measure, 40, 14);
        expect(rects).toHaveLength(2);
        expect(rects[0]).toMatchObject({ page: 0, x: 100, width: 40, y: 100 });
        expect(rects[1]).toMatchObject({ page: 0, x: 40, width: 50, y: 114 });
    });

    it('keeps a visible gap when the highlight band is shorter than the line advance', () => {
        const rects = highlightRectsForSpan(lines, 6, 16, measure, 40, 10);
        expect(rects).toHaveLength(2);
        expect(rects[1].y - (rects[0].y + rects[0].height)).toBe(4);
    });

    it('skips lines the span does not touch and zero-width intersections', () => {
        const rects = highlightRectsForSpan(lines, 0, 5, measure, 40, 14);
        expect(rects).toHaveLength(1);
        expect(rects[0].y).toBe(100);
    });

    it('carries page indexes through for multi-page spans', () => {
        const tight = { ...options, startY: 690, pageBottomY: 700 };
        const paged = layoutVerifiedText(text, measure, tight);
        const rects = highlightRectsForSpan(paged, 0, text.length, measure, 40, 14);
        expect(new Set(rects.map((rect) => rect.page))).toEqual(new Set([0, 1]));
    });
});
