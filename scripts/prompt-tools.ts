/**
 * prompt-tools — validate, size, and export platform system prompt defaults
 *
 * Uses production loader and assembler (no duplicated manifest logic).
 * Run via npm: `prompts:validate`, `prompts:size`, `prompts:export-samples`.
 *
 * @author: EngE-AI Team
 * @date: 2026-06-25
 * @version: 1.1.0
 * @description: CLI for platform default manifests under src/chat/system-prompts/.
 */

import fs from 'fs';
import path from 'path';
import { assembleCourseSystemPrompt } from '../src/chat/system-prompts/assemble-course-system-prompt';
import {
    getPlatformModeDefaults,
    getSystemPromptsBaseDir,
    reloadPlatformDefaultsCache,
} from '../src/chat/system-prompts/system-prompt-defaults-loader';
import {
    CONVERSATION_MODE_IDS,
    ConversationModeId,
    LearningObjectiveForDisplay,
} from '../src/types/shared';

const SAMPLE_OUTPUT_FILES: Record<ConversationModeId, string> = {
    socratic: 'socratic-system-prompt.md',
    explanatory: 'explanatory-system-prompt.md',
};

/**
 * Assembled-XML ceiling per mode. Set above the measured size with headroom so growth is a
 * deliberate act: raising this number should come with a reason, not a drive-by edit.
 */
const MODE_SIZE_BUDGET_BYTES: Record<ConversationModeId, number> = {
    socratic: 33000,
    explanatory: 19000,
};

/** Objective count used to model the runtime learning-objective block when none is supplied. */
const DEFAULT_MODELLED_LO_COUNT = 50;

function estimateTokens(bytes: number): number {
    return Math.ceil(bytes / 4);
}

function byteLength(value: string): number {
    return Buffer.byteLength(value, 'utf8');
}

// =====================================================
// Invariants
// =====================================================

/** Levenshtein distance, used only to spot near-miss module references (renames, typos). */
function editDistance(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    let previous = Array.from({ length: cols }, (_, i) => i);

    for (let i = 1; i < rows; i++) {
        const current = [i];
        for (let j = 1; j < cols; j++) {
            const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
        }
        previous = current;
    }
    return previous[cols - 1];
}

/**
 * Cross-reference check: modules point at each other in bold (e.g. `**mermaid synthax**`), which
 * couples their bodies to manifest ids with nothing enforcing it. An exact match resolves; a span
 * within two edits of a known id is treated as a dangling reference from a rename or typo;
 * anything further away is ordinary emphasis and ignored.
 */
function checkModuleCrossReferences(mode: ConversationModeId, knownIds: Set<string>, allIds: Set<string>): string[] {
    const problems: string[] = [];
    const boldSpan = /\*\*([^*]+)\*\*/g;

    for (const mod of getPlatformModeDefaults(mode).instructorModules) {
        let match: RegExpExecArray | null;
        boldSpan.lastIndex = 0;
        while ((match = boldSpan.exec(mod.body)) !== null) {
            const span = match[1].trim().toLowerCase();
            if (knownIds.has(span)) continue;

            for (const id of allIds) {
                if (editDistance(span, id) <= 2) {
                    problems.push(
                        `module "${mod.id}" references "**${match[1].trim()}**", which is not a module in mode "${mode}" (closest id: "${id}")`
                    );
                    break;
                }
            }
        }
    }
    return problems;
}

