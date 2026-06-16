/**
 * report-document.ts
 * @author: @gatahcha
 * @date: 2026-06-15
 * @description: PDFKit page sections, appendix layout math, render loop, and ReportDocumentService.
 */

import PDFDocument from 'pdfkit';
import type { StruggleStatsLegendItem } from '../types/shared';
import { ChartJsStackedBarRenderer } from './report-chart';
import {
    PDF_CHBE_GREEN,
    PDF_TABLE_TEXT,
    PDF_TITLE_TEXT,
    PDF_ZEBRA_STRIPE_B,
    buildReportPdfFilename,
    deriveAcademicPeriod,
    formatReportGeneratedAt,
    type IReportDataService,
    type IReportSection,
    type IStackedBarChartRenderer,
    type ReportBuildInput,
    type ReportPdfOutput,
    type ReportPdfPhase,
    type ReportRenderContext,
    type StudentAppendixChapterGroup,
    type StudentAppendixPdfRow
} from './report-contracts';
import { ReportDataService } from './report-data';

// --- Layout: appendix row height (exported for tests) ---

const EMPTY_PLACEHOLDER = '—';

/** Minimal PDFKit surface used for appendix row height measurement in tests. */
export interface AppendixLayoutDoc {
    font(name: string): AppendixLayoutDoc;
    fontSize(size: number): AppendixLayoutDoc;
    widthOfString(text: string): number;
    heightOfString(text: string, options?: { width?: number }): number;
}

/**
 * Greedy word-wrap height using PDFKit widthOfString / heightOfString.
 *
 * @param doc - PDFKit doc or test double implementing {@link AppendixLayoutDoc}
 * @param text - Text to measure
 * @param width - Column width in points
 * @param font - PDFKit font name
 * @param fontSize - Font size in points
 * @returns Total wrapped height in points
 */
export function heightOfWrappedText(
    doc: AppendixLayoutDoc,
    text: string,
    width: number,
    font: string,
    fontSize: number
): number {
    if (!text || width <= 0) {
        return 0;
    }

    doc.font(font).fontSize(fontSize);
    let total = 0;
    let remaining = text;

    while (remaining.length > 0) {
        const { chunk, rest } = takeWordsFittingWidth(doc, remaining, width, font, fontSize);
        if (!chunk) {
            const forced = fitTextChunk(doc, remaining, width, font, fontSize);
            total += doc.heightOfString(forced.chunk, { width });
            remaining = forced.rest;
            continue;
        }

        total += doc.heightOfString(chunk, { width });
        remaining = rest;
    }

    return total;
}

/**
 * Height for one chapter group, matching renderChapterGroups continued-text layout.
 *
 * @param doc - PDFKit doc or layout test double
 * @param group - Chapter bin with optional chapter number and topic labels
 * @param colWidth - Column width in points
 * @param fontSize - Body font size in points
 * @returns Content height in points
 */
export function heightOfChapterGroup(
    doc: AppendixLayoutDoc,
    group: StudentAppendixChapterGroup,
    colWidth: number,
    fontSize: number
): number {
    const prefix =
        group.chapterNum !== undefined ? `chapter ${group.chapterNum}: ` : '';
    const topicList = ReportDataService.getInstance().formatChapterTopicsList(group.topics);

    if (!prefix && !topicList) {
        return 0;
    }
    if (!prefix) {
        return heightOfWrappedText(doc, topicList, colWidth, 'Helvetica', fontSize);
    }
    if (!topicList) {
        doc.font('Helvetica-Bold').fontSize(fontSize);
        return doc.heightOfString(prefix, { width: colWidth });
    }

    return heightOfChapterGroupWithContinued(doc, prefix, topicList, colWidth, fontSize);
}

/**
 * Max column content height for one appendix table row.
 *
 * @param doc - PDFKit doc or layout test double
 * @param row - Pre-shaped appendix row
 * @param col1Width - Student name column width
 * @param col2Width - Struggle topics column width
 * @param fontSize - Table body font size
 * @returns Row content height in points (before padding)
 */
