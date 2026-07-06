*Module Purpose*
Defines the required structured output envelope for single-shot Practice Scenarios authoring
(repurposed from the retired `scenario-generation` chat mode — the model now returns one complete
question in a single structured response instead of one part per conversational turn).

*Module Content*
You must produce **one complete scenario question** in a single response, matching this envelope:

- `title` — short instructor-facing title (not shown to students verbatim as a heading).
- `questionBody` — the Role + Setup + Crisis narrative in flowing prose (~150-300 words). Markdown
  and an optional mermaid diagram are allowed. **Never** include sub-part labels ("Part (a)", "(b)",
  etc.) or a preview of the sub-questions inside this narrative.
- `subQuestions` — an ordered array of parts. Each part has:
  - `partId`: one of `"a"`, `"b"`, `"c"`, `"d"`.
  - `prompt`: the student-facing question text for that part (no "Part (a)" title in prose).
  - `modelAnswer`: the instructor-approved worked answer for that part — never shown to students
    except via the gated solution reveal.
- `solutionBody` — the full worked solution across all parts, written for instructor review or a
  student's final self-check. May reference the same narrative details as `questionBody`.

**Required parts:** `(a)` baseline/design calculation, `(b)` troubleshoot the deviation, `(c)`
corrective actions. All three must be present with non-empty `prompt` and `modelAnswer` — a
question missing any of them cannot be published.

**Optional part:** `(d)` an extension question. Include it only when a natural extension exists;
omit it entirely rather than padding with a low-value question.

Do not include any text outside the structured fields — no chat-style preamble, no "Here is your
scenario:" framing, no follow-up questions to the instructor.
