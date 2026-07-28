/**
 * Submission extraction — isolated digital parsing and verification-gated OCR
 *
 * Extracts supported digital documents through a short-lived local file without
 * invoking course-material upload, embeddings, retrieval, or Qdrant. The OCR adapter
 * intentionally returns no transcript until privacy approval and benchmarking exist.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.0.0
 * @description: Parses writing submissions locally and keeps scan intake staff-verified.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { DocumentParsingModule } from 'ubc-genai-toolkit-document-parsing';
import type { DocumentExtractionService, OcrProvider } from './contracts';

const DIGITAL_TYPES = new Set(['txt', 'docx', 'pdf', 'html', 'htm']);
const SCAN_TYPES = new Set(['pdf', 'jpeg', 'jpg', 'png']);

function extensionOf(fileName: string): string {
    return path.extname(fileName).slice(1).toLowerCase();
}

/**
 * Parses supported digital buffers through the document toolkit's local file API.
 *
 * Temporary files use sanitized basenames and random prefixes, with cleanup attempted on
 * every success or failure path. Extracted submission text never enters the RAG pipeline.
 */
export class LocalDocumentExtractionService implements DocumentExtractionService {
    private readonly parser = new DocumentParsingModule();

    /**
     * Extracts text from one supported digital submission.
     *
     * @param input - In-memory file and untrusted original filename
     * @returns Extracted text with a sanitized basename
     * @throws Error for unsupported types or parser/filesystem failures
     */
    async extract(input: { buffer: Buffer; fileName: string }): Promise<{ text: string; fileName: string }> {
        // Reject unsupported types before writing any untrusted payload to disk.
        const extension = extensionOf(input.fileName);
        if (!DIGITAL_TYPES.has(extension)) {
            throw new Error('Unsupported digital file type. Use TXT, DOCX, text-based PDF, or HTML.');
        }
        // Strip paths and unsafe characters before deriving a randomized temporary name.
        const safeName = path.basename(input.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const tempPath = path.join(os.tmpdir(), `engeai-writing-${randomUUID()}-${safeName}`);
        try {
            await fs.promises.writeFile(tempPath, input.buffer);
            // Plain text bypasses the heavier document parser but uses identical cleanup.
            if (extension === 'txt') {
                return { text: await fs.promises.readFile(tempPath, 'utf8'), fileName: safeName };
            }
            const parsed = await this.parser.parse({ filePath: tempPath }, 'text');
            return { text: parsed.content ?? '', fileName: safeName };
        } finally {
            // Cleanup is best-effort so unlink failures never mask the extraction result/error.
            await fs.promises.unlink(tempPath).catch(() => undefined);
        }
    }
}

/**
 * Verification-gated placeholder for paper scans.
 *
 * It validates supported media but deliberately performs no OCR until privacy approval
 * and handwriting benchmarking are complete, forcing the staff verification workflow.
 */
export class StaffVerifiedMockOcrProvider implements OcrProvider {
    /**
     * Validates scan media while returning an empty, explicitly unverified transcript.
     *
     * @param input - Scan buffer and original filename; bytes are intentionally not processed
     * @returns Empty transcript and zero confidence for mandatory staff verification
     * @throws Error when the file extension is not an accepted scan format
     */
    async extract(input: { buffer: Buffer; fileName: string }): Promise<{ text: string; confidence: number }> {
        if (!SCAN_TYPES.has(extensionOf(input.fileName))) {
            throw new Error('Paper intake supports PDF, JPEG, and PNG scans.');
        }
        return { text: '', confidence: 0 };
    }
}