export function measureAppendixRowContentHeight(
    doc: AppendixLayoutDoc,
    row: StudentAppendixPdfRow,
    col1Width: number,
    col2Width: number,
    fontSize: number
): number {
    const nameHeight = heightOfWrappedText(doc, row.userName, col1Width, 'Helvetica', fontSize);

    let topicsHeight: number;
    if (!row.chapterGroups.length) {
        doc.font('Helvetica').fontSize(fontSize);
        topicsHeight = doc.heightOfString(EMPTY_PLACEHOLDER, { width: col2Width });
    } else {
        topicsHeight = 0;
        for (const group of row.chapterGroups) {
            topicsHeight += heightOfChapterGroup(doc, group, col2Width, fontSize);
        }
    }

    return Math.max(nameHeight, topicsHeight);
}

/**
 * Height for one chapter group with continued text layout.
 *
 * @param doc - PDFKit doc or layout test double
 * @param prefix - Chapter prefix
 * @param topicList - Topic list
 * @param colWidth - Column width in points
 * @param fontSize - Body font size in points
 * @returns Content height in points
 */
function heightOfChapterGroupWithContinued(
    doc: AppendixLayoutDoc,
    prefix: string,
    topicList: string,
    colWidth: number,
    fontSize: number
): number {
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const prefixLines = breakTextIntoLines(doc, prefix, colWidth, 'Helvetica-Bold', fontSize);

    let height = 0;
    for (let i = 0; i < prefixLines.length - 1; i++) {
        height += doc.heightOfString(prefixLines[i], { width: colWidth });
    }

    const lastPrefixChunk = prefixLines[prefixLines.length - 1] ?? '';
    const lastPrefixWidth = lastPrefixChunk ? doc.widthOfString(lastPrefixChunk) : 0;
    const remainingWidthOnLastLine = Math.max(0, colWidth - lastPrefixWidth);

    const { chunk: firstTopicChunk, rest: remainingTopics } = takeWordsFittingWidth(
        doc,
        topicList,
        remainingWidthOnLastLine,
        'Helvetica',
        fontSize
    );

    const prefixLastLineHeight = doc
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .heightOfString(lastPrefixChunk || ' ', { width: colWidth });

    if (!remainingTopics) {
        const topicOnSharedHeight = firstTopicChunk
            ? doc
                  .font('Helvetica')
                  .fontSize(fontSize)
                  .heightOfString(firstTopicChunk, {
                      width: remainingWidthOnLastLine || colWidth
                  })
            : 0;
        height += Math.max(prefixLastLineHeight, topicOnSharedHeight);
        return height;
    }

    const sharedTopicHeight = firstTopicChunk
        ? doc
              .font('Helvetica')
              .fontSize(fontSize)
              .heightOfString(firstTopicChunk, {
                  width: remainingWidthOnLastLine || colWidth
              })
        : 0;
    height += Math.max(prefixLastLineHeight, sharedTopicHeight);
    height += heightOfWrappedText(doc, remainingTopics, colWidth, 'Helvetica', fontSize);
    return height;
}

/**
 * Breaks text into lines fitting the given width.
 *
 * @param doc - PDFKit doc or layout test double
 * @param text - Text to break into lines
 * @param width - Column width in points
 * @param font - PDFKit font name
 * @param fontSize - Font size in points
 * @returns Array of lines
 */
function breakTextIntoLines(
    doc: AppendixLayoutDoc,
    text: string,
    width: number,
    font: string,
    fontSize: number
): string[] {
    if (!text || width <= 0) {
        return [];
    }

    doc.font(font).fontSize(fontSize);
    const lines: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        const { chunk, rest } = takeWordsFittingWidth(doc, remaining, width, font, fontSize);
        if (!chunk) {
            const forced = fitTextChunk(doc, remaining, width, font, fontSize);
            lines.push(forced.chunk);
            remaining = forced.rest;
            continue;
        }

        lines.push(chunk);
        remaining = rest;
    }

    return lines;
}

/**
 * Takes words fitting the given width.
 *
 * @param doc - PDFKit doc or layout test double
 * @param text - Text to take words from
 * @param width - Column width in points
 * @param font - PDFKit font name
 * @param fontSize - Font size in points
 * @returns { chunk: string; rest: string } - Chunk of words and remaining text
 */
