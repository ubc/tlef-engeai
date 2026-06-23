import {
    validatePeriodDates,
    AcademicPeriodValidationError,
    DEFAULT_ACADEMIC_PERIOD_TITLE,
    linkCourseToPeriod,
    lazyMigrateCourseAcademicPeriod,
    ensureDefaultAcademicPeriod
} from '../academic-period-mongo';
import type { MongoDalContext } from '../mongo-context';

describe('academic-period-mongo', () => {
    describe('validatePeriodDates', () => {
        it('rejects endDate before startDate', () => {
            expect(() => validatePeriodDates('2026-01-06', '2026-01-01')).toThrow(
                AcademicPeriodValidationError
            );
        });

        it('accepts valid range', () => {
            expect(() => validatePeriodDates('2026-01-06', '2026-04-30')).not.toThrow();
        });
    });

    describe('ensureDefaultAcademicPeriod', () => {
        it('returns existing default period without insert', async () => {
            const existing = {
                id: 'period-1',
                title: DEFAULT_ACADEMIC_PERIOD_TITLE,
                startDate: new Date('2026-01-06'),
                endDate: new Date('2026-04-30'),
                courseIds: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const findOne = jest.fn().mockResolvedValue(existing);
            const insertOne = jest.fn();
            const ctx = {
                db: { collection: () => ({ findOne, insertOne }) },
                idGenerator: { uniqueIDGenerator: (s: string) => s }
            } as unknown as MongoDalContext;

            const result = await ensureDefaultAcademicPeriod(ctx);
            expect(result.id).toBe('period-1');
            expect(insertOne).not.toHaveBeenCalled();
        });
    });

    describe('linkCourseToPeriod', () => {
        it('sets academicPeriodId and addToSet on period', async () => {
            const courseUpdateOne = jest.fn().mockResolvedValue({});
            const periodUpdateOne = jest.fn().mockResolvedValue({});
            const courseFindOne = jest.fn().mockResolvedValue({
                id: 'c1',
                courseName: 'Test',
                academicPeriodId: undefined
            });
            const periodFindOne = jest.fn().mockResolvedValue({
                id: 'p1',
                title: DEFAULT_ACADEMIC_PERIOD_TITLE,
                courseIds: []
            });

            const ctx = {
                db: {
                    collection: (name: string) => {
                        if (name === 'active-course-list') {
                            return { findOne: courseFindOne, updateOne: courseUpdateOne };
                        }
                        return { findOne: periodFindOne, updateOne: periodUpdateOne };
                    }
                }
            } as unknown as MongoDalContext;

            await linkCourseToPeriod(ctx, 'c1', 'p1');

            expect(courseUpdateOne).toHaveBeenCalledWith(
                { id: 'c1' },
                expect.objectContaining({
                    $set: expect.objectContaining({ academicPeriodId: 'p1' })
                })
            );
            expect(periodUpdateOne).toHaveBeenCalledWith(
                { id: 'p1' },
                expect.objectContaining({ $addToSet: { courseIds: 'c1' } })
            );
        });
    });

    describe('lazyMigrateCourseAcademicPeriod (AP-001)', () => {
        it('no-ops when academicPeriodId already set', async () => {
            const course = { id: 'c1', academicPeriodId: 'p-existing' } as any;
            const result = await lazyMigrateCourseAcademicPeriod({} as MongoDalContext, course);
            expect(result.academicPeriodId).toBe('p-existing');
        });
    });
});
