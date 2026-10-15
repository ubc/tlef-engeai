# Writing Feedback plain-language design

Date: 2026-10-03
Branch base: `feature/writing-feedback-diagnosis-grounding` (`2a13772`)

## Improved request

> Writing Feedback comments are too abstract for the students who receive them. Colleagues, our supervisor and I all find them hard to follow, even as proficient English speakers.
>
> **Audience.** LLED_V 200 (*Introduction to Writing in Academic and Professional Registers*) is taught in UBC Vantage One. Vantage One is an 11-month first year for international students who do not yet meet UBC's direct-entry English requirement. Its minimum is IELTS 5.5 / TOEFL 70; direct entry needs about IELTS 6.5. So readers are capable university students working in their second language, roughly upper-B1 to B2.
>
> **Goal.** Student-facing feedback must be in plain English. That means short sentences, everyday words, one idea at a time, and concrete pointers to the student's own words. It must not be simplified, childish, or less accurate. Course terms the students have been taught may stay, explained in plain words. Internal analysis terms such as SFL theory vocabulary must not reach students.
>
> **Scope.** Evaluate current annotations (rationale and revision guidance), criterion explanations, strengths, revision goals, guided questions and rewrite feedback. Find the causes in the prompts and pipeline, and propose measurable changes. Keep every existing invariant: exact evidence, no rewritten student sentences, human approval, no logging of student text.

## Evidence (synthetic eval output, `eval-reports/wf-eval-2026-09-28T21-17-39-314Z.json`)

These figures cover 303 student-facing strings (7,843 words) from the 18 synthetic eval runs:

- Average sentence: 20.8 words. 77 sentences run over 25 words.
- SFL or analysis vocabulary: 5.8 terms per 100 words. Most frequent: *classification* (92), *entity* (63), *composition* (46), *Theme* (32), *process* (23), *clause* (21), *stance* (20), *register* (17), *participant* (10), *positioning* (8).
- Typical failures:
  - "The impersonal technical register is generally suitable for an informative report, but the interpersonal choices are calibrated to explaining how sound occurs." The comment describes the theory, not the student's words.
  - "Use objective timeless-present relational clauses to describe what each type or part is, has, or consists of." The advice is correct, but a B1/B2 reader cannot act on it.
  - "The Theme and temporal marker establish the first event in a chronological explanation." It says nothing about what to change.
  - The same "add a classification or composition stage" point appears under all three criteria and again in the goal and the rewrite direction. Repetition adds to the overload.
  - The rewrite direction is one 70–90-word sentence chaining four steps with semicolons.

## Root causes

1. The writer prompt *asks* for jargon: "use light SFL terms the course materials use" (`feedback-engine.ts`, Pedagogy line). The model reads every SFL term as permitted.
2. The analyzer's findings are written in SFL terms, by design. The writer is never told to translate them, so it copies their wording ("Theme shifts…", "relational processes").
3. The worked examples show content precision but say nothing about register. The analyzer example is pure metalanguage, and the writer imitates the nearest example.
4. Wrong reader framing. The technical prompt and the summary-redraft prompt say "your reader is the teaching team", but their prose ships to students. The linguistic writer calls itself a "staff review workspace" step.
5. The prompt contains no length, sentence or word-choice limits. No check measures plainness, so the eval passed 18/18 while the prose stayed opaque.
6. The rubric and genre profile describe the target in theory terms (field, tenor, mode, calibrated modality). The model reuses that vocabulary as its own.
7. Default rubric descriptors that print in the student PDF use the same vocabulary, for example "Modality, hedging, and technicality are calibrated…".

## Design

### D1. One shared student-reader contract (`plain-language.ts`)

A single module holds the rules, the translation table and the lint, so every student-facing writer gets the same text:

- **Reader.** "The student is the final reader. They are a capable first-year university student writing in English as an additional language (about IELTS 5.5–6.5). Staff will review your text, but write it for the student."
- **Sentences.** Address the student as "you". Use active voice and put one idea in each sentence. Aim for 20 words or fewer; never go over 25.
- **Words.** Use everyday words, and prefer verbs to abstract nouns ("you explain how sound travels", not "the text represents sound as a process"). Name the actual thing, so write "sound" and not "the entity".
- **Point and act.** A rationale says what the quoted words do and what that means for the reader, in at most two sentences. Revision guidance starts with a verb and gives one action the student can take on that passage, in at most two sentences. A criterion explanation has at most three sentences.
- **Terms.** Course terms ("known terms") may appear. On first use, each one gets a short plain gloss, e.g. "a general statement (your first sentence, which says what X is)". All other analysis vocabulary is translated through the table below and never named.
- **No repetition.** Make a point once, in the place that fits it best.
- **Rewrite direction.** Write numbered steps, one per line, with each step one short sentence.
- **Quality floor.** Plain does not mean simple. Keep the precise point, keep correct academic terms the course uses, and do not talk down. No exclamation marks and no "Great job!".

