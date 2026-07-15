/**
 * Loads platform default system prompts from JSON on disk with in-memory cache.
 *
 * Layout under `system-prompts/`:
 * - `socratic-default/`, `explanatory-default/` — `{mode}.json` + mode-only `.md` files (flat)
 * - `shared-default/` — shared `.md` modules referenced as `shared-default/<file>.md`
 *
 * Practice Scenarios generation/feedback prompts live under `src/scenario-generation/prompts/*.ts`.
 *
 * Admin POST reload clears and re-reads files without restart.
 */

import fs from 'fs';
import path from 'path';
import { ConversationModeId } from '../../types/shared';

export interface PlatformSystemModule {
    id: string;
    placement: 'before_instructor';
    modes: ConversationModeId[];
    body: string;
}

export interface PlatformInstructorModule {
    id: string;
    body: string;
}

export interface PlatformModeDefaults {
    version: string;
    conversationMode: ConversationModeId;
    systemModules: PlatformSystemModule[];
    instructorModules: PlatformInstructorModule[];
}

interface PlatformSystemModuleRaw {
    id: string;
    placement: 'before_instructor';
    modes: ConversationModeId[];
    body?: string;
    bodyFile?: string;
}

interface PlatformInstructorModuleRaw {
    id: string;
    body?: string;
    bodyFile?: string;
}

interface PlatformModeDefaultsRaw {
    version: string;
    conversationMode: ConversationModeId;
    systemModules?: PlatformSystemModuleRaw[];
    instructorModules: PlatformInstructorModuleRaw[];
}

const MODE_DEFAULT_FOLDER: Record<ConversationModeId, string> = {
    socratic: 'socratic-default',
    explanatory: 'explanatory-default',
};

const SHARED_BODY_FILE_PREFIX = 'shared-default/';

let cache: Partial<Record<ConversationModeId, PlatformModeDefaults>> = {};

let resolvedSystemPromptsBaseDir: string | null = null;

/**
 * Parent directory containing `shared-default/` and each `*-default/` mode folder.
 */
export function getSystemPromptsBaseDir(): string {
    if (resolvedSystemPromptsBaseDir) {
        return resolvedSystemPromptsBaseDir;
    }

    const candidates = [
        __dirname,
        path.join(process.cwd(), 'dist/chat/system-prompts'),
        path.join(process.cwd(), 'src/chat/system-prompts'),
    ];

    for (const dir of candidates) {
        const sharedProbe = path.join(dir, 'shared-default');
        const socraticProbe = path.join(dir, 'socratic-default', 'socratic.json');
        if (fs.existsSync(sharedProbe) && fs.existsSync(socraticProbe)) {
            resolvedSystemPromptsBaseDir = dir;
            return dir;
        }
    }

    throw new Error(
        `System prompts base not found. Expected shared-default/ and socratic-default/socratic.json in one of: ${candidates.join(', ')}`
    );
}

/**
 * Returns the directory for a mode's platform defaults (`{mode}.json` and mode-only `.md` files).
 */
export function getModeDefaultsDir(mode: ConversationModeId): string {
    const folder = MODE_DEFAULT_FOLDER[mode];
    const baseDir = getSystemPromptsBaseDir();
    const dir = path.join(baseDir, folder);
    const probe = path.join(dir, `${mode}.json`);
    if (!fs.existsSync(probe)) {
        throw new Error(`System prompt defaults for "${mode}" not found at ${probe}`);
    }
    return dir;
}

/** @deprecated Use getModeDefaultsDir(mode) */
export function getDefaultsDir(): string {
    return getModeDefaultsDir('socratic');
}

/**
 * Resolves bodyFile: `shared-default/<file>.md` from base dir, or `<file>.md` from mode dir.
 */
