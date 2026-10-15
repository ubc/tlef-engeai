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
    buildFindingNeeds,
    retrieveForNeeds,
    toExcerpts,
    type WritingFeedbackMaterialRetriever
} from '../course-material-mentions';
import { COURSE_MATERIAL_RESOLVER_VERSION } from '../sfl-foundation';
import fs from 'fs';
import path from 'path';
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

describe('the whole run sends no query containing student text', () => {
    it('keeps quotes and analyzer prose out of every finding query', async () => {
        const retriever = recordingRetriever();
        await retrieveForNeeds(assignment(), buildFindingNeeds(assignment(), analysisOf([finding()])), { retriever, budgetChars: 4000, idPrefix: 'f' });
        const sent = retriever.queries.join('\n');
        expect(sent).not.toContain('ZZQUOTEZZ');
        expect(sent).not.toContain('ZZOBSERVATIONZZ');
        expect(sent).not.toContain('ZZINTERPRETATIONZZ');
        expect(retriever.queries.length).toBeGreaterThan(0);
    });
});

describe('finding clustering', () => {
    it('gives identical findings one need, not one each', () => {
        const needs = buildFindingNeeds(assignment(), analysisOf([finding(), finding({ id: 'f2' })]));
        expect(needs).toHaveLength(1);
    });
});

describe('resolver version', () => {
    it('names the resolver contract version', () => {
        expect(COURSE_MATERIAL_RESOLVER_VERSION).toBe('course-material-mentions-v2.0.0');
    });
});

describe('excerpt containment', () => {
    it('keeps course text off every label a student or staff list carries', async () => {
        const retriever: WritingFeedbackMaterialRetriever = {
            async retrieve() {
                return [{ content: 'ZZEXCERPTZZ course text', score: 0.9, published: true, metadata: { id: 'open', topicOrWeekTitle: 'Week 4', itemTitle: 'Lecture 1', name: 'Flow' } }] as never;
            }
        };
        const result = await retrieveForNeeds(assignment(), buildFindingNeeds(assignment(), analysisOf([finding()])), { retriever, budgetChars: 4000, idPrefix: 'f' });
        expect(JSON.stringify(result.excerpts.map((excerpt) => [excerpt.mention, excerpt.staffMention]))).not.toContain('ZZEXCERPTZZ');
        expect(toExcerpts(result.excerpts).some((excerpt) => excerpt.text.includes('ZZEXCERPTZZ'))).toBe(true);
    });

    it('never renders an excerpt in the student report', () => {
        const report = fs.readFileSync(path.join(__dirname, '..', '..', 'report-generation', 'writing-feedback-report.ts'), 'utf8');
        expect(report).not.toContain('courseMaterialExcerpts');
        expect(report).not.toContain('CourseMaterialExcerpt');
    });

    it('never mirrors the excerpt type into the browser bundle', () => {
        const shared = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-shared.ts'), 'utf8');
        expect(shared).not.toContain('CourseMaterialExcerpt');
    });
});

describe('student-facing source list', () => {
    it('renders published labels only, with no scores or ids', () => {
        const report = fs.readFileSync(path.join(__dirname, '..', '..', 'report-generation', 'writing-feedback-report.ts'), 'utf8');
        const section = report.match(/function renderCourseMaterialSources[\s\S]*?\n}/)?.[0] ?? '';
        expect(section).toContain('Useful readings');
        expect(section).toContain('mention.label');
        expect(section).not.toContain('mention.id');
        expect(section).not.toContain('score');
        // A title, never a URL: the student may be reading the PDF on paper.
        expect(section).not.toContain('courseMaterialLink');
    });
});

describe('mention identity', () => {
    it('gives one untagged material the same id however many needs found it', async () => {
        // Without a metadata id the label is all there is to go on. An id that also counted
        // the chunk's position gave one document several ids and silently dropped citations.
        const retriever: WritingFeedbackMaterialRetriever = {
            async retrieve() {
                return [{ content: 'open text', score: 0.9, published: true, metadata: { topicOrWeekTitle: 'Week 4', itemTitle: 'Lecture 1', name: 'Information flow' } }] as never;
            }
        };
        const needs = buildFindingNeeds(assignment(), analysisOf([finding(), finding({ id: 'f2', primaryFunction: 'organizational' })]));
        const result = await retrieveForNeeds(assignment(), needs, { retriever, budgetChars: 4000, idPrefix: 'f' });
        expect(result.excerpts).toHaveLength(1);
        expect(result.excerpts[0].needIds).toHaveLength(2);
        expect(result.excerpts[0].mention?.id).toBe(result.excerpts[0].staffMention?.id);
    });
});
