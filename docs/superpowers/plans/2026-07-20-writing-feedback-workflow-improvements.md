# Writing Feedback Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delete-assignment / delete-submission to the Writing Feedback landing page, fix the cramped intake textarea, add a reading zoom control, make the review annotation panel resizable, fix a layout gap when the dashboard sidebar collapses, surface the highlight-to-comment affordance, and turn the review-history panel into a full read-only audit trail.

**Architecture:** Backend: two new DELETE routes on the existing `/:courseId/writing-feedback` router (already gated by course-staff RBAC + feature flag at the router level, so no new middleware), two new mongo delegate functions, one route-level submission-count guard. Frontend: new buttons/controls wired into the existing landing/review render functions in `public/scripts/feature/writing-feedback*.ts`, CSS-only fixes for sizing/zoom/resize/layout, and a pure diff function for history rendering.

**Tech Stack:** Express + TypeScript backend, MongoDB native driver, vanilla TypeScript frontend (no framework), Jest for tests.

## Global Constraints

- Do not commit or push — this repo's `AGENTS.md` says not to unless explicitly asked. Skip any "commit" step a generic plan template would include; mark tasks done by checking the box only.
- Any course staff (instructor + TA) can delete — reuse the router-level `requireInstructorForCourseAPI` (checks `isCourseStaff`, i.e. instructor-or-TA despite the name) already applied to the whole `/writing-feedback` router. Do not add `requireRosterManageAPI`.
- Deleting an assignment is blocked (409) while it has any submissions. Deleting a submission is always allowed, including `released` ones (UI shows an extra warning line in that case).
- Never log submission text or generated feedback content (existing invariant — none of these tasks add logging, so just don't introduce any).
- Mirror any shared type change in both `src/writing-feedback/contracts.ts` and `public/scripts/feature/writing-feedback-shared.ts` per this repo's type-mirroring rule — but per the investigation below, no contract change is actually needed (see Task 8).
- Update `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md` for the two new routes/delegates (Task 9).
- Run `npx jest src/writing-feedback`, backend `npx tsc --noEmit`, and frontend `npx tsc -p public/tsconfig.json --noEmit` before calling this done (Task 10).

---

## Task 1: Mongo delegate — delete assignment (blocked while submissions exist)

**Files:**
- Modify: `src/db/mongo/writing-feedback-mongo.ts`
- Test: `src/writing-feedback/__tests__/writing-feedback-mongo-delete.test.ts` (new)

**Interfaces:**
- Produces: `deleteWritingAssignment(ctx: MongoDalContext, courseId: string, assignmentId: string): Promise<{ deleted: boolean; submissionCount: number }>` — `submissionCount` lets the route decide 409 vs 404 vs 200 without a second query.

This module already exposes `submissions(ctx)` and `assignments(ctx)` collection helpers (see the top of the file) and a `countWritingSubmissionsByAssignment` whole-course aggregate. For a single assignment, use a direct `countDocuments` — no need to reuse the aggregate.

- [ ] **Step 1: Write the failing test**

Check how existing tests in this area set up an in-memory/test Mongo context first:

```bash
ls src/writing-feedback/__tests__/ | head -20
grep -rn "MongoMemoryServer\|mongo-context\|MongoDalContext" src/writing-feedback/__tests__/*.test.ts | head -10
```

Use whatever harness those tests already use (mirror the existing pattern exactly — same imports, same setup/teardown) and add:

```typescript
import { deleteWritingAssignment, createManualWritingAssignment, createWritingSubmission } from '../../db/mongo/writing-feedback-mongo';

describe('deleteWritingAssignment', () => {
    it('deletes an assignment with zero submissions', async () => {
        const assignment = await createManualWritingAssignment(ctx, 'course-1', 'Essay 1');
        const result = await deleteWritingAssignment(ctx, 'course-1', assignment.id);
        expect(result).toEqual({ deleted: true, submissionCount: 0 });
        const found = await ctx.db.collection('writing-assignments').findOne({ id: assignment.id });
        expect(found).toBeNull();
    });

    it('refuses to delete an assignment that still has submissions', async () => {
        const assignment = await createManualWritingAssignment(ctx, 'course-1', 'Essay 1');
        await createWritingSubmission(ctx, {
            courseId: 'course-1', assignmentId: assignment.id, studentId: 'student-1',
            attempt: 1, sourceType: 'manual', originalText: 'text', verifiedText: 'text',
            requiresVerification: false, status: 'imported'
        });
        const result = await deleteWritingAssignment(ctx, 'course-1', assignment.id);
        expect(result).toEqual({ deleted: false, submissionCount: 1 });
        const found = await ctx.db.collection('writing-assignments').findOne({ id: assignment.id });
        expect(found).not.toBeNull();
    });

    it('reports deleted: false for an assignment that does not exist', async () => {
        const result = await deleteWritingAssignment(ctx, 'course-1', 'no-such-id');
        expect(result).toEqual({ deleted: false, submissionCount: 0 });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/writing-feedback-mongo-delete.test.ts -v`
Expected: FAIL — `deleteWritingAssignment` is not exported.

- [ ] **Step 3: Implement**

Add to `src/db/mongo/writing-feedback-mongo.ts`, near `discardWritingRubricDraft`:

```typescript
export async function deleteWritingAssignment(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string
): Promise<{ deleted: boolean; submissionCount: number }> {
    const submissionCount = await submissions(ctx).countDocuments({ courseId, assignmentId });
    if (submissionCount > 0) {
        return { deleted: false, submissionCount };
    }
    const result = await assignments(ctx).deleteOne({ id: assignmentId, courseId });
    return { deleted: result.deletedCount === 1, submissionCount: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/writing-feedback/__tests__/writing-feedback-mongo-delete.test.ts -v`
Expected: PASS (3 tests)

---

## Task 2: Mongo delegate — delete submission (cascades runs/releases/jobs)

**Files:**
- Modify: `src/db/mongo/writing-feedback-mongo.ts`
- Test: `src/writing-feedback/__tests__/writing-feedback-mongo-delete.test.ts` (same file as Task 1)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `deleteWritingSubmission(ctx: MongoDalContext, courseId: string, submissionId: string): Promise<boolean>` — `true` if a submission was found and deleted.

- [ ] **Step 1: Write the failing test**

Append to the same test file from Task 1:

```typescript
import { deleteWritingSubmission, createWritingFeedbackRun, createWritingRelease } from '../../db/mongo/writing-feedback-mongo';

describe('deleteWritingSubmission', () => {
    it('deletes the submission and cascades its feedback runs and releases', async () => {
        const assignment = await createManualWritingAssignment(ctx, 'course-1', 'Essay 1');
        const submission = await createWritingSubmission(ctx, {
            courseId: 'course-1', assignmentId: assignment.id, studentId: 'student-1',
            attempt: 1, sourceType: 'manual', originalText: 'text', verifiedText: 'text',
            requiresVerification: false, status: 'imported'
        });
        await createWritingFeedbackRun(ctx, {
            courseId: 'course-1', assignmentId: assignment.id, submissionId: submission.id,
            profileVersion: assignment.profileVersion, rubricVersion: 1,
            result: { criteria: [], strengths: [], revisionGoals: [], internalFlags: [] },
            modelMetadata: { engine: 'test', promptVersion: 'v1' }
        });
        await createWritingRelease(ctx, {
            courseId: 'course-1', submissionId: submission.id, feedbackRunId: 'run-1',
            payloadFingerprint: 'fp-1', status: 'released'
        });

        const deleted = await deleteWritingSubmission(ctx, 'course-1', submission.id);
        expect(deleted).toBe(true);

        expect(await ctx.db.collection('writing-submissions').findOne({ id: submission.id })).toBeNull();
        expect(await ctx.db.collection('writing-feedback-runs').findOne({ submissionId: submission.id })).toBeNull();
        expect(await ctx.db.collection('writing-releases').findOne({ submissionId: submission.id })).toBeNull();
    });

    it('returns false for a submission that does not exist', async () => {
        const deleted = await deleteWritingSubmission(ctx, 'course-1', 'no-such-id');
        expect(deleted).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/writing-feedback-mongo-delete.test.ts -v`
Expected: FAIL — `deleteWritingSubmission` is not exported.

- [ ] **Step 3: Implement**

Add to `src/db/mongo/writing-feedback-mongo.ts`, near `getWritingSubmission`:

```typescript
export async function deleteWritingSubmission(
    ctx: MongoDalContext,
    courseId: string,
    submissionId: string
): Promise<boolean> {
    const result = await submissions(ctx).deleteOne({ id: submissionId, courseId });
    if (result.deletedCount !== 1) return false;
    await Promise.all([
        runs(ctx).deleteMany({ submissionId }),
        releases(ctx).deleteMany({ submissionId }),
        jobs(ctx).deleteMany({ 'payload.submissionId': submissionId })
    ]);
    return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/writing-feedback/__tests__/writing-feedback-mongo-delete.test.ts -v`
Expected: PASS (5 tests total in the file)

---

## Task 3: Wire both delegates through `EngEAI_MongoDB`

**Files:**
- Modify: `src/db/enge-ai-mongodb.ts:267` (right after `failWritingJob`)

**Interfaces:**
- Consumes: `deleteWritingAssignment`, `deleteWritingSubmission` from Task 1/2.
- Produces: `EngEAI_MongoDB.deleteWritingAssignment(courseId, assignmentId)`, `EngEAI_MongoDB.deleteWritingSubmission(courseId, submissionId)`.

- [ ] **Step 1: Add the two delegate passthroughs**

In `src/db/enge-ai-mongodb.ts`, the existing writing-feedback methods are one-line arrow-function passthroughs to `WritingFeedbackMongo.*`, e.g.:

```typescript
public failWritingJob = async (job: WritingJob, sanitizedError: string) =>
    WritingFeedbackMongo.failWritingJob(this.ctx(), job, sanitizedError);
```

Add immediately after that line:

```typescript
public deleteWritingAssignment = async (courseId: string, assignmentId: string) =>
    WritingFeedbackMongo.deleteWritingAssignment(this.ctx(), courseId, assignmentId);
public deleteWritingSubmission = async (courseId: string, submissionId: string) =>
    WritingFeedbackMongo.deleteWritingSubmission(this.ctx(), courseId, submissionId);
```

Confirm the exact context-accessor name (`this.ctx()` above is a placeholder) by reading how the line you're inserting after builds its own context — copy that expression verbatim rather than guessing.

- [ ] **Step 2: Verify the backend still typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

## Task 4: Routes — `DELETE .../assignments/:assignmentId` and `DELETE .../submissions/:submissionId`

**Files:**
- Modify: `src/routes/route-writing-feedback.ts:196-205` (add the assignment route near the existing rubric-draft delete for locality) and after line 255 (add the submission route)

**Interfaces:**
- Consumes: `mongo.deleteWritingAssignment`, `mongo.deleteWritingSubmission` from Task 3.
- Produces: `DELETE /:courseId/writing-feedback/assignments/:assignmentId` → `{ success: true }` (200) / `{ success:false, error }` (404/409); `DELETE /:courseId/writing-feedback/submissions/:submissionId` → `{ success: true }` (200) / `{ success:false, error }` (404).

- [ ] **Step 1: Add the assignment-delete route**

In `src/routes/route-writing-feedback.ts`, add after the existing `router.delete('/:courseId/writing-feedback/assignments/:assignmentId/rubric-draft', ...)` block (ends at line 205):

```typescript
router.delete('/:courseId/writing-feedback/assignments/:assignmentId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const { deleted, submissionCount } = await mongo.deleteWritingAssignment(courseId(req), String(req.params.assignmentId));
    if (deleted) return res.json({ success: true });
    if (submissionCount > 0) {
        return res.status(409).json({ success: false, error: 'Delete submissions before deleting this assignment' });
    }
    res.status(404).json({ success: false, error: 'Writing assignment not found' });
}));
```

Note this route does **not** use `requireRosterManageAPI` — it relies on the router-level `requireInstructorForCourseAPI` (course staff) already applied via `router.use(...)` at the top of the file, per the Global Constraints.

- [ ] **Step 2: Add the submission-delete route**

Add after the `GET /:courseId/writing-feedback/submissions/:submissionId` block (after line 266):

```typescript
router.delete('/:courseId/writing-feedback/submissions/:submissionId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const mongo = await EngEAI_MongoDB.getInstance();
    const deleted = await mongo.deleteWritingSubmission(courseId(req), String(req.params.submissionId));
    if (!deleted) return res.status(404).json({ success: false, error: 'Writing submission not found' });
    res.json({ success: true });
}));
```

- [ ] **Step 3: Add the new 409 message to `safeError`'s allow-list**

In `safeError`'s `safePrefixes` array (around line 38-50), add `'Delete submissions before deleting this assignment'` to the list (this route builds the response directly rather than through `safeError`, but keep the message registered for consistency/searchability — grep the codebase for other direct-response routes and confirm whether they also register their strings there before deciding; if none do, skip this step).

- [ ] **Step 4: Write route tests**

Find the existing route test file for writing feedback (likely `src/routes/__tests__/route-writing-feedback*.test.ts` or similar — search first: `find src -iname "*route-writing-feedback*test*"`). Mirror its supertest/app-setup pattern exactly. Add:

```typescript
describe('DELETE .../assignments/:assignmentId', () => {
    it('deletes an assignment with no submissions', async () => {
        // Arrange: create a course + manual assignment via the existing test helpers used elsewhere in this file.
        const res = await request(app)
            .delete(`/api/courses/${courseId}/writing-feedback/assignments/${assignmentId}`)
            .set(authHeaders);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('returns 409 when the assignment still has submissions', async () => {
        // Arrange: create an assignment + one submission via existing helpers.
        const res = await request(app)
            .delete(`/api/courses/${courseId}/writing-feedback/assignments/${assignmentId}`)
            .set(authHeaders);
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Delete submissions/);
    });
});

describe('DELETE .../submissions/:submissionId', () => {
    it('deletes a submission regardless of status', async () => {
        // Arrange: create a submission via existing helpers, optionally set status to 'released'.
        const res = await request(app)
            .delete(`/api/courses/${courseId}/writing-feedback/submissions/${submissionId}`)
            .set(authHeaders);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('returns 404 for an unknown submission', async () => {
        const res = await request(app)
            .delete(`/api/courses/${courseId}/writing-feedback/submissions/does-not-exist`)
            .set(authHeaders);
        expect(res.status).toBe(404);
    });
});
```

Fill in the arrange steps using whatever course/assignment/submission-creation helpers the rest of that test file already uses — do not invent new fixtures; match the file's existing style exactly.

- [ ] **Step 5: Run the route tests and the backend build**

Run: `npx jest <path-to-the-route-test-file> -v` then `npx tsc --noEmit`
Expected: all new tests PASS, build clean.

---

## Task 5: Frontend API calls + delete UI on the landing page

**Files:**
- Modify: `public/scripts/feature/writing-feedback.ts:1-44` (imports), `:89-144` (`renderAssignmentCard`), `:177-206` (`expandAssignment`)

**Interfaces:**
- Consumes: `jsonRequest<T>(path, 'DELETE')` (already imported), `showDeleteConfirmationModal(itemType, itemName)` from `../ui/modal-overlay.js` (new import), `createButton`, `state`, `Assignment`, `Submission` (already imported).
- Produces: nothing consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Import `showDeleteConfirmationModal`**

In `public/scripts/feature/writing-feedback.ts`, change the modal import line (currently there is none at top-level for modal-overlay — `showErrorModal`/`showConfirmModal` are only imported inside `writing-feedback-shared.ts`). Add a new import line after the existing `showSuccessToast` import (line 11):

```typescript
import { showDeleteConfirmationModal } from '../ui/modal-overlay.js';
```

- [ ] **Step 2: Add the "Delete" button to `renderAssignmentCard`**

In `renderAssignmentCard` (starts at line 89), the `controls` div currently appends `chip(...)`, `chip(...)`, then `rubricButton`, then `expandIcon` (lines 115-125). Insert a delete button between `rubricButton` and `expandIcon`:

```typescript
const deleteButton = createButton('Delete', 'danger', async () => {
    const result = await showDeleteConfirmationModal('assignment', assignment.title);
    if (result.action !== 'delete') return;
    await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}`, 'DELETE');
    state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
    if (state.expandedAssignmentId === assignment.id) state.expandedAssignmentId = null;
    renderLanding();
    showSuccessToast('Assignment deleted.');
});
deleteButton.addEventListener('click', (event) => event.stopPropagation());
controls.append(deleteButton);
```

Place this right before the existing `controls.append(expandIcon)` line, i.e.:

```typescript
controls.append(
    chip(assignment.canvasAssignmentId ? 'Canvas import' : 'Manual', assignment.canvasAssignmentId ? 'blue' : 'neutral'),
    chip(`${assignment.submissionCount ?? 0} submissions`, 'green')
);
const rubricButton = createButton('Edit rubric', 'secondary', async () => openRubricPage(assignment.id));
rubricButton.addEventListener('click', (event) => event.stopPropagation());
controls.append(rubricButton);
const deleteButton = createButton('Delete', 'danger', async () => {
    const result = await showDeleteConfirmationModal('assignment', assignment.title);
    if (result.action !== 'delete') return;
    await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}`, 'DELETE');
    state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
    if (state.expandedAssignmentId === assignment.id) state.expandedAssignmentId = null;
    renderLanding();
    showSuccessToast('Assignment deleted.');
});
deleteButton.addEventListener('click', (event) => event.stopPropagation());
controls.append(deleteButton);
const expandIcon = document.createElement('span');
```

`createButton` already wraps its action in `runButtonAction`, which catches and displays any thrown error (including the 409 from Task 4) via the existing error-modal path — no extra try/catch needed here. The 409 case leaves the card in place, which is correct since it wasn't removed from `state.assignments`.

- [ ] **Step 3: Add the "Delete" button to each submission row in `expandAssignment`**

In `expandAssignment` (starts at line 162), the row-building loop (lines 177-200) currently ends with:

```typescript
row.append(
    info,
    createButton('Open submission', 'secondary', async () => openReview(submission.id))
);
panel.append(row);
```

Change to:

```typescript
const deleteSubmissionButton = createButton('Delete', 'danger', async () => {
    const label = submission.studentLabel || 'this submission';
    const extraWarning = submission.status === 'released'
        ? ' This submission was already released to the student; deleting it removes only the local record and cannot recall the release.'
        : '';
    const result = await showConfirmModal(
        'Delete submission',
        `Are you sure you want to delete "${label}"? This action cannot be undone.${extraWarning}`,
        'Delete',
        'Cancel',
        'danger'
    );
    if (result.action !== 'confirm') return;
    await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}`, 'DELETE');
    row.remove();
    const current = state.assignments.find((item) => item.id === assignmentId);
    if (current && typeof current.submissionCount === 'number') {
        current.submissionCount = Math.max(0, current.submissionCount - 1);
    }
    document.querySelectorAll<HTMLElement>(`.wf-assignment[data-assignment-id="${assignmentId}"] .wf-assignment-meta ~ .wf-assignment-controls`);
    showSuccessToast('Submission deleted.');
});
row.append(
    info,
    createButton('Open submission', 'secondary', async () => openReview(submission.id)),
    deleteSubmissionButton
);
panel.append(row);
```

Remove the stray `document.querySelectorAll` line above — it was a leftover exploration artifact and does nothing; the submission-count chip is only re-read on the next full `renderLanding()`/`loadLanding()` call, which is acceptable (the count self-corrects next time the page loads; do not add extra DOM-patching for a chip that isn't even visible while the accordion panel is expanded).

This uses `showConfirmModal` (title, message, confirmText, cancelText, confirmVariant) rather than `showDeleteConfirmationModal` because the extra released-submission warning needs to be part of the message body. Import it:

```typescript
import { showDeleteConfirmationModal, showConfirmModal } from '../ui/modal-overlay.js';
```

Check `showConfirmModal`'s actual parameter order and its `ModalResult.action` value (`'confirm'` vs `'delete'`) by reading `public/scripts/ui/modal-overlay.ts:732` before wiring this up — the plan above assumes `action: 'confirm'` for the primary button based on the `resolve({ action: 'confirm', data: value })` call seen during investigation; confirm this is the button-click path (not only the text-input path) before relying on it.

- [ ] **Step 4: Manual verification (no MongoDB required for a static check)**

Run: `npx tsc -p public/tsconfig.json --noEmit`
Expected: clean. This task has no dedicated unit test (it's DOM wiring against an already-tested API); it's covered by the browser pass in Task 10.

---

## Task 6: Intake textarea sizing

**Files:**
- Modify: `public/scripts/feature/writing-feedback.ts:326`, `public/styles/instructor-components/writing-feedback.css` (near line 580, the `.wf-field textarea` rule)

**Interfaces:** none — CSS/DOM only, no exported symbols.

- [ ] **Step 1: Add a dedicated class to the intake textarea**

At `public/scripts/feature/writing-feedback.ts:326`:

```typescript
const text = textAreaControl('', 10);
```

becomes:

```typescript
const text = textAreaControl('', 10);
text.classList.add('wf-intake-text');
```

- [ ] **Step 2: Add the CSS rule**

In `public/styles/instructor-components/writing-feedback.css`, immediately after the `.wf-field textarea { min-height: 96px; line-height: 1.5; resize: vertical; }` rule (around line 580-584), add:

```css
.wf-field textarea.wf-intake-text {
    min-height: 45vh;
}
```

- [ ] **Step 3: Verify no CSS syntax break**

Run:
```bash
node -e "const fs=require('fs');const c=fs.readFileSync('public/styles/instructor-components/writing-feedback.css','utf8');const o=(c.match(/{/g)||[]).length;const cl=(c.match(/}/g)||[]).length;console.log(o,cl);if(o!==cl)process.exit(1)"
```
Expected: two equal numbers printed, exit code 0.

---

## Task 7: Zoom control (intake + review reading pane)

**Files:**
- Modify: `public/scripts/feature/writing-feedback-shared.ts` (new exported helper), `public/scripts/feature/writing-feedback.ts` (apply to intake form), `public/scripts/feature/writing-feedback-review.ts` (apply to doc pane), `public/styles/instructor-components/writing-feedback.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createZoomControl(target: HTMLElement): HTMLElement` in `writing-feedback-shared.ts` — builds the "Aa − 100% +" stepper, wires it to set `--wf-zoom` on `target`, and initializes from `localStorage`. Used by Task 5's intake form and by `writing-feedback-review.ts`.

- [ ] **Step 1: Add the shared zoom-control helper**

In `public/scripts/feature/writing-feedback-shared.ts`, add near `createButton`:

```typescript
const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];
const ZOOM_STORAGE_KEY = 'wf-zoom-level';

