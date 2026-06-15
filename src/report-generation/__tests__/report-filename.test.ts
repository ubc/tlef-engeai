import { buildReportPdfFilename, contentDispositionAttachmentPdf } from '../report-filename';

describe('buildReportPdfFilename', () => {
    it('follows EngE-AI naming pattern', () => {
        const filename = buildReportPdfFilename('Test 3', {
            academicYear: '2025-2026',
            termLabel: 'Winter-T1',
            displayLabel: 'Winter Term 1, 2025–2026'
        });
        expect(filename).toBe('EngE-AI-Test 3-2025-2026-Winter-T1-report.pdf');
    });

    it('sanitizes unsafe course name characters', () => {
        const filename = buildReportPdfFilename('Bad/Name', {
            academicYear: '2025-2026',
            termLabel: 'Summer',
            displayLabel: 'Summer'
        });
        expect(filename).not.toContain('/');
    });
});

describe('contentDispositionAttachmentPdf', () => {
    it('includes ASCII fallback and UTF-8 filename*', () => {
        const header = contentDispositionAttachmentPdf('EngE-AI-Test-report.pdf');
        expect(header).toContain('attachment');
        expect(header).toContain('filename=');
        expect(header).toContain('filename*=UTF-8');
    });
});
