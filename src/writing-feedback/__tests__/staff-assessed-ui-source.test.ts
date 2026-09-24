/**
 * @fileoverview Source guard for the staff-assessed criterion's staff-facing wiring. The
 * rubric grid and the review panel both need a DOM to run and the Jest project has none,
 * so the invariants that would otherwise fail silently — a toggle that renders but is
 * never read back, a review card that renders the model branch for a staff criterion —
 * are pinned by reading the source. The rules themselves are unit tested in
 * criterion-assessment.test.ts and summary-sources.test.ts.
 */

import fs from 'fs';
import path from 'path';

const feature = (file: string) =>
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', file), 'utf8');

const grid = feature('writing-feedback-grid.ts');
const rubricPage = feature('writing-feedback-rubric.ts');
const review = feature('writing-feedback-review.ts');
const summaryEditor = feature('writing-feedback-summary-editor.ts');

describe('rubric editor toggle', () => {
    it('renders the control on every criterion row', () => {
        expect(grid).toContain('authorshipControl(criterion, rowIndex, gridId, canEdit, onChange)');
        expect(grid).toContain('`criterion.${rowIndex}.assessedBy`');
    });

    it('keeps both options on screen under a label naming the question', () => {
        // A collapsed control showing the default reads as a status label, and the
        // alternative is never discovered. Both options and the question stay visible.
        expect(grid).toContain("role', 'radiogroup'");
        expect(grid).toContain("'Feedback written by'");
        expect(grid).toContain("['model', 'EngE-AI']");
        expect(grid).toContain("['staff', 'Course staff']");
    });

    it('explains the choice once above the grid', () => {
        expect(grid).toContain('The AI only receives the text of a submission.');
        expect(grid).toContain('authorshipHint');
    });

    it('reads the control back into the draft under the same name', () => {
        // A control the collector never reads is a setting staff cannot actually change.
        expect(rubricPage).toContain('`criterion.${index}.assessedBy`');
    });

    it('stores only the staff marking, leaving the model default absent', () => {
        expect(rubricPage).toContain("rawAssessedBy === 'staff' ? 'staff' as const : undefined");
    });

    it('refuses a rubric with nothing left for the model', () => {
        expect(rubricPage).toContain("criteria.every((criterion) => criterion.assessedBy === 'staff')");
    });
});

describe('review card', () => {
    it('branches on the staff marking before the missing-feedback branch', () => {
        const staffBranch = review.indexOf("definition?.assessedBy === 'staff'");
        const missingBranch = review.indexOf('No stored feedback was found for this rubric criterion.');
        expect(staffBranch).toBeGreaterThan(-1);
        // Reversed, every staff criterion would render the "no stored feedback" note
        // instead of its editable box, since the run legitimately carries no row.
        expect(staffBranch).toBeLessThan(missingBranch);
    });

    it('offers the same editable field the model branch uses', () => {
        expect(review).toContain('editor.explanationField(lens, criterionId, staffText, {');
        expect(review).toContain('required: true');
    });

    it('blocks approval from the live controls, not the saved edit', () => {
        expect(review).toContain('staffCriteriaBlocker()');
        expect(review).toContain('editor.writtenCriteria(lens)');
        expect(summaryEditor).toContain('writtenCriteria(lens: WritingFeedbackLens): Set<string>');
    });
});