function readStoredZoomIndex(): number {
    const raw = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    const index = ZOOM_STEPS.indexOf(raw);
    return index === -1 ? 1 : index;
}

/** Builds an "Aa − 100% +" stepper that sets `--wf-zoom` on `target` and persists the level per-browser. */
export function createZoomControl(target: HTMLElement): HTMLElement {
    let index = readStoredZoomIndex();

    const wrap = document.createElement('div');
    wrap.className = 'wf-zoom-control';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Reading zoom');

    const label = createText('span', 'Aa', 'wf-zoom-label');
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'wf-icon-button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Zoom out');

    const percent = createText('span', '', 'wf-zoom-percent');

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'wf-icon-button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Zoom in');

    function apply(): void {
        const level = ZOOM_STEPS[index];
        target.style.setProperty('--wf-zoom', String(level));
        percent.textContent = `${Math.round(level * 100)}%`;
        minus.disabled = index === 0;
        plus.disabled = index === ZOOM_STEPS.length - 1;
        window.localStorage.setItem(ZOOM_STORAGE_KEY, String(level));
    }

    minus.addEventListener('click', () => { index = Math.max(0, index - 1); apply(); });
    plus.addEventListener('click', () => { index = Math.min(ZOOM_STEPS.length - 1, index + 1); apply(); });

    apply();
    wrap.append(label, minus, percent, plus);
    return wrap;
}
```

- [ ] **Step 2: Apply it to the intake form**

In `public/scripts/feature/writing-feedback.ts`, near where `text` (the intake textarea from Task 6) is built and inserted into its `field(...)` wrapper, add the zoom control as a sibling. Find the `field('...', text, ...)` call for this textarea and insert immediately after building `text`:

```typescript
const text = textAreaControl('', 10);
text.classList.add('wf-intake-text');
const zoomControl = createZoomControl(text);
```

Then wherever the field/label for this textarea is appended to the form (locate the exact surrounding `field(...)` call by reading the ~20 lines around line 326), append `zoomControl` next to it — e.g. if it's currently:

```typescript
form.append(field('Submission text', text, 'Paste the full essay text.'));
```

change to:

```typescript
const textFieldWrap = document.createElement('div');
textFieldWrap.append(field('Submission text', text, 'Paste the full essay text.'), zoomControl);
form.append(textFieldWrap);
```

Add `createZoomControl` to the shared import list at the top of `writing-feedback.ts`.

- [ ] **Step 3: Apply it to the review reading pane**

In `public/scripts/feature/writing-feedback-review.ts`, `renderDocPane` (starts at line 336) builds `paper` (the `.wf-doc-paper` element) in two branches — the verification-textarea branch (lines 341-357) and the annotated/plain-text branch (lines 373 onward). In both branches, after `paper` is created and before it's returned/appended, add:

```typescript
paper.prepend(createZoomControl(paper));
```

For the verification branch specifically, insert this right after `paper.className = 'wf-doc-paper';` and before the `paper.append(createText('h3', ...), ...)` call, so the zoom control renders above the heading. For the annotated branch, insert right after `paper.id = 'wf-doc-paper';`.

Add `createZoomControl` to the shared import list at the top of `writing-feedback-review.ts`.

- [ ] **Step 4: Add CSS for the zoom control and wire `--wf-zoom` into font-size**

In `public/styles/instructor-components/writing-feedback.css`:

```css
.wf-zoom-control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
}

