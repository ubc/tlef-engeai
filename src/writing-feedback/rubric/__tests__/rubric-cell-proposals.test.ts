/**
 * Rubric cell proposal tests — descriptions EngE-AI writes where the instructor wrote none
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for proposing, placing, and counting suggested rating descriptions.
 */

import { buildCellProposalPrompt, countProposedCells, proposeCellDescriptions } from '../rubric-cell-proposals';
import type { ImportedRubricShape } from '../../contracts';

const shape: ImportedRubricShape = {
    levels: [
        { id: 'not_met', label: 'Not met', description: 'd', rank: 1 },
        { id: 'met', label: 'Met', description: 'd', rank: 2 }
    ],
    criteria: [
        { id: 'front_matter', label: 'Front matter', description: '- Title page is unnumbered.', points: 4,
          cells: { not_met: { min: 0, max: 2 }, met: { min: 3, max: 4 } } },
        { id: 'thesis', label: 'Thesis', description: 'd', points: 4,
          cells: { not_met: { min: 0, max: 2, descriptor: 'Copied', origin: 'source' }, met: { min: 3, max: 4, descriptor: 'Copied', origin: 'source' } } }
    ]
};
const context = { title: 'Design report', task: 'Write a report.', audience: 'Engineers', purpose: 'Recommend a design.' };

function answering(criteria: unknown) {
    return { sendStructuredConversation: jest.fn().mockResolvedValue({ parsed: { criteria } }) };
}

describe('proposeCellDescriptions', () => {
    it('fills only the named rows\' empty cells, marking each as proposed', async () => {
        const llm = answering([
            { criterionId: 'front_matter', descriptions: [{ levelId: 'not_met', text: 'Items are missing.' }, { levelId: 'met', text: 'Every item is present.' }] },
            { criterionId: 'thesis', descriptions: [{ levelId: 'met', text: 'Should be ignored.' }] }
        ]);
        const result = await proposeCellDescriptions(shape, { cells: ['front_matter'], descriptions: [] }, context, llm as never);

        expect(result.proposed).toBe(2);
        expect(result.shape.criteria[0]!.cells!.met).toEqual({ min: 3, max: 4, descriptor: 'Every item is present.', origin: 'proposed' });
        expect(result.shape.criteria[1]!.cells!.met!.descriptor).toBe('Copied');
        expect(shape.criteria[0]!.cells!.met!.descriptor).toBeUndefined();
    });

    it('ignores levels the grid does not have', async () => {
        const llm = answering([{ criterionId: 'front_matter', descriptions: [{ levelId: 'excellent', text: 'x' }] }]);

        expect((await proposeCellDescriptions(shape, { cells: ['front_matter'], descriptions: [] }, context, llm as never)).proposed).toBe(0);
    });

    it('hides the model\'s own error', async () => {
        const failing = { sendStructuredConversation: jest.fn().mockRejectedValue(new Error('echoed prompt')) };

        await expect(proposeCellDescriptions(shape, { cells: ['front_matter'], descriptions: [] }, context, failing as never))
            .rejects.toThrow('Rating descriptions could not be proposed');
    });

    it('asks nothing when no row needs describing', async () => {
        const llm = answering([]);
        await proposeCellDescriptions(shape, { cells: [], descriptions: [] }, context, llm as never);

        expect(llm.sendStructuredConversation).not.toHaveBeenCalled();
    });
});

describe('proposing criterion descriptions', () => {
    it('writes a description only for the criteria named for one, marking it proposed', async () => {
        const llm = answering([
            { criterionId: 'front_matter', description: 'Whether the report opens with the required front matter.', descriptions: [] },
            { criterionId: 'thesis', description: 'Should be ignored.', descriptions: [] }
        ]);
        const result = await proposeCellDescriptions(shape, { cells: [], descriptions: ['front_matter'] }, context, llm as never);

        expect(result.proposed).toBe(1);
        expect(result.shape.criteria[0]).toMatchObject({
            description: 'Whether the report opens with the required front matter.', descriptionOrigin: 'proposed'
        });
        expect(result.shape.criteria[1]!.description).toBe('d');
        expect(result.shape.criteria[0]!.cells!.met!.descriptor).toBeUndefined();
    });

    it('asks for a description without showing the placeholder as the instructor\'s words', () => {
        const prompt = buildCellProposalPrompt(shape, { cells: ['front_matter'], descriptions: ['front_matter'] }, context);

        expect(prompt).toContain('— write a description and every level');
        expect(prompt).not.toContain('Title page is unnumbered.');
    });

    it('counts suggested criterion descriptions with suggested cells', () => {
        expect(countProposedCells([{ ...shape.criteria[1]!, descriptionOrigin: 'proposed' as const }])).toBe(1);
    });
});

describe('buildCellProposalPrompt', () => {
    it('names only the rows to describe, with the instructor\'s own wording', () => {
        const prompt = buildCellProposalPrompt(shape, { cells: ['front_matter'], descriptions: [] }, context);

        expect(prompt).toContain('- front_matter: Front matter (4 points) — write every level');
        expect(prompt).toContain('Title page is unnumbered.');
        expect(prompt).not.toContain('- thesis:');
        expect(prompt).toMatch(/Do not mention points/);
        expect(prompt).toMatch(/Never comment on the assignment details, the rubric/);
    });
});

describe('countProposedCells', () => {
    it('counts cells still marked proposed', () => {
        const withProposal = [{ ...shape.criteria[0]!, cells: { met: { min: 3, max: 4, descriptor: 'x', origin: 'proposed' as const } } }];

        expect(countProposedCells(withProposal)).toBe(1);
        expect(countProposedCells(shape.criteria)).toBe(0);
    });
});
