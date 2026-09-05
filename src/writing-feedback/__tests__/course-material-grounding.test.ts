/**
 * Course-material grounding tests — what the writer may read, and what it may cite.
 *
 * The load-bearing rule here is that no retrieval query may contain student writing:
 * evidence quotes are exact student text, and `observation` and `functionalInterpretation`
 * are model prose written about that text. Student submissions never enter the
 * course-material pipeline, so the query is built only from curated fields.
 *
 * @author: @rdschrs
 */

import { RAGApp } from '../../rag/rag-app';

describe('Writing Feedback retrieval scope', () => {
    it('offers an include-unpublished option that chat retrieval does not use', () => {
        // The published filter is what makes material visible to students, so chat keeps it.
        // Writing Feedback grounds the writer on the whole uploaded corpus and restricts
        // *citation* instead — see the allowlist in feedback-engine.
        const method = RAGApp.prototype.retrieveForWritingFeedback.toString();
        expect(method).toContain('includeUnpublished');
        expect(RAGApp.prototype.retrieveForChat.toString()).not.toContain('includeUnpublished');
    });

    it('tags every returned chunk with whether its item is published', () => {
        expect(RAGApp.prototype.retrieveForWritingFeedback.toString()).toContain('published:');
    });
});

import {
    MAX_RETRIEVAL_QUERIES,
    buildFindingRetrievalQuery,
    findingClusterKey,
    resolveCourseMaterialGrounding
} from '../course-material-mentions';
import type { WritingFeedbackMaterialRetriever } from '../course-material-mentions';
import type { SflAnalysis, SflFinding, WritingAssignment } from '../contracts';

const QUOTE = 'ZZQUOTEZZ the reaction proceeded rapidly';
const OBSERVATION = 'ZZOBSERVATIONZZ nominalisation carries the process';
const INTERPRETATION = 'ZZINTERPRETATIONZZ the writer compresses the method';

function finding(overrides: Partial<SflFinding> = {}): SflFinding {
    return {
        id: 'f1',
        evidence: [{ quote: QUOTE }],
        observation: OBSERVATION,
        functionalInterpretation: INTERPRETATION,
        primaryFunction: 'content',
        crossFunctions: [],
        languageLevel: 'clause_word',
        ruleIds: [],
        sourceIds: [],
        confidence: 0.6,
        alternatives: [],
        ...overrides
    } as SflFinding;
}

function assignment(): WritingAssignment {
    return {
        id: 'a1',
        courseId: 'c1',
        title: 'Process description',
        rubric: {
            status: 'approved',
            task: 'Describe a process you observed in the lab.',
            criteria: [],
            levels: [],
            sflContext: {
                genreLabel: 'Process description',
                field: 'Chemical engineering',
                mode: 'Written report',
                genreState: 'staff_confirmed',
                stages: [{ id: 's1', label: 'Method', purpose: 'Say what was done' }]
            }
        }
    } as unknown as WritingAssignment;
}

function analysisOf(findings: SflFinding[]): SflAnalysis {
    return {
        schemaVersion: 'writing-feedback-v2',
        foundationVersion: 'v1',
        profileGenreState: 'staff_confirmed',
        findings,
        abstentions: [],
        internalFlags: []
    } as SflAnalysis;
}

/** Records every query it is asked, and answers with one chunk per call. */
function recordingRetriever(published = true): WritingFeedbackMaterialRetriever & { queries: string[] } {
    const queries: string[] = [];
    return {
        queries,
        async retrieve(input) {
            queries.push(input.query);
            return [{
                content: `Course text for ${input.query.slice(0, 12)}`,
                score: 0.9,
                published,
                metadata: {
                    id: `m${queries.length}`,
                    topicOrWeekTitle: 'Week 4',
                    itemTitle: `Lecture ${queries.length}`,
                    name: 'Information flow'
                }
            }];
        }
    };
}

