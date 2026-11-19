import { normalizeMathDelimiters } from '../math-delimiters';

describe('normalizeMathDelimiters', () => {
    it('converts \\( \\) inline math to $...$', () => {
        expect(normalizeMathDelimiters('use \\(\\lambda=hc/|\\Delta E|\\) here')).toBe(
            'use $\\lambda=hc/|\\Delta E|$ here'
        );
    });

    it('converts \\[ \\] display math to multi-line $$...$$', () => {
        expect(normalizeMathDelimiters('see \\[E_n = -R_H/n^2\\]')).toBe('see $$\nE_n = -R_H/n^2\n$$');
    });

    it('undoes doubled backslashes from structured output', () => {
        expect(normalizeMathDelimiters('in \\\\(\\\\lambda=hc/|\\\\Delta E|\\\\)?')).toBe(
            'in $\\lambda=hc/|\\Delta E|$?'
        );
    });

    it('keeps inline math on one line', () => {
        expect(normalizeMathDelimiters('\\(a +\n b\\)')).toBe('$a + b$');
    });

    it('leaves dollar-delimited math and plain text unchanged', () => {
        const text = 'Energy $E_n = -R_H/n^2$ and\n$$\n\\Delta E\n$$\n(see note)';
        expect(normalizeMathDelimiters(text)).toBe(text);
    });
});
