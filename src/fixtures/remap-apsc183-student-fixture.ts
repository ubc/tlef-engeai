/**
 * remap-apsc183-student-fixture.ts
 *
 * Reads legacy student struggle fixture + remap table; writes catalog-aligned JSON.
 *
 * Usage:
 *   npx ts-node src/fixtures/remap-apsc183-student-fixture.ts
 *   npx ts-node src/fixtures/remap-apsc183-student-fixture.ts /path/to/input.json /path/to/output.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAllPredeterminedCatalogLabels } from '../memory-agent/predetermined-struggle-catalog';

const DEFAULT_INPUT = path.join(__dirname, '../test-scripts/APSC183-struggle-topic-lists.json');
const DEFAULT_OUTPUT = DEFAULT_INPUT;
const REMAP_PATH = path.join(__dirname, 'APSC183-struggle-topic-remap.json');

type StudentFixture = Record<string, string[]>;

interface RemapFile {
    mappings: Record<string, string>;
}

function loadJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function dedupePreserveOrder(labels: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const label of labels) {
        if (!seen.has(label)) {
            seen.add(label);
            result.push(label);
        }
    }
    return result;
}

function remapFixture(input: StudentFixture, mappings: Record<string, string>): StudentFixture {
    const catalogLabels = new Set(getAllPredeterminedCatalogLabels());
    const output: StudentFixture = {};
    let unmappedCount = 0;

    for (const [studentName, topics] of Object.entries(input)) {
        const remapped: string[] = [];

        for (const topic of topics) {
            const mapped = mappings[topic];
            if (!mapped) {
                console.warn(`[REMAP] No mapping for "${topic}" (${studentName})`);
                unmappedCount += 1;
                continue;
            }
            if (!catalogLabels.has(mapped)) {
                console.warn(`[REMAP] Mapped label not in catalog: "${mapped}"`);
            }
            remapped.push(mapped);
        }

        output[studentName] = dedupePreserveOrder(remapped);
    }

    if (unmappedCount > 0) {
        console.warn(`[REMAP] ${unmappedCount} label(s) had no mapping and were dropped`);
    }

    return output;
}

function main(): void {
    const inputPath = path.resolve(process.argv[2]?.trim() || DEFAULT_INPUT);
    const outputPath = path.resolve(process.argv[3]?.trim() || DEFAULT_OUTPUT);

    if (!fs.existsSync(inputPath)) {
        console.error(`Input fixture not found: ${inputPath}`);
        process.exit(1);
    }

    const remapFile = loadJson<RemapFile>(REMAP_PATH);
    const input = loadJson<StudentFixture>(inputPath);
    const output = remapFixture(input, remapFile.mappings);

    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${Object.keys(output).length} students to ${outputPath}`);
}

main();
