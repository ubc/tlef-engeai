/**
 * rubric-extraction-eval — runs rubric extraction on local instructor files and reports the grids
 *
 * For checking extraction quality on real rubrics without committing them: pass files from
 * anywhere on disk, and the script extracts their text the way an upload would, asks the model
 * for the rubric, converts it, and writes a readable report under `prompt-test/` (git-ignored).
 * It calls the configured model, so it needs the same `.env` as the app.
 *
 * Usage: npx ts-node -r dotenv/config scripts/rubric-extraction-eval.ts <file> [<file> ...]
 *
 * @author: EngE-AI Team
 * @date: 2026-10-09
 * @version: 1.0.0
 * @description: CLI that reports what rubric extraction makes of local rubric files.
 */

import fs from 'fs';
import path from 'path';
import { extractSourceFile } from '../src/writing-feedback/source-material-extraction';
import { convertExtractedRubric, extractRubricsFromMaterial } from '../src/writing-feedback/source-rubric-extraction';
import type { ImportedRubricShape } from '../src/writing-feedback/contracts';

function describeGrid(shape: ImportedRubricShape): string[] {
    const lines = [`  Levels: ${shape.levels.map((level) => level.label).join(' | ')}`];
    const total = shape.criteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0);
    lines.push(`  Criteria (${shape.criteria.length}, ${total} points):`);
    shape.criteria.forEach((criterion) => {
        const staff = criterion.assessedBy === 'staff' ? ' [staff]' : '';
        lines.push(`    - ${criterion.label}: ${criterion.points ?? 'no points'}${staff}`);
        shape.levels.forEach((level) => {
            const cell = criterion.cells?.[level.id];
            if (!cell) return;
            const descriptor = (cell.descriptor ?? '').slice(0, 90).replace(/\s+/g, ' ');
            lines.push(`        ${level.label} [${cell.min}–${cell.max}]: ${descriptor}${(cell.descriptor?.length ?? 0) > 90 ? '…' : ''}`);
        });
    });
    return lines;
}

async function main(): Promise<void> {
    const files = process.argv.slice(2);
    if (!files.length) {
        console.error('Usage: npx ts-node -r dotenv/config scripts/rubric-extraction-eval.ts <file> [<file> ...]');
        process.exit(1);
    }
    const report: string[] = [];
    for (const file of files) {
        report.push(`==== ${path.basename(file)}`);
        try {
            // Step 1: the text an upload would store.
            const extracted = await extractSourceFile({ buffer: fs.readFileSync(file), fileName: path.basename(file) });
            report.push(`Extracted ${extracted.text.length} characters, tables kept: ${extracted.hasTables}`);
            // Step 2: what the model reports, and what the fixed rules make of it.
            const started = Date.now();
            const candidates = await extractRubricsFromMaterial(extracted.text);
            report.push(`Model: ${candidates.length} rubric(s) in ${Math.round((Date.now() - started) / 1000)}s`);
            candidates.forEach((candidate, index) => {
                const converted = convertExtractedRubric(candidate);
                report.push(`-- Candidate ${index + 1}: "${converted.title}" (${candidate.shape})${converted.refusal ? ` REFUSED: ${converted.refusal}` : ''}`);
                if (converted.shape) report.push(...describeGrid(converted.shape));
                converted.deductions.forEach((deduction) => report.push(`  Deduction: ${deduction}`));
                converted.notes.forEach((note) => report.push(`  Note: ${note}`));
            });
        } catch (error) {
            report.push(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
        }
        report.push('');
    }
    const outDir = path.join(__dirname, '..', 'prompt-test');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `rubric-extraction-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    fs.writeFileSync(outFile, report.join('\n'));
    console.log(`Report written to ${outFile}`);
}

void main();
