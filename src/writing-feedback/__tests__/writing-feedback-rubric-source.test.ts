/**
 * @fileoverview Source guard for frontend rubric-page copy where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-rubric.ts'),
    'utf8'
);

describe('writing feedback rubric page source contract', () => {
    it('never labels a control "Genre id"', () => {
        expect(source).not.toMatch(/label:\s*'Genre id'/);
    });

    it('does not render an sfl.genreId form control', () => {
        expect(source).not.toContain("'sfl.genreId'");
    });

    it('uses plain-language primary labels for the SFL profile fields', () => {
        expect(source).toContain("label: 'Subject matter'");
        expect(source).toContain("label: 'Reader relationship'");
        expect(source).toContain("label: 'Format and conditions'");
        expect(source).toContain("label: 'Who marks it'");
        expect(source).toContain("label: 'Writing conditions'");
        expect(source).toContain("label: 'Genres inside it'");
    });

    it('carries the SFL term only as a secondary hint, never as a primary label', () => {
        expect(source).not.toMatch(/label:\s*'Field'/);
        expect(source).not.toMatch(/label:\s*'Tenor'/);
        expect(source).not.toMatch(/label:\s*'Mode'/);
    });
});
