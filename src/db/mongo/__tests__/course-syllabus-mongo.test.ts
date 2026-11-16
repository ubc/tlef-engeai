/**
 * course-syllabus-mongo — Course Syllabus records on the active course (#674).
 */

const updateOne = jest.fn();

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(() => ({ updateOne }))
}));

import type { MongoDalContext } from '../mongo-context';
import { addSyllabusMaterial, clearSyllabusMaterials, removeSyllabusMaterial } from '../course-syllabus-mongo';
import type { AdditionalMaterial } from '../../../types/shared';

const ctx = { db: {} } as unknown as MongoDalContext;
const material = { id: 'syl-1', name: 'Outline' } as AdditionalMaterial;

describe('course-syllabus-mongo', () => {
    beforeEach(() => {
        updateOne.mockReset();
        updateOne.mockResolvedValue({ matchedCount: 1 });
    });

    it('pushes a syllabus document onto the course', async () => {
        await expect(addSyllabusMaterial(ctx, 'course-1', material)).resolves.toBe(true);
        expect(updateOne).toHaveBeenCalledWith(
            { id: 'course-1' },
            expect.objectContaining({ $push: { syllabusMaterials: material } })
        );
    });

    it('pulls one syllabus document by id', async () => {
        await expect(removeSyllabusMaterial(ctx, 'course-1', 'syl-1')).resolves.toBe(true);
        expect(updateOne).toHaveBeenCalledWith(
            { id: 'course-1' },
            expect.objectContaining({ $pull: { syllabusMaterials: { id: 'syl-1' } } })
        );
    });

    it('clears every syllabus document', async () => {
        await expect(clearSyllabusMaterials(ctx, 'course-1')).resolves.toBe(true);
        expect(updateOne).toHaveBeenCalledWith(
            { id: 'course-1' },
            expect.objectContaining({ $unset: { syllabusMaterials: 1 } })
        );
    });

    it('reports a missing course', async () => {
        updateOne.mockResolvedValue({ matchedCount: 0 });
        await expect(addSyllabusMaterial(ctx, 'missing', material)).resolves.toBe(false);
    });
});
