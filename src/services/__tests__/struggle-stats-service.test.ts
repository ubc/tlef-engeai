import {
    buildCourseStruggleStats,
    STRUGGLE_OTHER_LABEL,
    type StruggleStatsBuildInput
} from '../struggle-stats-service';
import type {
    activeCourse,
    InstructorStruggleTopicForDisplay,
    MemoryAgentEntry
} from '../../types/shared';
import type { MonitorRosterUser } from '../../db/mongo/monitor-roster-mongo';

const now = new Date('2026-01-01');

function makeCourse(instances: Array<{ id: string; title: string }>): activeCourse {
    return {
        id: 'course-1',
        courseName: 'Test Course',
        frameType: 'byTopic',
        tilesNumber: instances.length,
        topicOrWeekInstances: instances.map((inst) => ({
            id: inst.id,
            date: now,
            title: inst.title,
            courseName: 'Test Course',
            published: true,
            items: [],
            createdAt: now,
            updatedAt: now
        })),
        date: now,
        createdAt: now,
        updatedAt: now
    } as unknown as activeCourse;
}

const catalog: InstructorStruggleTopicForDisplay[] = [
    {
        struggleTopic: 'Enthalpy',
        topicOrWeekId: 'tw-1',
        topicOrWeekTitle: 'Thermo',
        itemTitle: 'L1'
    },
    {
        struggleTopic: 'Entropy',
        topicOrWeekId: 'tw-1',
        topicOrWeekTitle: 'Thermo',
        itemTitle: 'L2'
    },
    {
        struggleTopic: 'Phase diagrams',
        topicOrWeekId: 'tw-2',
        topicOrWeekTitle: 'Phases',
        itemTitle: 'L3'
    }
];

function memoryEntry(userId: string, name: string, labels: string[]): MemoryAgentEntry {
    return {
        name,
        userId,
        role: 'Student',
        struggleTopics: labels,
        createdAt: now,
        updatedAt: now
    };
}

function roster(users: Array<{ userId: string; name: string }>): MonitorRosterUser[] {
    return users.map((u) => ({
        userId: u.userId,
        userName: u.name,
        role: 'student' as const,
        chats: []
    }));
}

function baseInput(overrides: Partial<StruggleStatsBuildInput>): StruggleStatsBuildInput {
    return {
        course: makeCourse([
            { id: 'tw-1', title: 'Thermo' },
            { id: 'tw-2', title: 'Phases' }
        ]),
        catalog,
        memoryAgentEntries: [],
        rosterUsers: [],
        rosterStudentCount: 10,
        ...overrides
    };
}