.wf-zoom-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
}

.wf-zoom-percent {
    min-width: 42px;
    text-align: center;
    font-size: 13px;
    color: var(--text-secondary);
}
```

Change the existing `.wf-doc-paper` rule (around line 837-848) from a fixed `font-size: 15px` to:

```css
.wf-doc-paper {
    position: relative;
    background: #fffef9;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    padding: 40px;
    max-width: 75ch;
    margin: 0 auto;
    color: var(--text-primary);
    --wf-zoom: 1;
    font-size: calc(15px * var(--wf-zoom));
    line-height: 1.75;
}
```

(The `--wf-zoom: 1;` default here means the page renders correctly even before JS runs / if JS fails.) Also update `.wf-field textarea.wf-intake-text` (added in Task 6) to respond to zoom — its parent `.wf-field` doesn't have a natural zoom scope, so give the textarea itself a local custom property:

```css
.wf-field textarea.wf-intake-text {
    min-height: 45vh;
    --wf-zoom: 1;
    font-size: calc(14px * var(--wf-zoom));
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p public/tsconfig.json --noEmit`
Expected: clean.

---

## Task 8: Resizable annotation panel

**Files:**
- Modify: `public/scripts/feature/writing-feedback-review.ts` (`renderReviewBody`/layout construction around line 322-328), `public/styles/instructor-components/writing-feedback.css:801-806`

**Interfaces:** none exported — self-contained DOM+CSS behavior scoped to the review layout element.

- [ ] **Step 1: Add the CSS var and drag handle styling**

In `public/styles/instructor-components/writing-feedback.css`, change:

```css
.wf-review-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    align-items: start;
    gap: 20px;
}
```

to:

```css
.wf-review-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6px var(--wf-panel-width, 420px);
    align-items: start;
    gap: 20px;
}

