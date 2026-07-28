# Writing Feedback UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the weak parts of the 2026-07-20 Writing Feedback pass: replace the in-document zoom control with a sticky Canvas-SpeedGrader-style reading toolbar (zoom + wide-view toggle), demote the text "Delete" buttons to icon-only trash buttons with a proper actions group, and fix the sidebar-collapse width fix that didn't actually work.

**Architecture:** Frontend-only. The backend delete endpoints, confirm modals, intake textarea sizing, resizable panel, and history audit trail from the earlier pass are kept unchanged. Changes concentrate in `writing-feedback-shared.ts` (helpers), `writing-feedback.ts` (landing), `writing-feedback-review.ts` (reading toolbar), and `writing-feedback.css`.

**Tech Stack:** Vanilla TypeScript frontend, feather icons (`refreshIcons`), CSS custom properties.

## Global Constraints

- Do not commit or push — repo `AGENTS.md` forbids it unless explicitly requested. Skip all commit steps.
- No new test infrastructure: this repo has no frontend jest and no supertest/MongoMemoryServer harness (established 2026-07-20). Verification = `npx tsc -p public/tsconfig.json --noEmit`, backend `npx tsc --noEmit`, `npx jest src/writing-feedback`, CSS brace balance.
- Design language: shared instructor tokens only (`--color-chbe-green`, `--border-color`, `--hover-bg`, `--text-primary`, `--text-secondary`, `--chat-bg`, `--color-eng-red`). No new palettes.
- Reading-comfort rationale (drives every task): a professor/TA grades hundreds of submissions; view controls must never scroll away, destructive actions must be visually quiet, and the document must be able to use the width the reader gives it.
- Keep: DELETE endpoints and their confirm-modal flows, `wf-intake-text` 45vh sizing, resizable panel handle, history audit trail, highlight-to-comment hint.

---

### Task 1: Shared helpers — zoom range/defaults, zero-margin zoom control, `createIconButton`

**Files:**
- Modify: `public/scripts/feature/writing-feedback-shared.ts` (the `ZOOM_STEPS`/`readStoredZoomIndex`/`createZoomControl` block added 2026-07-20, and the area near `createButton`)
- Modify: `public/styles/instructor-components/writing-feedback.css` (`.wf-zoom-control` rule and `.wf-icon-button` area, ~lines 209-226)

**Interfaces:**
- Consumes: existing `createText`, `handleActionError` in the same file.
- Produces: `createIconButton(iconName: string, label: string, variant: 'neutral' | 'danger', action: (button: HTMLButtonElement) => Promise<void>): HTMLButtonElement` — used by Task 2. `createZoomControl(target: HTMLElement): HTMLElement` keeps its signature (Tasks 3 and 4 re-place it).

- [ ] **Step 1: Widen the zoom range and fix the stored-default lookup**

In `public/scripts/feature/writing-feedback-shared.ts`, replace:

```typescript
const ZOOM_STEPS = [0.85, 1, 1.15, 1.3, 1.5];
const ZOOM_STORAGE_KEY = 'wf-zoom-level';

function readStoredZoomIndex(): number {
    const raw = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    const index = ZOOM_STEPS.indexOf(raw);
    return index === -1 ? 1 : index;
}
```

with:

```typescript
const ZOOM_STEPS = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
const ZOOM_STORAGE_KEY = 'wf-zoom-level';
const DEFAULT_ZOOM_INDEX = ZOOM_STEPS.indexOf(1);

function readStoredZoomIndex(): number {
    const raw = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    const index = ZOOM_STEPS.indexOf(raw);
    return index === -1 ? DEFAULT_ZOOM_INDEX : index;
}
```

Rationale: 75%–200% covers both skimming many short submissions and reading dense text closely; the old hardcoded `1` default index silently pointed at 100% only by coincidence of array position.

- [ ] **Step 2: Add `createIconButton` near `createButton`**

`createButton`'s `runButtonAction` swaps `textContent` to "Working…", which would destroy an icon — so the icon button carries its own busy handling. Add after `createButton`:

