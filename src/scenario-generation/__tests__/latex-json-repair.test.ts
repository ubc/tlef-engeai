import { repairJsonMangledLatex } from '../latex-json-repair';
import { parsePlainTextPracticeFeedback, sanitizeScenarioFeedback } from '../scenario-schemas';

describe('repairJsonMangledLatex', () => {
    it('repairs the feedback seen in production-like testing', () => {
        // Stored text: a BEL character, a literal "\u0007", and two dropped backslashes
        const stored =
            'using $E_\u0007gamma=hc/lambda$, convert $250\\ \\text{nm}$, then $K_{\\max}=E_\\u0007gamma-phi$?';
        expect(repairJsonMangledLatex(stored)).toBe(
            'using $E_\\gamma=hc/\\lambda$, convert $250\\ \\text{nm}$, then $K_{\\max}=E_\\gamma-\\phi$?'
        );
    });

    it('restores commands the JSON parser turned into escape characters', () => {
        // \f, \b, \t, \r from `\frac`, `\beta`, `\theta`, `\rho`
        expect(repairJsonMangledLatex('$\frac{1}{2}\x08eta + \theta + \rho$')).toBe(
            '$\\frac{1}{2}\\beta + \\theta + \\rho$'
        );
    });

    it('restores \\nu but keeps real line breaks in display math', () => {
        expect(repairJsonMangledLatex('$$\nE = h\nu\n$$')).toBe('$$\nE = h\\nu\n$$');
    });

    it('restores escaped text forms that kept their letter', () => {
        expect(repairJsonMangledLatex('$\\u000crac{a}{b}$')).toBe('$\\frac{a}{b}$');
    });

    it('leaves correct math, \\text arguments, and text outside math alone', () => {
        const fine = 'Use lambda here, then $\\lambda = hc/E$ and $5\\ \\text{eta units}$ and $$\n\\Delta E\n$$';
        expect(repairJsonMangledLatex(fine)).toBe(fine);
    });

    it('does not add backslashes inside longer words or subscripts', () => {
        expect(repairJsonMangledLatex('$x_{beta2} + alphabet + E_{\\mathrm{photon}}$')).toBe(
            '$x_{\\beta2} + alphabet + E_{\\mathrm{photon}}$'
        );
    });
});

describe('exam feedback sanitizer', () => {
    it('repairs mangled math before the feedback is stored', () => {
        const { feedback } = sanitizeScenarioFeedback({ grade: 7, feedback: 'Check $E_\u0007gamma$.' }, '');
        expect(feedback).toBe('Check $E_\\gamma$.');
    });
});

describe('parsePlainTextPracticeFeedback', () => {
    it('keeps plain text, including LaTeX backslashes, exactly as written', () => {
        const text = 'Start with $E_\\gamma = hc/\\lambda$. What units is $\\lambda$ in?';
        expect(parsePlainTextPracticeFeedback(`  ${text}\n`)).toEqual({ feedback: text });
    });

    it('unwraps a code fence', () => {
        expect(parsePlainTextPracticeFeedback('```text\nTry $\\frac{a}{b}$.\n```')).toEqual({
            feedback: 'Try $\\frac{a}{b}$.',
        });
    });

    it('unwraps a JSON object and repairs its math', () => {
        expect(parsePlainTextPracticeFeedback('{"feedback": "Use $\\frac{1}{2}$ here."}')).toEqual({
            feedback: 'Use $\\frac{1}{2}$ here.',
        });
    });

    it('unwraps surrounding quotes', () => {
        expect(parsePlainTextPracticeFeedback('"Nice start."')).toEqual({ feedback: 'Nice start.' });
    });

    it('returns empty feedback for an empty reply', () => {
        expect(parsePlainTextPracticeFeedback('   ')).toEqual({ feedback: '' });
    });
});