.wf-panel-resize-handle {
    align-self: stretch;
    width: 6px;
    border-radius: 3px;
    background: var(--border-color);
    cursor: col-resize;
    touch-action: none;
}

.wf-panel-resize-handle:hover,
.wf-panel-resize-handle:focus-visible {
    background: var(--pinned-color);
    outline: none;
}
```

(Using a 3-column grid — content, handle, panel — is simpler and more robust than absolutely positioning the handle over a 2-column grid.)

- [ ] **Step 2: Insert the handle between the two panes and wire drag/keyboard resize**

In `public/scripts/feature/writing-feedback-review.ts`, locate the layout-assembly block (around line 322-328):

```typescript
const layout = document.createElement('div');
layout.className = 'wf-review-layout';
layout.append(
    renderDocPane(submission, feedbackRun !== null && !staleRubric),
    renderFeedbackPanel(detail, assignment, staleRubric)
);
root.append(layout);
```

Change to:

```typescript
const layout = document.createElement('div');
layout.className = 'wf-review-layout';
const storedWidth = window.localStorage.getItem('wf-panel-width');
if (storedWidth) layout.style.setProperty('--wf-panel-width', `${storedWidth}px`);
layout.append(
    renderDocPane(submission, feedbackRun !== null && !staleRubric),
    createPanelResizeHandle(layout),
    renderFeedbackPanel(detail, assignment, staleRubric)
);
root.append(layout);
```

Add this new function near the other layout helpers in the same file:

```typescript
const PANEL_MIN_WIDTH = 340;
const PANEL_DEFAULT_WIDTH = 420;

