/**
 * LaTeX JSON repair — restores math that an LLM escaped incorrectly inside JSON output
 *
 * In structured (JSON) output every LaTeX backslash must be written twice. Models sometimes
 * write it once, and the JSON parser then turns `\frac`, `\beta`, `\theta`, `\rho`, `\nu` into
 * form feed, backspace, tab, carriage return or newline followed by the rest of the word; other
 * slips leave a control character or the literal text `\u0007` where the backslash was, or drop
 * the backslash entirely (`\lambda` → `lambda`). KaTeX cannot render any of these.
 *
 * Only text inside `$...$` / `$$...$$` is changed, and the fixes are best-effort: when the
 * parser consumed a letter we restore the usual one (`\f` → `\frac`'s `f`), which is right for
 * every common command but cannot be proven.
 *
 * @author: Kathleen Tom
 * @date: 2026-11-20
 * @version: 1.0.0
 * @description: Best-effort repair of JSON-mangled LaTeX in LLM feedback before it is stored.
 */

/** Greek letters and symbols the model commonly writes without their backslash. */
const BARE_COMMANDS = [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
    'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
    'Phi', 'Psi', 'Omega', 'hbar', 'infty', 'approx', 'cdot', 'times',
];

// Longest first so `varepsilon` wins over `epsilon`; bounded by non-letters and no backslash before.
const BARE_COMMAND_PATTERN = new RegExp(
    `(?<![\\\\A-Za-z])(${[...BARE_COMMANDS].sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z])`,
    'g'
);

/** Arguments that are text, not math — never add backslashes inside these. */
const TEXT_ARGUMENT_PATTERN = /\\(?:text|textrm|textbf|textit|mathrm|operatorname)\{[^{}]*\}/g;

/**
 * repairJsonMangledLatex — fix math damaged by single-escaped backslashes in JSON output.
 *
 * @param text - Feedback text from a structured LLM response
 * @returns The same text with math segments repaired; text outside math is unchanged
 */
export function repairJsonMangledLatex(text: string): string {
    return text.replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (whole, display?: string, inline?: string) => {
        if (display !== undefined) return `$$${repairMath(display)}$$`;
        if (inline !== undefined) return `$${repairMath(inline)}$`;
        return whole;
    });
}

function repairMath(math: string): string {
    // Step 1: control characters the JSON parser produced from `\f`, `\b`, `\t`, `\r`, `\n`
    let fixed = math
        .replace(/\f/g, '\\f')
        .replace(/\x08/g, '\\b')
        .replace(/\t(?=[A-Za-z])/g, '\\t')
        .replace(/\r(?=[A-Za-z])/g, '\\r')
        // A real line break is legitimate in display math, so only restore known `\n…` commands
        .replace(/\n(?=(?:abla|eq|ot|u|e|i|eg|ewline)(?![A-Za-z]))/g, '\\n');

    // Step 2: escaped text forms of those same characters keep their letter (`\u000crac` → `\frac`);
    // any other control character, or its escaped form, stands in for the backslash alone
    const consumedLetter: Record<string, string> = { '08': 'b', '09': 't', '0a': 'n', '0c': 'f', '0d': 'r' };
    fixed = fixed
        .replace(/\\u00(0[89acdACD])(?=[A-Za-z])/g, (_m, hex: string) => `\\${consumedLetter[hex.toLowerCase()]}`)
        .replace(/\\u00[01][0-9a-fA-F]/g, '\\')
        .replace(/[\x00-\x08\x0B\x0E-\x1F]/g, '\\');

    // Step 3: commands that lost their backslash entirely, skipping \text{...} arguments
    const protectedArgs: string[] = [];
    fixed = fixed.replace(TEXT_ARGUMENT_PATTERN, (arg) => `\u0000${protectedArgs.push(arg) - 1}\u0000`);
    fixed = fixed.replace(BARE_COMMAND_PATTERN, '\\$1');
    return fixed.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => protectedArgs[Number(i)]);
}
