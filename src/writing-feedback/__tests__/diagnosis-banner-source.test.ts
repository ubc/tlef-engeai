/**
 * @fileoverview Source guard for the whole-text diagnosis banner (D-155). Jest has no DOM,
 * so the markup contract is pinned by reading the source; the browser pass checks the look.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(root, 'public', 'scripts', 'feature', 'writing-feedback-diagnosis.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles', 'instructor-components', 'writing-feedback.css'), 'utf8');
const bannerCss = css.slice(css.indexOf('/* Whole-text diagnosis banner'), css.indexOf('/* Annotations withheld'));

describe('diagnosis banner markup', () => {
    it('is an annotation card with the filter-label section label', () => {
        expect(source).toContain("banner.className = 'wf-annotation-card wf-diagnosis'");
        expect(source).toContain("createText('span', 'WHOLE-TEXT DIAGNOSIS', 'wf-filter-label')");
    });

    it('uses the shared chip for stages and the rewrite marker', () => {
        expect(source).toContain('chip(`${stage.label}: ${stage.status}`, stage.tone)');
        expect(source).toContain("chip('Rewrite feedback', 'amber')");
    });

    it('has no accent bar and no red body text', () => {
        expect(bannerCss.length).toBeGreaterThan(0);
        expect(bannerCss).not.toMatch(/border-left/);
        expect(bannerCss).not.toMatch(/\.wf-diagnosis-warning\s*\{[^}]*color:\s*var\(--color-eng-red\)/);
    });
});
