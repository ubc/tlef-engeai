/**
 * Writing feedback lens route contract — asserts the rubric routes resolve a
 * lens from the query string, that the one-time assignment type route and the
 * technical seed route exist (D-123), and that the lab-report toggle is gone,
 * without depending on declaration order in the source file.
 *
 * A genuine source-text guard test: reads `route-writing-feedback.ts` with
 * `fs.readFileSync` and asserts on its contents (mirrors the technique in
 * `src/dashboard-setting/__tests__/llm-feature-wiring.test.ts`).
 */

import fs from 'fs';
import path from 'path';
import { requireCompleteRubricCells } from '../../writing-feedback/rubric-schema';
import type { WritingRubricDefinition } from '../../writing-feedback/contracts';

/** A one-criterion draft missing exactly one of the two things the gate requires. */
function draftMissing(what: 'points' | 'descriptor'): WritingRubricDefinition {
    return {
        version: 1,
        status: 'draft',
        title: 't',
        task: 't',
        audience: 't',
        purpose: 't',
        constraints: ['c'],
        learningOutcomes: ['o'],
        gradingIntent: 'g',
        criteria: [{
            id: 'crit',
            label: 'Criterion',
            description: 'd',
            ...(what === 'points' ? {} : { points: 10 }),
            cells: what === 'points'
                ? { weak: { min: 0, max: 10, descriptor: 'd' } }
                : { weak: { min: 0, max: 10 } }
        }],
        levels: [{ id: 'weak', label: 'Weak', description: 'd', rank: 1 }],
        updatedAt: new Date(),
        updatedBy: 'u'
    } as WritingRubricDefinition;
}

const source = fs.readFileSync(
    path.join(__dirname, '..', 'route-writing-feedback.ts'),
    'utf8'
);

