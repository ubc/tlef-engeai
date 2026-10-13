/**
 * Source material extraction — instructor files and pastes as text that keeps its tables
 *
 * Instructors keep assignment instructions and grading schemes in their own documents, and the
 * rubric in those documents is usually a table. Plain-text extraction puts every table cell on
 * its own line, which loses which description belongs to which criterion and level. This module
 * keeps the table structure wherever the source has it: Word files and pasted HTML become
 * markdown tables. PDFs carry no table structure to keep, so they use the parser's markdown.
 *
 * Instructor material only. Nothing here touches student submissions, embeddings, or Qdrant.
 *
 * @author: EngE-AI Team
 * @date: 2026-10-08
 * @version: 1.0.0
 * @description: Extracts instructor-supplied assignment material, keeping table structure.
 */

import path from 'path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { LocalDocumentExtractionService } from './document-extraction-service';

/** Longest extracted text one material may hold. Longer material is refused, never cut. */
export const MAX_SOURCE_MATERIAL_CHARS = 60000;

/** Most materials one assignment may hold. */
export const MAX_SOURCE_MATERIALS = 5;

/** File types accepted as source material. */
export const SOURCE_MATERIAL_TYPES = ['docx', 'pdf', 'html', 'htm', 'txt', 'md', 'markdown'] as const;

/** Refusal messages staff can read and act on. Each is also a safe error prefix for routes. */
export const SOURCE_MATERIAL_ERRORS = {
    unsupported: 'This file type is not supported. Upload a Word document, PDF, HTML, or text file.',
    empty: 'No text could be read from this material. If it is a scanned PDF, paste its text instead.',
    tooLong: `This material is longer than ${MAX_SOURCE_MATERIAL_CHARS.toLocaleString('en-US')} characters. Upload or paste only the parts with the instructions and the rubric.`,
    tooMany: `An assignment can hold at most ${MAX_SOURCE_MATERIALS} source materials. Remove one before adding another.`
} as const;

/** Extracted material text, and whether real table structure survived into it. */
export interface ExtractedSourceText {
    text: string;
    hasTables: boolean;
}

/** Elements whose content is never instructor-readable text. */
const DROPPED_ELEMENTS = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'iframe', 'object', 'embed', 'svg', 'img']);

/** A markdown table separator row, as typed or pasted into a text or markdown source. */
const MARKDOWN_TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m;

function columnSpan(node: TurndownService.Node): number {
    const span = Number((node as HTMLElement).getAttribute?.('colspan'));
    return Number.isInteger(span) && span > 1 ? Math.min(span, 20) : 1;
}

/** Whether a row is its table's first, ignoring which thead/tbody/tfoot section holds it. */
function isFirstRow(row: TurndownService.Node): boolean {
    let table: Node | null = row.parentNode;
    while (table && table.nodeName !== 'TABLE') table = table.parentNode;
    if (!table) return false;
    const rows = (table as HTMLTableElement).getElementsByTagName?.('tr');
    return Boolean(rows && rows[0] === row);
}

/** One table cell's content on a single line, with pipes escaped so they cannot open a column. */
function cellText(content: string): string {
    return content
        .replace(/\s*\n+\s*/g, ' <br> ')
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' ')
        .replace(/^(?:\s*<br>\s*)+|(?:\s*<br>\s*)+$/g, '')
        .trim();
}

/**
 * htmlToSourceText - HTML as readable markdown, with tables kept as markdown tables.
 *
 * The first row of each table becomes its header, because a markdown table needs one; in
 * rubrics that row is almost always the level or column headings. A merged cell is followed by
 * empty cells so every later column stays aligned. Images, scripts, and styles are dropped.
 *
 * @param html - Untrusted HTML from mammoth, an uploaded HTML file, or the clipboard
 * @returns Markdown text, and whether any table was kept
 */
export function htmlToSourceText(html: string): ExtractedSourceText {
    let tables = 0;
    const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    // The text is read by staff and a model, never rendered as markdown, so escaping
    // characters such as "1." only adds backslashes that obscure the instructor's wording.
    turndown.escape = (text: string) => text;
    // A rule, not `remove`: turndown applies its built-in rules before its remove list, so
    // an image would otherwise arrive as a base64 data URI longer than the rest of the text.
    turndown.addRule('dropped', {
        filter: (node) => DROPPED_ELEMENTS.has(node.nodeName.toLowerCase()),
        replacement: () => ''
    });

    turndown.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: (content, node) => ` ${cellText(content)} |${' |'.repeat(columnSpan(node) - 1)}`
    });
    turndown.addRule('tableRow', {
        filter: 'tr',
        replacement: (content, node) => {
            const row = `|${content}\n`;
            if (!isFirstRow(node)) return row;
            const cells = Array.from((node as HTMLElement).children ?? [])
                .filter((cell) => cell.nodeName === 'TD' || cell.nodeName === 'TH')
                .reduce((total, cell) => total + columnSpan(cell as unknown as TurndownService.Node), 0);
            return `${row}|${' --- |'.repeat(Math.max(1, cells))}\n`;
        }
    });
    turndown.addRule('table', {
        filter: 'table',
        replacement: (content) => {
            const rows = content.split('\n').filter((line) => line.trim().startsWith('|'));
            if (rows.length === 0) return '';
            tables += 1;
            return `\n\n${rows.join('\n')}\n\n`;
        }
    });

    const text = normalizeSourceText(turndown.turndown(html));
    return { text, hasTables: tables > 0 };
}

