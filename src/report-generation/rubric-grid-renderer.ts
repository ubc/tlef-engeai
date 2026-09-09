/**
 * Rubric grid renderer — the marking grid as the student receives it
 *
 * A number tells a student what they got. The grid tells them why: every criterion as a row,
 * every level as a column, the descriptor that defines each cell, and a mark on the cell they
 * earned. This is the part of the feedback PDF a student reads when they disagree with a grade.
 *
 * Measurement is separated from drawing because the geometry carries all the judgment — how
 * wide a column can be before a 400-character descriptor stops wrapping into anything readable,
 * when the page has to turn on its side, and where a page may break without separating a
 * criterion from the levels that describe it. Drawing is then mechanical.
 *
 * Model suggestions never appear here. Only the staff-final assessment reaches a student.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Measures and draws the rubric grid with the earned cell marked.
 */

import type {
    StaffFinalAssessment,
    WritingRubricDefinition,
    WritingRubricCriterion,
    WritingRubricLevel
} from '../writing-feedback/contracts';
import { earnedLevelFor } from '../writing-feedback/rubric-bands';

/**
 * Narrowest column that still wraps a descriptor into readable lines.
 *
 * Below roughly this width a 400-character descriptor breaks into one or two words per line
 * and the cell becomes a column of fragments. Exported so the tests assert the same number the
 * renderer honours.
 */
export const MIN_GRID_COLUMN_WIDTH = 64;

/** Width reserved for the criterion name and its awarded points. */
const CRITERION_COLUMN_WIDTH = 120;

/** At this many levels a portrait page cannot give every column a readable width. */
const LANDSCAPE_FROM_LEVELS = 5;

const CELL_PADDING = 4;
const DESCRIPTOR_SIZE = 7.5;
const HEADER_SIZE = 8.5;
const LABEL_SIZE = 9;
const LINE_GAP = 1;
const MIN_ROW_HEIGHT = 28;

const BODY_FONT = 'Helvetica';
const BOLD_FONT = 'Helvetica-Bold';
const TEXT_COLOR = '#1d271d';
const MUTED_COLOR = '#5a6b5a';
const RULE_COLOR = '#c9d4c9';
const EARNED_FILL = '#e4efe4';

/** Page box the grid is measured against, in points, already inside the document margins. */
export interface GridPageBox {
    portraitWidth: number; // usable width on a portrait page
    landscapeWidth: number; // usable width once the page is turned
    availableHeight: number; // usable height below the section heading
}

/** Everything drawing needs, decided before a single line is put on the page. */
export interface GridGeometry {
    landscape: boolean; // whether the grid needs a turned page
    columnWidth: number; // width of one level column
    criterionColumnWidth: number; // width of the leading criterion column
    rowHeights: number[]; // measured height of each criterion row, in rubric order
    pageBreakAfter: number[]; // row indexes after which a page break falls
}

/** The text a cell shows, or an empty string where the rubric carries no descriptor. */
function descriptorFor(criterion: WritingRubricCriterion, level: WritingRubricLevel): string {
    return criterion.cells?.[level.id]?.descriptor ?? '';
}

/**
 * Rough height of wrapped text at a known width.
 *
 * Deliberately arithmetic rather than a PDFKit measurement: geometry is decided before any
 * document exists, which is what lets the whole layout be tested without rendering a PDF.
 * Helvetica averages close to 0.5em per character, so characters-per-line follows from width.
 */
function wrappedHeight(text: string, width: number, size: number): number {
    if (!text) return size + LINE_GAP;
    const charsPerLine = Math.max(1, Math.floor(width / (size * 0.5)));
    const lines = Math.ceil(text.length / charsPerLine);
    return lines * (size + LINE_GAP);
}

/**
 * measureRubricGrid - decides the grid's shape before anything is drawn.
 *
 * Orientation comes first, because it changes the width every column gets. The column width
 * is then the usable width shared evenly, floored at {@link MIN_GRID_COLUMN_WIDTH} so a wide
 * rubric overflows its page rather than collapsing into unreadable slivers. Row heights follow
 * from the tallest cell in each row, and page breaks fall between rows only.
 *
 * @param rubric - The rubric being printed
 * @param page - Usable page box, already inside the document margins
 * @returns Orientation, column widths, row heights, and the rows a page break follows
 */
export function measureRubricGrid(rubric: WritingRubricDefinition, page: GridPageBox): GridGeometry {
    const levels = rubric.levels;
    const landscape = levels.length >= LANDSCAPE_FROM_LEVELS;
    const usableWidth = landscape ? page.landscapeWidth : page.portraitWidth;
    const columnWidth = Math.max(
        MIN_GRID_COLUMN_WIDTH,
        (usableWidth - CRITERION_COLUMN_WIDTH) / Math.max(1, levels.length)
    );

    const rowHeights = rubric.criteria.map((criterion) => {
        const tallestCell = levels.reduce((tallest, level) => Math.max(
            tallest,
            wrappedHeight(descriptorFor(criterion, level), columnWidth - CELL_PADDING * 2, DESCRIPTOR_SIZE)
        ), 0);
        const labelHeight = wrappedHeight(criterion.label, CRITERION_COLUMN_WIDTH - CELL_PADDING * 2, LABEL_SIZE)
            + LABEL_SIZE + LINE_GAP; // the awarded-points line below the name
        return Math.max(MIN_ROW_HEIGHT, Math.max(tallestCell, labelHeight) + CELL_PADDING * 2);
    });

    // Break between criteria only. A row split across a page separates a descriptor from the
    // level it describes, which is the one thing this grid exists to show.
    const pageBreakAfter: number[] = [];
    let used = 0;
    rowHeights.forEach((height, index) => {
        if (index > 0 && used + height > page.availableHeight) {
            pageBreakAfter.push(index - 1);
            used = 0;
        }
        used += height;
    });

    return { landscape, columnWidth, criterionColumnWidth: CRITERION_COLUMN_WIDTH, rowHeights, pageBreakAfter };
}

