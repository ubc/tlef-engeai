/**
 * @fileoverview D-153: staff can edit the rewrite block's Socratic question. Jest has no
 * DOM, so the editor wiring is pinned by reading the source.
 */
import fs from 'fs';
import path from 'path';

const feature = path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature');
const diagnosisSource = fs.readFileSync(path.join(feature, 'writing-feedback-diagnosis.ts'), 'utf8');
const summarySource = fs.readFileSync(path.join(feature, 'writing-feedback-summary-editor.ts'), 'utf8');

describe('rewrite question editing', () => {
    it('lets staff edit the rewrite question', () => {
        expect(diagnosisSource).toContain("field('wf-global-question', 'Question for the student'");
    });

    it('saves an edited rewrite question with the rewrite block, and an explicit clear', () => {
        expect(summarySource).toMatch(/guidedQuestion: global\.guidedQuestion\.trim\(\)/);
        expect(summarySource).toContain("global.guidedQuestion !== undefined");
    });
});