function createPanelResizeHandle(layout: HTMLElement): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'wf-panel-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize feedback panel');
    handle.tabIndex = 0;

    function currentWidth(): number {
        const raw = getComputedStyle(layout).getPropertyValue('--wf-panel-width').trim();
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : PANEL_DEFAULT_WIDTH;
    }

    function setWidth(px: number): void {
        const maxWidth = layout.getBoundingClientRect().width * 0.65;
        const clamped = Math.min(Math.max(px, PANEL_MIN_WIDTH), Math.max(maxWidth, PANEL_MIN_WIDTH));
        layout.style.setProperty('--wf-panel-width', `${clamped}px`);
        window.localStorage.setItem('wf-panel-width', String(Math.round(clamped)));
    }

    handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startWidth = currentWidth();
        function onMove(moveEvent: PointerEvent): void {
            setWidth(startWidth - (moveEvent.clientX - startX));
        }
        function onUp(): void {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    });

    handle.addEventListener('dblclick', () => setWidth(PANEL_DEFAULT_WIDTH));

    handle.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); setWidth(currentWidth() + 10); }
        if (event.key === 'ArrowRight') { event.preventDefault(); setWidth(currentWidth() - 10); }
    });

    return handle;
}
```

(Panel width grows as you drag the handle left, i.e. toward the document — `startWidth - deltaX` — since the panel sits on the right; dragging left increases panel width. Arrow-Left grows the panel to match, Arrow-Right shrinks it, for the same reason.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p public/tsconfig.json --noEmit`
Expected: clean.