```typescript
/**
 * Icon-only action button (feather icon). Handles its own busy state so the
 * icon is never replaced by text, and stops propagation so it can sit inside
 * clickable card headers. Call refreshIcons() after inserting into the DOM.
 */
export function createIconButton(
    iconName: string,
    label: string,
    variant: 'neutral' | 'danger',
    action: (button: HTMLButtonElement) => Promise<void>
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wf-icon-button${variant === 'danger' ? ' wf-icon-button--danger' : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<i data-feather="${iconName}" aria-hidden="true"></i>`;
    button.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            await action(button);
        } catch (error) {
            await handleActionError(error);
        } finally {
            if (button.isConnected) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }
    });
    return button;
}
```

- [ ] **Step 3: Make the zoom control margin-neutral and add the danger icon-button variant**

In `public/styles/instructor-components/writing-feedback.css`, change the `.wf-zoom-control` rule (added 2026-07-20) from `margin-bottom: 10px` to no margin — containers now own spacing:

```css
.wf-zoom-control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
}
```

After the existing `.wf-icon-button:hover` rule (~line 224), add:

```css
.wf-icon-button--danger {
    color: var(--color-eng-red);
    border-color: var(--color-eng-red);
}

.wf-icon-button--danger:hover:not(:disabled) {
    background: rgba(139, 0, 0, 0.08);
}

.wf-icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.wf-icon-button svg,
.wf-icon-button .feather {
    width: 16px;
    height: 16px;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p public/tsconfig.json --noEmit`
Expected: clean.

---

### Task 2: Landing — icon-only deletes and a proper actions group

**Files:**
- Modify: `public/scripts/feature/writing-feedback.ts` (assignment-card delete block and submission-row block inside `expandAssignment`, both added 2026-07-20)
- Modify: `public/styles/instructor-components/writing-feedback.css`

**Interfaces:**
- Consumes: `createIconButton` from Task 1 (add to the `writing-feedback-shared.js` import list), existing `showDeleteConfirmationModal`, `showConfirmModal`, `jsonRequest`, `refreshIcons`, `showSuccessToast`.
- Produces: nothing consumed later — leaf UI task.

- [ ] **Step 1: Replace the assignment-card text Delete button**

In `renderAssignmentCard`, replace the block added 2026-07-20:

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

with:

```typescript
    const deleteButton = createIconButton('trash-2', `Delete assignment "${assignment.title}"`, 'danger', async () => {
        const result = await showDeleteConfirmationModal('assignment', assignment.title);
        if (result.action !== 'delete') return;
        await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}`, 'DELETE');
        state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
        if (state.expandedAssignmentId === assignment.id) state.expandedAssignmentId = null;
        renderLanding();
        showSuccessToast('Assignment deleted.');
    });
    controls.append(deleteButton);
```

(`createIconButton` already stops propagation; the separate listener goes away.) Add `createIconButton` to the shared import list at the top of the file and remove `createButton`'s Delete usage only — `createButton` is still used elsewhere, keep its import.

- [ ] **Step 2: Group submission-row actions and use an icon delete**

In `expandAssignment`, replace the block added 2026-07-20 (from `const deleteSubmissionButton = ...` through `row.append(info, ..., deleteSubmissionButton);`) with:

```typescript
        const actions = document.createElement('div');
        actions.className = 'wf-submission-actions';
        const label = submission.studentLabel || 'this submission';
        actions.append(
            createButton('Open submission', 'secondary', async () => openReview(submission.id)),
            createIconButton('trash-2', `Delete submission for ${label}`, 'danger', async () => {
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
                if (result.action !== 'delete') return;
                await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}`, 'DELETE');
                row.remove();
                const current = state.assignments.find((item) => item.id === assignmentId);
                if (current && typeof current.submissionCount === 'number') {
                    current.submissionCount = Math.max(0, current.submissionCount - 1);
                }
                showSuccessToast('Submission deleted.');
            })
        );
        row.append(info, actions);
        panel.append(row);
```

Important: before relying on `result.action !== 'delete'`, confirm the resolved action slug for `showConfirmModal`'s confirm button — the modal slugifies the button text (`'Delete'` → `'delete'`, see `modal-overlay.ts` `createFooter`'s `this.close(buttonConfig.text.toLowerCase()...)`). The existing 2026-07-20 code used the same check and typechecked; keep it consistent.

- [ ] **Step 3: Re-render feather icons after row insertion**

At the end of `expandAssignment` (after `panel.append(footer);`), add:

```typescript
    refreshIcons();
