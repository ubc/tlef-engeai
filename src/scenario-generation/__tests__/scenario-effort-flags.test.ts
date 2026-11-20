import { effortFlagsForAnswer, normalizeAnswerText } from '../scenario-effort-flags';

const prompt =
    'Light with a wavelength of 250 nm shines on a metal surface whose work function is 4.3 eV. Calculate the maximum kinetic energy of the emitted photoelectrons.';
const modelAnswer =
    'The photon energy is hc divided by lambda which gives about 4.96 eV, so the maximum kinetic energy is 4.96 minus 4.3 which is about 0.66 eV.';

function flags(answer: string, previousAnswer?: string) {
    return effortFlagsForAnswer({ answer, prompt, modelAnswer, previousAnswer });
}

describe('normalizeAnswerText', () => {
    it('lowercases, drops punctuation and LaTeX commands, keeps decimals', () => {
        expect(normalizeAnswerText('  K = $\\frac{hc}{\\lambda}$ - 4.3 eV!! ')).toBe('k hc 4.3 ev');
    });
});

describe('effortFlagsForAnswer', () => {
    it('passes a terse but real numeric answer', () => {
        expect(flags('K = 0.66 eV')).toEqual([]);
    });

    it('passes a genuine worked answer in the student’s own words', () => {
        expect(
            flags('E = hc/λ = (6.63e-34)(3e8)/(250e-9) ≈ 7.95e-19 J ≈ 4.97 eV, subtract 4.3 eV to get roughly 0.67 eV')
        ).toEqual([]);
    });

    it.each(['idk', 'I don’t know', 'n/a', '?', '0.66', ''])('flags "%s" as too short', (answer) => {
        expect(flags(answer)).toContain('too_short');
    });

    it('flags an answer that mostly repeats the question', () => {
        expect(flags('Calculate the maximum kinetic energy of the emitted photoelectrons')).toEqual([
            'repeats_question',
        ]);
    });

    it('flags an answer copied from the model answer', () => {
        expect(flags('the maximum kinetic energy is 4.96 minus 4.3 which is about 0.66 eV')).toEqual([
            'copies_model_answer',
        ]);
    });

    it('flags a resubmission identical to the previous answer, ignoring case and spacing', () => {
        expect(flags('K is about 0.66 eV.', 'k  is about 0.66 eV')).toEqual(['duplicate']);
        expect(flags('K is about 0.66 eV', 'K is about 0.7 eV')).toEqual([]);
    });

    it('does not run copy checks on answers too short to judge', () => {
        // Three words are all in the model answer, but that alone says nothing about copying
        expect(flags('about 0.66 eV')).toEqual([]);
    });
});
