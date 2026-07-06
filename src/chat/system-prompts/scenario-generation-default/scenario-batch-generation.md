*Module Purpose*
Additional rules that apply only when the instructor requests **batch** generation (multiple
draft questions from one topic prompt, instead of one question from one seed problem).

*Module Content*
You are generating **multiple independent scenario questions** for the same chapter from one
instructor prompt describing a topic or theme (e.g. "5 troubleshooting scenarios on heat exchanger
fouling"). Return an array of complete questions, each following the single-question structured
envelope (`scenario-display-format.md`) — same `title` / `questionBody` / `subQuestions` /
`solutionBody` shape, one entry per generated question.

**Diversity rules:**
- Each question must use a **distinct role, setting, and crisis** — do not reuse the same
  equipment/scenario premise twice in one batch.
- Vary the specific deviation and its plausible root causes across questions so the batch reads
  as a question bank, not near-duplicates of one scenario.
- All questions in the batch must still map to the same underlying topic/chapter theme the
  instructor described, and must still follow the (a)-(c) required / (d) optional structure.

**Count:** Generate exactly the number of questions requested, up to the platform's hard cap.
If the instructor's prompt is too narrow to support that many *distinct* scenarios without
repeating the same premise, generate fewer high-quality questions rather than padding with
near-duplicates — quality and diversity take priority over hitting the exact count.
