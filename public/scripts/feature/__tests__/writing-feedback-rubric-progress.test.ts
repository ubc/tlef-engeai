/**
 * writing-feedback-rubric-progress.test.ts
 *
 * The rubric page promises staff that a step is finished. Three different
 * places in this codebase decide what "finished" means and they do not agree,
 * so the page's promise is pinned here against the one that actually blocks
 * feedback: requireCompleteSflProfile.
 *
 * @author: @rdschrs
 */

import { SFL_PROFILE_PLACEHOLDERS, buildDefaultSflContextProfile } from '../../../../src/writing-feedback/default-rubric-profile';
import { requireCompleteSflProfile } from '../../../../src/writing-feedback/sfl-analysis';
import {
    SFL_PLACEHOLDER_MIRROR,
    describeDetails,
    describeProfile,
    describeGrid,
    deriveGenreState,
    type DetailsValues
} from '../writing-feedback-rubric-progress';
import type { SflContextProfile, RubricCriterion, RubricLevel } from '../writing-feedback-shared';

const FILLED_DETAILS: DetailsValues = {
    title: 'Reflective Essay on a Design Failure',
    task: 'Choose an engineering failure covered in class and explain what went wrong.',
    audience: 'A peer who has not studied this failure.',
    purpose: 'To show they can connect a decision to its consequences.',
    constraints: ['800-1,000 words'],
    learningOutcomes: ['Explain a technical decision to a non-expert reader'],
    gradingIntent: 'The quality of the reflection matters more than polish.'
};

function filledProfile(): SflContextProfile {
    return {
        genreId: 'custom',
        genreLabel: 'Reflective essay',
        genreState: 'staff_confirmed',
        task: FILLED_DETAILS.task,
        purpose: FILLED_DETAILS.purpose,
        audience: FILLED_DETAILS.audience,
        field: 'A historical engineering failure and the decisions behind it.',
        tenor: 'Reflective and first-person, but evidence-backed.',
        mode: '1,000 words, submitted as a Word file.',
        actualEvaluator: 'Instructor or teaching assistant.',
        productionConditions: 'Take-home, over two weeks.',
        stages: [{ id: 'main_response', label: 'The failure, described', purpose: 'Sets out the case.' }],
        embeddedGenres: [],
        taskRequirements: ['A named failure case'],
        learningOutcomes: FILLED_DETAILS.learningOutcomes
    };
}

describe('placeholder mirror', () => {
    it('matches the backend placeholders exactly, so the page cannot drift from the engine', () => {
        expect(SFL_PLACEHOLDER_MIRROR).toEqual({ ...SFL_PROFILE_PLACEHOLDERS });
    });
});

describe('describeProfile', () => {
    it('refuses the seeded default, whose fields are placeholders rather than answers', () => {
        const seeded = buildDefaultSflContextProfile() as unknown as SflContextProfile;
        const readiness = describeProfile(seeded, FILLED_DETAILS);
        expect(readiness.complete).toBe(false);
        expect(readiness.done).toBeLessThan(readiness.total);
    });

    it('accepts a genuinely filled profile', () => {
        expect(describeProfile(filledProfile(), FILLED_DETAILS).complete).toBe(true);
    });

    it('fails when the description it borrows task, purpose and audience from is empty', () => {
        const blank: DetailsValues = { ...FILLED_DETAILS, task: '', purpose: '', audience: '' };
        expect(describeProfile(filledProfile(), blank).complete).toBe(false);
    });

    it('agrees with requireCompleteSflProfile on both answers', () => {
        const good = filledProfile();
        expect(describeProfile(good, FILLED_DETAILS).complete).toBe(true);
        expect(() => requireCompleteSflProfile({ ...good } as never)).not.toThrow();

        const bad = { ...good, field: SFL_PROFILE_PLACEHOLDERS.field };
        expect(describeProfile(bad, FILLED_DETAILS).complete).toBe(false);
        expect(() => requireCompleteSflProfile({ ...bad } as never)).toThrow();
    });

    it('names what is missing, in staff language', () => {
        const bad = { ...filledProfile(), tenor: '' };
        expect(describeProfile(bad, FILLED_DETAILS).missing).toContain('How should the student sound?');
    });

    /*
     * The engine checks more than the nine text fields. A profile whose prose is
     * perfect but whose stages, task requirements or outcomes are empty is still
     * rejected at generation, so the page must not call it finished. Each case
     * below asserts both halves: the module says incomplete, and the engine agrees
     * by throwing.
     */
    it('requires at least one stage, as the engine does', () => {
        const noStages = { ...filledProfile(), stages: [] };
        expect(describeProfile(noStages, FILLED_DETAILS).complete).toBe(false);
        expect(() => requireCompleteSflProfile({ ...noStages } as never)).toThrow();
    });

    it('requires every stage to carry a purpose, as the engine does', () => {
        const emptyPurpose = {
            ...filledProfile(),
            stages: [{ id: 'main_response', label: 'The failure, described', purpose: '   ' }]
        };
        expect(describeProfile(emptyPurpose, FILLED_DETAILS).complete).toBe(false);
        expect(() => requireCompleteSflProfile({ ...emptyPurpose } as never)).toThrow();
    });

    it('requires at least one task requirement, as the engine does', () => {
        const noRequirements = { ...filledProfile(), taskRequirements: [] };
        expect(describeProfile(noRequirements, FILLED_DETAILS).complete).toBe(false);
        expect(() => requireCompleteSflProfile({ ...noRequirements } as never)).toThrow();
    });

    it('requires at least one learning outcome, as the engine does', () => {
        const noOutcomes: DetailsValues = { ...FILLED_DETAILS, learningOutcomes: [] };
        expect(describeProfile(filledProfile(), noOutcomes).complete).toBe(false);
        // The saved profile takes its outcomes from the description form, so an
        // empty list there is what the engine will eventually see.
        expect(() => requireCompleteSflProfile({ ...filledProfile(), learningOutcomes: [] } as never)).toThrow();
    });
});