export function resolveModuleBodyFile(
    modeDefaultsDir: string,
    bodyFile: string,
    moduleId: string
): string {
    if (path.isAbsolute(bodyFile)) {
        throw new Error(`Module "${moduleId}": bodyFile must be relative, not absolute`);
    }

    const normalized = path.normalize(bodyFile);
    if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
        throw new Error(`Module "${moduleId}": bodyFile must not contain "..": ${bodyFile}`);
    }

    const baseDir = getSystemPromptsBaseDir();
    let fullPath: string;
    let allowedRoot: string;

    if (normalized.startsWith(SHARED_BODY_FILE_PREFIX)) {
        fullPath = path.join(baseDir, normalized);
        allowedRoot = path.join(baseDir, 'shared-default');
    } else if (normalized.includes(path.sep)) {
        throw new Error(
            `Module "${moduleId}": bodyFile must be shared-default/<file>.md or a single filename in the mode directory`
        );
    } else {
        fullPath = path.join(modeDefaultsDir, normalized);
        allowedRoot = modeDefaultsDir;
    }

    const resolvedAllowed = path.resolve(allowedRoot);
    const resolvedFull = path.resolve(fullPath);
    if (!resolvedFull.startsWith(resolvedAllowed + path.sep) && resolvedFull !== resolvedAllowed) {
        throw new Error(`Module "${moduleId}": bodyFile escapes allowed directory: ${bodyFile}`);
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Module "${moduleId}": bodyFile not found: ${bodyFile}`);
    }

    return fs.readFileSync(fullPath, 'utf8').trim();
}

function hydrateModuleBody(
    modeDefaultsDir: string,
    module: { id: string; body?: string; bodyFile?: string }
): string {
    const hasBody = typeof module.body === 'string' && module.body.length > 0;
    const hasBodyFile = typeof module.bodyFile === 'string' && module.bodyFile.length > 0;

    if (hasBody && hasBodyFile) {
        throw new Error(`Module "${module.id}": specify exactly one of body or bodyFile`);
    }
    if (!hasBody && !hasBodyFile) {
        throw new Error(`Module "${module.id}": missing body or bodyFile`);
    }
    if (hasBodyFile) {
        return resolveModuleBodyFile(modeDefaultsDir, module.bodyFile!, module.id);
    }
    return module.body!.trim();
}

function hydrateModeDefaults(modeDefaultsDir: string, raw: PlatformModeDefaultsRaw): PlatformModeDefaults {
    return {
        version: raw.version,
        conversationMode: raw.conversationMode,
        systemModules: (raw.systemModules ?? []).map((m) => ({
            id: m.id,
            placement: m.placement,
            modes: m.modes,
            body: hydrateModuleBody(modeDefaultsDir, m),
        })),
        instructorModules: raw.instructorModules.map((m) => ({
            id: m.id,
            body: hydrateModuleBody(modeDefaultsDir, m),
        })),
    };
}

function readModeDefaults(mode: ConversationModeId): PlatformModeDefaults {
    const modeDefaultsDir = getModeDefaultsDir(mode);
    const filePath = path.join(modeDefaultsDir, `${mode}.json`);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PlatformModeDefaultsRaw;
    if (raw.conversationMode !== mode) {
        throw new Error(`Defaults file ${mode}.json has mismatched conversationMode`);
    }
    return hydrateModeDefaults(modeDefaultsDir, raw);
}

/**
 * Returns cached platform defaults for a conversation mode, loading from disk on first access.
 */
export function getPlatformModeDefaults(mode: ConversationModeId): PlatformModeDefaults {
    if (!cache[mode]) {
        cache[mode] = readModeDefaults(mode);
    }
    return cache[mode]!;
}

/**
 * Returns the shipped platform default version string for a mode.
 */
export function getPlatformDefaultVersion(mode: ConversationModeId): string {
    return getPlatformModeDefaults(mode).version;
}

/**
 * Clears the in-memory cache so the next read reloads JSON from disk.
 */
export function reloadPlatformDefaultsCache(): void {
    cache = {};
    resolvedSystemPromptsBaseDir = null;
    for (const mode of ['socratic', 'explanatory'] as ConversationModeId[]) {
        getPlatformModeDefaults(mode);
    }
}

/**
 * Returns instructor modules from platform JSON with sequential sortOrder values.
 */
export function getPlatformInstructorModules(mode: ConversationModeId): Array<{ id: string; body: string; sortOrder: number }> {
    return getPlatformModeDefaults(mode).instructorModules.map((m, index) => ({
        id: m.id,
        body: m.body,
        sortOrder: index,
    }));
}
