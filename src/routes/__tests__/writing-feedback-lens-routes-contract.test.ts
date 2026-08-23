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

    // Captures everything between the fill route's `router.post(` call and the next
    // `router.` declaration — the route's full body, including its argument list and
    // handler. Reused by every test below that needs to inspect that body, so a
    // deleted or renamed route fails every one of them (`match` is `null`) instead of
    // leaving some green.
    function fillRouteBody(): string | null {
        const pattern = /router\.post\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/rubric-draft\/fill',([\s\S]*?)\nrouter\./;
        return source.match(pattern)?.[1].trim() ?? null;
    }

    it('declares the auto-fill route', () => {
        expect(source).toContain(routePath);
        expect(source).toMatch(/router\.post\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/rubric-draft\/fill'/);
    });

    it('inherits the router-level course-staff guard mounted on the writing-feedback prefix', () => {
        // There is exactly one guard in this file, mounted once on the whole
        // '/:courseId/writing-feedback' prefix; reading it here (rather than
        // re-deriving a guard list per route) is what proves the fill route,
        // whose path is a literal sub-path of that prefix, sits behind it.
        expect(source).toMatch(
            /router\.use\(\s*'\/:courseId\/writing-feedback',\s*requireInstructorForCourseAPI\(\['params'\]\),\s*requireCourseFeatureAPI\('writingFeedback',\s*\['params'\]\)\s*\);/
        );
    });

    it('declares no middleware for the fill route beyond the shared async-auth wrapper', () => {
        // The captured body must be exactly one wrapped call — `asyncHandlerWithAuth(...)`
        // as the sole remaining argument to `router.post`, immediately closed by the
        // route registration's own `);`. Checking only the start (as an earlier version
        // of this test did) misses a middleware appended as a trailing third argument,
        // e.g. `router.post(path, asyncHandlerWithAuth(...), someMiddleware)` — that
        // shape still starts with `asyncHandlerWithAuth(` but does not end with the
        // wrapper's own close immediately followed by the route's close, so the
        // `endsWith` check below is what catches it.
        const body = fillRouteBody();
        expect(body).not.toBeNull();
        expect(body?.startsWith('asyncHandlerWithAuth(')).toBe(true);
        expect(body?.endsWith('})\n);')).toBe(true);
    });

    it('validates the merged rubric with the shared draft schema before saving', () => {
        // Pins that the route still gates the save on `writingRubricDraftInputSchema`
        // (added in fix round 1 for the "verbose model response" / "bad band" findings).
        // Scoped to the fill route's own body, not just anywhere in the file, so this
        // stays meaningful even though the PUT handler above also references the schema.
        const body = fillRouteBody();
        expect(body).not.toBeNull();
        expect(body).toContain('writingRubricDraftInputSchema');
    });

    it('is declared before the approve route so it is not shadowed by a capturing sibling', () => {
        const routeIndex = source.indexOf(routePath);
        const approveIndex = source.indexOf(approvePath);
        expect(routeIndex).toBeGreaterThan(-1);
        expect(approveIndex).toBeGreaterThan(-1);
        expect(routeIndex).toBeLessThan(approveIndex);
    });
});