/** Normalizes a rule line for duplicate detection across modules. */
function normalizeRuleLine(line: string): string {
    return line
        .replace(/^\s*-\s*(\[[ x]\]\s*)?/i, '')
        .replace(/[*`_]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Duplicate-rule check: the stack works by single ownership, so the same bullet living in two
 * modules gives the model two places to disagree and costs the tokens twice. The one intended
 * duplicate is the Socratic reply contract, which lives in a module and in the runtime bridge —
 * not in two modules — so it does not trip this.
 */
function checkDuplicateRules(mode: ConversationModeId): string[] {
    const seen = new Map<string, string>();
    const problems: string[] = [];

    for (const mod of getPlatformModeDefaults(mode).instructorModules) {
        const lines = new Set(
            mod.body
                .split('\n')
                .filter((line) => /^\s*-\s+/.test(line))
                .map(normalizeRuleLine)
                .filter((line) => line.length >= 40)
        );

        for (const line of lines) {
            const owner = seen.get(line);
            if (owner && owner !== mod.id) {
                problems.push(`rule duplicated in "${owner}" and "${mod.id}": "${line}"`);
                continue;
            }
            seen.set(line, mod.id);
        }
    }
    return problems;
}

/** Load every mode manifest, resolve bodyFile paths, assemble XML, and enforce invariants. */
function validate(): void {
    reloadPlatformDefaultsCache();
    const baseDir = getSystemPromptsBaseDir();
    console.log(`Validating platform defaults under ${baseDir}`);

    const allIds = new Set<string>();
    for (const mode of CONVERSATION_MODE_IDS) {
        for (const mod of getPlatformModeDefaults(mode).instructorModules) {
            allIds.add(mod.id.toLowerCase());
        }
    }

    const failures: string[] = [];

    for (const mode of CONVERSATION_MODE_IDS) {
        const defaults = getPlatformModeDefaults(mode);
        const xml = assembleCourseSystemPrompt({ mode, learningObjectives: [] });
        const moduleCount = defaults.instructorModules.length + defaults.systemModules.length;
        const bytes = byteLength(xml);

        if (!xml.includes(`mode="${mode}"`)) {
            throw new Error(`Assembly for "${mode}" missing expected system_prompt mode attribute`);
        }
        if (defaults.instructorModules.length === 0) {
            throw new Error(`Mode "${mode}" has no instructor modules`);
        }

        const knownIds = new Set(defaults.instructorModules.map((m) => m.id.toLowerCase()));
        failures.push(...checkModuleCrossReferences(mode, knownIds, allIds));
        failures.push(...checkDuplicateRules(mode));

        const budget = MODE_SIZE_BUDGET_BYTES[mode];
        if (bytes > budget) {
            failures.push(
                `mode "${mode}" assembled to ${bytes} bytes, over the ${budget}-byte budget — trim a module or raise the budget deliberately`
            );
        }

        console.log(
            `  ok  ${mode} (v${defaults.version}, ${moduleCount} modules, ${bytes} bytes XML, ${Math.round((100 * bytes) / budget)}% of budget)`
        );
    }

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error(`  fail  ${failure}`);
        }
        throw new Error(`${failures.length} prompt invariant failure(s)`);
    }

    console.log('All modes validated.');
}

// =====================================================
// Size report
// =====================================================

/** Synthetic objectives at representative length, so the modelled block matches the real format. */
function buildModelLearningObjectives(count: number): LearningObjectiveForDisplay[] {
    return Array.from({ length: count }, (_, index) => ({
        LearningObjective: `Explain and apply the core concept covered in session ${index + 1}, including its limiting assumptions.`,
        topicOrWeekTitle: `Topic ${Math.floor(index / 6) + 1}`,
        itemTitle: `Session ${(index % 6) + 1}`,
    }));
}

/**
 * Reports per-module and total prompt size, plus the runtime learning-objective block, which is
 * injected uncapped at assembly time and is the one part of the prompt that scales with a course.
 */
function sizeReport(): void {
    reloadPlatformDefaultsCache();

    const loCount = Number(process.env.ENGEAI_PROMPT_SIZE_LO_COUNT ?? DEFAULT_MODELLED_LO_COUNT);
    const modelObjectives = buildModelLearningObjectives(loCount);

    for (const mode of CONVERSATION_MODE_IDS) {
        const modules = getPlatformModeDefaults(mode).instructorModules;
        const moduleBytes = modules.map((m) => ({ id: m.id, bytes: byteLength(m.body) }));
        const moduleTotal = moduleBytes.reduce((sum, m) => sum + m.bytes, 0);

        const bareXml = byteLength(assembleCourseSystemPrompt({ mode, learningObjectives: [] }));
        const withObjectives = byteLength(
            assembleCourseSystemPrompt({ mode, learningObjectives: modelObjectives })
        );
        const objectiveBlock = withObjectives - bareXml;

        console.log(`\n${mode} — ${bareXml} bytes assembled (~${estimateTokens(bareXml)} tokens), sent every turn`);
        console.log('  module                          bytes   ~tokens   share');
        for (const mod of [...moduleBytes].sort((a, b) => b.bytes - a.bytes)) {
            const share = ((100 * mod.bytes) / moduleTotal).toFixed(1);
            console.log(
                `  ${mod.id.padEnd(30)} ${String(mod.bytes).padStart(6)} ${String(estimateTokens(mod.bytes)).padStart(9)} ${share.padStart(6)}%`
            );
        }
        console.log(`  ${'(module bodies total)'.padEnd(30)} ${String(moduleTotal).padStart(6)} ${String(estimateTokens(moduleTotal)).padStart(9)}`);
        console.log(
            `  learning objectives: ${objectiveBlock} bytes (~${estimateTokens(objectiveBlock)} tokens) for ${loCount} objectives, ~${Math.round(objectiveBlock / Math.max(loCount, 1))} bytes each`
        );
        console.log(
            `  budget: ${bareXml}/${MODE_SIZE_BUDGET_BYTES[mode]} bytes (${Math.round((100 * bareXml) / MODE_SIZE_BUDGET_BYTES[mode])}%)`
        );
    }

    console.log('\nOverride the modelled objective count with ENGEAI_PROMPT_SIZE_LO_COUNT.');
}

function resolveSampleOutputDir(): string {
    if (process.env.ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR) {
        return path.resolve(process.env.ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR);
    }
    return path.resolve(__dirname, '..', '..', 'EngE-AI-RAG-Document-examples', 'sample_md');
}

/** Export assembled XML for each mode to the RAG examples sample_md directory. */
function exportSamples(): void {
    const outputDir = resolveSampleOutputDir();
    fs.mkdirSync(outputDir, { recursive: true });

    reloadPlatformDefaultsCache();

    for (const mode of CONVERSATION_MODE_IDS) {
        const xml = assembleCourseSystemPrompt({
            mode,
            learningObjectives: [],
        });
        const filePath = path.join(outputDir, SAMPLE_OUTPUT_FILES[mode]);
        fs.writeFileSync(filePath, `${xml}\n`, 'utf8');
        console.log(`Wrote ${filePath} (${byteLength(xml)} bytes)`);
    }
}

function printUsage(): void {
    console.error('Usage: npm run prompts -- <validate|size|export-samples>');
    console.error('');
    console.error('Commands:');
    console.error('  validate        Load all mode manifests, assemble XML, and enforce invariants');
    console.error('  size            Report per-module and total prompt size, including the LO block');
    console.error('  export-samples  Write assembled XML to EngE-AI-RAG-Document-examples/sample_md/');
    console.error('');
    console.error('Override export dir: ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR=/path/to/dir');
    console.error('Override modelled objective count: ENGEAI_PROMPT_SIZE_LO_COUNT=120');
}

function main(): void {
    const command = process.argv[2];

    switch (command) {
        case 'validate':
            validate();
            break;
        case 'size':
            sizeReport();
            break;
        case 'export-samples':
            exportSamples();
            break;
        default:
            printUsage();
            process.exit(1);
    }
}

main();
