import * as fs from 'fs';
import * as path from 'path';
import type { Db } from 'mongodb';
import { IDGenerator } from '../../../utils/unique-id-generator';
import type { MongoDalContext } from '../mongo-context';
import {
    buildReportFixtureSyntheticPuid,
    parseStruggleTopicsByStudentBody,
    ReportFixtureSeedError,
    REPORT_FIXTURE_PUID_PREFIX,
    REPORT_FIXTURE_TARGET_COURSE_NAME,
    seedReportFixture
} from '../report-fixture-seed-mongo';

type CourseDoc = { id: string; courseName: string };
type CourseUserDoc = {
    userId: string;
    name: string;
    affiliation: string;
    chats: unknown[];
    courseName?: string;
    courseId?: string;
};
type GlobalUserDoc = {
    puid: string;
    userId: string;
    name: string;
    affiliation: string;
    coursesEnrolled: string[];
};
type MemoryAgentDoc = {
    userId: string;
    name: string;
    struggleTopics?: string[];
    struggleTopicsByChapter?: Array<{
        topicOrWeekId: string;
        topicOrWeekTitle: string;
        struggleTopics: string[];
    }>;
};

const committedSamplePath = path.join(__dirname, 'fixtures', 'test3-seed-sample.json');
const committedSample = JSON.parse(fs.readFileSync(committedSamplePath, 'utf8')) as Record<string, string[]>;

function makeCtx(state: {
    course: CourseDoc | null;
    users: CourseUserDoc[];
    globalUsers: GlobalUserDoc[];
    memoryAgent: MemoryAgentDoc[];
}): MongoDalContext {
    const idGenerator = IDGenerator.getInstance();
    const usersCollectionName = `${REPORT_FIXTURE_TARGET_COURSE_NAME}_users`;
    const memoryCollectionName = `${REPORT_FIXTURE_TARGET_COURSE_NAME}_memory-agent`;

    const db = {
        collection: (name: string) => {
            if (name === 'active-course-list') {
                return {
                    findOne: async (filter: { id?: string }) =>
                        filter.id === state.course?.id ? state.course : null,
                    aggregate: () => ({
                        toArray: async () => []
                    })
                };
            }
            if (name === usersCollectionName) {
                return {
                    deleteMany: async (filter: { affiliation?: string }) => {
                        const before = state.users.length;
                        if (filter.affiliation) {
                            const kept = state.users.filter((u) => u.affiliation !== filter.affiliation);
                            const removed = state.users.filter((u) => u.affiliation === filter.affiliation);
                            state.users.length = 0;
                            state.users.push(...kept);
                            return { deletedCount: removed.length };
                        }
                        state.users.length = 0;
                        return { deletedCount: before };
                    },
                    updateMany: async (filter: { affiliation?: string }, update: { $set?: Partial<CourseUserDoc> }) => {
                        let modified = 0;
                        for (const user of state.users) {
                            if (filter.affiliation && user.affiliation !== filter.affiliation) {
                                continue;
                            }
                            if (update.$set) {
                                Object.assign(user, update.$set);
                            }
                            modified += 1;
                        }
                        return { modifiedCount: modified };
                    },
                    updateOne: async (filter: { userId?: string }, update: { $set?: Partial<CourseUserDoc> }) => {
                        const user = state.users.find((u) => u.userId === filter.userId);
                        if (!user || !update.$set) {
                            return { matchedCount: 0, modifiedCount: 0 };
                        }
                        Object.assign(user, update.$set);
                        return { matchedCount: 1, modifiedCount: 1 };
                    },
                    findOne: async (filter: { userId?: string; puid?: string }) => {
                        if (filter.userId) {
                            return state.users.find((u) => u.userId === filter.userId) ?? null;
                        }
                        return null;
                    },
                    insertOne: async (doc: CourseUserDoc) => {
                        state.users.push(doc);
                    }
                };
            }
            if (name === memoryCollectionName) {
                return {
                    deleteMany: async () => {
                        const count = state.memoryAgent.length;
                        state.memoryAgent.length = 0;
                        return { deletedCount: count };
                    },
                    insertOne: async (doc: MemoryAgentDoc) => {
                        state.memoryAgent.push(doc);
                    },
                    findOne: async () => null
                };
            }
            if (name === 'active-users') {
                return {
                    findOne: async (filter: { puid?: string }) =>
                        state.globalUsers.find((g) => g.puid === filter.puid) ?? null,
                    insertOne: async (doc: GlobalUserDoc) => {
                        state.globalUsers.push(doc);
                    },
                    deleteMany: async (filter: { puid?: { $regex?: string } }) => {
                        const pattern = filter.puid?.$regex;
                        if (!pattern) {
                            const count = state.globalUsers.length;
                            state.globalUsers.length = 0;
                            return { deletedCount: count };
                        }
                        const regex = new RegExp(pattern);
                        const kept = state.globalUsers.filter((g) => !regex.test(g.puid));
                        const removed = state.globalUsers.length - kept.length;
                        state.globalUsers.length = 0;
                        state.globalUsers.push(...kept);
                        return { deletedCount: removed };
                    },
                    updateMany: async (
                        filter: { affiliation?: string; coursesEnrolled?: string },
                        update: { $addToSet?: { coursesEnrolled: string }; $pull?: { coursesEnrolled: string }; $set?: { updatedAt: Date } }
                    ) => {
                        let modified = 0;
                        for (const user of state.globalUsers) {
                            if (filter.affiliation && user.affiliation !== filter.affiliation) {
                                continue;
                            }
                            if (filter.coursesEnrolled && !user.coursesEnrolled.includes(filter.coursesEnrolled)) {
                                continue;
                            }
                            if (update.$addToSet?.coursesEnrolled) {
                                if (!user.coursesEnrolled.includes(update.$addToSet.coursesEnrolled)) {
                                    user.coursesEnrolled.push(update.$addToSet.coursesEnrolled);
                                }
                            }
                            if (update.$pull?.coursesEnrolled) {
                                user.coursesEnrolled = user.coursesEnrolled.filter(
                                    (id) => id !== update.$pull!.coursesEnrolled
                                );
                            }
                            modified += 1;
                        }
                        return { modifiedCount: modified };
                    },
                    updateOne: async (filter: { puid?: string }, update: { $addToSet?: { coursesEnrolled: string } }) => {
                        const user = state.globalUsers.find((g) => g.puid === filter.puid);
                        if (!user || !update.$addToSet?.coursesEnrolled) {
                            return { matchedCount: 0 };
                        }
                        if (!user.coursesEnrolled.includes(update.$addToSet.coursesEnrolled)) {
                            user.coursesEnrolled.push(update.$addToSet.coursesEnrolled);
                        }
                        return { matchedCount: 1 };
                    }
                };
            }
            throw new Error(`Unexpected collection: ${name}`);
        }
    } as unknown as Db;

    return {
        db,
        idGenerator,
        collectionNamesCache: new Map([
            [
                REPORT_FIXTURE_TARGET_COURSE_NAME,
                {
                    users: usersCollectionName,
                    flags: `${REPORT_FIXTURE_TARGET_COURSE_NAME}_flags`,
                    memoryAgent: memoryCollectionName,
                    scheduledTasks: `${REPORT_FIXTURE_TARGET_COURSE_NAME}_scheduled-tasks`,
                    scenarioQuestions: `${REPORT_FIXTURE_TARGET_COURSE_NAME}_scenario_questions`
                }
            ]
        ]),
        scheduledTasksIndexesEnsured: new Set<string>()
    };
}