function takeWordsFittingWidth(
    doc: AppendixLayoutDoc,
    text: string,
    width: number,
    font: string,
    fontSize: number
): { chunk: string; rest: string } {
    doc.font(font).fontSize(fontSize);

    if (!text || width <= 0) {
        return { chunk: '', rest: text };
    }

    const words = text.split(' ');
    let line = '';
    let wordIndex = 0;

    for (; wordIndex < words.length; wordIndex++) {
        const word = words[wordIndex];
        const candidate = line ? `${line} ${word}` : word;

        if (line && doc.widthOfString(candidate) > width) {
            break;
        }

        if (!line && doc.widthOfString(word) > width) {
            const { chunk, rest } = fitTextChunk(doc, word, width, font, fontSize);
            const remainingWords = words.slice(wordIndex + 1).join(' ');
            const restText = rest + (remainingWords ? ` ${remainingWords}` : '');
            return { chunk, rest: restText.trimStart() };
        }

        line = candidate;
    }

    const rest = words.slice(wordIndex).join(' ');
    return { chunk: line, rest: rest.trimStart() };
}

/**
 * Fits text chunk into the given width.
 *
 * @param doc - PDFKit doc or layout test double
 * @param text - Text to fit into a chunk
 * @param maxWidth - Maximum width in points
 * @param font - PDFKit font name
 * @param fontSize - Font size in points
 * @returns { chunk: string; rest: string } - Chunk of text and remaining text
 */
function fitTextChunk(
    doc: AppendixLayoutDoc,
    text: string,
    maxWidth: number,
    font: string,
    fontSize: number
): { chunk: string; rest: string } {
    doc.font(font).fontSize(fontSize);

    if (!text || maxWidth <= 0) {
        return { chunk: '', rest: text };
    }

    if (doc.widthOfString(text) <= maxWidth) {
        return { chunk: text, rest: '' };
    }

    let end = 0;
    while (end < text.length && doc.widthOfString(text.slice(0, end + 1)) <= maxWidth) {
        end += 1;
    }

    if (end === 0) {
        end = 1;
    }

    return { chunk: text.slice(0, end), rest: text.slice(end) };
}

// --- PDFKit layout helpers ---


/**
 * Gets the bottom Y content position.
 *
 * @param doc - PDFKit doc
 * @returns Bottom Y content position
 */
function getContentBottomY(doc: ReportRenderContext['doc']): number {
    return doc.page.height - doc.page.margins.bottom;
}

/**
 * Ensures vertical space at the given Y position.
 *
 * @param doc - PDFKit doc
 * @param y - Y position
 * @param requiredHeight - Required height
 * @returns New Y position
 */
function ensureVerticalSpaceAt(
    doc: ReportRenderContext['doc'],
    y: number,
    requiredHeight: number
): number {
    const bottomY = getContentBottomY(doc);
    if (y + requiredHeight > bottomY) {
        doc.addPage();
        return doc.page.margins.top;
    }
    return y;
}

/**
 * Gets the student appendix table columns.
 *
 * @param doc - PDFKit doc
 * @returns Student appendix table columns
 */
function getStudentAppendixTableColumns(doc: ReportRenderContext['doc']): {
    margin: number;
    contentWidth: number;
    col1Width: number;
    col2Width: number;
    col2X: number;
} {
    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const col1Width = contentWidth * 0.35;
    const col2Width = contentWidth - col1Width;

    return {
        margin,
        contentWidth,
        col1Width,
        col2Width,
        col2X: margin + col1Width
    };
}

// --- Page: Title ---

/** Green CHBE title page with course name, term, and generated timestamp. */
class TitlePageSection implements IReportSection {
    async render(context: ReportRenderContext): Promise<void> {
        const { doc, input, academicPeriod } = context;
        const { course, generatedAt } = input;
        const pageWidth = doc.page.width;
        const margin = doc.page.margins.left;

        doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_CHBE_GREEN);
        doc.fillColor(PDF_TITLE_TEXT);

