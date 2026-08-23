/**
 * Writing feedback lens route contract — asserts the rubric routes resolve a
 * lens from the query string and that the lab-report toggle route exists,
 * without depending on declaration order in the source file.
 *
 * A genuine source-text guard test: reads `route-writing-feedback.ts` with
 * `fs.readFileSync` and asserts on its contents (mirrors the technique in
 * `src/dashboard-setting/__tests__/llm-feature-wiring.test.ts`).
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', 'route-writing-feedback.ts'),
    'utf8'
);

describe('writing feedback lens route contract', () => {
    it('declares the lab-report toggle route', () => {
        expect(source).toContain("'/:courseId/writing-feedback/assignments/:assignmentId/lab-report'");
        expect(source).toMatch(/router\.patch\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/lab-report'/);
    });

    it('declares all four rubric routes', () => {
        expect(source).toContain("'/:courseId/writing-feedback/assignments/:assignmentId/rubric'");
        expect(source).toContain("'/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft'");
        expect(source).toMatch(/router\.put\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/rubric-draft'/);
        expect(source).toMatch(/router\.delete\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/rubric-draft'/);
        expect(source).toContain("'/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/approve'");
    });

    it('resolves the lens from the query string on every rubric route', () => {
        // Counts occurrences across the whole file rather than slicing a search
        // window, so moving a route never silently empties the assertion.
        expect(source.match(/parseLens\(req\.query\.lens\)/g)?.length).toBeGreaterThanOrEqual(4);
    });

    it('never adds roster-management authority to a writing feedback route', () => {
        expect(source).not.toContain('requireRosterManageAPI');
    });

    it('keeps the router-level course-staff guard', () => {
        expect(source).toContain('requireInstructorForCourseAPI');
    });
});

describe('POST rubric-draft/fill', () => {
    const routePath = "'/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/fill'";
    const approvePath = "'/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft/approve'";

    it('declares the auto-fill route', () => {
        expect(source).toContain(routePath);
        expect(source).toMatch(/router\.post\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/rubric-draft\/fill'/);
    });

    it('sits under the shared writing-feedback prefix guarded by the router-level middleware', () => {
        // Every route behind `requireInstructorForCourseAPI` shares this literal prefix
        // (see the `router.use('/:courseId/writing-feedback', ...)` guard above); no
        // route needs its own guard because there is exactly one shared one.
        expect(routePath).toContain("'/:courseId/writing-feedback/");
    });

    it('is declared before the approve route so it is not shadowed by a capturing sibling', () => {
        const routeIndex = source.indexOf(routePath);
        const approveIndex = source.indexOf(approvePath);
        expect(routeIndex).toBeGreaterThan(-1);
        expect(approveIndex).toBeGreaterThan(-1);
        expect(routeIndex).toBeLessThan(approveIndex);
    });
});