describe('report-fixture-seed-mongo', () => {
    const courseId = 'course-test-3';
    const payload = committedSample;

    it('buildReportFixtureSyntheticPuid is deterministic', () => {
        const a = buildReportFixtureSyntheticPuid('Ali Al-Jubouri');
        const b = buildReportFixtureSyntheticPuid('Ali Al-Jubouri');
        expect(a).toBe(b);
        expect(a.startsWith(REPORT_FIXTURE_PUID_PREFIX)).toBe(true);
        expect(a).toBe('seed-test3-ali-al-jubouri');
    });

    it('parseStruggleTopicsByStudentBody accepts valid payload', () => {
        expect(parseStruggleTopicsByStudentBody({ struggleTopicsByStudent: payload })).toEqual(payload);
    });

    it('parseStruggleTopicsByStudentBody accepts committed test3-seed-sample.json shape', () => {
        expect(parseStruggleTopicsByStudentBody({ struggleTopicsByStudent: committedSample })).toEqual(
            committedSample
        );
    });

    it('parseStruggleTopicsByStudentBody rejects empty object', () => {
        expect(parseStruggleTopicsByStudentBody({ struggleTopicsByStudent: {} })).toBeNull();
    });

    it('rejects missing course', async () => {
        const ctx = makeCtx({
            course: null,
            users: [],
            globalUsers: [],
            memoryAgent: []
        });
        await expect(seedReportFixture(ctx, courseId, payload)).rejects.toMatchObject({
            code: 'COURSE_NOT_FOUND'
        } satisfies Partial<ReportFixtureSeedError>);
    });

    it('rejects wrong course', async () => {
        const ctx = makeCtx({
            course: { id: courseId, courseName: 'APSC_V 183: Matter and Energy II' },
            users: [],
            globalUsers: [],
            memoryAgent: []
        });
        await expect(seedReportFixture(ctx, courseId, payload)).rejects.toMatchObject({
            code: 'WRONG_COURSE'
        } satisfies Partial<ReportFixtureSeedError>);
    });

    it('removes all prior students then imports only JSON roster', async () => {
        const puid = buildReportFixtureSyntheticPuid('Ali Al-Jubouri');
        const userId = IDGenerator.getInstance().globalUserID(puid, 'Ali Al-Jubouri', 'student');

        const state = {
            course: { id: courseId, courseName: REPORT_FIXTURE_TARGET_COURSE_NAME },
            users: [
                {
                    userId,
                    name: 'Ali Al-Jubouri',
                    affiliation: 'student',
                    chats: [{ id: 'chat-1' }]
                },
                {
                    userId: 'mock-student-leftover',
                    name: 'Mock Student',
                    affiliation: 'student',
                    chats: [{ id: 'chat-old' }]
                },
                {
                    userId: 'instructor-1',
                    name: 'Instructor',
                    affiliation: 'faculty',
                    chats: []
                }
            ] as CourseUserDoc[],
            globalUsers: [
                {
                    puid: 'seed-test3-old-fixture',
                    userId: 'old-fixture-user',
                    name: 'Old Fixture',
                    affiliation: 'student',
                    coursesEnrolled: [courseId]
                },
                {
                    puid: 'dev-mock-puid',
                    userId: 'mock-student-leftover',
                    name: 'Mock Student',
                    affiliation: 'student',
                    coursesEnrolled: [courseId]
                }
            ] as GlobalUserDoc[],
            memoryAgent: [{ userId, name: 'Ali Al-Jubouri', struggleTopics: ['old topic'] }] as MemoryAgentDoc[]
        };
        const ctx = makeCtx(state);

        const summary = await seedReportFixture(ctx, courseId, payload);

        expect(summary.studentsSeeded).toBe(2);
        expect(summary.memoryAgentRowsCreated).toBe(2);
        expect(summary.studentsRemoved).toBe(2);
        expect(summary.syntheticGlobalUsersRemoved).toBe(1);
        expect(summary.globalStudentsUnenrolled).toBe(1);
        expect(state.users).toHaveLength(3);
        expect(state.users.filter((u) => u.affiliation === 'student')).toHaveLength(2);
        expect(state.users.find((u) => u.userId === 'mock-student-leftover')).toBeUndefined();
        expect(state.users.find((u) => u.userId === 'instructor-1')).toBeDefined();
        expect(state.globalUsers.find((g) => g.puid === 'seed-test3-old-fixture')).toBeUndefined();
        expect(state.globalUsers.find((g) => g.puid === 'dev-mock-puid')?.coursesEnrolled).toEqual([]);
        expect(state.memoryAgent).toHaveLength(2);
        expect(state.memoryAgent.every((row) => !JSON.stringify(row).includes('old topic'))).toBe(true);
        expect(state.memoryAgent.every((row) => Array.isArray(row.struggleTopics))).toBe(true);
    });

    it('re-run is idempotent for memory-agent row count', async () => {
        const state = {
            course: { id: courseId, courseName: REPORT_FIXTURE_TARGET_COURSE_NAME },
            users: [] as CourseUserDoc[],
            globalUsers: [] as GlobalUserDoc[],
            memoryAgent: [] as MemoryAgentDoc[]
        };
        const ctx = makeCtx(state);

        await seedReportFixture(ctx, courseId, payload);
        const studentCountAfterFirst = state.users.filter((u) => u.affiliation === 'student').length;

        const summary2 = await seedReportFixture(ctx, courseId, payload);
        expect(summary2.studentsSeeded).toBe(2);
        expect(summary2.memoryAgentRowsCreated).toBe(2);
        expect(state.users.filter((u) => u.affiliation === 'student')).toHaveLength(studentCountAfterFirst);
        expect(state.memoryAgent).toHaveLength(2);
    });

    it('seeds committed test3-seed-sample.json fixture', async () => {
        const state = {
            course: { id: courseId, courseName: REPORT_FIXTURE_TARGET_COURSE_NAME },
            users: [] as CourseUserDoc[],
            globalUsers: [] as GlobalUserDoc[],
            memoryAgent: [] as MemoryAgentDoc[]
        };
        const ctx = makeCtx(state);

        const summary = await seedReportFixture(ctx, courseId, committedSample);
        expect(summary.studentsSeeded).toBe(2);
        expect(summary.memoryAgentRowsCreated).toBe(2);
        expect(state.memoryAgent).toHaveLength(2);
    });

    const localApscFixturePath = path.join(
        __dirname,
        '../../../test-scripts/APSC183-struggle-topic-lists.json'
    );

    if (fs.existsSync(localApscFixturePath)) {
        it('seeds full local APSC183-struggle-topic-lists.json when present', async () => {
            const raw = JSON.parse(fs.readFileSync(localApscFixturePath, 'utf8')) as Record<string, string[]>;
            const studentCount = Object.keys(raw).length;
            expect(studentCount).toBeGreaterThan(0);

            const state = {
                course: { id: courseId, courseName: REPORT_FIXTURE_TARGET_COURSE_NAME },
                users: [] as CourseUserDoc[],
                globalUsers: [] as GlobalUserDoc[],
                memoryAgent: [] as MemoryAgentDoc[]
            };
            const ctx = makeCtx(state);

            const summary = await seedReportFixture(ctx, courseId, raw);
            expect(summary.studentsSeeded).toBe(studentCount);
            expect(summary.memoryAgentRowsCreated).toBe(studentCount);
            expect(state.memoryAgent).toHaveLength(studentCount);
        });
    }
});
