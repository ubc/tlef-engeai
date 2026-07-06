/**
 * scenario-generation-prompt.ts
 *
 * Builds the system prompt for AI scenario question generation from the repurposed
 * `scenario-generation-default/` module files (authoring, not conversational — the retired chat
 * mode delivered these one part per turn; single-shot generation needs the full module set plus
 * the structured output envelope and, for batch mode, the diversity rules).
 */

import fs from 'fs';
import path from 'path';
import { appLogger } from '../utils/logger';

const MODULE_FILES = [
    'scenario_generation_purpose_and_goals.md',
    'engineering_context_and_role_selection.md',
    'generating_plausible_reasons_and_corrective_actions.md',
    'scenario_correctness_restrictions.md',
    'scenario-display-format.md',
] as const;

const BATCH_MODULE_FILE = 'scenario-batch-generation.md';

const cachedModuleBodies = new Map<string, string>();

/** Resolves one prompt module from dist or src (same resolution order as other prompt loaders). */
function loadPromptModule(fileName: string): string {
    const cached = cachedModuleBodies.get(fileName);
    if (cached) {
        return cached;
    }

    const candidates = [
        path.join(process.cwd(), 'dist/chat/system-prompts/scenario-generation-default', fileName),
        path.join(process.cwd(), 'src/chat/system-prompts/scenario-generation-default', fileName),
    ];

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            const body = fs.readFileSync(filePath, 'utf8');
            cachedModuleBodies.set(fileName, body);
            return body;
        }
    }

    throw new Error(`Scenario generation prompt module not found: ${fileName}. Expected one of: ${candidates.join(', ')}`);
}

/** Clears cached module bodies (for tests). */
export function clearScenarioGenerationPromptCache(): void {
    cachedModuleBodies.clear();
}

/**
 * Full system prompt for AI scenario generation. `mode: 'batch'` appends the diversity/count
 * rules from `scenario-batch-generation.md` on top of the shared authoring modules.
 */
export function buildScenarioGenerationSystemPrompt(mode: 'single' | 'batch'): string {
    const files = mode === 'batch' ? [...MODULE_FILES, BATCH_MODULE_FILE] : MODULE_FILES;
    const bodies = files.map((file) => {
        try {
            return loadPromptModule(file);
        } catch (error) {
            appLogger.error('[SCENARIO-GEN] Failed to load prompt module:', error);
            throw error;
        }
    });
    return bodies.join('\n\n---\n\n');
}
