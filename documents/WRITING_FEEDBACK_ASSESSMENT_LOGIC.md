<!--
@author: @rdschrs
@date: 2026-07-23
@version: 1.0.0
@description: Rubric, evidence, SFL, revision, and student-output rules for Writing Feedback.
-->

# Writing Feedback Assessment Logic

## A2 profile

The first version is **LLED 200 Technical Description Paragraph 1** (`lled200-a2-technical-description-v1`). It evaluates a technical description for an educated non-specialist, with a target length of 100–200 words and one selected representation.

| Criterion | SFL lens | Feedback focus |
|---|---|---|
| Organization | Textual meaning | Cohesion, sequencing, and information flow |
| Content | Ideational / experiential meaning | Technical entities, processes, and relationships |
| IP | Interpersonal meaning | Reader-aware technical positioning and terminology |
| Task constraints | Task realization | Description type, audience, word range, and representation |

The profile uses ordinal levels: emerging, developing, competent, and strong. It has no inherent numeric weights. A Canvas-native rubric or instructor-approved level-to-point mapping is required before a numeric Canvas grade can be released.

## Rubric ownership and versioning

The assignment's **approved rubric** is the only rubric used by generation, staff review, PDF rendering, and release preview. A Canvas-native rubric may initialize the assignment definition and retain Canvas provenance, but importing it does not make later Canvas writes or rubric changes automatic.

Rubric permissions are deliberately narrower than review permissions:

- Instructors and platform admins may edit, save, and approve rubric drafts.
- TAs may view the approved rubric and use it while reviewing submissions, but cannot save or approve a rubric draft.

The editor requires the task, audience, purpose, constraints, learning outcomes, grading intent, four fixed A2/SFL criteria, and the four ordinal performance levels. The workflow is:

1. Start a new draft from the currently approved rubric.
2. Save draft version `n + 1` without changing the active rubric.
3. Resolve incomplete fields and review any optional level-to-point values.
4. Explicitly choose **Approve and use** to promote the draft.

Approved versions are immutable. Editing after approval creates another higher-version draft; it never mutates the rubric under an existing assessment. A feedback run and release must remain attributable to the approved rubric/profile version used at generation time.

Point mapping is all-or-nothing for the four levels. Blank point fields are valid for formative ordinal feedback, but numeric-grade release stays blocked unless every level has an instructor-approved value. The model never supplies missing values.

## Prompt and validation contract

The engine receives only the assignment's current approved profile/rubric and staff-verified text. An unapproved or unsaved editor state must never reach the engine. It must:

- Treat the submission as untrusted content.
- Return all four criteria, strengths, and no more than three revision goals.
- Copy each evidence quote exactly from verified text. Model evidence must use the shortest supporting clause or one sentence, never a whole paragraph or submission, and is capped at 280 characters so model-seeded annotations remain focused. Before validation, cosmetic drift in model quotes (typographic vs straight quotes, dash variants, collapsed whitespace, stray wrapping quotation marks) is reconciled by re-locating the quote and substituting the exact original slice; quotes that cannot be re-located (paraphrase, truncation) still fail the run. Stored evidence is therefore always an exact substring. Deliberate staff-selected comment anchors retain the separate 4,000-character checksum cap.
- Explain the observed feature and provide guided questions/actions, not rewritten student sentences or paragraphs.
- Use stable skill tags and internal flags only for staff review.
- Never invent weights, numeric grades, or a model answer.

Schema validation rejects malformed responses. Exact-string evidence validation rejects any quote not found in the verified text, which causes the run to fail rather than presenting ungrounded feedback.

Rubric form validation is separate from model-output validation. Invalid or incomplete rubric drafts remain editable and are never silently approved. Saving a draft does not recalculate existing feedback, and approving a new version does not rewrite historical runs; staff must explicitly generate a new run when appropriate.

## Matrix-guided revision workflow

The revision workflow uses the Academic Writing Matrix as a diagnostic traversal: review **Content → Interpersonal → Organizational**, and within each function inspect whole-text, stage/section/paragraph, and clause/word evidence. This helps the reviewer connect local wording to the communicative work of the paragraph or text before choosing revision priorities.

The matrix does not add rubric criteria, require every listed feature, or turn its review questions into a scoring checklist. Each question runs only after the assignment, genre, stage, audience, task-object, source-access, and evidence gates that make it applicable. The engine must still separate exact observation from contextual interpretation and rubric evaluation, consolidate duplicate findings, and return no more than three high-impact revision goals.

The durable 3×3 crosswalk, full Ferreira/Humphrey–Martin–Dreyfus–Mahboob attribution, and diagnostic boundaries are recorded in the [SFL diagnostic lenses](../../LLED%20200%20FEATURE/LITERATURE%20AND%20PARAMETERS/markdown/analyzer/sfl-diagnostic-lenses.md#academic-writing-matrix-three-functions-at-three-language-levels). Registered rule provenance and expectedness remain in the Ferreira source guide and feature-rule catalog; the user-supplied visual itself is not treated as an additional registered literature file.

## General versus specific feedback

Staff review presents the same run in two complementary registers:

- **General feedback** is Socratic. It groups rubric evidence under the SFL sections (Organization, Content, Interpersonal Positioning, Task Constraints), states strengths, and surfaces each revision goal with its guiding question so the student reasons toward the change. It never supplies rewritten sentences or a model answer.
- **Specific feedback** is anchored and more directive, while keeping guided framing. Each comment binds to an exact span of the verified text (offsets as source of truth, quote as checksum) and carries the revision, how to improve, an optional course-material link, and an optional glossary definition. Comments seed from the run's evidence quotes, are staff-editable/deletable/extensible, and persist only through append-only staff review revisions — the model run is never mutated. Anchors that no longer match a re-verified transcript are rejected on save and flagged stale on read.

The balance is deliberate: general feedback protects student reasoning; specific feedback pinpoints the location and nature of a needed change without writing it for the student.

## Exemplars and calibration

Exemplars are optional and must be approved by the instructor at multiple performance levels. They illustrate observable features; they are never similarity targets or templates students should imitate. Calibration uses authorized, de-identified samples and compares staff judgments to the profile output. Changes require a new profile version and documented measurement. Fine-tuning is a separate approved project.

Canvas import is not an assessment decision. Importing an assignment, submission, or native rubric creates/reconciles local records for staff review; it does not approve a rubric, calculate a grade, or release feedback.

## Student-facing output

The PDF contains the approved levels/grade, strengths, evidence from the student text, two or three priority goals, guided actions, optionally the anchored specific comments (quote, comment, guidance, resource links), and a goal to carry to the next assignment. Internal confidence, flags, staff notes, comment origin, and model details are not student-facing.