---

## Task 9: Sidebar-collapse layout fix + highlight-to-comment hint

**Files:**
- Modify: `public/styles/instructor-components/writing-feedback.css:24-30` (`.wf-main-content`)
- Modify: `public/scripts/feature/writing-feedback-review.ts` (annotate-mode doc pane, inside the branch starting at line 373)

**Interfaces:** none — CSS + one static text node.

- [ ] **Step 1: Loosen the main-content width cap**

Change:

```css
.wf-main-content {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 20px 20px;
    overflow-y: auto;
}
```

to:

```css
.wf-main-content {
    width: 100%;
    max-width: clamp(960px, 92vw, 1680px);
    margin: 0 auto;
    padding: 0 20px 20px;
    overflow-y: auto;
}
```

This keeps a comfortable reading width on narrow/default viewports but lets the workspace use the space the collapsed sidebar frees up on wide screens, instead of a hard 1400px ceiling regardless of sidebar state.

- [ ] **Step 2: Start the app and check the header-to-panel gap live**

Run: `npm run dev` (requires local MongoDB — if unavailable, note this step as not completed rather than guessing at a fix).

In a browser, open the Writing Feedback tab as an instructor, collapse the left feature sidebar, and inspect (DevTools) any visible vertical gap between `.wf-header` and the section below it. If a stray margin/padding is found beyond the existing intentional `20px` header `margin-bottom`, fix it at its source rule (do not add a compensating negative margin). Record in the task notes exactly what, if anything, was found and changed — if nothing beyond the intentional 20px gap is found, say so explicitly rather than inventing a fix.

- [ ] **Step 3: Add the highlight-to-comment hint**

In `public/scripts/feature/writing-feedback-review.ts`, in `renderDocPane`'s annotate branch (the `if (!annotate) { ... } else { ... }` split following line 376 — read the ~20 lines after line 376 to find exactly where the annotated-text branch starts), add one line before the annotated text is appended:

```typescript
if (annotate) {
    paper.append(createText('p', 'Select any text in the document to add a comment.', 'wf-muted-note'));
}
```

Place this so it renders once, near the top of the paper, not per-paragraph — insert it right after the zoom control added in Task 7 Step 3 for this branch, before the annotated text/marks are appended.

- [ ] **Step 4: CSS balance check + typecheck**

Run the brace-balance check from Task 6 Step 3, and `npx tsc -p public/tsconfig.json --noEmit`.
Expected: both clean.

---

## Task 10: Review history — full audit trail

**Files:**
- Modify: `public/scripts/feature/writing-feedback-shared.ts` (add `staffUserId` to `ReviewRevision`, add a pure diff function)
- Modify: `public/scripts/feature/writing-feedback-review.ts:649-660` (rebuild the history block)
- Test: `public/scripts/feature/__tests__/writing-feedback-history-diff.test.ts` (new — check how existing frontend unit tests are set up first: `find public -iname "*__tests__*" -path "*feature*"`)

**Interfaces:**
- Consumes: `AnchoredComment` (already defined in `writing-feedback-shared.ts`).
- Produces: `diffReviewComments(previous: AnchoredComment[] | undefined, current: AnchoredComment[] | undefined): { added: AnchoredComment[]; removed: AnchoredComment[]; edited: Array<{ before: AnchoredComment; after: AnchoredComment }> }` exported from `writing-feedback-shared.ts`.

Investigation note: no backend change is needed here. `StaffReviewRevision.comments` in `src/writing-feedback/contracts.ts` already includes every field this diff needs, `appendWritingReview` in `src/db/mongo/writing-feedback-mongo.ts:284-289` already stores `staffUserId` on every pushed revision, and `WritingFeedbackService.detail()` returns the raw submission document (including `reviews[].staffUserId`) with no field-stripping. The only gap is that the frontend `ReviewRevision` TypeScript type doesn't declare `staffUserId`, so existing code never reads a field that's already on the wire.

