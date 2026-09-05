/**
 * @fileoverview Source guard for the full-screen PDF viewer. The Jest environment is
 * `node` with no jsdom and no CSS engine, so the geometry is pinned by reading the
 * stylesheet and the modal helper rather than by rendering them. The browser pass is
 * what proves it looks right; this is what stops it silently regressing.
 */

import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const modalCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles', 'modal-overlay.css'), 'utf8');
const wfCss = fs.readFileSync(
    path.join(repoRoot, 'public', 'styles', 'instructor-components', 'writing-feedback.css'),
    'utf8'
);
const modalSource = fs.readFileSync(
    path.join(repoRoot, 'public', 'scripts', 'ui', 'modal-overlay.ts'),
    'utf8'
);

/** The declarations of one rule, found by its exact selector text. */
function rule(css: string, selector: string): string {
    const index = css.indexOf(selector);
    if (index < 0) return '';
    return css.slice(index, css.indexOf('}', index) + 1);
}

describe('the PDF viewer modal owns its own geometry', () => {
    it('gives the viewer container a real width and height, not only a cap', () => {
        // The mobile override is indented inside its media block and appears earlier in the
        // file, so the top-level rule is anchored on its own newline.
        const viewer = rule(modalCss, '\n.modal--viewer.modal-container {');
        expect(viewer).toContain('width: 96vw;');
        expect(viewer).toContain('height: 96dvh;');
        expect(viewer).toContain('max-width: none;');
        expect(viewer).toContain('max-height: none;');
        expect(viewer).toContain('flex-direction: column;');
    });

    it('lets the viewer body shrink below its content so the frame is not clipped', () => {
        const body = rule(modalCss, '.modal--viewer .modal-body {');
        expect(body).toContain('min-height: 0;');
        expect(body).toContain('flex: 1;');
    });

    it('escapes the responsive cap that applies to every other modal', () => {
        const narrow = rule(modalCss, '@media (max-width: 768px)');
        expect(narrow).toContain('max-width: calc(100vw - 2rem);');
        expect(modalCss).toContain('.modal--viewer.modal-container {\n        width: 100vw;');
    });

    it('keeps the grading modal off the viewer rules', () => {
        expect(modalCss).not.toContain('.modal--viewer .modal-body,\n.modal--grading .modal-body {');
        expect(rule(modalCss, '.modal--grading .modal-body {')).toContain('max-height: none;');
    });

    it('makes the frame follow its container instead of competing with it', () => {
        expect(rule(wfCss, '.wf-pdf-frame {')).toContain('height: 100%;');
        expect(wfCss).not.toContain('height: min(82vh, 1000px);');
    });

    it('stops showViewerModal setting an inline max-width over the class', () => {
        const viewerFn = modalSource.match(/export async function showViewerModal[\s\S]*?\n}/)?.[0] ?? '';
        expect(viewerFn).toContain("customClass: 'modal--viewer'");
        expect(viewerFn).not.toContain('maxWidth');
    });
});