```

(`renderLanding` already refreshes icons for card headers; expanded rows are inserted later and need their own pass.)

- [ ] **Step 4: Add the actions-group CSS**

In `public/styles/instructor-components/writing-feedback.css`, near the `.wf-submission-row` rules:

```css
.wf-submission-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p public/tsconfig.json --noEmit`
Expected: clean.

---

### Task 3: Review page — sticky reading toolbar (zoom + wide view), zoom out of the paper

**Files:**
- Modify: `public/scripts/feature/writing-feedback-review.ts` (`renderDocPane` and a new `createDocToolbar` helper)
- Modify: `public/styles/instructor-components/writing-feedback.css`

**Interfaces:**
- Consumes: `createZoomControl` from Task 1 (already imported).
- Produces: nothing consumed later.

Design (SpeedGrader model): view controls live in a slim toolbar that is **sticky** above the document, so they are reachable at any scroll position while grading a long essay. The toolbar carries the zoom stepper and a **Wide view** toggle that releases the 75ch prose measure when the reader wants the document to use the panel width they created with the resize handle. Both persist per-browser.

- [ ] **Step 1: Remove both in-paper zoom insertions**

In `renderDocPane`, delete the line `paper.append(createZoomControl(paper));` from **both** branches (the verification branch and the annotated/plain branch — two occurrences added 2026-07-20).

- [ ] **Step 2: Add the toolbar helper and mount it on the pane**

Add near `createPanelResizeHandle` in the same file:

```typescript
const WIDE_VIEW_STORAGE_KEY = 'wf-doc-wide';

/**
 * Sticky reading toolbar above the document: zoom stepper plus a Wide view
 * toggle that releases the 75ch prose measure. Both persist per-browser so a
 * grader's reading setup survives across the whole queue of submissions.
 */
function createDocToolbar(pane: HTMLElement): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'wf-doc-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Document view options');

    bar.append(createZoomControl(pane));

    const wide = document.createElement('button');
    wide.type = 'button';
    wide.className = 'wf-toolbar-toggle';
    wide.textContent = 'Wide view';
    const applyWide = (on: boolean): void => {
        pane.classList.toggle('wf-doc-pane--wide', on);
        wide.setAttribute('aria-pressed', String(on));
        window.localStorage.setItem(WIDE_VIEW_STORAGE_KEY, on ? '1' : '0');
    };
    applyWide(window.localStorage.getItem(WIDE_VIEW_STORAGE_KEY) === '1');
    wide.addEventListener('click', () => {
        applyWide(!pane.classList.contains('wf-doc-pane--wide'));
    });
    bar.append(wide);

    return bar;
}
```

In `renderDocPane`, immediately after `pane.className = 'wf-doc-pane';`, add:

```typescript
    pane.append(createDocToolbar(pane));
```

This single mount covers both branches (verification and reading), since it precedes the branch split. The zoom target is now the **pane**, and the paper picks the value up by CSS custom-property inheritance (Step 3) — including the verification textarea, which already has `font: inherit`.

- [ ] **Step 3: Toolbar CSS + pane-level zoom variable**

In `public/styles/instructor-components/writing-feedback.css`:

Change the `.wf-doc-pane` rule to establish the zoom default at pane level:

```css
.wf-doc-pane {
    min-width: 0;
    --wf-zoom: 1;
}
```

Change `.wf-doc-paper`'s zoom lines from a local default to inheritance — replace:

```css
    --wf-zoom: 1;
    font-size: calc(15px * var(--wf-zoom));
```

with:

```css
    font-size: calc(15px * var(--wf-zoom, 1));