- [ ] **Step 1: Add `staffUserId` to the frontend type**

In `public/scripts/feature/writing-feedback-shared.ts`, change:

```typescript
export interface ReviewRevision {
    studentFeedback: string;
    internalNote?: string;
    comments?: AnchoredComment[];
    createdAt: string;
}
```

to:

```typescript
export interface ReviewRevision {
    staffUserId: string;
    studentFeedback: string;
    internalNote?: string;
    comments?: AnchoredComment[];
    createdAt: string;
}
```

- [ ] **Step 2: Write the failing test for the diff function**

First check the existing frontend test setup pattern:

```bash
find public -iname "*.test.ts" | xargs grep -l "writing-feedback" 2>/dev/null
cat jest.config.js 2>/dev/null || cat jest.config.ts 2>/dev/null
```

Mirror whatever ts-jest config those existing frontend tests use. Create `public/scripts/feature/__tests__/writing-feedback-history-diff.test.ts`:

```typescript
import { diffReviewComments, type AnchoredComment } from '../writing-feedback-shared';

function comment(overrides: Partial<AnchoredComment> = {}): AnchoredComment {
    return {
        id: 'c1',
        quote: 'the quick fox',
        startOffset: 0,
        endOffset: 13,
        comment: 'Consider revising this clause.',
        origin: 'staff',
        ...overrides
    };
}

describe('diffReviewComments', () => {
    it('treats every comment as added when there is no previous revision', () => {
        const result = diffReviewComments(undefined, [comment()]);
        expect(result.added).toHaveLength(1);
        expect(result.removed).toHaveLength(0);
        expect(result.edited).toHaveLength(0);
    });

    it('detects an added comment', () => {
        const previous = [comment({ id: 'c1' })];
        const current = [comment({ id: 'c1' }), comment({ id: 'c2' })];
        const result = diffReviewComments(previous, current);
        expect(result.added.map((c) => c.id)).toEqual(['c2']);
    });

    it('detects a removed comment', () => {
        const previous = [comment({ id: 'c1' }), comment({ id: 'c2' })];
        const current = [comment({ id: 'c1' })];
        const result = diffReviewComments(previous, current);
        expect(result.removed.map((c) => c.id)).toEqual(['c2']);
    });

    it('detects an edited comment when the text changes', () => {
        const previous = [comment({ id: 'c1', comment: 'Original note.' })];
        const current = [comment({ id: 'c1', comment: 'Revised note.' })];
        const result = diffReviewComments(previous, current);
        expect(result.edited).toHaveLength(1);
        expect(result.edited[0].before.comment).toBe('Original note.');
        expect(result.edited[0].after.comment).toBe('Revised note.');
    });

    it('does not flag an unchanged comment as edited', () => {
        const previous = [comment({ id: 'c1' })];
        const current = [comment({ id: 'c1' })];
        const result = diffReviewComments(previous, current);
        expect(result.edited).toHaveLength(0);
        expect(result.added).toHaveLength(0);
        expect(result.removed).toHaveLength(0);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest public/scripts/feature/__tests__/writing-feedback-history-diff.test.ts -v`
Expected: FAIL — `diffReviewComments` is not exported.

- [ ] **Step 4: Implement the diff function**

In `public/scripts/feature/writing-feedback-shared.ts`, add near the `AnchoredComment` interface:

