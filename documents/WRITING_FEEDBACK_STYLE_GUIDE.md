<!--
@author: @rdschrs
@date: 2026-07-20
@version: 1.0.0
@description: Interaction, visual, accessibility, and responsive rules for the staff review workspace.
-->

# Writing Feedback Style Guide

## Navigation and status

Place **Writing Feedback** directly below **Document** in the instructor sidebar. It is hidden until course data confirms that the capability is enabled. Use clear, non-automated language: **Imported**, **Verification needed**, **Draft ready**, **Approved**, **Released**, and **Needs attention**. Green communicates approved/released progress; amber communicates required verification; red is reserved for failures.

Use the instructor shell's existing tokens by their exact names: `--color-chbe-green`, `--color-ubc-blue`, `--color-navy-blue`, `--background-2`, `--border-color`, `--text-primary`, `--text-secondary`, `--hover-bg`, `--sidebar-bg`, and `--chat-bg`. Do not introduce near-duplicate variables such as `--chbe-green` or `--ubc-blue`, and do not use inline styles or edit compiled CSS.

The feature uses the shared instructor page shell: a green sticky header bar (`--color-chbe-green`, radius 12, white h1, `mobile-header-bar` behavior at ≤768px) holding two white-pill header actions in this order:

1. **Import from Canvas** — primary path because it is the normal course workflow.
2. **Add assignment** — creates an assignment seeded from the internal rubric profile with an optional deadline.

The landing is a documents-style accordion. Each assignment row has a beige (`--background-2`) header strip that toggles expansion (whole strip is the control; `role="button"`, `aria-expanded`/`aria-controls`, rotating chevron): title, Created/Deadline meta, source chip (Canvas/Manual), submission-count chip, a small **Edit rubric** button (read-only rubric page for TAs), and an icon-only trash button (`createIconButton`, `wf-icon-button--danger`, feather `trash-2`, `aria-label`ed). Expanding reveals content-item submission rows — student label, submitted date with a red **Late** text flag when past the deadline, attempt, tinted status chip, and a `.wf-submission-actions` group holding an **Open submission** button alongside a matching icon-only trash button — plus **+ Add submission (manually)**, which offers paste-text and file-upload in one inline form. With no assignments, show a plain muted empty note inviting Canvas import or manual creation; never render placeholder rows. Do not use uppercase eyebrow labels, navy headings, or card accent stripes anywhere — they are not part of the dashboard language.

Both the assignment-strip and submission-row deletes are icon-only trash buttons, never text buttons, and both remain confirm-modal-gated. Deleting an assignment is blocked (`409`) while it still has any submissions; the error surfaces through the existing action-error modal and the card stays in place. Deleting a submission is allowed at any status, including `released`; the confirmation modal adds an extra warning line for released submissions noting that only the local record is removed and the release cannot be recalled. Both confirmations use the shared modal helpers (`showDeleteConfirmationModal` / `showConfirmModal`), never a native `confirm()`.

The manual-intake "Verified student submission" textarea uses a taller `wf-intake-text` sizing (45vh minimum) rather than the generic small `.wf-field textarea`, since it holds a full essay rather than a short field.

Do not label local fixtures as merely "Canvas" or "connected." In local demo mode show **Synthetic Canvas demo** and explain that no network request or Canvas write occurs. When live Canvas is not configured, keep the action visible, show the gated connection requirements inline, and give authorized instructors a clear future configuration path; do not show a dead button or generic error.

Open import and rubric tasks in an inline action panel within the page so staff retain assignment/queue context. The panel needs a descriptive heading, close action, visible labels, and deterministic focus movement. Avoid nested modals, `alert()`, and `confirm()` for normal workflow states.

## Review workspace

Opening a submission shows a top bar (back action, student and assignment identity, status and rubric-version chips) above a two-pane layout:

