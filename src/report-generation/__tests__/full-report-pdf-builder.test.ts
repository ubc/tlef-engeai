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

jest.mock('../chart/chartjs-stacked-bar-renderer', () => ({
    ChartJsStackedBarRenderer: jest.fn().mockImplementation(() => ({
        render: jest.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    }))
}));

import { FullReportPdfBuilder } from '../builders/full-report-pdf-builder';
import type { IStackedBarChartRenderer } from '../interfaces';
import type { ReportBuildInput } from '../types';
import type { activeCourse, StruggleStatsResult } from '../../types/shared';
import { deriveAcademicPeriod } from '../report-academic-period';
import { buildReportPdfFilename } from '../report-filename';

const mockChartRenderer: IStackedBarChartRenderer = {
    render: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
};

const now = new Date('2026-01-15');

function makeInput(): ReportBuildInput {
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
    };

    return { course, stats, generatedAt: now, phase: 'full' };
}

describe('FullReportPdfBuilder', () => {
    it('produces a valid PDF buffer and filename for full report', async () => {
        const builder = new FullReportPdfBuilder(mockChartRenderer);
        const result = await builder.build(makeInput());

        expect(result.buffer.length).toBeGreaterThan(0);
        expect(result.buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
        expect(result.filename).toBe(buildReportPdfFilename('Test 3', deriveAcademicPeriod(now)));
        expect(result.filename.endsWith('.pdf')).toBe(true);
    });
});
