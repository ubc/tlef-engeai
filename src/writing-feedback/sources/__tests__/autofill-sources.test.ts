/**
 * Auto-fill source tests — which material "Fill these in for me" reads
 *
 * Pins the source list staff see (no duplicate of the Canvas description, materials in the
 * order added), the refusals that stop a fill before any model call, and how several sources
 * are labelled for the model.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for listing, selecting, and composing auto-fill sources.
 */

import {
    AUTOFILL_SOURCE_ERRORS,
    CANVAS_DESCRIPTION_SOURCE_ID,
    INSTRUCTIONS_SOURCE_ID,
    MAX_AUTOFILL_SOURCE_CHARS,
    composeAutofillMaterial,
    listAutofillSources,
    selectAutofillSources
} from '../autofill-sources';
import type { WritingSourceMaterial } from '../../contracts';

function material(id: string, kind: 'file' | 'paste', text: string, fileName?: string): WritingSourceMaterial {
    return {
        id, courseId: 'course-1', assignmentId: 'assignment-1', kind, text,
        ...(fileName ? { fileName } : {}),
        hasTables: kind === 'file', characterCount: text.length, addedAt: new Date(), addedBy: 'user-1'
    };
}

const canvasDetails = (descriptionText: string) => ({ descriptionText, importedAt: new Date() });

describe('listAutofillSources', () => {
    it('lists the instructions, then each material in the order added', () => {
        const sources = listAutofillSources(
            { instructions: 'Write a memo.' },
            [material('m1', 'file', 'Rubric table', 'rubric.docx'), material('m2', 'paste', 'More'), material('m3', 'paste', 'Even more')]
        );

        expect(sources.map((source) => [source.id, source.label])).toEqual([
            [INSTRUCTIONS_SOURCE_ID, 'Assignment instructions'],
            ['m1', 'rubric.docx'],
            ['m2', 'Pasted text 1'],
            ['m3', 'Pasted text 2']
        ]);
    });

    it('does not offer a Canvas description that matches the imported instructions', () => {
        const sources = listAutofillSources(
            { instructions: 'Write  a memo.', canvasAssignmentId: '88', canvasDetails: canvasDetails('Write a memo.\n') },
            []
        );

        expect(sources.map((source) => source.id)).toEqual([INSTRUCTIONS_SOURCE_ID]);
        expect(sources[0]!.label).toBe('Canvas assignment description (as imported)');
    });

    it('offers a Canvas description changed since import as its own source', () => {
        const sources = listAutofillSources(
            { instructions: 'Write a memo.', canvasAssignmentId: '88', canvasDetails: canvasDetails('Write a two-page memo.') },
            []
        );

        expect(sources.map((source) => [source.id, source.label])).toEqual([
            [INSTRUCTIONS_SOURCE_ID, 'Canvas assignment description (as imported)'],
            [CANVAS_DESCRIPTION_SOURCE_ID, 'Canvas assignment description (latest)']
        ]);
    });

    it('lists nothing for an assignment with no material', () => {
        expect(listAutofillSources({ instructions: '   ' }, [])).toEqual([]);
    });
});

describe('selectAutofillSources', () => {
    const available = listAutofillSources(
        { instructions: 'Write a memo.' },
        [material('m1', 'file', 'Rubric table', 'rubric.docx')]
    );

    it('reads every source when no selection is given', () => {
        expect(selectAutofillSources(available).map((source) => source.id)).toEqual([INSTRUCTIONS_SOURCE_ID, 'm1']);
    });

    it('reads only the ticked sources, in list order', () => {
        expect(selectAutofillSources(available, ['m1']).map((source) => source.id)).toEqual(['m1']);
    });

    it.each([
        ['there is no material at all', [], undefined, AUTOFILL_SOURCE_ERRORS.none],
        ['nothing is ticked', available, [], AUTOFILL_SOURCE_ERRORS.noneSelected],
        ['a ticked source is gone', available, ['deleted'], AUTOFILL_SOURCE_ERRORS.unknown]
    ])('refuses when %s', (_name, sources, ids, message) => {
        expect(() => selectAutofillSources(sources, ids)).toThrow(message);
    });

    it('refuses a selection longer than one fill may read', () => {
        const long = listAutofillSources({}, [
            material('a', 'paste', 'a'.repeat(MAX_AUTOFILL_SOURCE_CHARS)),
            material('b', 'paste', 'b')
        ]);

        expect(() => selectAutofillSources(long)).toThrow(AUTOFILL_SOURCE_ERRORS.tooLong);
        expect(selectAutofillSources(long, ['a'])).toHaveLength(1);
    });
});

describe('composeAutofillMaterial', () => {
    it('sends a single source bare', () => {
        const [only] = listAutofillSources({ instructions: 'Write a memo.' }, []);

        expect(composeAutofillMaterial([only!])).toBe('Write a memo.');
    });

    it('labels and numbers several sources', () => {
        const sources = listAutofillSources({ instructions: 'Write a memo.' }, [material('m1', 'file', '| A | B |', 'rubric.docx')]);

        expect(composeAutofillMaterial(sources)).toBe(
            '=== Source 1 of 2: Assignment instructions ===\nWrite a memo.\n\n=== Source 2 of 2: rubric.docx ===\n| A | B |'
        );
    });
});