/** Draws one header row of level names. */
function drawHeader(
    doc: PDFKit.PDFDocument,
    levels: WritingRubricLevel[],
    geometry: GridGeometry,
    left: number,
    top: number
): number {
    const height = HEADER_SIZE * 2 + CELL_PADDING * 2;
    doc.font(BOLD_FONT).fontSize(HEADER_SIZE).fillColor(MUTED_COLOR);
    doc.text('Criterion', left + CELL_PADDING, top + CELL_PADDING, {
        width: geometry.criterionColumnWidth - CELL_PADDING * 2
    });
    levels.forEach((level, index) => {
        const x = left + geometry.criterionColumnWidth + geometry.columnWidth * index;
        doc.text(level.label, x + CELL_PADDING, top + CELL_PADDING, {
            width: geometry.columnWidth - CELL_PADDING * 2
        });
    });
    return height;
}

/**
 * renderRubricGrid - draws the grid with the earned cell marked.
 *
 * The earned cell carries both a filled background and a heavier border, so the mark survives
 * a greyscale print — a student printing their feedback in black and white must still be able
 * to see which level they were given.
 *
 * @param doc - Document positioned where the grid should begin
 * @param rubric - Rubric whose grid is drawn
 * @param assessment - Staff-final scores; the only grade a student ever sees
 */
export function renderRubricGrid(
    doc: PDFKit.PDFDocument,
    rubric: WritingRubricDefinition,
    assessment: StaffFinalAssessment
): void {
    const margin = doc.page.margins.left;
    const geometry = measureRubricGrid(rubric, {
        portraitWidth: 612 - margin * 2,
        landscapeWidth: 792 - margin * 2,
        availableHeight: doc.page.height - margin * 2 - 60
    });

    // A turned page for a wide grid; the sections after it return to portrait.
    if (geometry.landscape) doc.addPage({ layout: 'landscape', margin });

    const left = margin;
    const awarded = new Map(assessment.criteria.map((entry) => [entry.criterionId, entry.points]));
    let y = doc.y;
    y += drawHeader(doc, rubric.levels, geometry, left, y);

    rubric.criteria.forEach((criterion, index) => {
        const height = geometry.rowHeights[index];
        const points = awarded.get(criterion.id);
        // earnedLevelFor, not the cells map: cells is sparse, so reading it directly left
        // every criterion without authored bands unmarked.
        const earned = points === undefined ? undefined : earnedLevelFor(criterion, rubric.levels, points);

        rubric.levels.forEach((level, column) => {
            const x = left + geometry.criterionColumnWidth + geometry.columnWidth * column;
            if (earned && level.id === earned.id) {
                doc.rect(x, y, geometry.columnWidth, height).fillColor(EARNED_FILL).fill();
            }
            doc.rect(x, y, geometry.columnWidth, height)
                .lineWidth(earned && level.id === earned.id ? 1.6 : 0.5)
                .strokeColor(earned && level.id === earned.id ? TEXT_COLOR : RULE_COLOR)
                .stroke();
            doc.font(BODY_FONT).fontSize(DESCRIPTOR_SIZE).fillColor(TEXT_COLOR)
                .text(descriptorFor(criterion, level), x + CELL_PADDING, y + CELL_PADDING, {
                    width: geometry.columnWidth - CELL_PADDING * 2,
                    height: height - CELL_PADDING * 2,
                    lineGap: LINE_GAP
                });
        });

        doc.rect(left, y, geometry.criterionColumnWidth, height)
            .lineWidth(0.5).strokeColor(RULE_COLOR).stroke();
        doc.font(BOLD_FONT).fontSize(LABEL_SIZE).fillColor(TEXT_COLOR)
            .text(criterion.label, left + CELL_PADDING, y + CELL_PADDING, {
                width: geometry.criterionColumnWidth - CELL_PADDING * 2
            });
        if (points !== undefined) {
            doc.font(BODY_FONT).fontSize(LABEL_SIZE).fillColor(MUTED_COLOR)
                .text(`${points} / ${criterion.points ?? 0}`, {
                    width: geometry.criterionColumnWidth - CELL_PADDING * 2
                });
        }

        y += height;
        if (geometry.pageBreakAfter.includes(index)) {
            doc.addPage(geometry.landscape ? { layout: 'landscape', margin } : { margin });
            y = doc.y;
            y += drawHeader(doc, rubric.levels, geometry, left, y);
        }
    });

    doc.y = y;
    doc.moveDown(0.5).font(BOLD_FONT).fontSize(11).fillColor(TEXT_COLOR)
        .text(`Total: ${assessment.totalPoints} / ${assessment.maxPoints}`, left, doc.y);
}
