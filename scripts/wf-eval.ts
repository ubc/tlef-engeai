/**
 * Writing Feedback live eval — runs synthetic fixtures through the real engine
 *
 * Usage: npm run wf:eval -- [--runs N] [--only fixture-id] [--live-rag courseId]
 * Needs LLM_PROVIDER / LLM_ENDPOINT / LLM_DEFAULT_MODEL (and LLM_API_KEY if the provider
 * requires it). Fixture texts are synthetic, so full outputs are written to the report.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Live prompt-quality measurement for Writing Feedback.
 */

import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { RubricWritingFeedbackEngine } from '../src/writing-feedback/feedback-engine';
import type { WritingFeedbackMaterialRetriever } from '../src/writing-feedback/course-material-mentions';
import { EVAL_FIXTURES, buildEvalAssignment } from '../src/writing-feedback/__tests__/fixtures/eval/eval-fixtures';
import { InMemoryMaterialRetriever } from '../src/writing-feedback/__tests__/fixtures/eval/eval-materials';
import { runEvalChecks, type EvalRunOutput } from '../src/writing-feedback/eval-checks';

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Student-facing comments are known only once the gate exists; baseline reports undefined. */
async function studentComments(result: Record<string, unknown>, verifiedText: string): Promise<EvalRunOutput['studentComments']> {
    try {
        // require, not import(): ts-node runs this file as CommonJS, where import() of a .ts path fails.
        const gate = require('../src/writing-feedback/feedback-gate') as { studentFacingComments: <T extends { heldBack?: boolean }>(c: T[], m: string) => T[] };
        const mode = (result.gateDecision as 'standard' | 'global_revision' | undefined) ?? 'standard';
        const criteria = (result.criteria as Array<{ evidence: Array<{ quote: string }> }>) ?? [];
        const seeds = criteria.flatMap((criterion) => criterion.evidence.map((item) => ({
            quote: item.quote,
            heldBack: mode === 'global_revision'
        })));
        return gate.studentFacingComments(seeds.filter((seed) => verifiedText.includes(seed.quote)), mode);
    } catch {
        return undefined;
    }
}

async function main(): Promise<void> {
    process.env.MOCK_RESPONSE = 'false';
    if (!process.env.LLM_DEFAULT_MODEL) throw new Error('Set LLM_DEFAULT_MODEL (and the provider variables) before running the eval.');
    const runs = Math.max(1, Number(arg('runs') ?? 1));
    const only = arg('only');
    const liveRagCourse = arg('live-rag');
    const assignment = buildEvalAssignment();
    if (liveRagCourse) assignment.courseId = liveRagCourse;

    const report: Array<Record<string, unknown>> = [];
    const summary: string[] = [];
    for (const fixture of EVAL_FIXTURES.filter((candidate) => !only || candidate.id === only)) {
        for (let run = 1; run <= runs; run += 1) {
            const retriever: WritingFeedbackMaterialRetriever | undefined = liveRagCourse
                ? undefined
                : fixture.materials === 'none' ? new InMemoryMaterialRetriever([]) : new InMemoryMaterialRetriever();
            const started = Date.now();
            try {
                const generated = await new RubricWritingFeedbackEngine(undefined, retriever)
                    .generate({ assignment, verifiedText: fixture.text });
                const { runTrace, ...result } = generated as typeof generated & { runTrace?: EvalRunOutput['runTrace'] };
                const output: EvalRunOutput = {
                    verifiedText: fixture.text,
                    result: result as EvalRunOutput['result'],
                    runTrace,
                    studentComments: await studentComments(result as Record<string, unknown>, fixture.text)
                };
                const checks = runEvalChecks(output, fixture);
                const failed = checks.filter((item) => item.status === 'fail');
                summary.push(`${failed.length ? 'FAIL' : 'PASS'}  ${fixture.id} #${run}  ${failed.map((item) => item.name).join(', ')}`);
                report.push({ fixture: fixture.id, run, ms: Date.now() - started, checks, output });
            } catch (error) {
                summary.push(`ERROR ${fixture.id} #${run}  ${(error as Error).message}`);
                report.push({ fixture: fixture.id, run, ms: Date.now() - started, error: (error as Error).message });
            }
        }
    }

    const versions = require('../src/writing-feedback/sfl-foundation') as Record<string, unknown>;
    const outDir = path.join(process.cwd(), 'eval-reports');
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `wf-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify({
        promptVersions: {
            analyzer: versions.SFL_ANALYZER_PROMPT_VERSION,
            writer: versions.SFL_WRITER_PROMPT_VERSION,
            diagnosis: versions.TEXT_DIAGNOSIS_PROMPT_VERSION ?? null,
            relevance: versions.MATERIAL_RELEVANCE_PROMPT_VERSION ?? null
        },
        model: process.env.LLM_DEFAULT_MODEL,
        report
    }, null, 2));
    console.log(summary.join('\n'));
    console.log(`\nReport: ${file}`);
}

main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
});
