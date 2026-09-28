/**
 * Writing Feedback eval materials — synthetic lecture notes and a keyword retriever
 *
 * Stands in for Qdrant so the eval measures prompts, not the vector store. Scores are
 * keyword overlap, normalized to 0..1, which is enough to rank three short notes.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: In-memory course material for the live Writing Feedback eval.
 */

import type { PublishedTaggedChunk } from '../../../../rag/rag-app';
import type { WritingFeedbackMaterialRetriever } from '../../../course-material-mentions';

interface LectureNote {
    id: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    name: string;
    content: string;
}

export const EVAL_LECTURE_NOTES: LectureNote[] = [
    {
        id: 'note-definitions',
        topicOrWeekTitle: 'Week 2',
        itemTitle: 'Lecture',
        name: 'Writing formal definitions',
        content: 'A formal definition places a term in a class and states its distinguishing features: term = class + distinguishing characteristics. For example, "A thermometer is an instrument that measures temperature." Avoid vague classes such as "something" or "a thing", which give the reader no class to build on.'
    },
    {
        id: 'note-reports',
        topicOrWeekTitle: 'Week 3',
        itemTitle: 'Lecture',
        name: 'Descriptive reports',
        content: 'A descriptive report classifies an entity into types or describes its composition into parts. Typical stages: general statement (identification and definition), classification or composition, then a description of each type or part. Reports use the timeless present tense and relational processes such as "is", "has" and "consists of". A report is not an explanation: an explanation sequences events in time, using markers such as first, then and finally, to show how or why a process happens.'
    },
    {
        id: 'note-theme',
        topicOrWeekTitle: 'Week 4',
        itemTitle: 'Lecture',
        name: 'Theme and information flow',
        content: 'Theme is the point of departure of the clause: what comes first and tells the reader what the clause is about. In reports, keep the entity or its types in Theme position to build a clear thematic pattern, and put new information at the end of the clause. Jumping between unrelated Themes makes a paragraph hard to follow.'
    }
];

function tokens(text: string): Set<string> {
    return new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
}

/** Keyword-overlap retriever over {@link EVAL_LECTURE_NOTES}; every note is published. */
export class InMemoryMaterialRetriever implements WritingFeedbackMaterialRetriever {
    constructor(private readonly notes: LectureNote[] = EVAL_LECTURE_NOTES) {}

    async retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<PublishedTaggedChunk[]> {
        const queryTokens = tokens(input.query);
        if (!queryTokens.size) return [];
        return this.notes
            .map((note) => {
                const noteTokens = tokens(`${note.name} ${note.content}`);
                const overlap = [...queryTokens].filter((token) => noteTokens.has(token)).length;
                return { note, score: overlap / queryTokens.size };
            })
            .filter(({ score }) => score >= Math.min(input.scoreThreshold, 0.1))
            .sort((left, right) => right.score - left.score)
            .slice(0, input.limit)
            .map(({ note, score }) => ({
                content: note.content,
                score,
                published: true,
                metadata: { id: note.id, topicOrWeekTitle: note.topicOrWeekTitle, itemTitle: note.itemTitle, name: note.name }
            }) as unknown as PublishedTaggedChunk);
    }
}
