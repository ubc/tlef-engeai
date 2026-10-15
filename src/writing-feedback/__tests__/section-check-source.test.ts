/**
 * @fileoverview Source guard for the section check (D-155). Jest has no DOM, so the markup
 * contract is pinned by reading the source; the browser pass checks the look.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const feature = path.join(root, 'public', 'scripts', 'feature');
const source = fs.readFileSync(path.join(feature, 'writing-feedback-diagnosis.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles', 'instructor-components', 'writing-feedback.css'), 'utf8');
const cardCss = css.slice(css.indexOf('/* Section check'), css.indexOf('/* Annotations withheld'));

describe('section check markup', () => {
    it('is an annotation card with the filter-label section label', () => {
        expect(source).toContain("card.className = 'wf-annotation-card wf-diagnosis'");
        expect(source).toContain("createText('span', 'OFF-GENRE OR MISSING SECTIONS', 'wf-filter-label')");
    });

    it('uses the shared chip for sections', () => {
        expect(source).toContain('chip(`${stage.label}: ${stage.status}`, stage.tone)');
    });

    it('offers "Include annotations", ticked meaning included, with where its value came from and a reset', () => {
        expect(source).toContain("'Include annotations'");
        expect(source).toContain('input.checked = !holdBack.checked;');
        expect(source).toContain("onChange(!input.checked)");
        expect(source).toContain('`Annotations not included (${comments.length})`');
        expect(source).toContain("'Changed by staff. '");
        expect(source).toContain("'Reset to default'");
    });

    it('names whose reasoning the rationale is', () => {
        expect(source).toContain("createText('span', 'Why EngE-AI flagged this', 'wf-diagnosis-why__label')");
        // A text link, not a disclosure triangle, collapsed to start.
        expect(source).not.toContain("createElement('details');\n    why");
        expect(source).toContain("link.setAttribute('aria-expanded', 'false');");
        expect(source).toContain('text.hidden = true;');
    });

    it('includes a held-back annotation from its own card, not a button below it', () => {
        expect(source).toContain('renderCard(comment, canEdit ? () => onRelease(comment.id) : undefined)');
        expect(source).not.toContain("createButton('Include'");
        const anchors = fs.readFileSync(path.join(feature, 'writing-feedback-anchors.ts'), 'utf8');
        expect(anchors).toContain("if (inclusion) actions.append(createButton(inclusion.label, 'outline', async () => inclusion.run()));");
        expect(anchors).toContain("onInclude ? { label: 'Include', run: onInclude } : undefined");
    });

    it('lets staff exclude an included annotation again while annotations are not included by default', () => {
        const anchors = fs.readFileSync(path.join(feature, 'writing-feedback-anchors.ts'), 'utf8');
        expect(anchors).toContain("holdBack ? { label: 'Exclude', run: () => setHeldBack(comment.id, true) } : undefined");
    });

    it('has no accent bar and no red body text', () => {
        expect(cardCss.length).toBeGreaterThan(0);
        expect(cardCss).not.toMatch(/border-left/);
        expect(cardCss).not.toMatch(/\.wf-diagnosis-warning\s*\{[^}]*color:\s*var\(--color-eng-red\)/);
    });
});

describe('staff- and student-facing wording', () => {
    const files = fs.readdirSync(feature)
        .filter((name) => /^writing-feedback-.*\.ts$/.test(name))
        .map((name) => fs.readFileSync(path.join(feature, name), 'utf8'));
    // User-facing text lives in string literals; identifiers and comments may still say "rewrite".
    const literals = files.flatMap((text) => text.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []);

    it('never offers "rewrite" feedback or says "passage comments"', () => {
        expect(literals.filter((literal) => /rewrite/i.test(literal))).toEqual([]);
        expect(literals.filter((literal) => /passage comments/i.test(literal))).toEqual([]);
    });
});
