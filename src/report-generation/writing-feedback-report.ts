/**
 * Student feedback PDF — general guidance and exact-span annotated writing
 *
 * Three modes ({@link FeedbackPdfInclude}):
 * - `general`   — the summary feedback document (strengths, rubric evidence, revision goals).
 * - `annotated` — the full verified submission text with Canvas-SpeedGrader-style PDF
 *                 `/Highlight` annotations and viewer-controlled comment popups.
 * - `both`      — general pages first, then the annotated text.
 *
 * Student-safe invariants: no confidence values, internal flags, origin, or matrix
 * function/level/priority tags ever reach this document.
 *
 * Annotation strategy follows a real Canvas SpeedGrader export: the yellow highlight is
 * painted directly into the page content stream, and the `/Highlight` annotation itself
 * is invisible (`/C [1 1 1]`, `/CA 0`) —
 * it exists only to carry the hover popup (`Contents`/`T`). Relying on viewers to draw the
 * annotation's appearance instead renders as Rect-sized blocks in several of them.
 * PDFKit note: `doc.highlight()` cannot be used because its `_markup` helper overwrites
 * `Contents` with an empty string, killing the popup; raw `doc.annotate()` is used instead.
 * `QuadPoints` use PDF bottom-left coordinates, bottom edge first (Canvas order).
 * Chrome hover behavior is verified; other viewers may require a click or tap because
 * popup activation belongs to the viewer, not the PDF file. The complete comment stays
 * in `Contents`, but Chrome/PDFium also owns the popup rectangle and can clip long text;
 * a portable PDF cannot force that viewer-generated box to grow.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Renders student-safe summary and interactive annotated PDF sections.
 */

import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import type {
    WritingFeedbackPdfService,
    WritingFeedbackResult,
    AnchoredComment,
    FeedbackPdfInclude,
    WritingAssignment,
    WritingRubricDefinition,
    WritingSubmission
} from '../writing-feedback/contracts';
import {
    layoutVerifiedText,
    highlightRectsForSpan,
    type HighlightRect
} from './writing-feedback-layout';

const PAGE_MARGIN = 64;
const BODY_SIZE = 11;
const BODY_FONT = 'Helvetica';
const BOLD_FONT = 'Helvetica-Bold';
const ITALIC_FONT = 'Helvetica-Oblique';
const RULE_COLOR = '#b7c9b7';
const MUTED_COLOR = '#5a6b5a';
const TEXT_COLOR = '#1d271d';
/** Line advance exceeds glyph height so adjacent wrapped highlights retain a white gap. */
const ANNOTATED_LINE_HEIGHT = 17;
/** Visible page-content fill; popup annotations remain transparent. */
const HIGHLIGHT_COLOR: [number, number, number] = [250, 225, 100];
const ANNOTATION_SUBJECT = 'Writing feedback comment';

/**
 * Produces student-safe feedback PDFs without exposing model or staff-only metadata.
 *
 * General and annotated sections share buffered pages so annotations and final page
 * numbering can be applied after layout is complete.
 */
