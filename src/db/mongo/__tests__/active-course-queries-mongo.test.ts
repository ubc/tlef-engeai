import type { Db } from 'mongodb';
import { fetchActiveCourseDocById, fetchActiveCourseDocByCourseName } from '../active-course-queries-mongo';

function makeDb(courseDoc: Record<string, unknown> | null) {
    return {
        collection: (_name: string) => ({
            findOne: async (query: Record<string, unknown>) => {
                if (query.id && courseDoc && courseDoc.id === query.id) return courseDoc;
                if (typeof query.courseName === 'string' && courseDoc?.courseName === query.courseName) {
                    return courseDoc;
                }
                if (
                    query.courseName &&
                    typeof query.courseName === 'object' &&
                    (query.courseName as any).$regex &&
                    typeof courseDoc?.courseName === 'string'
                ) {
                    const re = (query.courseName as any).$regex as RegExp;
                    if (re.test(String(courseDoc.courseName))) return courseDoc;
                }
                return null;
            }
        })
    } as Db;
}

describe('active-course-queries-mongo', () => {
    it('fetchActiveCourseDocById returns match', async () => {
        const doc = { id: 'x', courseName: 'Foo' };
        const db = makeDb(doc);
        await expect(fetchActiveCourseDocById(db, 'x')).resolves.toEqual(doc as any);
    });

    it('fetchActiveCourseDocByCourseName uses exact match', async () => {
        const doc = { id: 'c1', courseName: 'Chem101' };
        const db = makeDb(doc);
        await expect(fetchActiveCourseDocByCourseName(db, 'Chem101')).resolves.toEqual(doc as any);
    });

    it('fetchActiveCourseDocByCourseName falls back to regex', async () => {
        const doc = { id: 'c1', courseName: 'chem101' };
        const db = makeDb(doc);
        await expect(fetchActiveCourseDocByCourseName(db, 'Chem101')).resolves.toEqual(doc as any);
    });
});
