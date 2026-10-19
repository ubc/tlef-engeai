/**
 * Writing Feedback allowlist tests — the attribute check never deletes a stored field
 *
 * The attribute check (migrate op A) deletes every top-level field its allowlist does not
 * name. These read each stored Writing Feedback type straight from `contracts.ts` with the
 * TypeScript compiler, so a field added to a type but not to its allowlist fails here rather
 * than disappearing from production records the next time someone runs the check with apply.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Guards the Writing Feedback attribute-check allowlists against the stored types.
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { walkObject, type FieldSpec } from '../schema-walker';
import {
    writingAssignmentSchema,
    writingFeedbackRunSchema,
    writingJobSchema,
    writingReleaseSchema,
    writingSubmissionSchema
} from '../schemas';

const CONTRACTS_DIR = path.join(__dirname, '..', '..', 'writing-feedback', 'contracts');
const CONTRACT_FILES = fs
    .readdirSync(CONTRACTS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(CONTRACTS_DIR, name));

/** Fields stored beside a type's own, written through intersection types in the Mongo delegate. */
const STORED_EXTRAS: Record<string, string[]> = {
    WritingSubmission: ['reviews']
};

let checker: ts.TypeChecker;
let contracts: ts.SourceFile[];

beforeAll(() => {
    const program = ts.createProgram(CONTRACT_FILES, { strict: true, noEmit: true });
    checker = program.getTypeChecker();
    contracts = CONTRACT_FILES.map((file) => program.getSourceFile(file)!);
});

function storedFields(typeName: string): string[] {
    let fields: string[] | undefined;
    for (const file of contracts) {
        ts.forEachChild(file, (node) => {
            if (ts.isInterfaceDeclaration(node) && node.name.text === typeName) {
                fields = checker.getPropertiesOfType(checker.getTypeAtLocation(node)).map((property) => property.name);
            }
        });
    }
    if (!fields) throw new Error(`${typeName} is not declared in writing-feedback/contracts/`);
    return [...fields, ...(STORED_EXTRAS[typeName] ?? [])];
}

describe('Writing Feedback attribute-check allowlists', () => {
    it.each<[string, FieldSpec[]]>([
        ['WritingAssignment', writingAssignmentSchema],
        ['WritingSubmission', writingSubmissionSchema],
        ['WritingFeedbackRun', writingFeedbackRunSchema],
        ['WritingRelease', writingReleaseSchema],
        ['WritingJob', writingJobSchema]
    ])('keeps every stored field of %s', (typeName, schema) => {
        const fields = storedFields(typeName);
        // A record carrying every field, each holding a nested object so opaque fields are
        // exercised too; the identity field needs a usable id or the walk skips the record.
        const record: Record<string, unknown> = Object.fromEntries(fields.map((field) => [field, { kept: true }]));
        record.id = 'record-1';

        const result = walkObject(record, schema);

        expect(result.skipped).toBe(false);
        expect(fields.filter((field) => !(field in (result.value ?? {})))).toEqual([]);
    }, 30000);
});
