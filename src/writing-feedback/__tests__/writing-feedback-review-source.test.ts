/**
 * @fileoverview Source guard for frontend review copy where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-review.ts'),
    'utf8'
);

const editorSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-summary-editor.ts'),
    'utf8'
);

const anchorsSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-anchors.ts'),
    'utf8'
);

describe('writing feedback review source contract', () => {
    it('labels retired rubric criteria without rendering internal ids', () => {
        const criterionLabel = source.match(/function criterionLabel[\s\S]*?\n}/)?.[0] ?? '';
        expect(source).toContain("?? 'Removed criterion'");
        expect(source).toContain('This criterion was removed after rubric v');
        expect(criterionLabel).not.toMatch(/\?\?\s*id/);
    });

    it('polls for generation results past the worker\'s worst-case retry budget', () => {
        // maxAttempts=3 with up to a 60s lease each (writing-feedback-service.ts,
        // writing-feedback-mongo.ts leaseNextWritingJob) means a job that fails once
        // and succeeds on retry can legitimately take past two minutes. A shorter
        // ceiling here throws a false "still running" error and stops the polling
        // that was keeping the staff session's idle timer alive.
        expect(source).toContain('const GENERATION_POLL_TIMEOUT_MS = 300_000;');
    });

    it('shows revision goals once, in one editable section named for them', () => {
        // A separate read-only section rendered the same result.revisionGoals that seed the
        // editable textarea, so staff read every goal twice and could edit only one copy.
        // The remaining section is named "Priority revision goals" because that is the
        // heading the student reads on the PDF.
        const summaryTab = source.match(/function renderSummaryLens[\s\S]*?\n}\n/)?.[0] ?? '';
        expect(summaryTab).not.toBe('');
        expect(summaryTab).toContain("createText('h3', 'Priority revision goals')");
        expect(summaryTab).not.toContain('Student-facing feedback');
        // The seed mirrors the student PDF's numbering and wording so staff edit the text
        // in the shape the student receives it, including the Socratic question.
        expect(source).toContain('seedSummaryText(');
        expect(editorSource).toContain('export function seedSummaryText');
        expect(editorSource).toContain('Ask yourself:');
    });

    it('lists internal review flags where they qualify the levels they belong to', () => {
        // A live run abstained on source completeness and word count. Both were joined into
        // one comma-separated sentence at the very bottom of the tab, under the release
        // card, so a marker approving a level never saw what the model could not check.
        const summaryTab = source.match(/function renderSummaryLens[\s\S]*?\n}\n/)?.[0] ?? '';
        const flagsSection = source.match(/function renderInternalFlags[\s\S]*?\n}/)?.[0] ?? '';
        expect(flagsSection).not.toContain('internalFlags.join');
        expect(flagsSection).toContain("createText('h3', 'Internal review flags')");
        const flagsIndex = summaryTab.indexOf('renderInternalFlags(run)');
        const goalsIndex = summaryTab.indexOf("createText('h3', 'Priority revision goals')");
        expect(flagsIndex).toBeGreaterThan(-1);
        expect(goalsIndex).toBeGreaterThan(-1);
        expect(flagsIndex).toBeLessThan(goalsIndex);
    });

    it('keeps the review history heading in step with the section it records', () => {
        expect(source).not.toContain("createText('h4', 'Student-facing feedback')");
        expect(source).toContain("createText('h4', 'Priority revision goals')");
    });
});

describe('annotation course-material copy', () => {
    it('names the material instead of rendering a link', () => {
        // A student reads this in the workspace and on a printed PDF. A bare URL is not a
        // name, and on paper it is not even clickable.
        const card = anchorsSource.match(/function renderReadOnlyCard[\s\S]*?\n}/)?.[0] ?? anchorsSource;
        expect(card).not.toContain("createElement('a')");
        expect(anchorsSource).toContain('courseMaterialTitle');
    });

    it('asks staff for a title rather than a URL', () => {
        expect(anchorsSource).not.toContain("field('Course material link'");
        expect(anchorsSource).toContain("field('Course material title'");
    });

    it('stores the picked material id so a later rename can be traced', () => {
        // The label alone cannot survive a course material being renamed. The id is set only
        // while the typed title still matches a known material, and cleared otherwise, so it
        // never claims a material the staff member did not pick.
        expect(anchorsSource).toContain('comment.courseMaterialId');
        expect(anchorsSource).toContain('matchedMaterial?.id');
    });

    it('offers the course\'s own published materials rather than free text alone', () => {
        // Staff typing a title by hand can name a document the course never released, or
        // spell one differently from the label retrieval resolves for the same material.
        expect(anchorsSource).toContain("request<CourseMaterialTitle[]>('/course-materials')");
        expect(anchorsSource).toContain('wf-course-material-');
        expect(anchorsSource).toContain("materialTitle.setAttribute('list'");
    });
});

describe('summary editor source contract', () => {
    const editor = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-summary-editor.ts'),
        'utf8'
    );

    it('uses the approved labels', () => {
        expect(editor).toContain("'What you did well'");
        expect(editor).toContain('`Strength ${');
        expect(editor).toContain("'+ Add strength'");
        expect(editor).toContain("'Feedback'");
    });

    it('caps staff strengths at five and never sends a blank explanation', () => {
        expect(editor).toContain('MAX_STAFF_STRENGTHS = 5');
        expect(editor).toMatch(/explanation\.trim\(\)/);
    });
});

describe('two-step review source contract', () => {
    it('replaces the Summary tab with the step bar', () => {
        expect(source).not.toContain("label: 'Summary', panel: summaryBody");
        expect(source).toContain('stepBarState(');
        expect(source).toContain("'← Back'");
        expect(source).toContain("'Next →'");
    });

    it('renders the footer on the summary and review steps, never on annotations', () => {
        expect(source).toMatch(/footer\.hidden = step === 'annotations'/);
    });

    it('offers Approve and Release only on the review step', () => {
        expect(source).toMatch(/approveButton\.hidden = !onReview/);
        expect(source).toMatch(/releaseButton\.hidden = !onReview/);
    });

    it('saves unsaved edits before approving instead of discarding them', () => {
        const approve = source.match(/async function approve\(\)[\s\S]*?\n    }\n/)?.[0] ?? '';
        expect(approve).toContain('if (savedFirst) await saveRevision();');
        expect(approve.indexOf('saveRevision')).toBeLessThan(approve.indexOf('/approve`'));
    });

    it('re-reads annotation evidence whenever the summary step opens', () => {
        expect(source).toMatch(/if \(step === 'summary'\) evidenceRefreshers\.forEach/);
    });

    it('redrafts through the summary-redraft route and confirms before replacing edits', () => {
        expect(source).toContain('/summary-redraft`');
        expect(source).toContain("'Update the summary from your annotations?'");
        expect(source).toContain("'Keep my summary'");
        expect(source).toContain("'Redraft summary'");
        expect(source).toContain("'Summary and suggested grades redrafted from your final annotations.'");
    });

    it('no longer renders the read-only technical draft', () => {
        expect(source).not.toContain('function renderTechnicalTab');
        expect(source).not.toContain('Read-only technical draft');
    });

    it('saves summary edits bound to their runs', () => {
        expect(source).toContain('summaryEdits');
        expect(source).toContain('technicalFeedbackRunId');
    });

    it('starts the annotation working set from the server-resolved comments', () => {
        expect(anchorsSource).toContain('detail.workingComments');
    });
});

describe('single release source contract', () => {
    it('offers only Release to Canvas, with no separate preview step', () => {
        expect(source).not.toContain("'Preview release'");
        expect(source).not.toContain('/release-preview');
        expect(source).toContain("'Release to Canvas'");
        expect(source).toContain('Feedback can be released only once.');
    });

    it('offers Canvas authorization on the review step and returns to that step', () => {
        expect(source).toContain("createButton('Connect Canvas', 'primary'");
        expect(source).toContain('connectUrlReturningTo(connectUrl, releaseReturnPath())');
        expect(source).toContain('const returningToRelease = consumeReleaseReturn();');
    });
});
