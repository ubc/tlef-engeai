/**
 * Course Syllabus retrieval (#674)
 *
 * Pins that the syllabus is read through its own small search by chat, Scenario
 * Generation (even when scoped to one week) and Writing Feedback, and that deleting a
 * syllabus document finds it outside the week/topic tree.
 */

jest.mock('ubc-genai-toolkit-rag', () => ({ RAGModule: { create: jest.fn() } }));
jest.mock('ubc-genai-toolkit-llm', () => ({ LLMModule: jest.fn() }));
jest.mock('ubc-genai-toolkit-document-parsing', () => ({ DocumentParsingModule: jest.fn() }));
jest.mock('../../utils/config', () => ({ loadConfig: jest.fn(() => ({})) }));
jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../helpers/mock-response', () => ({ isMockResponse: jest.fn(() => false) }));
jest.mock('../../db/enge-ai-mongodb', () => ({ EngEAI_MongoDB: { getInstance: jest.fn() } }));

import { RAGApp } from '../rag-app';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import {
    activeSyllabusMaterials,
    isCourseSyllabusScope,
    isReservedSyllabusTitle,
    SYLLABUS_RETRIEVE_LIMIT,
    syllabusChunkFilter,
    syllabusChunkIds
} from '../course-syllabus';
import { COURSE_SYLLABUS_SCOPE_ID, COURSE_SYLLABUS_TITLE } from '../../types/shared';

const syllabusMaterial = { id: 'syl-1', name: 'Outline', qdrantChunkIds: ['c-1', 'c-2'] };

/** A course with one published week (two items) and an optional syllabus. */
function makeCourse(withSyllabus: boolean, published = true) {
    return {
        id: 'course-1',
        courseName: 'CHBE 241',
        topicOrWeekInstances: [
            { id: 'w1', published, items: [{ itemTitle: 'Lecture 1' }] },
            { id: 'w2', published, items: [{ itemTitle: 'Lecture 2' }] }
        ],
        ...(withSyllabus ? { syllabusMaterials: [syllabusMaterial] } : {})
    };
}

/** Builds a RAGApp without its private constructor, wired to stub RAG and Mongo. */
function makeApp(course: unknown, retrieveContext: jest.Mock) {
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
        getCourseByName: jest.fn().mockResolvedValue(course),
        getActiveCourse: jest.fn().mockResolvedValue(course)
    });
    const app = Object.create(RAGApp.prototype) as RAGApp;
    const rag = { retrieveContext, getDocumentsByMetadata: jest.fn().mockResolvedValue([]), deleteDocumentsByIds: jest.fn() };
    Object.assign(app as unknown as Record<string, unknown>, {
        rag,
        mongoDB: { getActiveCourse: jest.fn().mockResolvedValue(course) }
    });
    return { app, rag };
}

const lectureChunk = { content: 'lecture', metadata: { itemTitle: 'Lecture 1', topicOrWeekTitle: 'Week 1' } };
const syllabusChunk = {
    content: 'syllabus',
    metadata: { itemTitle: COURSE_SYLLABUS_TITLE, topicOrWeekTitle: COURSE_SYLLABUS_TITLE }
};

/** Returns lecture chunks for the main search and syllabus chunks for the syllabus search. */
function routedRetrieve() {
    return jest.fn(async (_query: string, options: { filter: { must: { key: string }[] } }) =>
        options.filter.must.some((clause) => clause.key === 'topicOrWeekTitle') ? [syllabusChunk] : [lectureChunk]
    );
}

