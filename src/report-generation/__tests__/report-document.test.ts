jest.mock('pdfkit', () => {
    const EventEmitter = require('events');

    class MockPDFDocument extends EventEmitter {
        page = {
            width: 612,
            height: 792,
            margins: { left: 54, top: 54, right: 54, bottom: 54 }
        };
        y = 100;

        font() {
            return this;
        }
        fontSize() {
            return this;
        }
        fillColor() {
            return this;
        }
        text() {
            return this;
        }
        moveDown() {
            return this;
        }
        heightOfString(text: string, options?: { width?: number }) {
            const lines = String(text).split('\n').length;
            const width = options?.width ?? 500;
            const charsPerLine = Math.max(1, Math.floor(width / 6));
            const wrappedLines = Math.max(lines, Math.ceil(String(text).length / charsPerLine));
            return wrappedLines * 12;
        }
        widthOfString(text: string) {
            return String(text).length * 6;
        }
        strokeColor() {
            return this;
        }
        lineWidth() {
            return this;
        }
        moveTo() {
            return this;
        }
        lineTo() {
            return this;
        }
        stroke() {
            return this;
        }
        addPage() {
            return this;
        }
        image() {
            return this;
        }
        save() {
            return this;
        }
        restore() {
            return this;
        }
        rect() {
            return { fill: () => undefined };
        }
        end() {
            this.emit('data', Buffer.from('%PDF-1.4 mock'));
            this.emit('end');
        }
    }

    return MockPDFDocument;
});

jest.mock('../report-chart', () => {
    const mockRenderer = {
        render: jest.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    };
    return {
        ChartJsStackedBarRenderer: {
            getInstance: jest.fn(() => mockRenderer)
        }
    };
});

import { buildReportPdf } from '../report-document';
import {
    buildReportPdfFilename,
    deriveAcademicPeriod,
    type IStackedBarChartRenderer,
    type ReportBuildInput
} from '../report-contracts';
import type { activeCourse, StruggleStatsResult } from '../../types/shared';

const mockChartRenderer: IStackedBarChartRenderer = {
    render: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
};

const now = new Date('2026-01-15');

function makePrototypeInput(): ReportBuildInput {
    const course = {
        id: 'course-1',
        courseName: 'Test 3',
        date: now,
        frameType: 'byTopic',
        topicOrWeekInstances: []
    } as unknown as activeCourse;

    const stats: StruggleStatsResult = {
        struggleTopics: {
            source: 'memory-agent-per-user',
            groupedBy: 'course-topic-or-week',
            topTopics: [],
            stackedBar: {
                xAxisLabel: 'Course Topic',
                yAxisLabel: 'Students',
                categories: [{ id: 'tw-1', label: 'Topic 1', order: 0 }],
                series: [
                    {
                        topic: 'Label A',
                        color: '#4D7A2F',
                        values: [{ categoryId: 'tw-1', studentCount: 2, tooltip: 'Label A: 2 students' }]
                    }
                ]
            },
            legend: [{ topic: 'Label A', color: '#4D7A2F', studentCount: 2 }]
        },
        users: []
    };

    return { course, stats, generatedAt: now, phase: 'prototype' };
}

function makeFullInput(): ReportBuildInput {
    const base = makePrototypeInput();
    return {
        ...base,
        phase: 'full',
        studentAppendix: [
            {
                userName: 'Alex Student',
                chapterGroups: [{ chapterNum: 1, topics: ['Label A'] }]
            }
        ],
        stats: {
            ...base.stats,
            users: [
                {
                    userId: 's1',
                    userName: 'Alex Student',
                    role: 'student',
                    conversationCount: 0,
                    struggleTopicCount: 1,
                    struggleTopics: ['Label A'],
                    struggleTopicsByChapter: [
                        {
                            topicOrWeekId: 'tw-1',
                            topicOrWeekTitle: 'Topic 1',
                            struggleTopics: ['Label A']
                        }
                    ],
                    chats: []
                },
                {
                    userId: 'i1',
                    userName: 'Instructor',
                    role: 'instructor',
                    conversationCount: 0,
                    struggleTopicCount: 1,
                    struggleTopics: ['Label A'],
                    struggleTopicsByChapter: [
                        {
                            topicOrWeekId: 'tw-1',
                            topicOrWeekTitle: 'Topic 1',
                            struggleTopics: ['Label A']
                        }
                    ],
                    chats: []
                }
            ]
        }
    };
}

describe('buildReportPdf', () => {
    it('produces a valid PDF buffer and filename for prototype phase', async () => {
        const result = await buildReportPdf(makePrototypeInput(), mockChartRenderer);

        expect(result.buffer.length).toBeGreaterThan(0);
        expect(result.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
        expect(result.filename).toBe(buildReportPdfFilename('Test 3', deriveAcademicPeriod(now)));
        expect(result.filename.endsWith('.pdf')).toBe(true);
    });

    it('produces a valid PDF buffer and filename for full report', async () => {
        const result = await buildReportPdf(makeFullInput(), mockChartRenderer);

        expect(result.buffer.length).toBeGreaterThan(0);
        expect(result.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
        expect(result.filename).toBe(buildReportPdfFilename('Test 3', deriveAcademicPeriod(now)));
        expect(result.filename.endsWith('.pdf')).toBe(true);
    });
});