/** Collapses runs of blank lines and strips characters Mongo and the model should never see. */
function normalizeSourceText(text: string): string {
    return text
        .replace(/\u0000/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * assertUsableSourceText - refuses empty or over-long material rather than storing or cutting it.
 *
 * @param extracted - Text produced from a file or paste
 * @returns The same value, once it is known to be usable
 * @throws Error with a staff-readable {@link SOURCE_MATERIAL_ERRORS} message
 */
export function assertUsableSourceText(extracted: ExtractedSourceText): ExtractedSourceText {
    if (!extracted.text) throw new Error(SOURCE_MATERIAL_ERRORS.empty);
    if (extracted.text.length > MAX_SOURCE_MATERIAL_CHARS) throw new Error(SOURCE_MATERIAL_ERRORS.tooLong);
    return extracted;
}

/**
 * editedSourceText - staff's corrected text for a material, held to the same limits as new material.
 *
 * The text is taken as written apart from whitespace normalization. Whether it holds tables is
 * read from the text itself, since a correction can add, fix, or remove a markdown table.
 *
 * @param text - The full corrected text
 * @returns Usable text and whether it holds markdown tables
 * @throws Error with a staff-readable {@link SOURCE_MATERIAL_ERRORS} message
 */
export function editedSourceText(text: string): ExtractedSourceText {
    const normalized = normalizeSourceText(text);
    return assertUsableSourceText({ text: normalized, hasTables: MARKDOWN_TABLE_SEPARATOR.test(normalized) });
}

/**
 * extractSourceFile - an uploaded file as source text, keeping tables where the format has them.
 *
 * Word files go through HTML so their tables survive; HTML files are read directly; PDFs use
 * the document parser's markdown, which keeps headings but cannot recover table structure; text
 * and markdown files are read as written.
 *
 * @param input - In-memory upload and its untrusted original filename
 * @returns Usable extracted text and the sanitized basename to display
 * @throws Error with a staff-readable {@link SOURCE_MATERIAL_ERRORS} message, or a parser error
 */
export async function extractSourceFile(input: { buffer: Buffer; fileName: string }): Promise<ExtractedSourceText & { fileName: string }> {
    // Split on both separators: some browsers send a Windows path, which POSIX basename keeps whole.
    const baseName = input.fileName.split(/[\\/]/).pop() ?? '';
    const fileName = baseName.replace(/[^a-zA-Z0-9._ ()&,-]/g, '_').slice(0, 160);
    const extension = path.extname(fileName).slice(1).toLowerCase();
    if (!(SOURCE_MATERIAL_TYPES as readonly string[]).includes(extension)) {
        throw new Error(SOURCE_MATERIAL_ERRORS.unsupported);
    }

    let extracted: ExtractedSourceText;
    if (extension === 'docx') {
        const { value } = await mammoth.convertToHtml({ buffer: input.buffer });
        extracted = htmlToSourceText(value);
    } else if (extension === 'html' || extension === 'htm') {
        extracted = htmlToSourceText(input.buffer.toString('utf8'));
    } else if (extension === 'pdf') {
        const parsed = await new LocalDocumentExtractionService().extract(input, 'markdown');
        extracted = { text: normalizeSourceText(parsed.text), hasTables: false };
    } else {
        const text = normalizeSourceText(input.buffer.toString('utf8'));
        extracted = { text, hasTables: MARKDOWN_TABLE_SEPARATOR.test(text) };
    }
    return { ...assertUsableSourceText(extracted), fileName };
}

/**
 * extractPastedSource - pasted material as source text.
 *
 * The clipboard's HTML is preferred because a table copied from Word or Google Docs arrives
 * there with its rows and columns; the plain text is used when no HTML came with the paste or
 * the HTML held no text.
 *
 * @param input - The paste's plain text and, when the browser supplied it, its HTML
 * @returns Usable extracted text
 * @throws Error with a staff-readable {@link SOURCE_MATERIAL_ERRORS} message
 */
export function extractPastedSource(input: { text?: string; html?: string }): ExtractedSourceText {
    const fromHtml = input.html?.trim() ? htmlToSourceText(input.html) : undefined;
    if (fromHtml?.text) return assertUsableSourceText(fromHtml);
    const text = normalizeSourceText(input.text ?? '');
    return assertUsableSourceText({ text, hasTables: MARKDOWN_TABLE_SEPARATOR.test(text) });
}
