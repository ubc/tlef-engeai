/**
 * rubric-page-design-guard.test.ts
 *
 * Pins the rubric page redesign against silent regression, in the same way
 * onboarding-design-guard.test.ts pins the onboarding tutorials: the outcome is
 * visual and this repository has no DOM layer, so what is asserted is the
 * absence of the specific patterns that made the page look generated and read
 * like a schema.
 *
 * @author: @rdschrs
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const CSS = join(REPO_ROOT, 'public', 'styles', 'instructor-components', 'writing-feedback.css');
const RUBRIC_TS = join(REPO_ROOT, 'public', 'scripts', 'feature', 'writing-feedback-rubric.ts');
const GRID_TS = join(REPO_ROOT, 'public', 'scripts', 'feature', 'writing-feedback-grid.ts');

/** Vocabulary that belongs to the implementation, never to a marker's screen. */
const INTERNAL_VOCABULARY = [
    'SFL:',
    'task object',
    'Genre and register',
    'Profile status',
    'Tenor —',
    'Mode —',
    'Field —',
    'criterion_use_range',
    'rubricSource'
];

function read(path: string): string {
    return readFileSync(path, 'utf8');
}

describe('rubric page copy', () => {
    it.each(INTERNAL_VOCABULARY)('never shows staff the phrase %p', (phrase) => {
        expect(read(RUBRIC_TS)).not.toContain(phrase);
        expect(read(GRID_TS)).not.toContain(phrase);
    });

    it('never says "lens" to staff', () => {
        // The word is fine as a type name and in comments; it must not reach a
        // string literal that a staff member can read.
        // Newlines are excluded from the character classes: without that, an
        // unmatched apostrophe in a comment swallows the rest of the file.
        const literals = read(RUBRIC_TS).match(/'[^'\n]{4,}'|"[^"\n]{4,}"/g) ?? [];
        const offenders = literals.filter((literal) => /\blens\b/i.test(literal) && !literal.includes('?lens='));
        expect(offenders).toEqual([]);
    });

    it('titles the page with the assignment, not with the name of the form', () => {
        expect(read(RUBRIC_TS)).not.toContain('Assignment Rubric and Details');
        expect(read(RUBRIC_TS)).toContain("createText('h1', assignment.title, 'wf-rubric-title')");
    });

    it('offers one Save and one Approve for the whole assignment', () => {
        // A lab report renders two rubric sections. When the actions lived inside
        // a section, that put two Save buttons on one page.
        const source = read(RUBRIC_TS);
        expect(source.match(/createButton\('Save for now'/g) ?? []).toHaveLength(1);
        expect(source.match(/createButton\('Approve rubric'/g) ?? []).toHaveLength(1);
    });
});

describe('rubric page styles', () => {
    const css = read(CSS);

    /**
     * The rules this redesign owns. The stylesheet also serves the landing,
     * review and submission views, whose pre-existing declarations are out of
     * this change's scope, so the style assertions below read this slice rather
     * than the whole file.
     */
    const rubricPageRules = css.slice(
        css.indexOf('/* Guided steps'),
        css.indexOf('.wf-rubric-library-select')
    );

    it('found the block it means to guard', () => {
        expect(rubricPageRules.length).toBeGreaterThan(1000);
    });

    it('has no left-accent bar on a step header', () => {
        expect(rubricPageRules).not.toContain('border-left');
    });

    it('keeps the old class names retired, so no rule is orphaned', () => {
        expect(css).not.toContain('wf-rubric-step');
        // `.wf-sfl-label` belongs to the review page and is out of scope here;
        // what this change retired is the rubric page's own `wf-sfl-box*`,
        // `wf-sfl-group-label` and `wf-sfl-hint`.
        expect(css).not.toContain('wf-sfl-box');
        expect(css).not.toContain('wf-sfl-group-label');
        expect(css).not.toContain('wf-sfl-hint');
    });

    it('introduces no hex literal in the rules it added', () => {
        // Every colour comes from a token declared in style.css or on .wf-page.
        // The one hex elsewhere in this stylesheet (#4c56af) predates this change.
        const permitted = ['#fff', '#ffffff', '#000'];
        const hexes = rubricPageRules.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
        expect(hexes.filter((hex) => !permitted.includes(hex.toLowerCase()))).toEqual([]);
    });
});
