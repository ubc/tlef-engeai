/**
 * @fileoverview Plain-language contract and lint: known terms, banned SFL vocabulary,
 * quoted student words ignored, sentence length, staff-only flag text.
 */

import {
    buildStudentReaderContract,
    LAB_REPORT_FAMILIAR_TERMS,
    knownTermsFor,
    lintFeedbackProse,
    lintStudentProse
} from '../plain-language';

describe('knownTermsFor', () => {
    it('unions glossary terms, stage labels and the genre label', () => {
        expect(knownTermsFor({
            approvedGlossaryTerms: ['stance'],
            stages: [{ id: 's1', label: 'General statement', purpose: 'x' }],
            genreLabel: 'Descriptive report'
        })).toEqual(['stance', 'General statement', 'Descriptive report']);
    });

    it('returns an empty list without a profile', () => {
        expect(knownTermsFor(undefined)).toEqual([]);
    });
});

describe('lintStudentProse', () => {
    it('flags SFL terms students were not taught', () => {
        const issue = lintStudentProse('Use relational processes and keep the entity as the Theme of each clause.', []);
        expect(issue.bannedTerms).toEqual(expect.arrayContaining(['relational process', 'entity', 'Theme', 'clause']));
    });

    it('allows a known term', () => {
        expect(lintStudentProse('Your stance is too strong here.', ['stance']).bannedTerms).toEqual([]);
    });

    it('ignores words inside quotation marks', () => {
        expect(lintStudentProse('You wrote "The classification of rocks" as your title.', []).bannedTerms).toEqual([]);
        expect(lintStudentProse('You wrote “Theme parks” here.', []).bannedTerms).toEqual([]);
    });

    it('allows "Theme" at the start of a sentence but flags it mid-sentence', () => {
        expect(lintStudentProse('Theme parks are popular.', []).bannedTerms).toEqual([]);
        expect(lintStudentProse('Keep sound as the Theme.', []).bannedTerms).toEqual(['Theme']);
    });

    it('does not treat apostrophes as quotation marks', () => {
        expect(lintStudentProse("The student's sentence uses the entity as it's subject.", []).bannedTerms).toEqual(['entity']);
    });

    it('does not match words that merely contain a term', () => {
        expect(lintStudentProse('The data was processed and registered.', []).bannedTerms).toEqual([]);
    });

    it('counts sentences over 25 words without splitting on decimals or e.g.', () => {
        const long = 'You explain each step of how sound moves from the guitar string through the air to the ear and then to the brain, which is a time order and not a report.';
        const issue = lintStudentProse(`${long} Add 3.5 g, e.g. salt.`, []);
        expect(issue.sentences).toBe(2);
        expect(issue.longSentences).toBe(1);
    });

    it('marks a comment with more sentences than allowed', () => {
        expect(lintStudentProse('One. Two. Three.', [], 2).tooManySentences).toBe(true);
    });
});

describe('lintFeedbackProse', () => {
    const result = {
        criteria: [{
            explanation: 'Your paragraph explains how sound travels.',
            evidence: [{ rationale: 'The Theme shifts to scientists.', revisionGuidance: 'Start each sentence with the volcano type you describe.' }]
        }],
        strengths: ['Your title names the topic.'],
        revisionGoals: [{ goal: 'Rewrite it as a descriptive report.', action: 'Write your first sentence so it says what a volcano is.' }]
    };

    it('aggregates hits across every student-facing field', () => {
        const report = lintFeedbackProse(result, []);
        expect(report.bannedTerms).toEqual(['Theme']);
        expect(report.bannedHits).toBe(1);
    });

});

describe('buildStudentReaderContract', () => {
    const contract = buildStudentReaderContract(['General statement']);

    it('names the real reader and the limits', () => {
        expect(contract).toMatch(/student is the final reader/i);
        expect(contract).toMatch(/additional language/);
        expect(contract).toMatch(/25 words/);
    });

    it('lists known terms and asks for a gloss', () => {
        expect(contract).toContain('General statement');
        expect(contract).toMatch(/short plain explanation the first time/i);
    });

    it('carries the translation table', () => {
        expect(contract).toContain('the start of your sentence');
        expect(contract).toContain('how sure your sentence sounds');
    });

    it('keeps the quality floor', () => {
        expect(contract).toMatch(/Plain does not mean simple/);
    });
});

describe('familiar lab-report terms', () => {
    it('lists familiar terms as free to use without a gloss', () => {
        const contract = buildStudentReaderContract([], ['percent error', 'uncertainty']);
        expect(contract).toMatch(/use them freely, no explanation needed\): "percent error", "uncertainty"/);
        expect(contract).not.toMatch(/No course terms are listed/);
    });

    it('allows a known term that a banned pattern would match', () => {
        expect(lintStudentProse('Check the calibration of the scale.', []).bannedTerms).toEqual(['calibrated']);
        expect(lintStudentProse('Check the calibration of the scale.', ['calibration']).bannedTerms).toEqual([]);
    });

    it('ships standard lab terms, including calibration and uncertainty', () => {
        expect(LAB_REPORT_FAMILIAR_TERMS).toEqual(expect.arrayContaining(['calibration', 'uncertainty', 'percent error']));
    });
});

describe('rewrite question lint (D-153)', () => {
    it('lints the rewrite question', () => {
        const report = lintFeedbackProse({ criteria: [], strengths: [], revisionGoals: [], globalRevision: { diagnosisStatement: 'Plain.', rewriteDirection: 'Plain.', guidedQuestion: 'How does the Theme work here?' } }, []);
        expect(report.bannedTerms).toContain('Theme');
    });
});