export class StudentWritingFeedbackPdfService implements WritingFeedbackPdfService {
    /**
     * Renders the requested general, annotated, or combined PDF document.
     *
     * @param input - Approved assignment context, feedback, verified text, and valid comments
     * @returns Complete PDF 1.7 bytes after the PDFKit stream closes
     * @throws Error when synchronous layout or PDFKit streaming fails
     */
    async render(input: {
        assignment: WritingAssignment;
        submission: WritingSubmission;
        feedback: WritingFeedbackResult;
        grade?: number;
        staffFeedback?: string;
        comments?: AnchoredComment[];
        include?: FeedbackPdfInclude;
        annotationAuthor?: string;
        technicalFeedback?: WritingFeedbackResult;
        technicalRubric?: WritingRubricDefinition;
    }): Promise<Buffer> {
        const include = input.include ?? 'general';
        return new Promise((resolve, reject) => {
            // Buffer pages so annotations and total-page footers can target finalized geometry.
            const doc = new PDFDocument({
                size: 'LETTER',
                margin: PAGE_MARGIN,
                bufferPages: true,
                pdfVersion: '1.7'
            });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            try {
                // Compose only the sections explicitly selected by the download request.
                renderHeader(doc, input.assignment, input.grade);
                if (include === 'general' || include === 'both') {
                    renderGeneralSections(doc, input.assignment, input.feedback, input.staffFeedback);
                    if (input.technicalFeedback && input.technicalRubric) {
                        doc.addPage();
                        renderTechnicalSections(doc, input.technicalRubric, input.technicalFeedback);
                    }
                }
                if (include === 'annotated' || include === 'both') {
                    if (include === 'both') doc.addPage();
                    renderAnnotatedText(doc, input.submission, input.comments ?? [], input.annotationAuthor);
                }
                // Stamp footers after all optional annotated pages have been created.
                renderPageFooters(doc);
                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }
}

/** Title block shared by every mode: document title, assignment, optional approved grade. */
function renderHeader(doc: PDFKit.PDFDocument, assignment: WritingAssignment, grade?: number): void {
    doc.fillColor(TEXT_COLOR).font(BOLD_FONT).fontSize(20).text('Writing Feedback');
    doc.moveDown(0.2).font(BODY_FONT).fontSize(12).fillColor(MUTED_COLOR).text(assignment.title);
    if (grade !== undefined) {
        doc.moveDown(0.3).font(BOLD_FONT).fontSize(11).fillColor(TEXT_COLOR).text(`Approved grade: ${grade}`);
    }
    drawRule(doc, 10);
}

function drawRule(doc: PDFKit.PDFDocument, gap: number): void {
    const y = doc.y + gap;
    doc.moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y)
        .lineWidth(1).strokeColor(RULE_COLOR).stroke();
    doc.y = y + gap;
}

function sectionHeading(doc: PDFKit.PDFDocument, label: string): void {
    // Keep the heading attached to at least two body lines when close to the page bottom.
    if (doc.y > doc.page.height - PAGE_MARGIN - 80) doc.addPage();
    doc.moveDown(0.9).font(BOLD_FONT).fontSize(14).fillColor(TEXT_COLOR).text(label);
    doc.moveDown(0.35);
}

function body(doc: PDFKit.PDFDocument): PDFKit.PDFDocument {
    return doc.font(BODY_FONT).fontSize(BODY_SIZE).fillColor(TEXT_COLOR);
}

function bullet(doc: PDFKit.PDFDocument, text: string): void {
    body(doc).text(`•  ${text}`, { indent: 6, lineGap: 3, paragraphGap: 4 });
}

/** Summary sections: strengths, per-criterion evidence, revision goals, staff feedback. */
function renderGeneralSections(
    doc: PDFKit.PDFDocument,
    assignment: WritingAssignment,
    feedback: WritingFeedbackResult,
    staffFeedback?: string
): void {
    sectionHeading(doc, 'What you did well');
    feedback.strengths.forEach((strength) => bullet(doc, strength));

    renderCriteriaAndGoals(doc, assignment.rubric, feedback);

    if (staffFeedback?.trim()) {
        sectionHeading(doc, 'Feedback from your teaching team');
        body(doc).text(staffFeedback.trim(), { lineGap: 3 });
    }

    sectionHeading(doc, 'Carry forward');
    body(doc).text('Use these goals when you plan and revise your next writing assignment.', { lineGap: 3 });
}

/**
 * Rubric-labeled criteria evidence and prioritized revision goals for one feedback lens.
 *
 * Shared by the general (linguistic) and technical sections so a lens's evidence
 * always resolves its criterion/level labels from that lens's own rubric rather
 * than one hard-coded to the assignment's linguistic rubric.
 */
function renderCriteriaAndGoals(
    doc: PDFKit.PDFDocument,
    rubric: WritingRubricDefinition,
    feedback: WritingFeedbackResult
): void {
    sectionHeading(doc, 'Evidence from your writing');
    feedback.criteria.forEach((criterion, index) => {
        const label = rubric.criteria.find((item) => item.id === criterion.criterion)?.label
            ?? criterion.criterion;
        const level = rubric.levels.find((item) => item.id === criterion.suggestedLevel)?.label
            ?? criterion.suggestedLevel;
        if (index > 0) doc.moveDown(0.6);
        doc.font(BOLD_FONT).fontSize(11.5).fillColor(TEXT_COLOR).text(`${label} — ${level}`);
        if (criterion.explanation?.trim()) {
            doc.moveDown(0.15);
            body(doc).text(criterion.explanation.trim(), { lineGap: 2 });
        }
        criterion.evidence.forEach((item) => {
            doc.moveDown(0.2).font(ITALIC_FONT).fontSize(BODY_SIZE).fillColor(MUTED_COLOR)
                .text(`“${item.quote}”`, { indent: 14, lineGap: 2 });
        });
        doc.fillColor(TEXT_COLOR);
    });

    sectionHeading(doc, 'Priority revision goals');
    feedback.revisionGoals.slice(0, 3).forEach((goal, index) => {
        doc.font(BOLD_FONT).fontSize(BODY_SIZE).fillColor(TEXT_COLOR)
            .text(`${index + 1}.  ${goal.goal}`, { lineGap: 2 });
        doc.font(ITALIC_FONT).fontSize(BODY_SIZE).fillColor(MUTED_COLOR)
            .text(`Ask yourself: ${goal.guidedQuestion}`, { indent: 14, lineGap: 2, paragraphGap: 6 });
        doc.fillColor(TEXT_COLOR);
    });
}

/** Technical sections for a lab report: strengths, per-criterion evidence, and revision goals. */
function renderTechnicalSections(
    doc: PDFKit.PDFDocument,
    rubric: WritingRubricDefinition,
    feedback: WritingFeedbackResult
): void {
    sectionHeading(doc, 'Technical feedback');
    feedback.strengths.forEach((strength) => bullet(doc, strength));
    // Confidence and internal flags are staff-only and never reach a student document.
    renderCriteriaAndGoals(doc, rubric, feedback);
}

/**
 * Comments whose spans overlap, grouped so they can share one popup annotation.
 * Stacked separate annotations over the same text let a viewer surface only the
 * topmost popup, hiding every other comment on that span.
 */
interface CommentCluster {
    comments: AnchoredComment[];
    startOffset: number;
    endOffset: number;
}

/** Groups position-sorted comments into chains of overlapping spans. */
function clusterOverlappingComments(comments: AnchoredComment[]): CommentCluster[] {
    const sorted = [...comments].sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
    const clusters: CommentCluster[] = [];
    for (const comment of sorted) {
        const current = clusters[clusters.length - 1];
        if (current && comment.startOffset < current.endOffset) {
            current.comments.push(comment);
            current.endOffset = Math.max(current.endOffset, comment.endOffset);
        } else {
            clusters.push({ comments: [comment], startOffset: comment.startOffset, endOffset: comment.endOffset });
        }
    }
    return clusters;
}

/** Popup author precedence: comment author, then approving staff, then the team label. */
function resolveAuthor(comment: AnchoredComment, annotationAuthor?: string): string {
    return comment.authorName?.trim() || annotationAuthor?.trim() || 'Teaching Team';
}

/**
 * Popup body for one cluster. A single comment keeps its plain student-safe text;
 * merged popups separate each comment and name its author when authors differ,
 * so no feedback disappears behind a stacked annotation.
 */
function clusterPopupText(cluster: CommentCluster, annotationAuthor?: string): string {
    if (cluster.comments.length === 1) return popupText(cluster.comments[0]);
    const authors = new Set(cluster.comments.map((comment) => resolveAuthor(comment, annotationAuthor)));
    // ASCII separator keeps PDFKit emitting Latin-1 literal strings for ASCII feedback.
    return cluster.comments
        .map((comment) => authors.size > 1
            ? `${resolveAuthor(comment, annotationAuthor)}:\n${popupText(comment)}`
            : popupText(comment))
        .join('\n\n---\n\n');
}

/** Annotation author (`/T`) for a cluster: the shared author, or the team label when mixed. */
function clusterAuthor(cluster: CommentCluster, annotationAuthor?: string): string {
    const authors = new Set(cluster.comments.map((comment) => resolveAuthor(comment, annotationAuthor)));
    return authors.size === 1 ? authors.values().next().value! : 'Teaching Team';
}

/**
 * The full verified text with `/Highlight` annotations. Overlapping comment spans are
 * merged into one cluster annotation per page: all of a cluster's line rectangles on a
 * page share one QuadPoints list so viewers show a single popup containing every
 * comment, exactly like a Canvas SpeedGrader annotated download.
 */
function renderAnnotatedText(
    doc: PDFKit.PDFDocument,
    submission: WritingSubmission,
    comments: AnchoredComment[],
    annotationAuthor?: string
): void {
    const text = submission.verifiedText ?? submission.originalText;
    doc.font(BOLD_FONT).fontSize(14).fillColor(TEXT_COLOR).text('Your writing, with comments');
    doc.moveDown(0.2).font(ITALIC_FONT).fontSize(9.5).fillColor(MUTED_COLOR).text(
        comments.length
            ? 'Highlighted passages have comments. Hover over (or tap) a highlight to read them.'
            : 'No passage comments were added to this submission.'
    );
    doc.moveDown(0.8).fillColor(TEXT_COLOR);

    doc.font(BODY_FONT).fontSize(BODY_SIZE);
    const measure = (segment: string): number => doc.widthOfString(segment);
    // Use glyph height for the fill, independent from the larger 17-point line advance.
    const highlightHeight = doc.currentLineHeight(true);
    const lines = layoutVerifiedText(text, measure, {
        maxWidth: doc.page.width - PAGE_MARGIN * 2,
        lineHeight: ANNOTATED_LINE_HEIGHT,
        startY: doc.y,
        pageTopY: PAGE_MARGIN,
        pageBottomY: doc.page.height - PAGE_MARGIN - ANNOTATED_LINE_HEIGHT,
        paragraphGap: 8
    });

    // Pre-compute every cluster's line rectangles so the fills can be painted under the
    // text of each page as it is rendered.
    const clusters = clusterOverlappingComments(comments);
    const clusterRects = clusters.map((cluster) => highlightRectsForSpan(
        lines, cluster.startOffset, cluster.endOffset, measure, PAGE_MARGIN, highlightHeight
    ));
    const fillsByPage = new Map<number, HighlightRect[]>();
    for (const rects of clusterRects) {
        for (const rect of rects) {
            const group = fillsByPage.get(rect.page) ?? [];
            group.push(rect);
            fillsByPage.set(rect.page, group);
        }
    }

    // Absolute index of the page the annotated text starts on (for switchToPage below).
    const firstAnnotatedPage = doc.bufferedPageRange().count - 1;
    const paintFills = (layoutPage: number): void => {
        for (const rect of fillsByPage.get(layoutPage) ?? []) {
            doc.save().rect(rect.x, rect.y, rect.width, rect.height)
                .fillColor(HIGHLIGHT_COLOR).fill().restore();
        }
    };
    let currentLayoutPage = 0;
    paintFills(0);
    for (const line of lines) {
        while (line.page > currentLayoutPage) {
            doc.addPage();
            currentLayoutPage += 1;
            paintFills(currentLayoutPage);
        }
        doc.font(BODY_FONT).fontSize(BODY_SIZE).fillColor(TEXT_COLOR)
            .text(line.text, PAGE_MARGIN, line.y, { lineBreak: false });
    }

    // Emit popup-carrying annotations after all pages exist, one per (cluster, page).
    const annotationDate = new Date();
    const lastPage = doc.bufferedPageRange().count - 1;
    clusters.forEach((cluster, index) => {
        const byPage = new Map<number, HighlightRect[]>();
        for (const rect of clusterRects[index]) {
            const group = byPage.get(rect.page) ?? [];
            group.push(rect);
            byPage.set(rect.page, group);
        }
        for (const [layoutPage, group] of byPage) {
            const pageIndex = firstAnnotatedPage + layoutPage;
            doc.switchToPage(pageIndex);
            emitHighlightAnnotation(
                doc,
                group,
                clusterPopupText(cluster, annotationAuthor),
                clusterAuthor(cluster, annotationAuthor),
                pageIndex,
                annotationDate
            );
        }
    });
    doc.switchToPage(lastPage);
}

/** Student-safe popup body: comment, improvement guidance, resource link, glossary. */
function popupText(comment: AnchoredComment): string {
    const parts = [comment.comment.trim()];
    if (comment.howToImprove?.trim()) parts.push(`How to improve: ${comment.howToImprove.trim()}`);
    if (comment.courseMaterialLink) parts.push(`See: ${comment.courseMaterialLink}`);
    if (comment.glossaryDefinition) {
        parts.push(`Glossary — ${comment.glossaryDefinition.term}: ${comment.glossaryDefinition.definition}`);
    }
    return parts.join('\n\n');
}

/**
 * Invisible `/Highlight` annotation carrying the hover popup. The visible yellow is painted
 * in the page content (see renderAnnotatedText); the annotation matches Canvas exports:
 * white color, `CA 0`, locked, QuadPoints bottom edge first in PDF (bottom-left origin)
 * coordinates, and the identity/date metadata emitted by Canvas annotated downloads.
 * Popup activation remains viewer-controlled: Chrome supports hover, while some viewers
 * require a click or tap on the same annotation.
 */
function emitHighlightAnnotation(
    doc: PDFKit.PDFDocument,
    rects: HighlightRect[],
    contents: string,
    author: string,
    pageIndex: number,
    annotationDate: Date
): void {
    const pageHeight = doc.page.height;
    const quadPoints: number[] = [];
    for (const rect of rects) {
        const x1 = rect.x;
        const x2 = rect.x + rect.width;
        const yTop = pageHeight - rect.y;
        const yBottom = pageHeight - (rect.y + rect.height);
        // PDF markup annotations use bottom-left coordinates and Canvas's bottom-edge-first order.
        quadPoints.push(x1, yBottom, x2, yBottom, x1, yTop, x2, yTop);
    }
    const minX = Math.min(...rects.map((rect) => rect.x));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
    const pdfDate = formatPdfDate(annotationDate);
    doc.annotate(minX, minY, maxX - minX, maxY - minY, {
        Subtype: 'Highlight',
        QuadPoints: quadPoints,
        // String objects (not primitives) make PDFKit serialize literal strings, not names.
        Contents: new String(contents),
        T: new String(author),
        NM: new String(randomUUID()),
        M: new String(pdfDate),
        CreationDate: new String(pdfDate),
        Subj: new String(ANNOTATION_SUBJECT),
        Page: pageIndex,
        // Keep the annotation invisible; the separate glyph-height fill is the visual highlight.
        CA: 0,
        color: [255, 255, 255],
        F: 128
    } as unknown as object);
}

/** Canvas-compatible UTC timestamp for PDF annotation metadata. */
function formatPdfDate(date: Date): string {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
        + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}+00'00'`;
}

/** Page numbers across every buffered page. */
function renderPageFooters(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
        doc.switchToPage(index);
        // Writing inside the bottom margin would trigger PDFKit's auto-pagination; disable it
        // for the footer stamp and restore afterwards.
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font(BODY_FONT).fontSize(8.5).fillColor(MUTED_COLOR).text(
            `Page ${index + 1} of ${range.count}`,
            PAGE_MARGIN,
            doc.page.height - PAGE_MARGIN + 20,
            { width: doc.page.width - PAGE_MARGIN * 2, align: 'center', lineBreak: false }
        );
        doc.page.margins.bottom = bottomMargin;
    }
}
