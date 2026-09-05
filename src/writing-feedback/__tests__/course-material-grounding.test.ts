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
