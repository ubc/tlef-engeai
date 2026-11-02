/**
 * material-name.test.ts
 *
 * Picking a file names the material after it, so staff no longer type a name for every
 * upload, but a name they typed themselves is never replaced.
 */

import { materialNameFromFileName, nameAfterFilePick } from '../utils/material-name';

describe('materialNameFromFileName', () => {
    it('drops the extension', () => {
        expect(materialNameFromFileName('Week 3 Lecture.pdf')).toBe('Week 3 Lecture');
    });

    it('drops only the last extension', () => {
        expect(materialNameFromFileName('notes.v2.docx')).toBe('notes.v2');
    });

    it('keeps a name with no extension', () => {
        expect(materialNameFromFileName('README')).toBe('README');
    });

    it('keeps a dotfile name rather than returning an empty name', () => {
        expect(materialNameFromFileName('.env')).toBe('.env');
    });

    it('trims surrounding whitespace', () => {
        expect(materialNameFromFileName('  slides.pptx  ')).toBe('slides');
    });
});

describe('nameAfterFilePick', () => {
    it('fills an empty name from the file', () => {
        expect(nameAfterFilePick('', null, 'lab.pdf')).toBe('lab');
    });

    it('treats a whitespace-only name as empty', () => {
        expect(nameAfterFilePick('   ', null, 'lab.pdf')).toBe('lab');
    });

    it('replaces a name it filled itself when another file is picked', () => {
        expect(nameAfterFilePick('lab', 'lab', 'syllabus.pdf')).toBe('syllabus');
    });

    it('keeps a name the user typed', () => {
        expect(nameAfterFilePick('Lab handout', null, 'lab.pdf')).toBe('Lab handout');
    });

    it('keeps a name the user edited after it was filled', () => {
        expect(nameAfterFilePick('lab (final)', 'lab', 'syllabus.pdf')).toBe('lab (final)');
    });

    it('leaves the name alone when the file is cleared', () => {
        expect(nameAfterFilePick('lab', 'lab', null)).toBe('lab');
    });
});
