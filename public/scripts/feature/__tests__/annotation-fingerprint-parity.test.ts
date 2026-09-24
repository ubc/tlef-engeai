/**
 * Annotation fingerprint parity — the browser and server must agree on "unchanged".
 */

import { fingerprintAnnotations as serverFingerprint } from '../../../../src/writing-feedback/annotation-fingerprint';
import { fingerprintAnnotations as browserFingerprint } from '../writing-feedback-annotation-fingerprint';

const base = [
    { id: 'a', lens: 'linguistic', criterion: 'content', startOffset: 10, endOffset: 30, quote: 'first passage here..', comment: 'Name the claim.', howToImprove: 'Attribute it.', origin: 'model_seed' },
    { id: 'b', lens: 'technical', criterion: 'results', startOffset: 50, endOffset: 70, quote: 'second passage here.', comment: 'Explain the gap.', origin: 'staff', authorName: 'TA' }
];

describe('fingerprintAnnotations', () => {
    it('returns identical values from the server and browser copies', () => {
        const variants = [
            [],
            base,
            [base[0]],
            [{ ...base[0], comment: 'Changed.' }],
            [{ ...base[1], howToImprove: '  trimmed  ' }]
        ];
        for (const comments of variants) {
            expect(browserFingerprint(comments)).toBe(serverFingerprint(comments));
        }
    });

    it('ignores ids, authors, origin, tags and order', () => {
        const reordered = [
            { ...base[1], id: 'z', authorName: 'Someone else', origin: 'model_seed' },
            { ...base[0], id: 'y', functionTag: 'content' }
        ];
        expect(serverFingerprint(reordered)).toBe(serverFingerprint(base));
    });

    it('changes when a passage, comment, guidance, criterion or lens changes', () => {
        const original = serverFingerprint(base);
        expect(serverFingerprint([{ ...base[0], comment: 'Different.' }, base[1]])).not.toBe(original);
        expect(serverFingerprint([{ ...base[0], howToImprove: undefined }, base[1]])).not.toBe(original);
        expect(serverFingerprint([{ ...base[0], criterion: 'organization' }, base[1]])).not.toBe(original);
        expect(serverFingerprint([{ ...base[0], startOffset: 11 }, base[1]])).not.toBe(original);
        expect(serverFingerprint([base[0]])).not.toBe(original);
    });

    it('treats a missing lens as linguistic and trims comment whitespace', () => {
        const { lens: _lens, ...noLens } = base[0];
        expect(serverFingerprint([noLens])).toBe(serverFingerprint([base[0]]));
        expect(serverFingerprint([{ ...base[0], comment: '  Name the claim.  ' }])).toBe(serverFingerprint([base[0]]));
    });

    it('is eight hex characters', () => {
        expect(serverFingerprint(base)).toMatch(/^[0-9a-f]{8}$/);
    });
});
