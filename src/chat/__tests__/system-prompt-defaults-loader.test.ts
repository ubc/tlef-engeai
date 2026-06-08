/**
 * Tests for platform default loader (bodyFile hydration and path guards).
 */

import fs from 'fs';
import path from 'path';
import { ConversationModeId } from '../../types/shared';
import {
    getModeDefaultsDir,
    getPlatformModeDefaults,
    getSystemPromptsBaseDir,
    reloadPlatformDefaultsCache,
    resolveModuleBodyFile,
} from '../system-prompts/system-prompt-defaults-loader';

const MODES: ConversationModeId[] = ['socratic', 'explanatory'];
const BASE = path.join(process.cwd(), 'src/chat/system-prompts');

function collectBodyFiles(mode: ConversationModeId): string[] {
    const modeDir = path.join(BASE, `${mode}-default`);
    const raw = JSON.parse(fs.readFileSync(path.join(modeDir, `${mode}.json`), 'utf8')) as {
        systemModules?: Array<{ bodyFile?: string }>;
        instructorModules?: Array<{ bodyFile?: string }>;
    };
    const files: string[] = [];
    for (const m of [...(raw.systemModules ?? []), ...(raw.instructorModules ?? [])]) {
        if (m.bodyFile) {
            files.push(m.bodyFile);
        }
    }
    return files;
}

describe('system-prompt-defaults-loader', () => {
    beforeAll(() => {
        reloadPlatformDefaultsCache();
    });

    it('resolves system-prompts base and per-mode directories', () => {
        const base = getSystemPromptsBaseDir();
        expect(fs.existsSync(path.join(base, 'shared-default'))).toBe(true);
        for (const mode of MODES) {
            const dir = getModeDefaultsDir(mode);
            expect(fs.existsSync(path.join(dir, `${mode}.json`))).toBe(true);
            const entries = fs.readdirSync(dir);
            expect(entries.every((e) => e.endsWith('.json') || e.endsWith('.md'))).toBe(true);
        }
    });

    it('every bodyFile in manifests resolves to an existing file', () => {
        for (const mode of MODES) {
            const modeDir = path.join(BASE, `${mode}-default`);
            for (const bodyFile of collectBodyFiles(mode)) {
                const full = bodyFile.startsWith('shared-default/')
                    ? path.join(BASE, bodyFile)
                    : path.join(modeDir, bodyFile);
                expect(fs.existsSync(full)).toBe(true);
            }
        }
    });

    it('hydrates non-empty bodies for both modes at version 1.3.0', () => {
        for (const mode of MODES) {
            const defaults = getPlatformModeDefaults(mode);
            expect(defaults.version).toBe('1.3.0');
            expect(defaults.systemModules).toHaveLength(0);
            for (const m of defaults.instructorModules) {
                expect(m.body.length).toBeGreaterThan(0);
            }
        }
    });

    it('rejects bodyFile paths with parent traversal', () => {
        const modeDir = getModeDefaultsDir('socratic');
        expect(() =>
            resolveModuleBodyFile(modeDir, '../outside.md', 'evil')
        ).toThrow(/must not contain "\.\."/);
    });

    it('rejects absolute bodyFile paths', () => {
        const modeDir = getModeDefaultsDir('socratic');
        const absolute = path.join(BASE, 'shared-default/system_prompt_guidance.md');
        expect(() =>
            resolveModuleBodyFile(modeDir, absolute, 'evil')
        ).toThrow(/must be relative/);
    });

    it('loads shared-default bodies via shared-default/ prefix', () => {
        const modeDir = getModeDefaultsDir('explanatory');
        const body = resolveModuleBodyFile(modeDir, 'shared-default/system_prompt_guidance.md', 'system prompt guidance');
        expect(body).toContain('self-contained modules');
    });
});
