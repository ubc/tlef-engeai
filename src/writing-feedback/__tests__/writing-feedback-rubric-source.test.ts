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

    it('uses plain-language primary labels for the profile fields', () => {
        // The v3 redesign replaced these labels with questions a first-time
        // instructor can answer without knowing the framework behind them. The
        // spec's wording table is normative; this pins the result.
        expect(source).toContain("label: 'What is the writing about?'");
        expect(source).toContain("label: 'How should the student sound?'");
        expect(source).toContain("label: 'How long, and in what form?'");
        expect(source).toContain("label: 'Who marks it?'");
        expect(source).toContain("label: 'What were the writing conditions?'");
        expect(source).toContain("label: 'Smaller pieces of writing inside it'");
    });

    it('carries the SFL term only as a secondary hint, never as a primary label', () => {
        expect(source).not.toMatch(/label:\s*'Field'/);
        expect(source).not.toMatch(/label:\s*'Tenor'/);
        expect(source).not.toMatch(/label:\s*'Mode'/);
    });
});