        doc.font('Helvetica-Bold').fontSize(28);
        doc.text(course.courseName, margin, 200, {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.moveDown(2);
        doc.font('Helvetica').fontSize(16);
        doc.text('EngE-AI Struggle Topic Report', {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.moveDown(1.5);
        doc.fontSize(14);
        doc.text(academicPeriod.displayLabel, {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.moveDown(3);
        doc.fontSize(11);
        doc.text(`Generated: ${formatReportGeneratedAt(generatedAt)}`, {
            width: pageWidth - margin * 2,
            align: 'center'
        });

        doc.fillColor('#000000');
    }
}

// --- Page: Outline ---

/** Outline items for the report. */
const OUTLINE_ITEMS: Array<{ title: string; description: string; fullReportOnly?: boolean }> = [
    {
        title: 'Executive summary',
        description: 'Course-wide struggle topic distribution and key statistics.'
    },
    {
        title: 'Chapter breakdown',
        description: 'Per-chapter charts and student rosters by struggle label.',
        fullReportOnly: true
    },
    {
        title: 'Per-student appendix',
        description:
            'Paginated zebra-striped table of all enrolled students; struggle topics binned by chapter (bold header, comma-separated topics).',
        fullReportOnly: true
    }
];

/** Phase-aware report outline listing included and pending sections. */
class OutlinePageSection implements IReportSection {
    async render(context: ReportRenderContext): Promise<void> {
        const { doc, input } = context;
        const isFullReport = input.phase === 'full';
        const margin = doc.page.margins.left;
        const contentWidth = doc.page.width - margin * 2;

        doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000');
        doc.text('Report Outline', margin, doc.page.margins.top);

        doc.moveDown(1.5);
        doc.font('Helvetica').fontSize(12);

        OUTLINE_ITEMS.forEach((item, index) => {
            const includedInFull = item.fullReportOnly && isFullReport;
            const pendingFull = item.fullReportOnly && !isFullReport;
            const suffix = includedInFull
                ? ' (included)'
                : pendingFull
                  ? ' (included in full report)'
                  : '';
            doc.font('Helvetica-Bold').text(`${index + 1}. ${item.title}${suffix}`, {
                width: contentWidth,
                continued: false
            });
            doc.font('Helvetica').fillColor('#444444');
            doc.text(item.description, {
                width: contentWidth,
                indent: 16
            });
            doc.fillColor('#000000');
            doc.moveDown(0.8);
        });

        doc.moveDown(1);
        doc.fontSize(10).fillColor('#666666');
        if (isFullReport) {
            doc.text(
                'This report includes the executive summary and per-student appendix. ' +
                    'Chapter breakdown sections follow in a future release.',
                { width: contentWidth }
            );
        } else {
            doc.text(
                'This prototype includes the executive summary (course-wide distribution chart). ' +
                    'Chapter breakdown and per-student appendix follow in the full report.',
                { width: contentWidth }
            );
        }
        doc.fillColor('#000000');
    }
}

// --- Page: Distribution ---

const LEGEND_SWATCH_SIZE = 10;
const LEGEND_ROW_HEIGHT = 14;
const LEGEND_FONT_SIZE = 9;

/** Executive summary page: stacked bar chart PNG and course-wide legend. */
class DistributionPageSection implements IReportSection {
    /**
     * @param chartRenderer - Chart PNG adapter (injected for tests)
     * @param dataService - Legend and chapter formatting (defaults to ReportDataService singleton)
     */
    constructor(
        private readonly chartRenderer: IStackedBarChartRenderer,
        private readonly dataService: IReportDataService = ReportDataService.getInstance()
    ) {}

    /**
     * Renders the distribution page.
     *
     * @param context - Report render context
     * @returns void
     */
    async render(context: ReportRenderContext): Promise<void> {
        const { doc, input } = context;
        const { struggleTopics } = input.stats;
        const margin = doc.page.margins.left;
        const contentWidth = doc.page.width - margin * 2;
        let y = doc.page.margins.top;

        doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000');
        doc.text('Struggle Topic Distribution', margin, y, { width: contentWidth });
        y = doc.y + 16;

        const chartBuffer = await this.chartRenderer.render(struggleTopics.stackedBar);
        const chartWidth = contentWidth;
        const chartHeight = 220;
        doc.image(chartBuffer, margin, y, { width: chartWidth, height: chartHeight });
        y += chartHeight + 24;

        this.renderLegend(
            doc,
            struggleTopics.legend,
            struggleTopics.stackedBar,
            margin,
            y,
            contentWidth
        );
    }

    /**
     * Renders the legend.
     *
     * @param doc - PDFKit doc
     * @param legend - Legend items
     * @param stackedBar - Course-wide struggle distribution payload
     * @param x - X position
     * @param startY - Start Y position
     * @param contentWidth - Content width in points
     * @returns void
     */
    private renderLegend(
        doc: ReportRenderContext['doc'],
        legend: StruggleStatsLegendItem[],
        stackedBar: ReportRenderContext['input']['stats']['struggleTopics']['stackedBar'],
        x: number,
        startY: number,
        contentWidth: number
    ): void {
        const visibleLegend = this.dataService.filterPdfLegendItems(legend);
        if (!visibleLegend.length) {
            doc.font('Helvetica').fontSize(11).fillColor('#666666');
            doc.text('No struggle topic data recorded.', x, startY);
            doc.fillColor('#000000');
            return;
        }

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
        doc.text('Legend (course-wide unique students per label)', x, startY);
        const legendStartY = doc.y + 10;

        this.renderLegendList(doc, visibleLegend, stackedBar, x, legendStartY, contentWidth);
    }

    /**
     * Renders the legend list.
     *
     * @param doc - PDFKit doc
     * @param items - Legend items
     * @param stackedBar - Course-wide struggle distribution payload
     * @param x - X position
     * @param startY - Start Y position
     * @param contentWidth - Content width in points
     * @returns void
     */
    private renderLegendList(
        doc: ReportRenderContext['doc'],
        items: StruggleStatsLegendItem[],
        stackedBar: ReportRenderContext['input']['stats']['struggleTopics']['stackedBar'],
        x: number,
        startY: number,
        contentWidth: number
    ): void {
        const chapterByLabel = this.dataService.buildLabelChapterNumberMap(stackedBar);
        let y = startY;
        doc.font('Helvetica').fontSize(LEGEND_FONT_SIZE);

        for (const item of items) {
            doc.save();
            doc.rect(x, y + 2, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE).fill(item.color);
            doc.restore();

            const labelText = this.dataService.formatPdfStruggleLine(
                item.topic,
                item.studentCount,
                chapterByLabel.get(item.topic)
            );
            doc.fillColor('#333333').text(labelText, x + LEGEND_SWATCH_SIZE + 6, y, {
                width: contentWidth - LEGEND_SWATCH_SIZE - 6
            });

            y += LEGEND_ROW_HEIGHT;
        }

        doc.fillColor('#000000');
    }
}

// --- Page: Student appendix ---

const SECTION_TITLE = 'Per-Student Struggle Topics';
const TABLE_FONT_SIZE = 10;
const HEADER_FONT_SIZE = 11;
const ROW_PADDING_TOP = 4;
const ROW_PADDING_BOTTOM = 4;
const HEADER_ROW_HEIGHT = 22;

/** Full-report appendix: zebra-striped per-student struggle topic table. */
class StudentAppendixSection implements IReportSection {
    /**
     * @param dataService - Chapter topic formatting (defaults to ReportDataService singleton)
     */
    constructor(private readonly dataService: IReportDataService = ReportDataService.getInstance()) {}

    async render(context: ReportRenderContext): Promise<void> {
        const rows = context.input.studentAppendix ?? [];
        if (!rows.length) {
            return;
        }

        const { doc } = context;
        const columns = getStudentAppendixTableColumns(doc);
        let y = doc.page.margins.top;

        doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000');
        doc.text(SECTION_TITLE, columns.margin, y, { width: columns.contentWidth });
        y = doc.y + 16;

        y = this.renderTableHeader(doc, columns, y);

        let rowIndex = 0;
        for (const row of rows) {
            y = this.renderTableRow(doc, columns, row, y, rowIndex);
            rowIndex += 1;
        }

        doc.fillColor('#000000');
    }

    /**
     * Renders the table header.
     *
     * @param doc - PDFKit doc
     * @param columns - Table columns
     * @param y - Y position
     * @returns New Y position
     */
    private renderTableHeader(
        doc: ReportRenderContext['doc'],
        columns: ReturnType<typeof getStudentAppendixTableColumns>,
        y: number
    ): number {
        doc.font('Helvetica-Bold').fontSize(HEADER_FONT_SIZE).fillColor('#000000');
        doc.text('Student', columns.margin, y, { width: columns.col1Width });
        doc.text('Struggle topics', columns.col2X, y, { width: columns.col2Width });

        y += HEADER_ROW_HEIGHT - 6;
        doc
            .strokeColor('#cccccc')
            .lineWidth(0.5)
            .moveTo(columns.margin, y)
            .lineTo(columns.margin + columns.contentWidth, y)
            .stroke();

        return y + 6;
    }

    /**
     * Renders a table row.
     *
     * @param doc - PDFKit doc
     * @param columns - Table columns
     * @param row - Table row
     * @param y - Y position
     * @param rowIndex - Row index
     * @returns New Y position
     */
    private renderTableRow(
        doc: ReportRenderContext['doc'],
        columns: ReturnType<typeof getStudentAppendixTableColumns>,
        row: StudentAppendixPdfRow,
        y: number,
        rowIndex: number
    ): number {
        const contentHeight = measureAppendixRowContentHeight(
            doc,
            row,
            columns.col1Width,
            columns.col2Width,
            TABLE_FONT_SIZE
        );
        const rowHeight = contentHeight + ROW_PADDING_TOP + ROW_PADDING_BOTTOM;
        const rowTop = y;

        const yBeforeBreak = y;
        y = ensureVerticalSpaceAt(doc, y, rowHeight);
        const pageBroke = y !== yBeforeBreak;
        if (pageBroke) {
            y = this.renderTableHeader(doc, columns, y);
        }
        const effectiveRowTop = pageBroke ? y : rowTop;

        if (rowIndex % 2 === 1) {
            doc.rect(columns.margin, effectiveRowTop, columns.contentWidth, rowHeight).fill(
                PDF_ZEBRA_STRIPE_B
            );
        }

        const contentY = y + ROW_PADDING_TOP;

        doc.font('Helvetica').fontSize(TABLE_FONT_SIZE).fillColor(PDF_TABLE_TEXT);
        doc.text(row.userName, columns.margin, contentY, { width: columns.col1Width });

        if (!row.chapterGroups.length) {
            doc.text(EMPTY_PLACEHOLDER, columns.col2X, contentY, { width: columns.col2Width });
        } else {
            this.renderChapterGroups(
                doc,
                columns.col2X,
                contentY,
                columns.col2Width,
                row.chapterGroups
            );
        }

        const col2Bottom = doc.y;
        doc.font('Helvetica').fontSize(TABLE_FONT_SIZE);
        const nameHeight = doc.heightOfString(row.userName, { width: columns.col1Width });
        const rowBottom = Math.max(
            effectiveRowTop + rowHeight,
            Math.max(col2Bottom, contentY + nameHeight) + ROW_PADDING_BOTTOM
        );

        doc
            .strokeColor('#eeeeee')
            .lineWidth(0.5)
            .moveTo(columns.margin, rowBottom)
            .lineTo(columns.margin + columns.contentWidth, rowBottom)
            .stroke();

        doc.y = rowBottom;
        return rowBottom;
    }

    /**
     * Renders the chapter groups.
     *
     * @param doc - PDFKit doc
     * @param x - X position
     * @param startY - Start Y position
     * @param width - Width in points
     * @param groups - Chapter groups
     * @returns void
     */
    private renderChapterGroups(
        doc: ReportRenderContext['doc'],
        x: number,
        startY: number,
        width: number,
        groups: StudentAppendixChapterGroup[]
    ): void {
        let lineY = startY;

        for (const group of groups) {
            const prefix =
                group.chapterNum !== undefined ? `chapter ${group.chapterNum}: ` : '';
            const topicList = this.dataService.formatChapterTopicsList(group.topics);

            if (prefix && topicList) {
                doc.font('Helvetica-Bold')
                    .fillColor(PDF_TABLE_TEXT)
                    .text(prefix, x, lineY, { width, continued: true });
                doc.font('Helvetica').fillColor(PDF_TABLE_TEXT).text(topicList, { width });
            } else if (prefix) {
                doc.font('Helvetica-Bold')
                    .fillColor(PDF_TABLE_TEXT)
                    .text(prefix, x, lineY, { width });
            } else if (topicList) {
                doc.font('Helvetica')
                    .fillColor(PDF_TABLE_TEXT)
                    .text(topicList, x, lineY, { width });
            }

            lineY = doc.y;
        }
    }
}

// --- Phase section registry ---

/**
 * Resolves the sections for the report.
 *
 * @param input - Report build input
 * @param chartRenderer - Chart PNG adapter
 * @returns Sections
 */
function resolveSections(
    input: ReportBuildInput,
    chartRenderer: IStackedBarChartRenderer
): IReportSection[] {
    const sections: IReportSection[] = [
        new TitlePageSection(),
        new OutlinePageSection(),
        new DistributionPageSection(chartRenderer)
    ];

    if (input.phase === 'full' && (input.studentAppendix?.length ?? 0) > 0) {
        sections.push(new StudentAppendixSection());
    }

    return sections;
}

// --- PDFKit render loop ---

/**
 * Renders the report PDF document.
 *
 * @param sections - Sections
 * @param input - Report build input
 * @returns PDF buffer
 */
function renderReportPdfDocument(
    sections: IReportSection[],
    input: ReportBuildInput
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 54, autoFirstPage: true });
        const academicPeriod = input.academicPeriod ?? deriveAcademicPeriod(input.course.date);
        const context: ReportRenderContext = { doc, input, academicPeriod };
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        void (async () => {
            try {
                for (let i = 0; i < sections.length; i += 1) {
                    if (i > 0) {
                        doc.addPage();
                    }
                    await sections[i].render(context);
                }
                doc.end();
            } catch (err) {
                reject(err);
            }
        })();
    });
}

// --- ReportDocumentService ---

/**
 * Application service that orchestrates PDF page sections and chart rendering.
 *
 * Key methods: {@link getInstance}, {@link buildReportPdf}, {@link parseReportPdfPhase}.
 */
export class ReportDocumentService {
    private static instance: ReportDocumentService | null = null;
    private readonly chartRenderer: IStackedBarChartRenderer;