describe('deriveGenreState', () => {
    it('confirms a profile that is genuinely complete', () => {
        expect(deriveGenreState(filledProfile(), FILLED_DETAILS)).toBe('staff_confirmed');
    });

    it('returns needs_staff_input while any field is still a placeholder', () => {
        const seeded = buildDefaultSflContextProfile() as unknown as SflContextProfile;
        expect(deriveGenreState(seeded, FILLED_DETAILS)).toBe('needs_staff_input');
    });

    it('never reports confirmed for a profile requireCompleteSflProfile would reject', () => {
        const seeded = buildDefaultSflContextProfile() as unknown as SflContextProfile;
        const derived = { ...seeded, genreState: deriveGenreState(seeded, FILLED_DETAILS) };
        expect(() => requireCompleteSflProfile(derived as never)).toThrow();
    });

    /*
     * The dangerous case: prose complete, structure missing. Before the module
     * counted stages and lists, this returned staff_confirmed and handed the
     * engine a profile it rejects -- reproducing the exact trap the derivation
     * was introduced to close.
     */
    it('never confirms a profile whose prose is complete but whose stages are empty', () => {
        const noStages = { ...filledProfile(), stages: [] };
        const derived = { ...noStages, genreState: deriveGenreState(noStages, FILLED_DETAILS) };
        expect(derived.genreState).toBe('needs_staff_input');
        expect(() => requireCompleteSflProfile(derived as never)).toThrow();
    });
});

describe('describeDetails', () => {
    it('counts the same seven fields the page has always counted', () => {
        expect(describeDetails(FILLED_DETAILS)).toMatchObject({ done: 7, total: 7, complete: true });
    });

    it('counts an empty list as unanswered', () => {
        expect(describeDetails({ ...FILLED_DETAILS, constraints: [] }).done).toBe(6);
    });
});

describe('describeGrid', () => {
    const levels: RubricLevel[] = [
        { id: 'weak', label: 'Weak', description: '', rank: 1 },
        { id: 'proficient', label: 'Proficient', description: '', rank: 2 }
    ];

    it('counts a cell with no descriptor as empty', () => {
        const criteria: RubricCriterion[] = [{
            id: 'organization', label: 'Organization', description: '', points: 10,
            cells: { weak: { min: 0, max: 5, descriptor: 'Ideas arrive in no clear order.' } }
        }];
        const readiness = describeGrid(criteria, levels);
        expect(readiness.emptyCells).toBe(1);
        expect(readiness.complete).toBe(false);
        expect(readiness.totalPoints).toBe(10);
    });

    it('is complete when every cell in every row says something', () => {
        const criteria: RubricCriterion[] = [{
            id: 'organization', label: 'Organization', description: '', points: 10,
            cells: {
                weak: { min: 0, max: 5, descriptor: 'Ideas arrive in no clear order.' },
                proficient: { min: 6, max: 10, descriptor: 'Each paragraph does one job.' }
            }
        }];
        expect(describeGrid(criteria, levels).complete).toBe(true);
    });
});
