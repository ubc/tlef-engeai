import PDFDocument from 'pdfkit';
import {
    heightOfChapterGroup,
    heightOfWrappedText,
    measureAppendixRowContentHeight,
    type AppendixLayoutDoc
} from '../report-document';
import { formatChapterTopicsList } from '../report-data';
import type { StudentAppendixChapterGroup, StudentAppendixPdfRow } from '../report-contracts';

function createLayoutDoc(fontSize = 10): AppendixLayoutDoc {
    const doc = new PDFDocument({ margin: 54 });
    doc.font('Helvetica').fontSize(fontSize);
    return doc;
}

function plainFullWidthHeight(
    doc: AppendixLayoutDoc,
    prefix: string,
    topics: string[],
    colWidth: number,
    fontSize: number
): number {
    const line = prefix + formatChapterTopicsList(topics);
    doc.font('Helvetica').fontSize(fontSize);
    return doc.heightOfString(line, { width: colWidth });
}

describe('appendix-chapter-group-layout', () => {
    const colWidth = 200;
    const fontSize = 10;

    it('measures single topic in one chapter as roughly one line', () => {
        const doc = createLayoutDoc(fontSize);
        const group: StudentAppendixChapterGroup = { chapterNum: 1, topics: ['enthalpy'] };
        const height = heightOfChapterGroup(doc, group, colWidth, fontSize);
        const oneLine = doc.heightOfString('chapter 1: enthalpy', { width: colWidth });

        expect(height).toBeGreaterThan(0);
        expect(height).toBeLessThanOrEqual(oneLine * 1.5);
    });

    it('bins two topics in the same chapter with comma-joined height', () => {
        const doc = createLayoutDoc(fontSize);
        const group: StudentAppendixChapterGroup = {
            chapterNum: 2,
            topics: ['enthalpy', 'entropy']
        };
        const height = heightOfChapterGroup(doc, group, colWidth, fontSize);
        const twoLineCap = doc.heightOfString('chapter 2: enthalpy, entropy', { width: colWidth }) * 2;

        expect(height).toBeGreaterThan(0);
        expect(height).toBeLessThanOrEqual(twoLineCap);
    });

    it('measures bold-prefix continued layout taller than plain full-width string (chapter 7 regression)', () => {
        const doc = createLayoutDoc(fontSize);
        const topics = [
            'steady-state energy balance',
            'heat exchanger effectiveness',
            'log mean temperature difference',
            'counterflow vs parallel flow'
        ];
        const group: StudentAppendixChapterGroup = { chapterNum: 7, topics };
        const prefix = 'chapter 7: ';

        const continuedHeight = heightOfChapterGroup(doc, group, colWidth, fontSize);
        const plainHeight = plainFullWidthHeight(doc, prefix, topics, colWidth, fontSize);

        expect(continuedHeight).toBeGreaterThanOrEqual(plainHeight);
    });

    it('wraps an over-wide prefix alone before topics on the next line', () => {
        const doc = createLayoutDoc(fontSize);
        const narrowWidth = 60;
        const group: StudentAppendixChapterGroup = {
            chapterNum: 12,
            topics: ['topic']
        };

        const height = heightOfChapterGroup(doc, group, narrowWidth, fontSize);
        const prefixOnly = doc
            .font('Helvetica-Bold')
            .fontSize(fontSize)
            .heightOfString('chapter 12: ', { width: narrowWidth });
        const topicsOnly = heightOfWrappedText(doc, 'topic', narrowWidth, 'Helvetica', fontSize);

        expect(height).toBeGreaterThanOrEqual(prefixOnly + topicsOnly - 1);
    });

    it('measureAppendixRowContentHeight uses max of name and topics columns', () => {
        const doc = createLayoutDoc(fontSize);
        const row: StudentAppendixPdfRow = {
            userName: 'Bowen Zheng',
            chapterGroups: [
                {
                    chapterNum: 7,
                    topics: ['steady-state energy balance', 'heat exchanger effectiveness']
                }
            ]
        };

        const rowHeight = measureAppendixRowContentHeight(doc, row, 120, colWidth, fontSize);
        const nameHeight = heightOfWrappedText(doc, row.userName, 120, 'Helvetica', fontSize);
        const topicsHeight = heightOfChapterGroup(doc, row.chapterGroups[0], colWidth, fontSize);

        expect(rowHeight).toBe(Math.max(nameHeight, topicsHeight));
    });

    it('measureAppendixRowContentHeight handles empty chapter groups with placeholder height', () => {
        const doc = createLayoutDoc(fontSize);
        const row: StudentAppendixPdfRow = { userName: 'No Topics', chapterGroups: [] };

        const rowHeight = measureAppendixRowContentHeight(doc, row, 120, colWidth, fontSize);
        const placeholderHeight = doc.heightOfString('—', { width: colWidth });

        expect(rowHeight).toBeGreaterThanOrEqual(placeholderHeight);
    });
});
