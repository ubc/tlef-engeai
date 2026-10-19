/**
 * Source material extraction tests — instructor files and pastes keep their tables
 *
 * A rubric in an instructor's document is a table, and its meaning is in which description
 * sits in which row and column. These pin that Word files and pasted HTML keep that structure,
 * that nothing unreadable (images, scripts) reaches the text, and that unusable material is
 * refused rather than stored or cut.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for source-material extraction from files and pastes.
 */

import fs from 'fs';
import path from 'path';
import {
    MAX_SOURCE_MATERIAL_CHARS,
    SOURCE_MATERIAL_ERRORS,
    extractPastedSource,
    extractSourceFile,
    htmlToSourceText
} from '../source-material-extraction';

describe('htmlToSourceText', () => {
    it('keeps a table as a markdown table whose first row is the header', () => {
        const { text, hasTables } = htmlToSourceText(
            '<table><thead><tr><th>Criterion</th><th>Good</th></tr></thead>'
            + '<tbody><tr><td>Organization</td><td>Clear stages</td></tr></tbody></table>'
        );

        expect(hasTables).toBe(true);
        expect(text).toBe('| Criterion | Good |\n| --- | --- |\n| Organization | Clear stages |');
    });

    it('pads a merged cell so later columns stay aligned, and escapes pipes inside a cell', () => {
        const { text } = htmlToSourceText(
            '<table><tr><td>Criterion</td><td>Weak</td><td>Strong</td></tr>'
            + '<tr><td colspan="2">Applies to a | b</td><td>Full marks</td></tr></table>'
        );

        expect(text.split('\n')).toEqual([
            '| Criterion | Weak | Strong |',
            '| --- | --- | --- |',
            '| Applies to a \\| b | | Full marks |'
        ]);
    });

    it('joins a cell\'s paragraphs on one line', () => {
        const { text } = htmlToSourceText('<table><tr><td><p>First idea.</p><p>Second idea.</p></td></tr></table>');

        expect(text).toContain('| First idea. <br> Second idea. |');
    });

    it('drops images, scripts, and styles', () => {
        const { text } = htmlToSourceText(
            '<style>p { color: red; }</style><script>alert(1)</script>'
            + '<p>Instructions<img src="data:image/png;base64,AAAA" alt="logo"></p>'
        );

        expect(text).toBe('Instructions');
    });

    it('reports no tables when the HTML has none', () => {
        expect(htmlToSourceText('<p>Write 400 words.</p>')).toEqual({ text: 'Write 400 words.', hasTables: false });
    });
});

describe('extractSourceFile', () => {
    it('keeps the table in a Word document', async () => {
        const buffer = fs.readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'sample-rubric-table.docx'));
        const extracted = await extractSourceFile({ buffer, fileName: 'C:\\Users\\me\\Rubric (final).docx' });

        expect(extracted.fileName).toBe('Rubric (final).docx');
        expect(extracted.hasTables).toBe(true);
        expect(extracted.text).toContain('| Criterion | Developing | Proficient |');
        expect(extracted.text).toContain('| Organization | Some stages \\| are missing | All stages are present |');
        expect(extracted.text).toContain('Total: 20 points');
    });

    it('recognises a markdown table in a text file', async () => {
        const extracted = await extractSourceFile({
            buffer: Buffer.from('| Criterion | Points |\n| --- | --- |\n| Content | 10 |'),
            fileName: 'rubric.md'
        });

        expect(extracted.hasTables).toBe(true);
    });

    it('refuses an unsupported file type', async () => {
        await expect(extractSourceFile({ buffer: Buffer.from('x'), fileName: 'rubric.xlsx' }))
            .rejects.toThrow(SOURCE_MATERIAL_ERRORS.unsupported);
    });

    it('refuses a file with no text', async () => {
        await expect(extractSourceFile({ buffer: Buffer.from('  \n\n '), fileName: 'empty.txt' }))
            .rejects.toThrow(SOURCE_MATERIAL_ERRORS.empty);
    });

    it('refuses material longer than the limit instead of cutting it', async () => {
        await expect(extractSourceFile({ buffer: Buffer.from('a'.repeat(MAX_SOURCE_MATERIAL_CHARS + 1)), fileName: 'long.txt' }))
            .rejects.toThrow(SOURCE_MATERIAL_ERRORS.tooLong);
    });
});

describe('extractPastedSource', () => {
    it('prefers the clipboard HTML, which carries the table structure', () => {
        const extracted = extractPastedSource({
            text: 'Criterion\tPoints\nContent\t10',
            html: '<table><tr><td>Criterion</td><td>Points</td></tr><tr><td>Content</td><td>10</td></tr></table>'
        });

        expect(extracted.hasTables).toBe(true);
        expect(extracted.text).toContain('| Content | 10 |');
    });

    it('falls back to the plain text when the HTML holds no text', () => {
        expect(extractPastedSource({ text: 'Write a memo.', html: '<img src="x.png">' }))
            .toEqual({ text: 'Write a memo.', hasTables: false });
    });

    it('refuses an empty paste', () => {
        expect(() => extractPastedSource({ text: '   ' })).toThrow(SOURCE_MATERIAL_ERRORS.empty);
    });
});
