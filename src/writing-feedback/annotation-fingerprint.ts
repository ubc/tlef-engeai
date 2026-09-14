/**
 * Annotation fingerprint — detects whether a lens's annotations changed since a summary draft
 *
 * Mirrored in `public/scripts/feature/writing-feedback-annotation-fingerprint.ts` and pinned by
 * `annotation-fingerprint-parity.test.ts`. A change detector, not a security hash: ids,
 * authors, origin and tags are excluded so reseeding with new ids never reads as a change.
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Order- and id-insensitive FNV-1a fingerprint of annotation content.
 */

/** The annotation fields that decide whether a summary still reflects its annotations. */
export interface FingerprintableComment {
    lens?: string;
    criterion?: string;
    startOffset: number;
    endOffset: number;
    quote: string;
    comment: string;
    howToImprove?: string;
}

const FIELD_SEPARATOR = '\u001f'; // ASCII unit separator: cannot appear in typed comment text
const ROW_SEPARATOR = '\u001e'; // ASCII record separator

/**
 * fingerprintAnnotations - summarises annotation content as eight hex characters.
 *
 * @param comments - Annotations for one lens (or any set to compare)
 * @returns FNV-1a 32-bit hash of the sorted content rows
 */
export function fingerprintAnnotations(comments: ReadonlyArray<FingerprintableComment>): string {
    // Step 1: one canonical row per annotation, sorted so order never matters.
    const rows = comments
        .map((comment) => [
            comment.lens ?? 'linguistic',
            comment.criterion ?? '',
            String(comment.startOffset),
            String(comment.endOffset),
            comment.quote,
            comment.comment.trim(),
            (comment.howToImprove ?? '').trim()
        ].join(FIELD_SEPARATOR))
        .sort();

    // Step 2: FNV-1a over UTF-16 code units, kept unsigned.
    const text = rows.join(ROW_SEPARATOR);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