```typescript
const DIFF_FIELDS: Array<keyof AnchoredComment> = [
    'quote', 'comment', 'howToImprove', 'courseMaterialLink', 'glossaryDefinition',
    'functionTag', 'levelTag', 'priority'
];

function commentsDiffer(a: AnchoredComment, b: AnchoredComment): boolean {
    return DIFF_FIELDS.some((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

export function diffReviewComments(
    previous: AnchoredComment[] | undefined,
    current: AnchoredComment[] | undefined
): { added: AnchoredComment[]; removed: AnchoredComment[]; edited: Array<{ before: AnchoredComment; after: AnchoredComment }> } {
    const previousById = new Map((previous ?? []).map((c) => [c.id, c]));
    const currentById = new Map((current ?? []).map((c) => [c.id, c]));

    const added = [...currentById.values()].filter((c) => !previousById.has(c.id));
    const removed = [...previousById.values()].filter((c) => !currentById.has(c.id));
    const edited = [...currentById.values()]
        .filter((c) => previousById.has(c.id) && commentsDiffer(previousById.get(c.id)!, c))
        .map((after) => ({ before: previousById.get(after.id)!, after }));

    return { added, removed, edited };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest public/scripts/feature/__tests__/writing-feedback-history-diff.test.ts -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Rebuild the history rendering block**

In `public/scripts/feature/writing-feedback-review.ts`, replace lines 649-660:

```typescript
if (submission.reviews?.length) {
    const historySection = document.createElement('section');
    historySection.className = 'wf-feedback-section';
    historySection.append(createText('h3', `Review history (${submission.reviews.length})`));
    const history = document.createElement('div');
    history.className = 'wf-history-list';
    [...submission.reviews].reverse().forEach((item, index) => {
        history.append(createText('div', `Revision ${submission.reviews!.length - index} · ${formatDate(item.createdAt, true)}`, 'wf-history-item'));
    });
    historySection.append(history);
    children.push(historySection);
}
```

with:

```typescript
if (submission.reviews?.length) {
    const historySection = document.createElement('section');
    historySection.className = 'wf-feedback-section';
    historySection.append(
        createText('h3', `Review history (${submission.reviews.length})`),
        createText('p', 'Every saved revision is kept for audit. This is a read-only record — it cannot be restored or reverted.', 'wf-muted-note')
    );
    const history = document.createElement('div');
    history.className = 'wf-history-list';
    const reviews = submission.reviews;
    [...reviews].reverse().forEach((item, reverseIndex) => {
        const revisionNumber = reviews.length - reverseIndex;
        const previous = reviews[revisionNumber - 2];
        const diff = diffReviewComments(previous?.comments, item.comments);

        const entry = document.createElement('details');
        entry.className = 'wf-history-item';
        entry.open = reverseIndex === 0;

        const summary = document.createElement('summary');
        summary.textContent = `Revision ${revisionNumber} · ${formatDate(item.createdAt, true)} · ${item.staffUserId}`;
        entry.append(summary);

        const body = document.createElement('div');
        body.className = 'wf-history-item-body';
        body.append(
            createText('h4', 'Student-facing feedback'),
            createText('pre', item.studentFeedback, 'wf-history-text')
        );
        if (item.internalNote) {
            body.append(createText('h4', 'Internal staff note'), createText('pre', item.internalNote, 'wf-history-text'));
        }

        function commentLine(label: string, comment: AnchoredComment): HTMLElement {
            const line = document.createElement('p');
            line.className = 'wf-history-comment-line';
            line.append(
                createText('strong', `${label}: `),
                createText('span', `"${comment.quote}" — ${comment.comment}`),
                chip(comment.origin === 'staff' ? 'Staff' : 'Model seed', comment.origin === 'staff' ? 'green' : 'neutral')
            );
            return line;
        }

        if (diff.added.length || diff.removed.length || diff.edited.length) {
            body.append(createText('h4', 'Comment changes'));
            diff.added.forEach((c) => body.append(commentLine('Added', c)));
            diff.edited.forEach(({ after }) => body.append(commentLine('Edited', after)));
            diff.removed.forEach((c) => body.append(commentLine('Removed', c)));
        }

        entry.append(body);
        history.append(entry);
    });
    historySection.append(history);
    children.push(historySection);
}
```

Add `diffReviewComments` and `AnchoredComment` (if not already imported) to the import list at the top of `writing-feedback-review.ts`.

- [ ] **Step 7: Add CSS for the new history structure**

In `public/styles/instructor-components/writing-feedback.css`, find the existing `.wf-history-list`/`.wf-history-item` rules (search: `grep -n "wf-history" public/styles/instructor-components/writing-feedback.css`) and read them before adding — reuse existing tokens/spacing rather than inventing new ones. Add:

```css
.wf-history-item {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 8px;
    background: var(--chat-bg);
}

.wf-history-item summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--text-primary);
}

.wf-history-item-body {
    margin-top: 10px;
}

.wf-history-item-body h4 {
    margin: 12px 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
}

.wf-history-text {
    white-space: pre-wrap;
    font: inherit;
    margin: 0;
    color: var(--text-primary);
}

.wf-history-comment-line {
    margin: 4px 0;
    font-size: 13px;
}
```

If the existing `.wf-history-list`/`.wf-history-item` rules from before this change conflict (e.g. `.wf-history-item` previously styled a plain `<div>` line), adjust rather than duplicate — read them first as instructed above.

- [ ] **Step 8: Run frontend typecheck and the full writing-feedback jest suite**

Run: `npx tsc -p public/tsconfig.json --noEmit` then `npx jest src/writing-feedback public/scripts/feature/__tests__/writing-feedback-history-diff.test.ts -v`
Expected: both clean/passing.

---

## Task 11: Docs + full verification pass

**Files:**
- Modify: `documents/ENDPOINT_ARCHITECTURE.md`
- Modify: `documents/MONGO_DATA_LAYER.md`
- Modify: `documents/WRITING_FEEDBACK_STYLE_GUIDE.md`

- [ ] **Step 1: Document the two new routes**

In `documents/ENDPOINT_ARCHITECTURE.md`, find the Writing Feedback routes section (search for `writing-feedback/assignments` or `writing-feedback/submissions`) and add rows/entries for:
- `DELETE /:courseId/writing-feedback/assignments/:assignmentId` — course staff; 409 if the assignment still has submissions.
- `DELETE /:courseId/writing-feedback/submissions/:submissionId` — course staff; allowed at any status, cascades feedback runs/releases/jobs for that submission.

Match the existing entries' format exactly (read a few neighboring entries first).

- [ ] **Step 2: Document the two new delegates**

In `documents/MONGO_DATA_LAYER.md`, find the writing-feedback delegate section and add `deleteWritingAssignment` and `deleteWritingSubmission` with their cascade behavior, matching the existing entries' format.

- [ ] **Step 3: Document the UI additions**

In `documents/WRITING_FEEDBACK_STYLE_GUIDE.md`, add short entries (matching the doc's existing structure) for: the zoom control, the resizable annotation panel, the enlarged intake textarea, and the expanded review-history format.

- [ ] **Step 4: Full verification pass**

Run, in order, and record actual output (do not claim a result without having run it):

```bash
npx jest src/writing-feedback -v
npx jest public/scripts/feature/__tests__/writing-feedback-history-diff.test.ts -v
npx tsc --noEmit
npx tsc -p public/tsconfig.json --noEmit
```

Expected: all green. If `npm run dev` / MongoDB was reachable in Task 9 Step 2, also do a final click-through: delete an assignment with and without submissions, delete a released and a non-released submission, resize the annotation panel, zoom the intake and review panes, and open the history panel on a submission with 2+ saved revisions to confirm the diff renders sensibly. Report exactly which of these were verified live vs. source-reviewed only.

- [ ] **Step 5: Update project memory**

Per this repo's `AGENTS.md`, update `../project-memory/01 Project Memory/Current State.md` with a dated section describing what changed and what was/wasn't browser-verified, and add one dated note under `../project-memory/02 Session Log/`. Do not commit anything in the main repo — memory files are in the separate `project-memory` workspace and are fine to write directly per existing session-log convention.