**Known terms** are the union of `sflContext.approvedGlossaryTerms`, the staff-approved stage labels (`sflContext.stages[].label`) and `sflContext.genreLabel`. They need no new data: `approvedGlossaryTerms` already exists and staff can already edit it on the rubric page. The plan also changes its field label to say what it now controls.

**Translation table** (SFL concept, then the plain wording the student sees):

| Internal | Student-facing |
|---|---|
| Theme / thematic progression | "the start of your sentence" / "what your sentences start with" |
| relational process / clause | "verbs such as *is*, *has*, *consists of*" |
| material process / temporal sequence | "describing steps in time order (first, then, finally)" |
| timeless present | "present tense (*is*, *are*), because these facts are always true" |
| entity / participant | the name of the thing itself |
| classification / composition stage | known stage label + gloss, or "a sentence that names the main types (or parts) of X" |
| impersonal stance / tenor | "write about the topic itself rather than about *we* or *you*" |
| modality / hedging / calibrated | "how sure your sentence sounds (*can*, *may*, *always*)" |
| evaluative language / appraisal | "words that give your opinion, such as *very dangerous*" |
| register | "the formal style this assignment needs" |
| cohesion / cohesive ties | "words that link your sentences (*this*, *these types*, *however*)" |
| nominalization | "turning a verb into a noun (*decide* → *decision*)" |
| positions the reader | "makes the reader feel / tells the reader…" |

### D2. Prompt changes

The linguistic writer, the summary redraft and the technical lens each receive the contract, and their prompt versions are bumped. Four changes come with it:

- The "light SFL terms" sentence is removed.
- The writer is told that the analysis input uses internal terms and that it must translate them.
- The "reader is the teaching team" framing is corrected.
- The worked examples are rewritten in the target register, and one abstract comment from the eval is added as an "avoid" example.

The analyzer and the diagnosis call stay technical, because staff and the writer are their only readers.

### D3. Deterministic lint (`lintStudentProse`)

The lint is pure, with no model call. It flags three things:

- banned analysis terms that are not known terms;
- sentences over 25 words;
- rationale or guidance over two sentences, and an explanation over three.

It runs in two places:
- **Generation.** After the writer, technical and redraft results pass validation, a single staff-only `internalFlags` line lists the offending terms and the count of long sentences. It never blocks a run and never shows student text in logs.
- **Eval.** A new `plainLanguage` check fails when a run has more than 1 banned term per 100 words, or more than 5% of sentences over 25 words.

### D4. Default rubric template

Rewrite the default template's level descriptors (`default-rubric-profile.ts`), which print in the student PDF, in plain language. This applies to the template only. Staff-authored and Canvas rubrics are never changed.

## Out of scope

- An automatic LLM "simplify" repair pass. It may become phase 2, if the lint shows that the prompt alone is not enough.
- Sentence frames or model sentences. The existing invariant forbids writing sentences for the student, so this would need a product decision (open question Q2).
- The Mongo schema, endpoints and UI layout. None of them change.

## Success criteria

- Eval: `plainLanguage` passes on 18/18 runs, while every existing check still passes.
- Banned-term density drops from 5.8 to ≤1 per 100 words. Average sentence length drops from 20.8 to ≤16 words.
- Human check: a colleague or the supervisor rates 10 before/after comment pairs (blind) on "I understand what to change", and the after versions are preferred.

## Open questions

- Q1. Which terms do LLED 200 students actually learn by the time of each assignment? This plan uses the staff-approved stage labels plus `approvedGlossaryTerms`. The instructor should confirm or extend that list per assignment.
- Q2. Should comments be allowed a generic sentence frame with blanks, such as "___ is a type of ___ that ___"? That is a common EAL scaffold, but it sits close to the "no model answer" invariant.
- Q3. Should the technical (APSC lab-report) lens use the same contract? This plan applies it, since the same Vantage students read it. That task can be dropped on its own.
