// public/scripts/feature/math-delimiters.ts

/**
 * Rewrites `\(...\)` and `\[...\]` math into the `$...$` / `$$...$$` form that
 * RenderChat and KaTeX recognize.
 *
 * LLM text returned through structured JSON output sometimes arrives with every
 * backslash doubled (`\\(\\lambda\\)`). In that case the doubling is undone inside
 * the converted math as well, so `\\lambda` becomes `\lambda`.
 *
 * Text that already uses dollar delimiters passes through unchanged.
 *
 * @param text - Markdown text that may contain LaTeX
 * @returns The same text with all math in dollar-delimited form
 */
export function normalizeMathDelimiters(text: string): string {
    const undouble = (inner: string) => inner.replace(/\\\\/g, '\\');

    return text
        // Doubled backslashes: \\[ ... \\] and \\( ... \\)
        .replace(/\\\\\[([\s\S]+?)\\\\\]/g, (_m, inner: string) => toDisplay(undouble(inner)))
        .replace(/\\\\\(([\s\S]+?)\\\\\)/g, (_m, inner: string) => toInline(undouble(inner)))
        // Single backslashes: \[ ... \] and \( ... \)
        .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => toDisplay(inner))
        .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner: string) => toInline(inner));
}

function toInline(inner: string): string {
    // RenderChat only treats single-line `$...$` as inline math.
    return `$${inner.trim().replace(/\s*\n\s*/g, ' ')}$`;
}

function toDisplay(inner: string): string {
    return `$$\n${inner.trim()}\n$$`;
}