describe('the per-finding query never contains student text', () => {
    it('omits the evidence quote, the observation, and the interpretation', () => {
        const query = buildFindingRetrievalQuery(assignment(), finding());
        expect(query).not.toContain('ZZQUOTEZZ');
        expect(query).not.toContain('ZZOBSERVATIONZZ');
        expect(query).not.toContain('ZZINTERPRETATIONZZ');
    });

    it('carries the curated fields that make the query useful', () => {
        const query = buildFindingRetrievalQuery(assignment(), finding({ stageId: 's1' }));
        expect(query).toContain('content');
        expect(query).toContain('clause_word');
        expect(query).toContain('Process description');
        expect(query).toContain('Method');
    });

    it('sends no query containing student text through a whole run', async () => {
        const retriever = recordingRetriever();
        await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding(), finding({ id: 'f2', primaryFunction: 'organizational' })]),
            retriever
        );
        retriever.queries.forEach((query) => {
            expect(query).not.toMatch(/ZZQUOTEZZ|ZZOBSERVATIONZZ|ZZINTERPRETATIONZZ/);
        });
    });
});

describe('finding clustering', () => {
    it('gives identical findings one query, not one each', async () => {
        const retriever = recordingRetriever();
        await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding(), finding({ id: 'f2' }), finding({ id: 'f3' })]),
            retriever
        );
        // One clustered query plus the run-level query.
        expect(retriever.queries).toHaveLength(2);
    });

    it('is insensitive to rule id order', () => {
        expect(findingClusterKey(finding({ ruleIds: ['b', 'a'] })))
            .toBe(findingClusterKey(finding({ id: 'other', ruleIds: ['a', 'b'] })));
    });

    it('caps the queries and falls back rather than dropping a finding', async () => {
        const retriever = recordingRetriever();
        const many = Array.from({ length: 12 }, (_, index) => finding({
            id: `f${index}`,
            ruleIds: [`rule-${index}`]
        }));
        const grounding = await resolveCourseMaterialGrounding(assignment(), analysisOf(many), retriever);
        expect(retriever.queries.length).toBeLessThanOrEqual(MAX_RETRIEVAL_QUERIES + 1);
        many.forEach((item) => {
            expect(grounding.byFinding.get(item.id)?.length ?? 0).toBeGreaterThan(0);
        });
    });
});

describe('the student list stays inside the schema cap', () => {
    it('keeps at most five mentions for the student while the allowlist stays whole', async () => {
        const retriever = recordingRetriever();
        const many = Array.from({ length: 12 }, (_, index) => finding({ id: 'f' + index, ruleIds: ['rule-' + index] }));
        const grounding = await resolveCourseMaterialGrounding(assignment(), analysisOf(many), retriever);
        expect(grounding.studentMentions).toHaveLength(5);
        expect(grounding.mentions.length).toBeGreaterThan(5);
    });
});

describe('citation is restricted to published material', () => {
    it('keeps unpublished material out of the citable list and in the staff list', async () => {
        const retriever = recordingRetriever(false);
        const grounding = await resolveCourseMaterialGrounding(assignment(), analysisOf([finding()]), retriever);
        expect(grounding.mentions).toEqual([]);
        expect(grounding.studentMentions).toEqual([]);
        expect(grounding.staffMentions.length).toBeGreaterThan(0);
        expect(grounding.byFinding.get('f1') ?? []).toEqual([]);
    });
});

describe('retrieval stays advisory', () => {
    it('produces nothing rather than failing the run', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            { async retrieve() { throw new Error('Qdrant unavailable'); } }
        );
        expect(grounding.mentions).toEqual([]);
        expect(grounding.studentMentions).toEqual([]);
        expect(grounding.staffMentions).toEqual([]);
        expect(grounding.excerpts).toEqual([]);
        expect(grounding.byFinding.size).toBe(0);
    });
});

import { EXCERPT_BUDGET_CHARS, MAX_EXCERPT_CHARS } from '../course-material-mentions';
import { COURSE_MATERIAL_RESOLVER_VERSION, SFL_WRITER_PROMPT_VERSION } from '../sfl-foundation';

