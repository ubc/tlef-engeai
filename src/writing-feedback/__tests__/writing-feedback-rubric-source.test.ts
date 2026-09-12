/**
 * @fileoverview Source guard for frontend rubric-page copy where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-rubric.ts'),
    'utf8'
);

/**
 * Source with comments stripped. The doc comment on MissingFieldsError quotes the
 * prose message it replaced, so a check for that prose has to read the code alone.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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
        // Optional fields carry an "(optional)" suffix instead of a required marker,
        // so this one is pinned by its question rather than the whole label string.
        expect(source).toContain("label: 'Smaller pieces of writing inside it");
    });

    it('carries the SFL term only as a secondary hint, never as a primary label', () => {
        expect(source).not.toMatch(/label:\s*'Field'/);
        expect(source).not.toMatch(/label:\s*'Tenor'/);
        expect(source).not.toMatch(/label:\s*'Mode'/);
    });

    it('never names required fields in prose that no label on the page uses', () => {
        // The sentence this replaces listed "the title, task, audience, purpose,
        // and how to grade" — five words, none of which appear above the boxes they
        // referred to, because those labels are questions. Any reintroduced prose
        // list is the same defect regardless of its wording.
        expect(code).not.toContain('Fill in the title');
        expect(code).not.toContain('Complete the genre and register profile');
        expect(code).not.toContain('Add at least one requirement and one learning outcome');
    });

    it('reports empty required fields by control name, not by a written-out list', () => {
        expect(source).toContain('class MissingFieldsError extends Error');
        expect(source).toContain('throw new MissingFieldsError(missing)');
        // The quoted label comes back out of the DOM, so it cannot drift from the
        // words actually rendered above the box.
        expect(source).toContain('function fieldLabelFor');
        expect(source).toContain("control.closest('.wf-field')?.querySelector('label')");
    });

    it('keeps the collectors free of DOM marking so autosave cannot paint the form red', () => {
        // autosaveAssignmentRubrics runs the same collectors on a timer while staff
        // are still typing. Marking belongs to the button path alone.
        const collectors = source.slice(
            source.indexOf('function collectAssignmentDetails'),
            source.indexOf('function collectRubricStructure')
        );
        expect(collectors).not.toContain('wf-field-invalid');
        expect(collectors).not.toContain('reportMissingFields(');
    });

    it('waits for a collapsed section to finish opening before scrolling to the field', () => {
        // expandDisclosure animates max-height from zero. Scrolling before it settles
        // measures a flat box and lands on the "Describe the writing" header instead
        // of the empty field inside it. A header click starts that animation without
        // returning anything to wait on, so the panel is expanded directly.
        expect(source).toContain('await expandDisclosure(panel)');
        expect(source).toContain('await revealControl(first)');
        expect(source).not.toMatch(/revealControl[\s\S]{0,400}header\?\.click\(\)/);
    });

    it('sends the staff member to the first empty field instead of a modal', () => {
        expect(source).toContain('function withFieldErrorReporting');
        expect(source).toContain('if (!(error instanceof MissingFieldsError)) throw error;');
        // Focus, not the shake, is what carries the failure to a screen reader.
        expect(source).toContain('first.focus({ preventScroll: true })');
        expect(source).toContain("control.setAttribute('aria-invalid', 'true')");
    });
});
