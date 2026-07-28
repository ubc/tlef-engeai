# Writing Feedback PDF modes — design (2026-07-22)

Approved by user in session 2026-07-22.

## Goal

Three student-facing PDF downloads from the review page footer (same `wf-download-menu` location):

1. **General PDF** (`?include=general`, default) — existing summary feedback, reformatted for readability.
2. **Annotated PDF** (`?include=annotated`, replaces the never-used `specific` value) — the full verified
   submission text with Canvas-SpeedGrader-style highlights: real PDF `/Highlight` annotations whose
   `Contents` popup shows the comment on hover/click in any standard viewer.
3. **Complete PDF** (`?include=both`) — general pages first, page break, annotated text after.

Reference artifact: a real Canvas annotated-submission download was inspected. It uses standard
`/Highlight` annotations with `QuadPoints` per wrapped line, `Contents` (comment text), and `/T`
(author). No endnote list. This design replicates that exactly.

## Decisions

- Annotation author (`/T`) = **approving staff name**, stored at approval time
  (`approvedByName` set by the approve route from the session user's name); fallback `"Teaching Team"`
  when not yet approved. (User-selected option.)
- Rendering approach: PDFKit custom line layout + native annotations. No new dependencies.
  `doc.highlight()` cannot be used — its `_markup` helper overwrites `Contents` — so annotations are
  emitted through raw `doc.annotate()` with an explicit dict (`Subtype: 'Highlight'`, own `QuadPoints`
  in bottom-left PDF coordinates, bottom edge first, `Contents`/`T` as `new String(...)`).
- **Revised after first user test (same day):** relying on viewers to draw the annotation appearance
  rendered as Rect-sized blocks ("whole text highlighted") with no working hover. The fix replicates
  Canvas exactly: the visible yellow is painted directly into the page content stream (rect fills under
  the text), and the annotation is invisible (`/C [1 1 1]`, `/CA 0`, `/F 128`) — purely the popup
  carrier. This also guarantees correct printing in every viewer.
- One annotation per (comment, page): all of a comment's line rects on a page merge into a single
  annotation's `QuadPoints`, so the popup is not duplicated per line.
- Popup body is student-safe only: comment, "How to improve:", resource link, glossary. Function/level/
  priority tags, origin, confidence, and internal notes never appear.
- Highlight color prints (visible on paper); popups are viewer behavior.

## Components

- `src/writing-feedback/annotated-text-layout.ts` — pure, testable layout engine.
  `layoutVerifiedText(text, measure, opts)` word-wraps the verified text and returns lines carrying
  `{ text, sourceStart, page, y }`. Offsets are UTF-16 code units, same anchor space as
  `AnchoredComment`. Handles `\n`/`\r\n`, blank lines, and char-splitting of unbreakable tokens.
- `src/writing-feedback/pdf-service.ts` — rewritten renderer: reformatted general sections
  (header block, ruled section headings, hanging bullets, per-criterion evidence blocks, numbered
  revision goals, page numbers via `bufferPages`), plus the annotated renderer that draws layout lines
  and emits grouped highlight annotations via `doc.switchToPage`.
- `contracts.ts` — `FeedbackPdfInclude = 'general' | 'annotated' | 'both'`; render input gains
  `annotationAuthor?`; `WritingSubmission` gains typed `approvedAt?/approvedBy?/approvedByName?`.
- Service/route — approve stores the approver's display name; `renderPdf` resolves the author and
  passes verified text comments (existing exact-anchor filter unchanged); route maps legacy
  `include=specific` to `annotated` and varies the download filename per mode.
- Frontend `writing-feedback-review.ts` — three links in the existing footer menu:
  `PDF`, `Annotated PDF`, `Complete PDF`.

## Bug fix (same session)

Saving a staff revision failed with `String must contain at most 500 character(s)` whenever any
working comment (typically a model seed copied from an unbounded evidence quote —
`feedback-schema.ts` sets no max) exceeded the `quote: max(500)` cap in `anchored-comments.ts`.
Fix: raise the server cap to 4000 (quote is an anchor checksum, not display copy) and align the
frontend selection truncation (`writing-feedback-anchors.ts`, was 500) to match.

## Testing

- New unit tests: layout engine (wrap/offset fidelity, blank lines, long tokens, page breaks) and
  pdf-service (decompressed-buffer assertions: `/Highlight` + `QuadPoints` presence, popup text,
  author, staff-only fields absent, mode gating).
- Extended: anchored-comments long-quote acceptance.
- `npx jest src/writing-feedback`, backend + frontend `tsc --noEmit`, dist rebuild.
