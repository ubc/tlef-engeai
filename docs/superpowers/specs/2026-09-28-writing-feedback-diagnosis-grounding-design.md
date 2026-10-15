# Writing Feedback: Whole-Text Diagnosis and Evidence-Backed Course-Material Grounding

- **Date:** 2026-09-28
- **Status:** Design approved in brainstorming; awaiting spec review
- **Scope:** Sub-projects A (whole-text gate) and B (course-material grounding) of the feedback-quality programme
- **Inputs:** Two emails from the LLED 200 instructor (feedback comparison with HelpMe; weekend requests #1–#9), student survey ranking clarity and actionability highest, and an evaluation of the current analyzer and writer prompts

## 1. Problem

Writing Feedback drafts are rubric-clean but often abstract, and in one observed case actively misleading. A student asked for a descriptive report wrote an explanation of how sound works. The draft flagged only the title, annotated sentence-level issues throughout the body, and praised the temporal markers that are themselves evidence of the genre failure. A student reading that draft would polish the explanation instead of rewriting it as a report.

This is not a one-off prompt miss. Evaluation of the current pipeline shows structural causes:

1. **No triage model.** The analyzer returns a flat list of up to 18 findings with no severity or dependency. Genre staging (C01/O01) weighs the same as punctuation (O14). The writer must assess every criterion with up to three evidence items, so the schema itself forces local annotations onto a text that needs a full rewrite.
2. **No diagnosis of what the student actually wrote.** Nothing asks which genre the text realizes. Strengths are checked for specificity, never for whether they serve the target genre.
3. **Thin genre knowledge.** Rules are one-line paraphrases. Expectedness codes (`O/E/P/R`) and `gates` are sent to the model unexplained. O10 (Theme) is gated on `theme_analysis_reliable`, which likely suppresses Theme analysis — matching the instructor's report that the tool "sucked on theme".
4. **Course material arrives late and is attached decoratively.** The analyzer never sees course material. Retrieval queries are long concatenations of title, task, genre, stage and rule summaries, which dilute the embedding. `attachPerFindingMentions` attaches a citation the writer never used, so a "Read again" label can appear on an annotation the material does not support.
5. **The pedagogy is set against what students ask for.** `guidedQuestion` is required on every revision goal, building a Socratic tone into the schema.
6. **No worked examples and no evaluation loop.** Prompt changes are judged by single live runs and instructor anecdotes.

## 2. Goals

- A text that fails the genre or omits a required stage receives rewrite-level feedback only; local findings are held back for staff.
- Strengths never praise features that contradict the target genre.
- Every course-material citation is backed by an excerpt judged to support that specific finding.
- Genre knowledge comes from the course's own materials, with retrieval rebuilt to make that reliable, and staff can see what the materials do and do not cover.
- Revision goals always carry a concrete action.
- Prompt quality is measured by a repeatable eval harness, with a baseline on the current prompts before any change.

## 3. Non-goals

- ZPD scaffolds such as sentence stems and grammatical patterns (sub-project D). The ban on rewriting student sentences stays for now.
- Splitting the `clause_word` language level into sentence/clause and vocabulary (sub-project E).
- Stage sub-requirements and language functions in the genre profile beyond what the diagnosis needs (sub-project C).
- Corpus tooling, TLC-stage filtering and student-profile adaptation.
- The operational requests from the instructor's weekend email (TA access from Canvas roles, section copy, Canvas rubric re-import, Memory Agent explanation, glossary preload). These are a separate track.

## 4. Decisions made in brainstorming

| # | Decision |
|---|---|
| 1 | In global-revision mode, local findings are hidden from the student and kept staff-side as a "held back until revision" list; staff may release individual items. |
| 2 | Global mode triggers on a genre mismatch **or** a missing stage marked `required` in the profile. |
| 3 | Staff can flip the mode per submission on the review page; the flip is recorded on the review revision. |
| 4 | Two-tier evaluation: deterministic Jest tests with recorded outputs, plus an opt-in live eval script on synthetic fixtures. |
| 5 | Genre knowledge comes from course materials via improved retrieval, not from built-in genre cards. |
| 6 | When course materials do not cover the genre, generation still runs, flagged to staff, with a coverage report showing the gaps. |
| 7 | Architecture B: a dedicated diagnosis call runs before the analyzer. |

## 5. Architecture

### 5.1 Pipeline

`RubricWritingFeedbackEngine.generate` becomes:

```
1. genre retrieval      profile-only queries            → genreExcerpts, coverage inputs
2. diagnosis call       text + profile + genreExcerpts  → TextDiagnosis
3. gate (code)          TextDiagnosis + profile         → gateDecision: 'standard' | 'global_revision'
4. contrast retrieval   only if realizedGenre ≠ target  → contrastExcerpts
5. analyzer call        reads genreExcerpts + diagnosis → SflAnalysis (unchanged contract)
6. finding retrieval    per cluster, expanded queries   → candidate excerpts
7. relevance call       curated labels × candidates     → supported excerpts per need
8. writer call          produces both standard and global content → WritingFeedbackResult
```

The analyzer still runs in global mode so the held-back list exists and the staff toggle needs no regeneration.

### 5.2 New units

| File | Responsibility |
|---|---|
| `src/writing-feedback/text-diagnosis.ts` | Diagnosis schema, prompt builder, validation (exact quotes, known stage ids, enum values) |
| `src/writing-feedback/feedback-gate.ts` | Pure function: `(diagnosis, profile, modeOverride?) → effective mode` |
| `src/writing-feedback/material-relevance.ts` | Batched relevance call, schema, filtering |
| `src/writing-feedback/prompt-examples.ts` | Versioned worked examples from synthetic texts |
| `course-material-mentions.ts` (changed) | Genre, contrast and finding query builders; vocabulary expansion; budgets; coverage |

### 5.3 Contracts

All changes are additive, mirrored in `src/types/shared.ts`/`src/writing-feedback/contracts.ts` and `public/scripts/types.ts`. Runs stored before this change stay readable and render as standard mode with legacy citations.

```ts
type RealizedGenre =
    | 'descriptive_report' | 'data_commentary' | 'problem_solution'
    | 'explanation' | 'recount' | 'procedure' | 'argument' | 'personal_response' | 'unclear';

interface TextDiagnosis {
    realizedGenre: RealizedGenre;
    genreFit: 'fits' | 'partial' | 'mismatch';
    stages: { stageId: string; status: 'present' | 'weak' | 'missing'; evidence?: string }[];
    contradictingFeatures: { quote: string; note: string }[]; // language showing the text does another genre's work
    transferableStrengths: { text: string; quote?: string }[]; // choices worth keeping in a rewrite
    rationale: string;                                        // staff-only
}

interface GlobalRevision {
    diagnosisStatement: string; // what the text does vs what the genre asks; may quote ≤2 contradicting features
    whatToKeep: string[];       // drawn from transferableStrengths
    rewriteDirection: string;   // stages to write; may cite a supported genre/contrast excerpt
    supportingExcerptIds?: string[];
}
```

- `WritingFeedbackResult` gains `gateDecision` and `globalRevision`. The writer always returns both the standard content and `globalRevision`.
- `CriterionEvidence` gains `supportingExcerptId?`. The student-facing mention label is derived from that excerpt.
- `RevisionGoal` gains a required `action`. `guidedQuestion` becomes optional. Old runs without `action` still read.
- The review revision gains `modeOverride?: 'standard' | 'global_revision'`. `AnchoredComment` gains `heldBack?: boolean`, set on model seeds when the gate decision is global; staff release clears it. `StaffSummaryEdit` gains `globalRevision?` for staff edits of the global block. `CourseMaterialExcerpt` gains an optional `id`.
- `runTrace` gains `textDiagnosis`, `gateDecision`, `coverage`, `contrastExcerpts`, `relevance` (per-pair verdicts), `flags` (for example `no_genre_material`), `diagnosisPromptVersion` and `relevancePromptVersion`.
- The effective mode is `modeOverride ?? gateDecision`.

### 5.4 Failure handling

- **Diagnosis failure** (schema, quote mismatch, unknown stage) fails the run with a fixed, hand-written sanitized message. The gate never silently defaults.
- **Retrieval or relevance failure** is advisory: nothing becomes citable, a staff flag is raised, and generation continues.
- **An invalid `supportingExcerptId` from the writer** drops that citation instead of failing the run.
- Error messages never echo model output or student text.

## 6. Gate and student output

### 6.1 Gate rule

- `global_revision` when `genreFit === 'mismatch'`, or any profile stage with `required: true` has diagnosis status `missing`.
- `standard` otherwise. When the fit is `partial` or any stage is `weak`, the writer's first revision goal must address the weakest stage, checked by validation on the goal's `skillTag`.
- `modeOverride` on the review revision wins.

### 6.2 Student output in global mode

- The `globalRevision` block and one revision goal: rewrite as the target genre, with a checklist of stages.
- No model-generated local annotations. They form the staff-only held-back list; any item staff release by hand is included.
- Rubric levels are still suggested per criterion for staff grading. Criterion explanations are written at text level. Canvas rubric and grade release are unchanged.
- Target shape, from the instructor's example: *"Sound is an excellent choice of entity for a classifying or compositional report. However, the text explains how sound works rather than describing its types or its parts, so it is not yet a descriptive report. Rewrite it as a descriptive report: …"*

### 6.3 Strengths guard (both modes)

- The writer is told that a strength must serve the target genre.
- A validator drops any strength whose wording or quote overlaps a `contradictingFeatures` quote, and records a staff flag.
- In global mode, strengths come only from `transferableStrengths`.

### 6.4 Summary redraft

The existing two-step review respects the effective mode. Flipping the mode marks the summary stale, and the existing redraft confirm applies.

## 7. Retrieval and grounding

### 7.1 Query builders

None of these read student text, evidence quotes, `observation` or `functionalInterpretation`. A test pins this for every builder.

- **Genre pass:** one short query per need: `genreLabel + purpose`, each stage's `label + purpose`, and each task requirement. Plus one query per fixed language function (definition, classification, composition, theme, noun groups), which also feeds coverage. At most 14 queries, top 5 each.
- **Contrast pass:** the `realizedGenre` enum label plus a curated contrast phrase from a fixed map (for example, explanation: "sequence of how or why a process happens").
- **Finding pass:** one query per finding cluster (existing `findingClusterKey`): rule summary plus a curated vocabulary expansion from `RULE_QUERY_TERMS`, keyed by rule id (for example, `O10: theme, rheme, point of departure, thematic progression`; `C12: definition, defining pattern, class, distinguishing feature`). The existing budget of 8 queries is kept. The run-level concatenated query is removed.

### 7.2 Relevance check

- One batched structured call per run.
- Input: `{ needId, curatedNeedLabel, excerptId, excerptText }[]`. No student text.
- Output per pair: `supports | related | irrelevant`.
- Only `supports` excerpts are citable. `related` excerpts may inform the writer but cannot be named. Unpublished material is never citable, as today.

### 7.3 Writer citation contract

- `supportingExcerptId` must be a `supports` excerpt for a finding linked to that evidence item (via `sflFindingIds`).
- `attachPerFindingMentions` is removed.

### 7.4 Budgets

- Genre excerpts: 4000 characters, sent to the diagnosis and analyzer calls.
- Finding excerpts: 4000 characters, sent to the writer.
- Each chunk stays capped at 600 characters.

### 7.5 Coverage

- One row per stage, per task requirement and per fixed language function (definition, classification, composition, theme and thematic progression, noun groups). Each row is covered when at least one `supports` excerpt exists.
- Cached on the assignment, keyed by rubric version plus a course-material fingerprint (published item ids and their `updatedAt`). A new upload or new rubric version invalidates it; staff can recompute on demand.
- Staff-only.

### 7.6 Thin-materials fallback

When the genre pass yields no `supports` excerpts, the diagnosis runs on the model's general knowledge, `runTrace.flags` records `no_genre_material`, and the review banner warns staff.

## 8. Prompt rewrite

### 8.1 Structure (diagnosis, analyzer, relevance, writer)

1. Role and purpose: who reads the output and why.
2. Pedagogy stance (analyzer and writer): feedback builds long-term capacity. Name precisely what works and what does not, give one concrete next move per issue, and use light SFL metalanguage tied to the course materials.
3. Method: numbered steps.
4. Knowledge: genre excerpts, contrast excerpts, rubric.
5. Constraints: the existing invariants, grouped once at the end and phrased positively where possible (about 12 grouped rules replacing about 30 scattered prohibitions).

### 8.2 Specific fixes

- The foundation resource explains `O/E/P/R` in plain language. `gates` are removed from the prompt payload; code-side validation keeps them.
- O10's prompt entry loses the `theme_analysis_reliable` gate. The analyzer analyzes Theme at clause level and abstains only for fragments.
- One or two worked examples per prompt (a good annotation versus a vague one; a wrong-genre diagnosis), from synthetic texts, in `prompt-examples.ts`.
- `RevisionGoal.action` required; `guidedQuestion` used only when it helps.
- The global-mode writer has its own method block (diagnose, what to keep, rewrite direction). In that mode it still produces held-back evidence for staff.
- The ban on rewriting student sentences stays until sub-project D.

### 8.3 Versioning

Adds `TEXT_DIAGNOSIS_PROMPT_VERSION` and `MATERIAL_RELEVANCE_PROMPT_VERSION`, and bumps `SFL_ANALYZER_PROMPT_VERSION` and `SFL_WRITER_PROMPT_VERSION`. All are recorded in `runTrace`.

## 9. Staff UI

### 9.1 Rubric page (`public/scripts/feature/writing-feedback-rubric.ts`)

- The stage repeater gains a **Required** checkbox, replacing the hardcoded `required: true` at line 544. Helper text: "If a student leaves out a required stage, the student gets rewrite feedback only."
- Existing rubrics keep their stored `required: true`. On first open of an approved rubric after the release, a one-time notice asks staff to review which stages are truly required. Changing the flag creates a new rubric version, as today.
- The autofill prompt marks only core stages as required (the schema already accepts `required`).
- A **coverage panel** below the stages, with ✓ plus the document title or ✗ per row, and a **Recheck materials** button.

### 9.2 Review page (`writing-feedback-review.ts`, `writing-feedback-review-steps.ts`)

- **Diagnosis banner** above the Annotations step, staff-only: realized genre, fit, stages present/weak/missing, the thin-materials warning, and the rationale behind a "Why?" disclosure.
- **Mode toggle** in the banner: *Rewrite feedback only* ↔ *Standard feedback*. Saves `modeOverride` and marks the summary stale.
- **Global mode, Annotations step:** model annotations sit in a collapsed "Held back until revision (N)" group, each with **Release to student**, which clears the comment's `heldBack` flag in the working set saved with the next revision. Staff-created annotations work as today.
- **Global mode, Summary step:** edits the `globalRevision` block instead of the revision goals.
- **Annotation cards:** "Read again" appears only when there is a `supportingExcerptId`, with staff able to expand the excerpt text.

### 9.3 Student PDF and release

- Global mode renders `globalRevision`, the rewrite goal and hand-released annotations.
- "Useful readings" lists the supported excerpts' materials.
- Canvas rubric and grade release are unchanged.

### 9.4 Batch view

A "Rewrite" chip on submissions whose effective mode is global.

## 10. API

Exact paths follow the existing Writing Feedback route conventions under `/api/courses/:courseId/writing-feedback/`:

- **No new review routes.** `modeOverride`, `heldBack` comment flags and `summaryEdits[].globalRevision` travel in the existing append-only revision save (`POST …/submissions/:submissionId/reviews`), so they share its validation, release lock and audit trail.
- `GET …/assignments/:assignmentId/material-coverage` returns the cached coverage (or `null`).
- `POST …/assignments/:assignmentId/material-coverage` recomputes and stores it.

All routes: course-scoped RBAC with instructor/admin/TA parity (D-049), 404 when Writing Feedback is disabled for the course, thin handlers delegating persistence to `src/db/mongo/` via `EngEAI_MongoDB`, and no logging of request bodies, submission text or feedback content.

## 11. Evaluation

### 11.1 Live eval (`npm run wf:eval`)

- Runs the real engine against the configured model, on Node 24, using the repo's existing TypeScript script runner (chosen in the plan).
- Fixtures in `src/writing-feedback/__tests__/fixtures/eval/` (TypeScript modules; Jest only runs `*.test.ts`), all synthetic and written by the team:
  - `dr-mismatch-explanation`
  - `dr-missing-classification`
  - `dr-good`
  - `dr-weak-theme`
  - `dr-partial-weak-definition`
  - `dr-materials-covered` (with synthetic lecture notes)
  - `dr-materials-empty`
- An in-memory `WritingFeedbackMaterialRetriever` serves the synthetic notes. `--live-rag <courseId>` uses real retrieval.
- Checks per fixture: expected effective mode; expected stage statuses; no strength overlapping a contradicting feature; every citation has a `supports` excerpt; zero student-facing local annotations in global mode; every revision goal has an `action`; Theme findings present for `dr-weak-theme`; all quotes exact.
- Output: a pass/fail table on stdout plus a JSON report (prompt versions, per-check results, full outputs) in a gitignored `eval-reports/` folder. `--runs N` measures variance.
- **Baseline first:** run the harness against the current prompts before changing them, so improvement is measured.

### 11.2 Jest

- Gate truth table: mismatch, missing required, missing optional, partial, override.
- Diagnosis validation: exact quotes, unknown stage ids, enum values.
- Query builders: no student text or model prose in any query (pinned).
- Relevance filtering; writer citation validation (a bad excerpt id drops the citation).
- Strengths guard; `RevisionGoal.action` required; old runs without the new fields still read.
- Student PDF and release in both modes; hand-release of held-back annotations.
- New routes: RBAC, disabled-course 404, no body logging.
- Mock mode: a deterministic `fits` diagnosis, so existing mock flows are unchanged.
- Jest runs with `--maxWorkers=4`, in the background.

## 12. Rollout and documentation

- Additive contracts; old runs render as standard mode.
- Update `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md`.
- Record decisions 1–7 from section 4 in `project-memory/01 Project Memory/Decisions.md`, update `Current State.md`, and add a session log entry.
- Suggested implementation order: (1) eval harness and baseline on the current prompts; (2) contracts, diagnosis and gate; (3) retrieval and relevance; (4) prompt rewrite; (5) staff UI; (6) eval re-run and comparison.

## 13. Risks

- **Latency and cost:** two extra model calls per submission (diagnosis, relevance). Mitigated by keeping relevance batched and small; measure in the eval.
- **False mismatches:** hide useful local feedback. Mitigated by the staff toggle and the diagnosis banner; tracked in the eval via `dr-good` and `dr-partial-weak-definition`.
- **All stages currently stored as required:** without staff review, a missing optional stage triggers global mode. Mitigated by the one-time notice on the rubric page.
- **Retrieval quality stays the ceiling** for genre knowledge (decision 5). Coverage makes gaps visible; if the eval shows diagnosis quality depends heavily on material coverage, revisit built-in fallback cards as a follow-up decision.