```

Add the toolbar rules (near the `.wf-doc-paper` block). The `top` offset matches the feedback panel's sticky offset (96px) so both clear the sticky green header:

```css
.wf-doc-toolbar {
    position: sticky;
    top: 96px;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 6px 10px;
    margin-bottom: 10px;
    background: var(--chat-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
}

.wf-toolbar-toggle {
    padding: 6px 10px;
    background: var(--chat-bg);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
}

.wf-toolbar-toggle:hover {
    background: var(--hover-bg);
}

.wf-toolbar-toggle[aria-pressed="true"] {
    background: var(--gingham-color);
    border-color: var(--color-chbe-green);
    color: var(--color-chbe-green);
}

.wf-doc-pane--wide .wf-doc-paper {
    max-width: none;
}
```

- [ ] **Step 4: Typecheck + CSS balance**

Run: `npx tsc -p public/tsconfig.json --noEmit` and the brace-balance one-liner:
```bash
node -e "const fs=require('fs');const c=fs.readFileSync('public/styles/instructor-components/writing-feedback.css','utf8');const o=(c.match(/{/g)||[]).length;const cl=(c.match(/}/g)||[]).length;console.log(o,cl);if(o!==cl)process.exit(1)"
```
Expected: clean, equal counts.

---

### Task 4: Intake — zoom control into a field toolbar row above the textarea

**Files:**
- Modify: `public/scripts/feature/writing-feedback.ts` (intake form block)
- Modify: `public/styles/instructor-components/writing-feedback.css`

**Interfaces:** none new.

The 2026-07-20 code appended the zoom control **after** the textarea and its help text — bottom of the field, where nobody looks for a view control. Move it to a slim right-aligned row between the label and the textarea.

- [ ] **Step 1: Reposition the control**

Replace:

```typescript
    const textField = field('Verified student submission', text, 'Paste the complete submission exactly as it should be evaluated.', true);
    textField.append(createZoomControl(text));
```

with:

```typescript
    const textField = field('Verified student submission', text, 'Paste the complete submission exactly as it should be evaluated.', true);
    const zoomRow = document.createElement('div');
    zoomRow.className = 'wf-field-toolbar';
    zoomRow.append(createZoomControl(text));
    textField.insertBefore(zoomRow, text);
```

(`field()` returns a wrapper whose children are `label`, the control, then optional `small` help — inserting before `text` lands the row between label and textarea.)

- [ ] **Step 2: Field-toolbar CSS**

Near the `.wf-field` rules in `public/styles/instructor-components/writing-feedback.css`:

```css
.wf-field-toolbar {
    display: flex;
    justify-content: flex-end;
    margin: 2px 0 6px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p public/tsconfig.json --noEmit`
Expected: clean.

---

### Task 5: Spacing — a width cap that actually responds to the sidebar, tighter handle gap

**Files:**
- Modify: `public/styles/instructor-components/writing-feedback.css` (`.wf-main-content`, `.wf-review-layout`)

**Interfaces:** none.

The 2026-07-20 fix used `max-width: clamp(960px, 92vw, 1680px)`. `92vw` is **viewport**-relative, and the viewport does not change when the sidebar collapses — so collapsing the sidebar still yielded almost no extra usable width. A plain container-bounded cap fixes it: `width: 100%` is already limited by the flex parent, so `max-width: 1680px` lets the workspace absorb exactly the space the collapsed sidebar frees, up to a sane ceiling. Reading comfort is preserved by the 75ch paper measure (now user-releasable via Wide view), not by the page cap.

- [ ] **Step 1: Fix the main-content cap**

Replace:

```css
    max-width: clamp(960px, 92vw, 1680px);
```

with:

```css
    max-width: 1680px;
```

- [ ] **Step 2: Tighten the review grid gap**

The 3-column grid (`doc | 6px handle | panel`) with `gap: 20px` puts 46px of dead space between document and panel. Change `.wf-review-layout`'s `gap: 20px` to `gap: 12px` (handle corridor becomes 30px total — still an easy pointer target, noticeably less waste).

- [ ] **Step 3: CSS balance check**

Run the brace-balance one-liner from Task 3 Step 4.
Expected: equal counts.

---

### Task 6: Docs, verification, memory

**Files:**
- Modify: `documents/WRITING_FEEDBACK_STYLE_GUIDE.md` (the two paragraphs added 2026-07-20: landing deletes; review workspace zoom/panel)
- Modify: `../project-memory/01 Project Memory/Current State.md`, new note under `../project-memory/02 Session Log/`

- [ ] **Step 1: Update the style guide**

In the landing paragraph: change "a **Delete** button" wording (both assignment strip and submission row) to describe **icon-only trash buttons** (`wf-icon-button--danger`, `aria-label`ed, confirm-modal-gated) with submission-row actions grouped in `.wf-submission-actions`.

In the review-workspace bullet: replace the "zoom stepper sits above the paper" sentence with the sticky **reading toolbar** description — sticky at the same offset as the Feedback panel, holding the zoom stepper (75–200%, persisted) and the **Wide view** toggle (releases the 75ch measure, persisted, `aria-pressed`). Note the intake zoom row now sits between the field label and the textarea.

- [ ] **Step 2: Full verification pass**

Run and record actual output:

```bash
npx jest src/writing-feedback
npx tsc --noEmit
npx tsc -p public/tsconfig.json --noEmit
node -e "const fs=require('fs');const c=fs.readFileSync('public/styles/instructor-components/writing-feedback.css','utf8');const o=(c.match(/{/g)||[]).length;const cl=(c.match(/}/g)||[]).length;console.log(o,cl);if(o!==cl)process.exit(1)"
npx tsc -p public/tsconfig.json
```

Expected: 44/44 tests, clean builds, balanced braces, dist rebuilt. Browser pass remains blocked by SAML-only auth (documented 2026-07-20) — state exactly what was and wasn't verified.

- [ ] **Step 3: Update project memory**

Add a dated subsection to `Current State.md` describing the redesign (toolbar, icon deletes, real width fix) superseding the corresponding 2026-07-20 descriptions, and one dated session-log handoff note. Do not commit.
