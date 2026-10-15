/**
 * Rubric grid geometry tests
 *
 * The grid is the student's answer to "where did my grade come from", so it has to stay
 * readable: columns wide enough to wrap a descriptor, and page breaks that never separate a
 * criterion from the levels describing it. Measurement is pure arithmetic and is tested here;
 * the drawing it drives is exercised through the report's own suite.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for rubric grid column sizing, orientation, and page breaking.
 */

import { measureRubricGrid, MIN_GRID_COLUMN_WIDTH } from '../rubric-grid-renderer';
import type { WritingRubricDefinition } from '../../writing-feedback/contracts';

/** LETTER minus the report's 64pt margins, measured below a section heading. */
const page = { portraitWidth: 612 - 128, landscapeWidth: 792 - 128, availableHeight: 600 };

function rubricWith(levelCount: number, criterionCount = 3, descriptorLength = 400): WritingRubricDefinition {
    return {
        version: 1,
        status: 'approved',
        title: 'Grid',
        task: 't', audience: 'a', purpose: 'p',
        constraints: [], learningOutcomes: [], gradingIntent: 'g',
        updatedAt: new Date(), updatedBy: 'u1',
        levels: Array.from({ length: levelCount }, (_, index) => ({
            id: `level_${index + 1}`,
            label: `Level ${index + 1}`,
            description: 'Level description',
            rank: index + 1
        })),
        criteria: Array.from({ length: criterionCount }, (_, row) => ({
            id: `criterion_${row + 1}`,
            label: `Criterion ${row + 1}`,
            description: 'Criterion description',
            points: 20,
            cells: Object.fromEntries(Array.from({ length: levelCount }, (_, index) => [
                `level_${index + 1}`,
                { min: index * 4, max: index * 4 + 3, descriptor: 'D'.repeat(descriptorLength) }
            ]))
        }))
    } as WritingRubricDefinition;
}

describe('measureRubricGrid', () => {
    /** The report's turned LETTER page inside its 64pt margins. */
    const landscapePage = { ...page, landscapeAvailableHeight: 612 - 128 };
    /** The repeated column header every page of the grid starts with. */
    const headerHeight = 8.5 * 2 + 4 * 2;

    it('keeps the normal descriptor size wherever a row already fits a page', () => {
        expect(new Set(measureRubricGrid(rubricWith(8), landscapePage).descriptorSizes)).toEqual(new Set([7.5]));
        expect(new Set(measureRubricGrid(rubricWith(4, 3, 800), page).descriptorSizes)).toEqual(new Set([7.5]));
    });

    it('shrinks the descriptors of a row too tall for a page until it fits', () => {
        const shortPage = { ...page, landscapeAvailableHeight: 400 };
        const geometry = measureRubricGrid(rubricWith(8, 3, 800), shortPage);
        geometry.rowHeights.forEach((height) => {
            expect(height).toBeLessThanOrEqual(shortPage.landscapeAvailableHeight - headerHeight);
        });
        expect(Math.max(...geometry.descriptorSizes)).toBeLessThan(7.5);
    });

    it('stays portrait at four levels or fewer', () => {
        expect(measureRubricGrid(rubricWith(4), page).landscape).toBe(false);
        expect(measureRubricGrid(rubricWith(2), page).landscape).toBe(false);
    });

    it('turns the page at five levels or more', () => {
        expect(measureRubricGrid(rubricWith(5), page).landscape).toBe(true);
        expect(measureRubricGrid(rubricWith(8), page).landscape).toBe(true);
    });

    it('never returns a column narrower than the readable minimum', () => {
        for (let levels = 2; levels <= 8; levels += 1) {
            expect(measureRubricGrid(rubricWith(levels), page).columnWidth)
                .toBeGreaterThanOrEqual(MIN_GRID_COLUMN_WIDTH);
        }
    });

    it('fits the criterion column and every level column inside the page', () => {
        for (let levels = 2; levels <= 8; levels += 1) {
            const geometry = measureRubricGrid(rubricWith(levels), page);
            const usable = geometry.landscape ? page.landscapeWidth : page.portraitWidth;
            const total = geometry.criterionColumnWidth + geometry.columnWidth * levels;
            expect(total).toBeLessThanOrEqual(usable + 0.001);
        }
    });

    it('measures one row height per criterion', () => {
        expect(measureRubricGrid(rubricWith(4, 6), page).rowHeights).toHaveLength(6);
    });

    it('breaks pages between criteria, never inside one', () => {
        const geometry = measureRubricGrid(rubricWith(8, 10), { ...page, availableHeight: 200 });
        geometry.pageBreakAfter.forEach((index) => {
            expect(Number.isInteger(index)).toBe(true);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(geometry.rowHeights.length - 1);
        });
        // Strictly increasing: a break is recorded once, in row order.
        expect([...geometry.pageBreakAfter].sort((a, b) => a - b)).toEqual(geometry.pageBreakAfter);
        expect(new Set(geometry.pageBreakAfter).size).toBe(geometry.pageBreakAfter.length);
    });

    it('needs no page break when every row fits', () => {
        expect(measureRubricGrid(rubricWith(2, 2), { ...page, availableHeight: 5000 }).pageBreakAfter).toEqual([]);
    });

    it('gives a taller row to a criterion carrying longer descriptors', () => {
        const short = rubricWith(4, 1);
        const long = rubricWith(4, 1);
        // Every cell, not one: the row is as tall as its tallest descriptor.
        Object.values(short.criteria[0].cells!).forEach((cell) => { cell.descriptor = 'Short.'; });
        expect(measureRubricGrid(long, page).rowHeights[0])
            .toBeGreaterThan(measureRubricGrid(short, page).rowHeights[0]);
    });
});
