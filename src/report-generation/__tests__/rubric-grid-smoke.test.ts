/**
 * Rubric grid smoke test — the measured geometry survives a real PDFKit render
 *
 * measureRubricGrid is arithmetic and is tested on its own. This confirms the drawing it
 * drives actually produces a document at both orientations and at the extremes of the grid
 * contract, rather than throwing on a page it mis-measured.
 */

import PDFDocument from 'pdfkit';
import { renderRubricGrid } from '../rubric-grid-renderer';
import type { StaffFinalAssessment, WritingRubricDefinition } from '../../writing-feedback/contracts';

function rubricWith(levelCount: number, criterionCount: number): WritingRubricDefinition {
    return {
        version: 1, status: 'approved', title: 'Grid',
        task: 't', audience: 'a', purpose: 'p',
        constraints: [], learningOutcomes: [], gradingIntent: 'g',
        updatedAt: new Date(), updatedBy: 'u1',
        levels: Array.from({ length: levelCount }, (_, index) => ({
            id: `level_${index + 1}`, label: `Level ${index + 1}`,
            description: 'd', rank: index + 1
        })),
        criteria: Array.from({ length: criterionCount }, (_, row) => ({
            id: `criterion_${row + 1}`, label: `Criterion ${row + 1}`,
            description: 'd', points: 20,
            cells: Object.fromEntries(Array.from({ length: levelCount }, (_, index) => [
                `level_${index + 1}`,
                { min: index * 5, max: index * 5 + 4, descriptor: 'D'.repeat(400) }
            ]))
        }))
    } as WritingRubricDefinition;
}

function assessmentFor(rubric: WritingRubricDefinition): StaffFinalAssessment {
    return {
        lens: 'technical',
        rubricVersion: 1,
        criteria: rubric.criteria.map((criterion) => ({ criterionId: criterion.id, points: 7 })),
        totalPoints: rubric.criteria.length * 7,
        maxPoints: rubric.criteria.length * 20
    };
}

function render(rubric: WritingRubricDefinition): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 64, bufferPages: true });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        try {
            renderRubricGrid(doc, rubric, assessmentFor(rubric));
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/** The earned-cell fill, as PDFKit writes #e4efe4 into an uncompressed content stream. */
const EARNED_FILL_OP = '0.8941176470588236 0.9372549019607843 0.8941176470588236 scn';

/** How many cells the grid painted as earned. */
function countEarnedFills(pdf: Buffer): number {
    return pdf.toString('latin1').split(EARNED_FILL_OP).length - 1;
}

/** Renders without compression, so the drawing operators can be counted. */
function renderUncompressed(rubric: WritingRubricDefinition, assessment: StaffFinalAssessment): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 64, bufferPages: true, compress: false });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        try {
            renderRubricGrid(doc, rubric, assessment);
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

describe('renderRubricGrid', () => {
    it('renders a portrait grid at the narrow end of the contract', async () => {
        const pdf = await render(rubricWith(2, 1));
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('renders a landscape grid at the wide end, paginating a long rubric', async () => {
        const pdf = await render(rubricWith(8, 10));
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.length).toBeGreaterThan(1000);
    });

    it('marks the top level when the awarded points sit above every band', async () => {
        // spaceBandsEvenly produces contiguous bands, but an imported Canvas rubric can leave
        // gaps. Points outside every band are clamped to the highest level they reach rather
        // than leaving the row unmarked, so a staff-final grade always shows a level.
        const rubric = rubricWith(4, 2);
        const assessment = { ...assessmentFor(rubric), criteria: rubric.criteria.map((c) => ({ criterionId: c.id, points: 99 })) };
        const pdf = await renderUncompressed(rubric, assessment);
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(countEarnedFills(pdf)).toBe(rubric.criteria.length);
    });

    it('marks every criterion of a rubric that authored no cells', async () => {
        // cells is sparse (D-060). Reading it directly left every unbanded criterion
        // unmarked, so a grid drew one green cell at most however many criteria it had.
        const rubric = rubricWith(4, 5);
        rubric.criteria.forEach((criterion) => { delete criterion.cells; });
        const pdf = await renderUncompressed(rubric, assessmentFor(rubric));
        expect(countEarnedFills(pdf)).toBe(5);
    });

    it('marks every criterion whose bands collapsed onto single values', async () => {
        // The superseded D-072 stored min === max, so only a grade landing exactly on a
        // band value was ever marked.
        const rubric = rubricWith(4, 3);
        rubric.criteria.forEach((criterion) => {
            criterion.cells = Object.fromEntries(rubric.levels.map((level, index) => [
                level.id, { min: index * 5, max: index * 5, descriptor: 'D' }
            ]));
        });
        const pdf = await renderUncompressed(rubric, assessmentFor(rubric));
        expect(countEarnedFills(pdf)).toBe(3);
    });
});
