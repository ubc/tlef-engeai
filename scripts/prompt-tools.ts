/**
 * prompt-tools — validate and export platform system prompt defaults
 *
 * Uses production loader and assembler (no duplicated manifest logic).
 * Run via npm: `prompts:validate`, `prompts:export-samples`.
 *
 * @author: EngE-AI Team
 * @date: 2026-06-25
 * @version: 1.0.0
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
import { CONVERSATION_MODE_IDS, ConversationModeId } from '../src/types/shared';

const SAMPLE_OUTPUT_FILES: Record<ConversationModeId, string> = {
    socratic: 'socratic-system-prompt.md',
    explanatory: 'explanatory-system-prompt.md',
};

function resolveSampleOutputDir(): string {
    if (process.env.ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR) {
        return path.resolve(process.env.ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR);
    }
    return path.resolve(__dirname, '..', '..', 'EngE-AI-RAG-Document-examples', 'sample_md');
}

/** Load every mode manifest, resolve bodyFile paths, and assemble XML. */
function validate(): void {
    reloadPlatformDefaultsCache();
    const baseDir = getSystemPromptsBaseDir();
    console.log(`Validating platform defaults under ${baseDir}`);

    for (const mode of CONVERSATION_MODE_IDS) {
        const defaults = getPlatformModeDefaults(mode);
        const xml = assembleCourseSystemPrompt({
            mode,
            learningObjectives: [],
        });
        const moduleCount = defaults.instructorModules.length + defaults.systemModules.length;

        if (!xml.includes(`mode="${mode}"`)) {
            throw new Error(`Assembly for "${mode}" missing expected system_prompt mode attribute`);
        }
        if (defaults.instructorModules.length === 0) {
            throw new Error(`Mode "${mode}" has no instructor modules`);
        }

        console.log(
            `  ok  ${mode} (v${defaults.version}, ${moduleCount} modules, ${Buffer.byteLength(xml, 'utf8')} bytes XML)`
        );
    }

    console.log('All modes validated.');
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
        console.log(`Wrote ${filePath} (${Buffer.byteLength(xml, 'utf8')} bytes)`);
    }
}

function printUsage(): void {
    console.error('Usage: npm run prompts -- <validate|export-samples>');
    console.error('');
    console.error('Commands:');
    console.error('  validate        Load all mode manifests and assemble XML');
    console.error('  export-samples  Write assembled XML to EngE-AI-RAG-Document-examples/sample_md/');
    console.error('');
    console.error('Override export dir: ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR=/path/to/dir');
}

function main(): void {
    const command = process.argv[2];

    switch (command) {
        case 'validate':
            validate();
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