    private constructor(chartRenderer: IStackedBarChartRenderer = ChartJsStackedBarRenderer.getInstance()) {
        this.chartRenderer = chartRenderer;
    }

    /**
     * Returns the shared document assembly service.
     *
     * @returns ReportDocumentService singleton instance
     */
    public static getInstance(): ReportDocumentService {
        if (!ReportDocumentService.instance) {
            ReportDocumentService.instance = new ReportDocumentService();
        }
        return ReportDocumentService.instance;
    }

    /**
     * Builds struggle-topic PDF for the given phase (normalizes phase to prototype or full).
     *
     * @param input - Course, stats, phase, and optional pre-built appendix rows
     * @param chartRenderer - Optional override for tests; defaults to ChartJsStackedBarRenderer singleton
     * @returns PDF buffer and attachment filename
     */
    async buildReportPdf(
        input: ReportBuildInput,
        chartRenderer?: IStackedBarChartRenderer
    ): Promise<ReportPdfOutput> {
        const phase: ReportPdfPhase = input.phase === 'full' ? 'full' : 'prototype';
        const normalizedInput = { ...input, phase };
        const renderer = chartRenderer ?? this.chartRenderer;
        const academicPeriod =
            input.academicPeriod ?? deriveAcademicPeriod(normalizedInput.course.date);
        const filename = buildReportPdfFilename(normalizedInput.course.courseName, academicPeriod);
        const sections = resolveSections(normalizedInput, renderer);
        const buffer = await renderReportPdfDocument(sections, normalizedInput);

        return { buffer, filename };
    }