/** A retriever answering with chunks of a chosen length, score, and publication state. */
function chunkyRetriever(chunks: Array<{ content: string; score: number; published: boolean; id: string }>): WritingFeedbackMaterialRetriever {
    return {
        async retrieve() {
            return chunks.map((chunk) => ({
                content: chunk.content,
                score: chunk.score,
                published: chunk.published,
                metadata: { id: chunk.id, topicOrWeekTitle: 'Week 4', itemTitle: `Item ${chunk.id}`, name: chunk.id }
            }));
        }
    };
}

describe('excerpt budgeting', () => {
    it('truncates each chunk and stops at the total budget, highest score first', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            chunkyRetriever([
                { id: 'low', content: 'l'.repeat(2000), score: 0.5, published: true },
                { id: 'high', content: 'h'.repeat(2000), score: 0.99, published: true },
                { id: 'mid', content: 'm'.repeat(2000), score: 0.8, published: true }
            ])
        );
        expect(grounding.excerpts[0]!.text.startsWith('h')).toBe(true);
        grounding.excerpts.forEach((excerpt) => {
            expect(excerpt.text.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
        });
        const total = grounding.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0);
        expect(total).toBeLessThanOrEqual(EXCERPT_BUDGET_CHARS);
    });

    it('carries a citable id only for published material', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            chunkyRetriever([
                { id: 'open', content: 'published text', score: 0.9, published: true },
                { id: 'draft', content: 'unpublished text', score: 0.8, published: false }
            ])
        );
        const open = grounding.excerpts.find((excerpt) => excerpt.text === 'published text');
        const draft = grounding.excerpts.find((excerpt) => excerpt.text === 'unpublished text');
        expect(open?.mentionId).toBe('open');
        expect(draft?.mentionId).toBeUndefined();
    });
});

describe('prompt contract versions move with the contract', () => {
    it('names the grounded writer and resolver versions', () => {
        expect(SFL_WRITER_PROMPT_VERSION).toBe('sfl-feedback-writer-v2.1.0');
        expect(COURSE_MATERIAL_RESOLVER_VERSION).toBe('course-material-mentions-v2.0.0');
    });
});

import fs from 'fs';
import path from 'path';

describe('excerpt containment', () => {
    it('keeps course text off every student-facing carrier', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            chunkyRetriever([{ id: 'open', content: 'ZZEXCERPTZZ course text', score: 0.9, published: true }])
        );
        const serialisedMentions = JSON.stringify([...grounding.mentions, ...grounding.staffMentions]);
        expect(serialisedMentions).not.toContain('ZZEXCERPTZZ');
        expect(JSON.stringify([...grounding.byFinding.values()])).not.toContain('ZZEXCERPTZZ');
        expect(grounding.excerpts.some((excerpt) => excerpt.text.includes('ZZEXCERPTZZ'))).toBe(true);
    });

    it('never renders an excerpt in the student report', () => {
        const report = fs.readFileSync(
            path.join(__dirname, '..', '..', 'report-generation', 'writing-feedback-report.ts'),
            'utf8'
        );
        expect(report).not.toContain('courseMaterialExcerpts');
        expect(report).not.toContain('CourseMaterialExcerpt');
    });

    it('never mirrors the excerpt type into the browser bundle', () => {
        const shared = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-shared.ts'),
            'utf8'
        );
        expect(shared).not.toContain('CourseMaterialExcerpt');
    });
});

describe('student-facing source list', () => {
    it('renders published labels only, with no scores or ids', () => {
        const report = fs.readFileSync(
            path.join(__dirname, '..', '..', 'report-generation', 'writing-feedback-report.ts'),
            'utf8'
        );
        const section = report.match(/function renderCourseMaterialSources[\s\S]*?\n}/)?.[0] ?? '';
        expect(section).toContain('Course materials this feedback draws on');
        expect(section).toContain('mention.label');
        expect(section).not.toContain('mention.id');
        expect(section).not.toContain('score');
    });
});
