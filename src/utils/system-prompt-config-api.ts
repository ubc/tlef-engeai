/**
 * system-prompt-config-api.ts
 *
 * API-layer helpers for instructor system prompt config (v2): validation and response shaping.
 * Persistence stays in `src/db/mongo/system-prompt-config-mongo.ts`.
 */

import { resolveInstructorModulesForDisplay } from '../chat/system-prompts/assemble-course-system-prompt';
import { isReservedModuleId, parseSystemPromptXml } from '../chat/system-prompts/system-prompt-xml';
import type { CourseSystemPromptConfig, SystemPromptModule } from '../types/shared';

const MAX_MODULES = 50;

export interface PlainXmlValidationResult {
    ok: boolean;
    mode?: string;
    modules?: SystemPromptModule[];
    warnings: string[];
}

/**
 * Singleton for system prompt config HTTP helpers (no Mongo I/O).
 */
export class SystemPromptConfigApi {
    private static instance: SystemPromptConfigApi | null = null;

    private constructor() {}

    public static getInstance(): SystemPromptConfigApi {
        if (!SystemPromptConfigApi.instance) {
            SystemPromptConfigApi.instance = new SystemPromptConfigApi();
        }
        return SystemPromptConfigApi.instance;
    }

    /**
     * Validates instructor-editable module list for PUT / validate-plain.
     *
     * @returns Error message, or null when valid.
     */
    public validateModules(modules: SystemPromptModule[]): string | null {
        if (modules.length > MAX_MODULES) {
            return `At most ${MAX_MODULES} modules allowed`;
        }
        const ids = new Set<string>();
        for (const m of modules) {
            if (isReservedModuleId(m.id)) {
                return `Reserved module id: ${m.id}`;
            }
            if (ids.has(m.id)) {
                return `Duplicate module id: ${m.id}`;
            }
            ids.add(m.id);
            if (typeof m.body !== 'string') {
                return 'Module body must be a string';
            }
        }
        return null;
    }

    /**
     * Adds `displayModules` per mode for instructor UI (platform or stored overrides).
     */
    public enrichForInstructorApi(config: CourseSystemPromptConfig) {
        return {
            ...config,
            modes: {
                socratic: {
                    ...config.modes.socratic,
                    displayModules: resolveInstructorModulesForDisplay('socratic', config.modes.socratic),
                },
                explanatory: {
                    ...config.modes.explanatory,
                    displayModules: resolveInstructorModulesForDisplay('explanatory', config.modes.explanatory),
                },
            },
        };
    }

    /**
     * Parses plain XML and runs {@link validateModules}.
     */
    public validatePlainXml(xml: string): PlainXmlValidationResult {
        try {
            const parsed = parseSystemPromptXml(xml);
            const err = this.validateModules(parsed.modules);
            if (err) {
                return { ok: false, warnings: [err] };
            }
            return {
                ok: true,
                mode: parsed.mode,
                modules: parsed.modules,
                warnings: parsed.warnings,
            };
        } catch (error) {
            return {
                ok: false,
                warnings: [error instanceof Error ? error.message : 'Invalid XML'],
            };
        }
    }
}

export const systemPromptConfigApi = SystemPromptConfigApi.getInstance();
