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

    it('renders when no awarded points fall inside any band', async () => {
        // spaceBandsEvenly produces contiguous bands, but an imported Canvas rubric can leave
        // gaps; the grid must still draw, just without marking a cell.
        const rubric = rubricWith(4, 2);
        const assessment = { ...assessmentFor(rubric), criteria: rubric.criteria.map((c) => ({ criterionId: c.id, points: 99 })) };
        const pdf = await new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ size: 'LETTER', margin: 64, bufferPages: true });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            renderRubricGrid(doc, rubric, assessment);
            doc.end();
        });
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });
});
