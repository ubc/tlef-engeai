/**
 * @fileoverview Source guard for frontend review copy where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-review.ts'),
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
        const summaryTab = source.match(/function renderSummaryTab[\s\S]*?\n}/)?.[0] ?? '';
        expect(summaryTab).not.toBe('');
        expect(summaryTab).toContain("createText('h3', 'Priority revision goals')");
        expect(summaryTab).not.toContain('Student-facing feedback');
        // The seed mirrors the student PDF's numbering and wording so staff edit the text
        // in the shape the student receives it, including the Socratic question.
        expect(source).toContain('function seedStudentFeedback');
        expect(source).toContain('Ask yourself:');
    });

    it('lists internal review flags where they qualify the levels they belong to', () => {
        // A live run abstained on source completeness and word count. Both were joined into
        // one comma-separated sentence at the very bottom of the tab, under the release
        // card, so a marker approving a level never saw what the model could not check.
        const summaryTab = source.match(/function renderSummaryTab[\s\S]*?\n}/)?.[0] ?? '';
        expect(summaryTab).not.toContain('internalFlags.join');
        const flagsIndex = summaryTab.indexOf("createText('h3', 'Internal review flags')");
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