describe('writing feedback lens route contract', () => {
    it('declares the one-time assignment type route and the technical seed route', () => {
        expect(source).toMatch(/router\.put\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/type'/);
        expect(source).toMatch(/router\.post\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/technical-rubric\/seed'/);
    });

    it('no longer lets staff toggle the lab-report flag', () => {
        expect(source).not.toContain('/lab-report');
        expect(source).not.toContain('setWritingAssignmentLabReport');
    });

    it('lets the fixed assignment-type refusals past the safeError allowlist', () => {
        const allowlist = source
            .slice(source.indexOf('const safePrefixes'), source.indexOf('return safePrefixes'));
        expect(allowlist).toContain("'The assignment type has already been chosen'");
        expect(allowlist).toContain("'Only a lab report has a technical rubric'");
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

describe('POST rubric-draft/approve completeness gates', () => {
    // Captures the approve route's full body the same way `fillRouteBody` does above,
    // so a deleted or renamed route fails this test instead of leaving it silently green.
    function approveRouteBody(): string | null {
        const pattern = /router\.post\(\s*'\/:courseId\/writing-feedback\/assignments\/:assignmentId\/rubric-draft\/approve',([\s\S]*?)\nrouter\./;
        return source.match(pattern)?.[1].trim() ?? null;
    }

    // Extracts the full statement governed by `marker` (an `if (...)` header),
    // regardless of whether the author wrote a single unbraced statement or a
    // braced block. Brace style is exactly the axis a future edit could change
    // without anyone intending to move code into or out of the branch, so a
    // regex anchored to one specific unbraced text shape (as an earlier version
    // of this test used) would miss a re-nesting that adds braces. This walks
    // the text instead: past a `{` it counts nested braces to the matching
    // close; otherwise it scans to the first statement-ending `;` outside any
    // parens.
    function ifStatementBody(text: string, marker: string): string {
        const start = text.indexOf(marker);
        if (start === -1) throw new Error(`marker not found: ${marker}`);
        let i = start + marker.length;
        while (/\s/.test(text[i])) i++;
        if (text[i] === '{') {
            let depth = 0;
            let j = i;
            for (; j < text.length; j++) {
                if (text[j] === '{') depth++;
                else if (text[j] === '}') {
                    depth--;
                    if (depth === 0) { j++; break; }
                }
            }
            return text.slice(i, j);
        }
        let parenDepth = 0;
        let j = i;
        for (; j < text.length; j++) {
            const ch = text[j];
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
            else if (ch === ';' && parenDepth === 0) { j++; break; }
        }
        return text.slice(i, j);
    }

    it('runs the rubric-cell completeness gate for both lenses, unlike the linguistic-only SFL gate', () => {
        const body = approveRouteBody();
        expect(body).not.toBeNull();
        expect(body).toMatch(/requireCompleteRubricCells\(selected\.draft\);/);
        // The SFL gate stays linguistic-only; the cell-completeness gate must not
        // appear anywhere inside that `if (lens === 'linguistic')` statement's
        // body — braced or not, so grouping the two checks under one brace in a
        // future edit is caught, not just the single-line unbraced form.
        const linguisticBranch = ifStatementBody(body!, "if (lens === 'linguistic')");
        expect(linguisticBranch).not.toContain('requireCompleteRubricCells');
    });

    it('lets every message the cell gate throws past the safeError allowlist', () => {
        // safeError replaces any message it does not recognise with a generic line, so a
        // gate that refuses approval for a reason staff cannot read is no better than a
        // silent one. Both of the gate's refusals are checked against the real allowlist.
        const allowlist = source
            .slice(source.indexOf('const safePrefixes'), source.indexOf('return safePrefixes'))
            .match(/'(?:[^'\\]|\\.)*'/g)!
            .map((literal) => literal.slice(1, -1).replace(/\\'/g, "'"));

        const noPoints = draftMissing('points');
        const noDescriptor = draftMissing('descriptor');
        for (const draft of [noPoints, noDescriptor]) {
            let thrown = '';
            try {
                requireCompleteRubricCells(draft);
            } catch (error) {
                thrown = (error as Error).message;
            }
            expect(thrown).not.toBe('');
            expect(allowlist.some((prefix) => thrown.startsWith(prefix))).toBe(true);
        }
    });

    it('refuses approval while the assignment type is still pending', () => {
        const body = approveRouteBody();
        expect(body).not.toBeNull();
        expect(body).toMatch(/assignment\.assignmentTypePending === true[\s\S]*?status\(409\)[\s\S]*?CHOOSE_TYPE_BEFORE_APPROVAL_MESSAGE/);
    });

    it('keeps the new gate inside the same try/catch that returns HTTP 400 with a safe error', () => {
        const body = approveRouteBody();
        expect(body).not.toBeNull();
        // The gate call and the 400 response it feeds both sit inside one try/catch;
        // this pins that the gate throw is what reaches safeError(), not a separate path.
        expect(body).toMatch(
            /try \{[\s\S]*?requireCompleteRubricCells\(selected\.draft\);[\s\S]*?\} catch \(error\) \{[\s\S]*?return res\.status\(400\)\.json\(\{ success: false, error: safeError\(error\) \}\);/
        );
    });
});

describe('POST summary-redraft', () => {
    function redraftRouteBody(): string | null {
        const pattern = /router\.post\(\s*'\/:courseId\/writing-feedback\/submissions\/:submissionId\/summary-redraft',([\s\S]*?)\nrouter\./;
        return source.match(pattern)?.[1].trim() ?? null;
    }

    it('is declared behind the shared guards with no extra middleware', () => {
        const body = redraftRouteBody();
        expect(body).not.toBeNull();
        expect(body?.startsWith('asyncHandlerWithAuth(')).toBe(true);
    });

    it('validates annotations and lenses before calling the service', () => {
        const body = redraftRouteBody()!;
        expect(body).toContain('anchoredCommentsInputSchema.safeParse');
        expect(body).toContain('redraftSummary(');
        expect(body.indexOf('anchoredCommentsInputSchema.safeParse')).toBeLessThan(body.indexOf('redraftSummary('));
    });

    it('never logs or returns model or annotation content', () => {
        const body = redraftRouteBody()!;
        expect(body).not.toMatch(/appLogger|console\./);
        expect(body).toContain('SUMMARY_REDRAFT_FAILED_MESSAGE');
    });

    it('lets the fixed redraft and summary refusals past the safeError allowlist', () => {
        const allowlist = source.slice(source.indexOf('const safePrefixes'), source.indexOf('return safePrefixes'));
        expect(allowlist).toContain("'The summary can only be redrafted before approval'");
        expect(allowlist).toContain("'The summary changed since you opened it'");
        expect(allowlist).toContain("'Summary edits failed validation'");
    });

    it('accepts summaryEdits on review save through the bounded schema', () => {
        expect(source).toContain('summaryEditsInputSchema.safeParse');
    });
});