describe('buildCourseStruggleStats', () => {
    it('excludes users with empty struggle topics from chart counts', () => {
        const result = buildCourseStruggleStats(
            baseInput({
                memoryAgentEntries: [
                    memoryEntry('u1', 'Alice', ['Enthalpy']),
                    memoryEntry('u2', 'Bob', []),
                    memoryEntry('u3', 'Carol', ['[memory-agent] error parsing json'])
                ],
                rosterUsers: roster([
                    { userId: 'u1', name: 'Alice' },
                    { userId: 'u2', name: 'Bob' },
                    { userId: 'u3', name: 'Carol' }
                ])
            })
        );

        const enthalpySeries = result.struggleTopics.stackedBar.series.find((s) => s.topic === 'Enthalpy');
        expect(enthalpySeries?.values.find((v) => v.categoryId === 'tw-1')?.studentCount).toBe(1);
        expect(result.struggleTopics.topTopics.find((t) => t.topic === 'Enthalpy')?.studentCount).toBe(1);
        expect(result.users.find((u) => u.userId === 'u2')?.struggleTopicCount).toBe(0);
        expect(result.users.find((u) => u.userId === 'u3')?.struggleTopicCount).toBe(0);
    });

    it('counts unique students per label per chapter', () => {
        const result = buildCourseStruggleStats(
            baseInput({
                memoryAgentEntries: [
                    memoryEntry('u1', 'Alice', ['Enthalpy', 'Entropy']),
                    memoryEntry('u2', 'Bob', ['Enthalpy'])
                ],
                rosterUsers: roster([
                    { userId: 'u1', name: 'Alice' },
                    { userId: 'u2', name: 'Bob' }
                ])
            })
        );

        const enthalpy = result.struggleTopics.stackedBar.series.find((s) => s.topic === 'Enthalpy');
        const entropy = result.struggleTopics.stackedBar.series.find((s) => s.topic === 'Entropy');
        expect(enthalpy?.values.find((v) => v.categoryId === 'tw-1')?.studentCount).toBe(2);
        expect(entropy?.values.find((v) => v.categoryId === 'tw-1')?.studentCount).toBe(1);
    });

    it('omits empty chapters from categories', () => {
        const result = buildCourseStruggleStats(
            baseInput({
                memoryAgentEntries: [memoryEntry('u1', 'Alice', ['Enthalpy'])],
                rosterUsers: roster([{ userId: 'u1', name: 'Alice' }])
            })
        );

        expect(result.struggleTopics.stackedBar.categories.map((c) => c.id)).toEqual(['tw-1']);
    });

    it('omits unmapped labels from chapter view and stats', () => {
        const result = buildCourseStruggleStats(
            baseInput({
                memoryAgentEntries: [memoryEntry('u1', 'Alice', ['Unknown label', 'Enthalpy'])],
                rosterUsers: roster([{ userId: 'u1', name: 'Alice' }])
            })
        );

        expect(result.users[0].struggleTopics).toEqual(['Unknown label', 'Enthalpy']);
        expect(result.users[0].struggleTopicsByChapter[0].struggleTopics).toEqual(['Enthalpy']);
        expect(result.struggleTopics.legend.find((l) => l.topic === 'Unknown label')).toBeUndefined();
    });

    it('derives per-user struggleTopicsByChapter on user rows', () => {
        const result = buildCourseStruggleStats(
            baseInput({
                memoryAgentEntries: [memoryEntry('u1', 'Alice', ['Phase diagrams'])],
                rosterUsers: roster([{ userId: 'u1', name: 'Alice' }])
            })
        );

        expect(result.users[0].struggleTopicsByChapter).toEqual([
            {
                topicOrWeekId: 'tw-2',
                topicOrWeekTitle: 'Phases',
                struggleTopics: ['Phase diagrams']
            }
        ]);
    });

    it('buckets palette overflow labels into Other for a chapter', () => {
        const manyLabels = Array.from({ length: 8 }, (_, i) => `Label ${i + 1}`);
        const bigCatalog: InstructorStruggleTopicForDisplay[] = manyLabels.map((label, i) => ({
            struggleTopic: label,
            topicOrWeekId: 'tw-1',
            topicOrWeekTitle: 'Thermo',
            itemTitle: `L${i}`
        }));

        const entries = manyLabels.map((label, i) =>
            memoryEntry(`u${i}`, `Student ${i}`, [label])
        );

        const result = buildCourseStruggleStats(
            baseInput({
                catalog: bigCatalog,
                course: makeCourse([{ id: 'tw-1', title: 'Thermo' }]),
                memoryAgentEntries: entries,
                rosterUsers: entries.map((e) => ({
                    userId: e.userId,
                    userName: e.name,
                    role: 'student' as const,
                    chats: []
                }))
            })
        );

        const otherSeries = result.struggleTopics.stackedBar.series.find((s) => s.topic === STRUGGLE_OTHER_LABEL);
        expect(otherSeries).toBeDefined();
        expect(otherSeries?.values.find((v) => v.categoryId === 'tw-1')?.studentCount).toBe(2);
        expect(result.struggleTopics.legend.find((l) => l.topic === STRUGGLE_OTHER_LABEL)?.studentCount).toBe(2);
    });
});
