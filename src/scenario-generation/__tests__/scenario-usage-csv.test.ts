jest.mock('../../db/mongo/collection-registry-mongo', () => ({ getCollectionNames: jest.fn() }));

import { buildScenarioUsageReport, type ReportQuestionDoc } from '../../db/mongo/scenario-usage-mongo';
import { buildScenarioUsageCsv, csvCell, formatCsvDateTime } from '../scenario-usage-csv';

const longPrompt = 'Calculate the maximum kinetic energy of the emitted photoelectrons in electron volts';

function answer(studentUserId: string, mode: 'practice' | 'exam', studentAnswer: string, submittedAt: string) {
    return { studentUserId, mode, studentAnswer, submittedAt };
}

describe('buildScenarioUsageReport', () => {
    const students = [
        { userId: 'b', name: 'Bea' },
        { userId: 'a', name: 'Ann' },
        { userId: 'z', name: 'Zed' }, // no activity
    ];

    const questions: ReportQuestionDoc[] = [
        {
            id: 'q1',
            status: 'published',
            subQuestions: [
                {
                    subQuestionId: 'p1',
                    prompt: longPrompt,
                    modelAnswer: '',
                    studentResponses: [
                        answer('a', 'practice', 'idk', '2026-11-01T18:00:00Z'),
                        answer('a', 'practice', 'K is about 0.66 eV', '2026-11-02T18:00:00Z'),
                        answer('a', 'exam', 'K is about 0.66 eV', '2026-11-03T18:00:00Z'),
                        answer('staff', 'practice', 'preview answer from an instructor', '2026-11-03T18:00:00Z'),
                    ],
                },
                {
                    subQuestionId: 'p2',
                    prompt: 'Find the stopping potential',
                    modelAnswer: '',
                    studentResponses: [
                        answer('a', 'exam', 'V equals K divided by e', '2026-11-03T18:00:00Z'),
                        answer('b', 'practice', 'V equals K divided by e', '2026-07-03T18:00:00Z'),
                    ],
                },
            ],
        },
        {
            id: 'removed',
            status: 'archived',
            subQuestions: [
                {
                    subQuestionId: 'r1',
                    prompt: 'Old question',
                    studentResponses: [answer('b', 'practice', 'an answer to a removed question', '2026-07-04T06:30:00Z')],
                },
            ],
        },
        { id: 'unanswered', status: 'published', subQuestions: [{ subQuestionId: 'u1', studentResponses: [] }] },
    ];

    const report = buildScenarioUsageReport(students, questions);
    const byId = Object.fromEntries(report.rows.map((r) => [r.userId, r]));

    it('counts published questions only in the header total', () => {
        expect(report.publishedQuestionCount).toBe(2);
    });

    it('includes every student, sorted by name, ignoring non-roster responders', () => {
        expect(report.rows.map((r) => r.studentName)).toEqual(['Ann', 'Bea', 'Zed']);
        expect(byId.z).toMatchObject({ questionsAttempted: 0, practiceAnswers: 0, daysActive: 0, lastActivityAt: null });
    });

    it('totals attempts, completion, practice answers and whole exam submissions', () => {
        // Ann: both parts of q1 answered → completed; one exam submission covering two parts
        expect(byId.a).toMatchObject({
            questionsAttempted: 1,
            questionsCompleted: 1,
            practiceAnswers: 2,
            examsSubmitted: 1,
            daysActive: 3,
        });
        // Bea: one part of q1 plus a removed question, which still counts
        expect(byId.b).toMatchObject({ questionsAttempted: 2, questionsCompleted: 1, practiceAnswers: 2, examsSubmitted: 0 });
    });

    it('counts flagged answers (too short, and an exam answer identical to the practice one before it)', () => {
        expect(byId.a.flaggedAnswers).toBe(2);
        expect(byId.b.flaggedAnswers).toBe(0);
    });

    it('tracks the latest submission and Vancouver calendar days', () => {
        expect(byId.b.lastActivityAt?.toISOString()).toBe('2026-07-04T06:30:00.000Z');
        // 2026-07-03T18:00Z and 2026-07-04T06:30Z are both July 3 in Vancouver (UTC-7)
        expect(byId.b.daysActive).toBe(1);
    });
});

describe('csv formatting', () => {
    it('quotes cells with commas, quotes or line breaks', () => {
        expect(csvCell('Tom, Kathleen')).toBe('"Tom, Kathleen"');
        expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
        expect(csvCell(12)).toBe('12');
    });

    it('neutralizes spreadsheet formulas in text cells', () => {
        expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
        expect(csvCell('-Ann')).toBe("'-Ann");
        expect(csvCell(-1)).toBe('-1');
    });

    it('formats times in Vancouver as sortable text', () => {
        expect(formatCsvDateTime(new Date('2026-07-04T06:30:00Z'))).toBe('2026-07-03 23:30');
        expect(formatCsvDateTime(null)).toBe('');
    });

    it('builds a BOM-prefixed sheet with the published total in the header', () => {
        const csv = buildScenarioUsageCsv({
            publishedQuestionCount: 4,
            rows: [
                {
                    userId: 'a',
                    studentName: 'Ann',
                    questionsAttempted: 2,
                    questionsCompleted: 1,
                    practiceAnswers: 5,
                    examsSubmitted: 1,
                    daysActive: 3,
                    lastActivityAt: new Date('2026-07-04T06:30:00Z'),
                    flaggedAnswers: 1,
                },
            ],
        });
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv.slice(1).split('\r\n')).toEqual([
            'Student name,Questions attempted (of 4 published),Questions completed,Practice answers submitted,Exams submitted,Days active,Last activity (America/Vancouver),Flagged answers',
            'Ann,2,1,5,1,3,2026-07-03 23:30,1',
            '',
        ]);
    });
});