    /**
     * Normalizes query param to supported phase; unknown values fall back to prototype.
     *
     * @param raw - Raw `phase` query string from HTTP layer
     * @returns `full` only when raw is exactly `full`
     */
    parseReportPdfPhase(raw: string | undefined): ReportPdfPhase {
        if (raw === 'full') {
            return 'full';
        }
        return 'prototype';
    }
}

// --- buildReportPdf / parseReportPdfPhase (backward-compatible wrappers) ---

/**
 * Builds struggle-topic PDF for the given phase (default prototype).
 * Thin wrapper around {@link ReportDocumentService.buildReportPdf}.
 *
 * @param input - Course, stats, phase, and optional pre-built appendix rows
 * @param chartRenderer - Optional chart renderer for tests
 * @returns PDF buffer and attachment filename
 */
export async function buildReportPdf(
    input: ReportBuildInput,
    chartRenderer?: IStackedBarChartRenderer
): Promise<ReportPdfOutput> {
    return ReportDocumentService.getInstance().buildReportPdf(input, chartRenderer);
}

/**
 * Normalizes query param to supported phase; unknown values fall back to prototype.
 * Thin wrapper around {@link ReportDocumentService.parseReportPdfPhase}.
 *
 * @param raw - Raw `phase` query string
 * @returns Normalized report phase
 */
export function parseReportPdfPhase(raw: string | undefined): ReportPdfPhase {
    return ReportDocumentService.getInstance().parseReportPdfPhase(raw);
}
