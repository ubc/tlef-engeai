# Instructor onboarding: skip, tutorial-mode visibility, and concision — design

**Date:** 2026-09-18
**Branch:** `feat/onboarding-skip-progress-trim`, created from `origin/main` at `8667cfd`
**Status:** approved for implementation (decisions taken with the user on 2026-09-18)

## Problem

Three defects in the seven-stage staff onboarding tutorial, two of them reported by an instructor at a
workshop:

1. **No exit.** Once routed into onboarding, staff must finish every owed stage. An instructor who
   already knows the product, or who wants to start work immediately, has no way out.
2. **Tutorial mode is invisible.** Instructor verbatim: *"Instructor onboarding was great but wasn't
   clear when we were still in onboarding mode vs. the actual interface. It would be helpful to have a
   way to communicate progress or maybe a banner indicating it is still a tutorial."* The only
   progress affordance is the per-stage rail, which shows steps inside one stage and says nothing
   about how many stages remain. `.staff-onboarding-progress` exists but is screen-reader-only above
   768px (`public/styles/instructor-components/onboarding.css:2625`).
3. **Too long, and partly stale.** Instructor verbatim: *"onboarding tutorial is a little lengthy -
   are there any parts we can cut out (obviously not entire features, but somehow make it more
   concise)?"* Word counts of the seven components today: course-setup 572, document-setup 478,
   scenario-generation 630, writing-feedback **2323**, guided-pathway 860, flag 831, monitor 591 —
   6285 total. Writing Feedback is also behind the product: it still describes a release preview step
   ("approve the feedback, preview the release, and release it",
   `public/components/onboarding/writing-feedback-setup.html:326`; "with a preview before anything is
   sent", `:357`), which D-128 removed, and it describes no two-step review or summary redraft
   (D-124–D-127).

## Existing structure this design builds on

- Stage order and gating: `public/scripts/utils/onboarding-stage-order.ts`, mirrored for the backend in
  `src/helpers/instructor-onboarding-redirect.ts`. Neither imports the other; parity is pinned by
  `src/helpers/__tests__/instructor-onboarding-redirect.test.ts`.
- Sequence: `course-setup` → `document-setup` → each enabled feature tutorial in
  `FEATURE_ONBOARDING_STAGES` order → `flag-setup` → `monitor-setup`. `courseSetup` lives on the
  course; every tutorial stage lives on the viewer's own `GlobalUser.instructorOnboarding` (D-077).
- Per-user progress write: `PATCH /api/user/onboarding/instructor-stage`
  (`src/routes/route-user-management.ts:203`) → `completeInstructorOnboardingStage`
  (`src/db/mongo/global-user-mongo.ts:208`), which sets one dotted path so siblings survive.
- Stage rendering: the three feature tutorials share `feature-tutorial-runtime.ts`; course-setup,
  document-setup, flag-setup and monitor-setup each carry their own copy of the same step engine.
  All seven components use `#backBtn` / `#nextBtn` inside `.onboarding-navigation`.
- Skip precedent already in the codebase for students: `showSkipOnboardingModal`
  (`public/scripts/ui/modal-overlay.ts:882`), used by `student-mode.ts:209` and
  `course-selection.ts:810`.
- Design guard: `src/helpers/__tests__/onboarding-design-guard.test.ts` forbids off-palette hex
  literals in `onboarding.css` (permitted: `#fff`, `#ffffff`, `#000`, `#e67e22`), left-accent callout
  bars, and emoji in component markup.
- Layout guard: `npm run check:onboarding-layout` (`scripts/onboarding-layout-guard.mjs`) fails when
  the floating `.onboarding-navigation` covers a gating control.

## Decisions

- **D-130 — Skippable set.** Skip is offered on every stage after `document-setup`:
  `scenario-generation-setup`, `writing-feedback-setup`, `guided-pathway-setup`, `flag-setup`,
  `monitor-setup`. `course-setup` and `document-setup` are never skippable: Course Setup writes real
  course structure (`frameType`, `tilesNumber`, capabilities) and Document Setup files real content
  under it.
- **D-131 — Two surfaces, one modal.** The offer appears twice: once unprompted as a modal on entry to
  the first skippable stage (i.e. immediately after Document Setup is finished), and thereafter as a
  persistent muted **Skip tutorial** button in `.onboarding-navigation` on every skippable stage. Both
  open the same modal. Declining is remembered for the browser session only
  (`sessionStorage`), so a reload does not re-prompt while the footer button keeps the exit available.
- **D-132 — Skip marks every remaining tutorial taught.** Confirming skip writes `true` for all six
  per-user keys (`contentSetup`, `flagSetup`, `monitorSetup`, `scenarioGeneration`, `writingFeedback`,
  `guidedPathway`) through one new endpoint, then lands the user on the course dashboard. Skipping is
  therefore final and follows the person across courses, exactly like being taught. `courseSetup` is
  untouched — it is course state, and skip is unreachable before it is complete. A stage is still never
  un-completed.
- **D-133 — Tutorial chrome.** Every staff onboarding stage renders, at the top of
  `.onboarding-content-area` and at both breakpoints: a banner naming the mode ("Tutorial — nothing
  here changes your live course") and a cross-stage progress line ("Tutorial 3 of 7" plus the stage
  name and a filled track). Stage totals are derived from the same resolver that routes stages, so a
  course with Writing Feedback disabled reports 6, not 7. The existing per-stage rail and the mobile
  `.staff-onboarding-progress` step strip stay as they are; the new chrome is about stages, not steps.
- **D-134 — Concision by moving depth into Help, not by dropping features.** Every feature, stage and
  step count stays. On-screen copy keeps one statement per idea; second-order detail moves into the
  per-step `#help-step-N` blocks that every tutorial already ships and the Help button already opens.
  Stacked `.completion-note` blocks collapse to at most one per step. Ceilings count only the words a
  step renders on screen, excluding the `#help-step-N` panels, since moving text into Help is the whole
  mechanism. Measured on screen before the trim: course-setup 355, document-setup 311,
  scenario-generation 389, writing-feedback 1642, guided-pathway 600, flag 567, monitor 399 — 4263
  total. Ceilings, enforced by test: 300, 270, 330, 950, 430, 430, 340 — about 3050 words, a 28% cut
  overall with Writing Feedback down 42%.
- **D-135 — Writing Feedback tutorial is refreshed to the shipped product.** The release step describes
  one **Release to Canvas** action with no separate preview (D-128), and the review step describes the
  two-step Annotations → Summary review with the summary redraft on Next (D-124–D-127) and the final
  annotations printing in the released PDF (D-127).

## Contract changes

### New endpoint

`POST /api/user/onboarding/skip-remaining`

- Auth: authenticated user, own record only; no course-scoped RBAC, matching the sibling PATCH.
- Body: none.
- `200 { success: true, instructorOnboarding: InstructorOnboardingProgress }`
- `401 { success: false, error: 'User not authenticated' }`
- `404 { success: false, error: 'User not found' }`
- `500 { success: false, error: 'Failed to skip instructor onboarding' }`
- Refreshes `req.session.globalUser.instructorOnboarding` like the PATCH does.
- Logs stage names only, never PUID (the existing log line prints `globalUser.userId`).

### New data-layer delegate

`skipRemainingInstructorOnboardingStages(ctx, puid): Promise<GlobalUser | null>` in
`src/db/mongo/global-user-mongo.ts`, exposed as `EngEAI_MongoDB.skipRemainingInstructorOnboardingStages`.
One `findOneAndUpdate` setting the six dotted `instructorOnboarding.*` paths plus `updatedAt`.

### New browser helpers

In `public/scripts/utils/onboarding-stage-order.ts` (and mirrored in
`src/helpers/instructor-onboarding-redirect.ts`):

- `ONBOARDING_STAGE_LABELS: Record<InstructorOnboardingStage, string>`
- `SKIPPABLE_ONBOARDING_STAGES: ReadonlyArray<InstructorOnboardingStage>` and
  `isSkippableOnboardingStage(stage): boolean`
- `buildOnboardingStageSequence(course, canManageRoster): InstructorOnboardingStage[]` — every stage
  this viewer can be routed through on this course, in presentation order, independent of completion.
- `resolveOnboardingStagePosition(stage, course, canManageRoster): { index: number; total: number } | null`
  — 1-based index of `stage` in that sequence, `null` when the stage is not in it.

## Out of scope

- Any affordance for replaying a tutorial after skipping (open question already recorded for the
  seven stages).
- Student onboarding (`student-onboarding.html`), which has its own skip path already.
- Changing stage order, gating rules, or which capabilities own a tutorial.

## Risks

- **Skip is irreversible for the user.** Nothing in the product re-opens a completed tutorial except a
  hand-typed URL. The modal says so plainly before the write.
- **A guard can only see text.** The banner, bar and trimmed copy are visual; Jest pins their markup,
  word ceilings and palette compliance, and the browser pass is what actually proves they look right.
- **Copy trim touches seven components.** Help blocks are keyed by step number; moving text into
  `#help-step-N` must not renumber steps, or the Help button opens the wrong panel.
