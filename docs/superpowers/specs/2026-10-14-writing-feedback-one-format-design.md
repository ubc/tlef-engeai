# Writing Feedback: one feedback format — design

Date: 2026-10-14 · Branch: `feature/writing-feedback-proportional-gate`
Supersedes the two-mode ("rewrite feedback") design in `2026-10-13-writing-feedback-proportional-gate-design.md`; amends D-143, D-144, D-145.

## Why

"Rewrite feedback" assumed every course allows resubmission, duplicated the standard sections, dropped criterion feedback while still printing grades, and showed a saved staff switch as if the gate had decided it.

## Design

- **Gate (unchanged rule):** a whole-text problem is a genre mismatch, or 75% or more of the `required` stages weak or missing (`resolveGateDecision`). Decided once, at generation; staff cannot flag one the gate missed. Read it through `hasWholeTextProblem`.
- **One format for every submission:** What you did well, Feedback by rubric criterion (with grades), Priority revision goals, annotations. Nothing student- or staff-facing says "rewrite".
- **Whole-text problem adds:**
  - `result.overallMessage`, shown to staff as **General feedback**: one paragraph (what is worth keeping, what the text does against what the genre asks). No numbered steps. Printed first on the PDF with no heading. Staff edit it in step 2 (`summaryEdits[].overallMessage`; empty clears it).
  - A restructuring first revision goal, scoped `whole` (enforced by the Socratic question gate, so a miss gets the corrective retry).
  - The staff-only card **OFF-GENRE OR MISSING SECTIONS** in step 1.
  - Annotations not included by default.
- **Card contents:** a fixed headline ("This submission is off-genre." / "… is missing several sections." / "… is off-genre and missing several sections."), the section chips, a **Why EngE-AI flagged this ›** link that reveals the diagnosis rationale, and the **Include annotations** checkbox.
- **Including annotations:** the checkbox is the inverse of the stored `reviews[].holdBackAnnotations`, which is saved only when staff change it (never as null). Unticked: the student sees only annotations staff include one by one (**Include** on each card in "Annotations not included (n)"; **Exclude** puts one back). Not-included annotations leave the document text and its numbering. Ticked: every annotation is included.
- **Without a whole-text problem:** no general feedback, no card, every annotation included; a weak or missing section still leads the first revision goal.
- **Summary redraft** carries `overallMessage` forward and keeps the restructuring goal first.

## Contracts

- Writer prompt `sfl-feedback-writer-v5.1.0`; examples `prompt-examples-v1.5.0`; redraft `summary-redraft-v1.4.0`; technical `lab-report-technical-v1.5.1` (shared reader rules changed).
- Removed: `globalRevision`, `rewriteGoal`, `modeOverride`, the mode switch and the rewrite PDF section. Not in production, so no migration; stored local values are ignored.
- See `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md`.

## Out of scope

How strictly the diagnosis rates sections (it can mark sections weak that are present); a staff "flag a whole-text problem" action; a per-assignment resubmission setting; the technical lens.