- **Left — the document.** One readable "paper" surface (`#fffef9`, 40px padding, ~75ch measure by default, 1.75 line-height) always shows the whole submission. A sticky reading toolbar (`.wf-doc-toolbar`, sticky at the same offset as the Feedback panel) sits above the paper and holds the "Aa − / % / +" zoom stepper (75–200% in eight steps, persisted per-browser in `localStorage` under `wf-zoom-level`), which scales the paper's font size via a `--wf-zoom` CSS variable, plus a **Wide view** toggle (`aria-pressed`, persisted under `wf-doc-wide`) that releases the ~75ch measure for a full-width paper. On the manual-intake form, the equivalent zoom row sits in a `.wf-field-toolbar` between the field label and the textarea. While a file upload awaits staff confirmation, the paper holds the verification textarea and **Confirm transcript** instead; there is never a duplicate original + verified pair. After verification, the original extraction is available behind a collapsed **View original extraction** disclosure only when it differs from the verified text. In annotate mode a muted hint line — "Select any text in the document to add a comment." — sits above the document so the highlight-to-comment flow is discoverable. Anchored spans render as green-tinted underlined highlights (never color alone) followed by small numbered circular markers; selecting any passage shows an **Add comment** popover.
- **A drag handle** between the document and the Feedback panel lets staff resize the panel (pointer drag, arrow-key resize when focused, double-click to reset to 420px); the chosen width persists per-browser and is clamped to 340px–65% of the layout width.
- **Right — the Feedback panel.** A sticky panel with segmented tabs:
  - **Annotations** (default) — FUNCTION (All/Content/Interpersonal/Organizational) and LEVEL (All/Text/Section/Clause & word) filter pill rows, then numbered annotation cards matching the document markers. Each card shows its number, function/level chips, a priority chip (high=red, medium=orange, low=green), an origin chip (**Model suggested** vs **Staff**), the anchored quote, **Feedback**, **Revision guidance**, an optional green-tinted **Suggested course material** box, and an optional glossary line. Cards open read-only with **Edit**/**Delete**; editing exposes the text fields plus Function/Level/Priority selects. Function/level/priority are staff triage metadata and never reach the student PDF. Filtered-out anchors dim in the document but stay clickable (clicking resets filters). Markers and cards stay in sync on hover/focus/click; markers are keyboard-activatable. Stale anchors (text re-verified after commenting) appear list-only with an amber treatment and a delete instruction.
  - **Summary** — strengths; rubric evidence grouped by SFL section (Organization — textual, Content — ideational, Interpersonal Positioning — interpersonal, Task Constraints — task realization); up to three priority revision goals, each with a Socratic **guiding question** that invites the student to reason toward the change rather than receiving the answer; the Academic Writing Matrix collapsible; the staff student-facing feedback and internal-note editors; review history; internal flags; and the release card.
- The panel footer keeps **Save staff revision** (one save covers both tabs, including the annotation working set), **Approve** (enabled only for draft-ready), and the two PDF downloads always visible.

**Review history** is a full, read-only audit trail, not an undo control. Each saved revision renders as a collapsible entry (newest open by default) labelled with the revision number, timestamp, and the staff member who saved it. Expanding an entry shows the exact student-facing feedback and internal note text as saved, plus a comment-level diff against the previous revision: **Added**, **Edited**, and **Removed** lines, each with the anchored quote, comment text, and an origin chip. There is no restore/revert action anywhere in this panel.

The explicit actions are Confirm transcript, Generate feedback, Save staff revision, Approve, PDF download (summary, or summary + comments), Release preview, and Release to Canvas. Generation must never imply that the work was graded or released.

Review actions use a consistent hierarchy:

- One solid primary action for the next safe step.
- Secondary outlined/neutral actions for save, preview, back, or download.
- A distinct external-write treatment for **Release to Canvas**, shown only after approval and preview prerequisites.

Never conflate **Approve feedback** with **Release to Canvas**. A successful release preview updates an inline preview region; it is not a confirmation dialog and it does not release anything.

### Canvas import panel

The panel progresses through connection status, assignment selection, import summary, and queue refresh:

- Show a loading state while checking integration status and listing assignments; disable repeat actions while a request is active.
- In demo mode, add a persistent demo badge and synthetic-data explanation.
- In live mode, identify the connected Canvas course without exposing tokens or unnecessary identifiers.
- Present selectable assignment names with useful metadata and a clear **Import selected assignment** button.
- A Canvas-rubric indicator is source metadata, not proof that the rubric was imported. Until rubric ingestion exists, say that EngE-AI will use its approved local rubric and that Canvas rubric import is not yet available.
- Report imported and skipped counts. A repeated import is a successful idempotent reconciliation, not a duplicate or an unexplained failure.
- Keep recoverable errors in the panel with a **Try again** action and retain the user's selection where safe.

Import is a read from Canvas and a write to EngE-AI only. Never imply that importing creates a Canvas rubric, posts feedback, or changes grades.

### Rubric editor

The rubric opens as a full page titled **Assignment Rubric and Details**, with a back action to the assignment list and the assignment's title, creation date, and deadline in the header. Show the active approved version and draft state at the top of the editor. Group fields into **Assignment context** (task, audience, purpose, constraints, learning outcomes, grading intent), **Criteria and SFL lens**, and **Performance levels**. Use visible labels and short helper text; fixed criterion/level IDs are implementation details and should not be editable.

The editor must distinguish these states:

- **Approved vN** — current active rubric, clean editor.
- **Unsaved changes** — local dirty state; generation still uses approved vN.
- **Draft vN+1 saved** — persisted but inactive.
- **Approved vN+1** — explicitly promoted and now active.
- **Validation needed** — field-level guidance with a summary near the actions.

Use separate **Save draft** and **Approve and use** actions. Approving may save the current valid form first, but the action label and supporting text must make the promotion explicit. TAs see the same approved content in read-only form without disabled editing controls that look broken. Leaving with unsaved changes requires an in-product warning; saving or closing must never approve implicitly.

Level point inputs are optional. Explain that leaving them blank keeps feedback ordinal and prevents numeric Canvas release; never fill them automatically.

At tablet and phone widths, the queue and review panels stack into a single-panel flow. Inputs use visible labels, focusable controls, 44px touch targets where practical, `aria-live` status updates, and sufficient color-independent status text. Student text is inserted as text content rather than unsafe HTML.

At ~1180px and below, the Feedback panel drops beneath the document and loses its sticky behavior; the rubric editor/preview stack. At 900px and below, form grids and level rows become one column. At 768px and below the header switches to the shared mobile-header treatment (hamburger, green title on light background), submission rows stack, and action buttons go full-width. No content requires horizontal scrolling.

### Loading, empty, error, and success states

- **Initial loading:** use stable placeholders or concise loading copy so the page does not flash an empty-state action before data arrives.
- **Empty assignment list:** explain why it is empty and offer **Import from Canvas** and **Add assignment (manually)** in the same priority order as the header.
- **Empty submission panel:** say the assignment has no submissions yet and point to manual intake or Canvas import.
- **Error:** keep already-loaded content when possible, identify the failed operation, and provide a local retry. Do not expose raw server errors or student text.
- **Success:** use the existing toast system plus an inline state change for durable outcomes. Toast/live regions need suitable status semantics and must not be the only record that an import, save, approval, or release occurred.

Use semantic buttons and links, `:focus-visible`, keyboard-operable filters, and `aria-live="polite"` for routine updates. Use an assertive announcement only when an error blocks the current action. Respect `prefers-reduced-motion`; do not use `transition: all`. Disabled buttons require a nearby explanation when the missing prerequisite is not obvious.

## PDF

The student PDF uses the existing UBC blue, CHBE green, navy, and neutral surface palette. Its order is assignment and approved grade/levels; what went well; evidence; priority revision goals; guided actions; an optional **Comments on your writing** section (when specific comments are included: quote, comment, how to improve, optional link and glossary entry); and a carry-forward goal. Never include staff flags, confidence, model data, prompt information, comment origin, or internal notes.