describe('course-syllabus helpers', () => {
    it('recognises only the reserved scope id', () => {
        expect(isCourseSyllabusScope(COURSE_SYLLABUS_SCOPE_ID)).toBe(true);
        expect(isCourseSyllabusScope('1')).toBe(false);
        expect(isCourseSyllabusScope(undefined)).toBe(false);
    });

    it('lists chunk ids and skips deleted or chunkless documents for retrieval', () => {
        const course = {
            syllabusMaterials: [
                syllabusMaterial,
                { id: 'gone', deleted: true, qdrantChunkIds: ['c-9'] },
                { id: 'empty', qdrantChunkIds: [] }
            ]
        } as never;
        expect(activeSyllabusMaterials(course).map((m) => m.id)).toEqual(['syl-1']);
        expect(syllabusChunkIds(course)).toEqual(['c-1', 'c-2', 'c-9']);
    });

    it('reserves the syllabus title for weeks/topics, ignoring case and spacing', () => {
        expect(isReservedSyllabusTitle(' course   SYLLABUS ')).toBe(true);
        expect(isReservedSyllabusTitle('Course Syllabus review')).toBe(false);
    });

    it('filters on course, topic and item title', () => {
        expect(syllabusChunkFilter('CHBE 241')).toEqual({
            must: [
                { key: 'courseName', match: { value: 'CHBE 241' } },
                { key: 'topicOrWeekTitle', match: { value: COURSE_SYLLABUS_TITLE } },
                { key: 'itemTitle', match: { value: COURSE_SYLLABUS_TITLE } }
            ]
        });
    });
});

describe('RAGApp.retrieveForChat with a Course Syllabus', () => {
    it('adds syllabus chunks even when Scenario Generation scopes to one week', async () => {
        const retrieve = routedRetrieve();
        const { app } = makeApp(makeCourse(true), retrieve);

        const chunks = await app.retrieveForChat('heat exchanger', 'CHBE 241', {
            limit: 5,
            scoreThreshold: 0.4,
            topicOrWeekId: 'w1'
        });

        expect(chunks).toEqual([lectureChunk, syllabusChunk]);
        expect(retrieve).toHaveBeenCalledTimes(2);
        const [, mainOptions] = retrieve.mock.calls[0];
        expect(mainOptions.filter.must[1]).toEqual({ key: 'itemTitle', match: { any: ['Lecture 1'] } });
        const [, syllabusOptions] = retrieve.mock.calls[1];
        expect(syllabusOptions).toEqual({
            limit: SYLLABUS_RETRIEVE_LIMIT,
            scoreThreshold: 0.4,
            filter: syllabusChunkFilter('CHBE 241')
        });
    });

    it('still reads the syllabus when nothing is published', async () => {
        const retrieve = routedRetrieve();
        const { app } = makeApp(makeCourse(true, false), retrieve);

        const chunks = await app.retrieveForChat('deadline', 'CHBE 241');

        expect(chunks).toEqual([syllabusChunk]);
        expect(retrieve).toHaveBeenCalledTimes(1);
    });

    it('runs no syllabus search when the course has no syllabus', async () => {
        const retrieve = routedRetrieve();
        const { app } = makeApp(makeCourse(false), retrieve);

        const chunks = await app.retrieveForChat('deadline', 'CHBE 241');

        expect(chunks).toEqual([lectureChunk]);
        expect(retrieve).toHaveBeenCalledTimes(1);
    });

    it('keeps lecture results when the syllabus search fails', async () => {
        const retrieve = jest
            .fn()
            .mockResolvedValueOnce([lectureChunk])
            .mockRejectedValueOnce(new Error('qdrant down'));
        const { app } = makeApp(makeCourse(true), retrieve);

        await expect(app.retrieveForChat('deadline', 'CHBE 241')).resolves.toEqual([lectureChunk]);
    });
});

describe('RAGApp.retrieveForWritingFeedback with a Course Syllabus', () => {
    it('returns syllabus chunks tagged published so they can be cited', async () => {
        const retrieve = routedRetrieve();
        const { app } = makeApp(makeCourse(true, false), retrieve);

        const chunks = await app.retrieveForWritingFeedback('report structure', 'course-1', {
            includeUnpublished: true
        });

        expect(chunks).toEqual([
            { ...lectureChunk, published: false },
            { ...syllabusChunk, published: true }
        ]);
    });
});

describe('RAGApp.deleteDocument for a Course Syllabus document', () => {
    it('finds the material on the course and deletes its stored chunks', async () => {
        const { app, rag } = makeApp(makeCourse(true), jest.fn());

        const result = await app.deleteDocument('syl-1', 'course-1', COURSE_SYLLABUS_SCOPE_ID, COURSE_SYLLABUS_SCOPE_ID);

        expect(rag.deleteDocumentsByIds).toHaveBeenCalledWith(['c-1', 'c-2']);
        expect(result).toEqual({ deleted: true, materialName: 'Outline', chunksDeleted: 2 });
    });
});
