/**
 * pathways-mongo.ts
 *
 * Domain logic for `{courseName}_pathways` — ensure/seed, list, CRUD, reorder,
 * evaluation-prompt singleton, and GP-001 off-topic heal.
 * Lazy provision for legacy courses mirrors scenario-questions SQ-001.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.1.0
 * @description: Guided Pathway Library Mongo delegates.
 */

import type { Collection } from 'mongodb';
import type {
    activeCourse,
    GuidedPathway,
    PathwayCta,
    PathwayEvaluationPromptConfig,
} from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { fetchActiveCourseDocById, fetchActiveCourseDocByCourseName } from './active-course-queries-mongo';
import { buildPlatformPathwaySeeds } from '../../guided-pathways/pathway-seed';
import {
    PATHWAY_EVALUATION_PROMPT_DOC_TYPE,
    PATHWAY_EVALUATION_PROMPT_ID,
    PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT,
} from '../../guided-pathways/pathway-evaluation-prompt-default';
import { appLogger } from '../../utils/logger';

/** Default CTA fill when color/style missing — matches former primary (CHBE green). */
export const DEFAULT_CTA_COLOR = '#4d7a2f';

/** Legacy style → hex (preserves former CSS tokens). */
const LEGACY_STYLE_COLORS: Record<string, string> = {
    primary: '#4d7a2f',
    secondary: '#2f5f8f',
    tertiary: '#1b365d',
    quaternary: '#f1f1f1',
    link: '#2f5f8f',
};

const DEFAULT_PATHWAY_TITLE = 'Untitled';

/** Mongo filter: pathway cards only (exclude evaluation-prompt singleton). */
const PATHWAY_CARD_FILTER = {
    id: { $ne: PATHWAY_EVALUATION_PROMPT_ID },
    docType: { $ne: PATHWAY_EVALUATION_PROMPT_DOC_TYPE },
} as const;

/**
 * normalizeCtaColor - Coerce a CTA color to `#RRGGBB`.
 *
 * Accepts `#RGB` / `#RRGGBB` (any case). Falls back to legacy `style` map, then DEFAULT_CTA_COLOR.
 *
 * @param rawColor - Stored or submitted color string
 * @param legacyStyle - Former PathwayCtaStyle value when color absent
 * @returns Normalized `#RRGGBB` (lowercase hex digits except preserved from expand)
 */
export function normalizeCtaColor(rawColor: unknown, legacyStyle?: unknown): string {
    if (typeof rawColor === 'string') {
        const trimmed = rawColor.trim();
        const m6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
        if (m6) return `#${m6[1].toLowerCase()}`;
        const m3 = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
        if (m3) {
            const [r, g, b] = m3[1].toLowerCase().split('');
            return `#${r}${r}${g}${g}${b}${b}`;
        }
    }
    if (typeof legacyStyle === 'string' && LEGACY_STYLE_COLORS[legacyStyle]) {
        return LEGACY_STYLE_COLORS[legacyStyle];
    }
    return DEFAULT_CTA_COLOR;
}

/** Platform seed titles by id — used when legacy docs were seeded before `title` existed. */
function platformTitleById(pathwayId: string): string | undefined {
    return buildPlatformPathwaySeeds(0).find((p) => p.id === pathwayId)?.title;
}

/** Input for creating a pathway — server assigns id/order/updatedAt when omitted. */
export interface CreatePathwayInput {
    title?: string;
    triggerDescription?: string;
    assistantResponse?: string;
    enabled?: boolean;
    ctas?: PathwayCta[];
}

/** Patch fields accepted by updatePathway. */
export interface UpdatePathwayInput {
    title?: string;
    triggerDescription?: string;
    assistantResponse?: string;
    enabled?: boolean;
    ctas?: PathwayCta[];
}

/**
 * resolveEnabled - Prefer `enabled`; fall back to legacy `enabledGlobally`; default true.
 */
function resolveEnabled(doc: any): boolean {
    if (typeof doc.enabled === 'boolean') return doc.enabled;
    return doc.enabledGlobally !== false;
}

/**
 * normalizeTitle - Prefer stored title; for known platform ids fall back to seed title (not Untitled).
 */
function normalizeTitle(raw: unknown, pathwayId?: string): string {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.length > 0) return trimmed;
    }
    if (pathwayId) {
        const platform = platformTitleById(pathwayId);
        if (platform) return platform;
    }
    return DEFAULT_PATHWAY_TITLE;
}

async function getPathwaysCollection(ctx: MongoDalContext, courseName: string): Promise<Collection> {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.pathways);
}

/**
 * createPathwayIndexes - Unique id index for pathways collection.
 */
export async function createPathwayIndexes(collection: Collection, courseName: string): Promise<void> {
    await collection.createIndex({ id: 1 }, { unique: true, name: 'pathways_id_unique' });
    await collection.createIndex({ order: 1 }, { name: 'pathways_order' });
    appLogger.log(`[pathways] Indexes ensured for ${courseName}`);
}

/**
 * healRemoveOffTopicPathway - GP-001: delete legacy platform `off-topic` pathway docs (idempotent).
 *
 * Scope redirect now lives in the teaching system prompt. Does not remove custom pathways.
 *
 * @param collection - Course pathways collection
 * @param courseName - For logging
 * @returns Deleted count
 */
export async function healRemoveOffTopicPathway(
    collection: Collection,
    courseName: string
): Promise<number> {
    const result = await collection.deleteMany({ id: 'off-topic' });
    const deleted = result.deletedCount ?? 0;
    if (deleted > 0) {
        appLogger.log(`[pathways] GP-001 removed ${deleted} off-topic pathway doc(s) for ${courseName}`);
    }
    return deleted;
}

function buildPlatformEvaluationPromptDoc(now: number = Date.now()) {
    return {
        id: PATHWAY_EVALUATION_PROMPT_ID,
        docType: PATHWAY_EVALUATION_PROMPT_DOC_TYPE,
        usePlatformDefault: true,
        body: PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT,
        updatedAt: now,
    };
}

/**
 * ensureEvaluationPromptDoc - Upsert the evaluation-prompt singleton when missing.
 *
 * @param collection - Course pathways collection
 * @param courseName - For logging
 */
export async function ensureEvaluationPromptDoc(
    collection: Collection,
    courseName: string
): Promise<void> {
    const existing = await collection.findOne({ id: PATHWAY_EVALUATION_PROMPT_ID });
    if (existing) return;
    await collection.insertOne(buildPlatformEvaluationPromptDoc() as any);
    appLogger.log(`[pathways] Seeded evaluation system prompt for ${courseName}`);
}

/**
 * resolveEvaluationPromptConfig - Map Mongo singleton (or missing) to API config.
 */
function resolveEvaluationPromptConfig(doc: any | null): PathwayEvaluationPromptConfig {
    if (!doc) {
        return {
            usePlatformDefault: true,
            body: PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT,
            updatedAt: 0,
        };
    }
    const usePlatformDefault = doc.usePlatformDefault !== false;
    const storedBody = typeof doc.body === 'string' ? doc.body.trim() : '';
    return {
        usePlatformDefault,
        body: usePlatformDefault || !storedBody ? PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT : storedBody,
        updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : 0,
    };
}

/**
 * getPathwayEvaluationPrompt - Load effective evaluation shell for instructor UI / runtime.
 *
 * Ensures singleton exists. When `usePlatformDefault`, returns the code default body.
 *
 * @param ctx - Mongo DAL context
 * @param courseName - Course whose pathways collection to read
 * @returns Resolved {@link PathwayEvaluationPromptConfig}
 */
export async function getPathwayEvaluationPrompt(
    ctx: MongoDalContext,
    courseName: string
): Promise<PathwayEvaluationPromptConfig> {
    const collection = await getPathwaysCollection(ctx, courseName);
    await ensureEvaluationPromptDoc(collection, courseName);
    const doc = await collection.findOne({ id: PATHWAY_EVALUATION_PROMPT_ID });
    return resolveEvaluationPromptConfig(doc);
}

/**
 * updatePathwayEvaluationPrompt - Persist a customized evaluation shell.
 *
 * Sets `usePlatformDefault: false`. Empty body is rejected by the route.
 *
 * @param ctx - Mongo DAL context
 * @param courseName - Course name
 * @param body - Shell text (should include `{{pathway_trigger_sections}}`)
 * @returns Updated config
 */
export async function updatePathwayEvaluationPrompt(
    ctx: MongoDalContext,
    courseName: string,
    body: string
): Promise<PathwayEvaluationPromptConfig> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const trimmed = body.trim();
    const now = Date.now();
    await collection.updateOne(
        { id: PATHWAY_EVALUATION_PROMPT_ID },
        {
            $set: {
                id: PATHWAY_EVALUATION_PROMPT_ID,
                docType: PATHWAY_EVALUATION_PROMPT_DOC_TYPE,
                usePlatformDefault: false,
                body: trimmed,
                updatedAt: now,
            },
        },
        { upsert: true }
    );
    return {
        usePlatformDefault: false,
        body: trimmed,
        updatedAt: now,
    };
}

/**
 * resetPathwayEvaluationPrompt - Restore platform default evaluation shell.
 *
 * @param ctx - Mongo DAL context
 * @param courseName - Course name
 * @returns Platform default config
 */
export async function resetPathwayEvaluationPrompt(
    ctx: MongoDalContext,
    courseName: string
): Promise<PathwayEvaluationPromptConfig> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const doc = buildPlatformEvaluationPromptDoc();
    await collection.updateOne(
        { id: PATHWAY_EVALUATION_PROMPT_ID },
        { $set: doc },
        { upsert: true }
    );
    appLogger.log(`[pathways] Reset evaluation system prompt for ${courseName}`);
    return resolveEvaluationPromptConfig(doc);
}

/**
 * seedPathwaysIfEmpty - Insert platform defaults when there are zero pathway cards (idempotent).
 *
 * Ignores the evaluation-prompt singleton when counting. Always ensures the singleton exists.
 */
export async function seedPathwaysIfEmpty(ctx: MongoDalContext, courseName: string): Promise<number> {
    const collection = await getPathwaysCollection(ctx, courseName);
    await healRemoveOffTopicPathway(collection, courseName);
    const count = await collection.countDocuments(PATHWAY_CARD_FILTER as any);
    let inserted = 0;
    if (count === 0) {
        const seeds = buildPlatformPathwaySeeds();
        if (seeds.length > 0) {
            await collection.insertMany(seeds as any[]);
            inserted = seeds.length;
            appLogger.log(`[pathways] Seeded ${seeds.length} default pathway(s) for ${courseName}`);
        }
    }
    await ensureEvaluationPromptDoc(collection, courseName);
    return inserted;
}

/**
 * ensurePathwaysCollection - Lazy migration: create collection and register name (no auto-seed).
 *
 * Runs GP-001 heal and ensures evaluation-prompt singleton. Empty pathway lists stay empty
 * until new-course seed, instructor add, or Reset to defaults.
 *
 * @param ctx - Mongo DAL context
 * @param courseId - activeCourse.id
 * @returns courseName
 */
export async function ensurePathwaysCollection(ctx: MongoDalContext, courseId: string): Promise<string> {
    const course = (await fetchActiveCourseDocById(ctx.db, courseId)) as activeCourse | null;
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const courseName = course.courseName;

    if (!course.collections?.pathways) {
        const collectionName = `${courseName}_pathways`;
        try {
            await ctx.db.createCollection(collectionName);
        } catch (error: any) {
            if (error?.codeName !== 'NamespaceExists') throw error;
        }

        await activeCourseListCollection(ctx.db).updateOne(
            { id: courseId },
            { $set: { 'collections.pathways': collectionName } }
        );
        ctx.collectionNamesCache.delete(courseName);
        appLogger.log(`[pathways] Lazy migration: provisioned ${collectionName} for course ${courseName}`);

        const collection = await getPathwaysCollection(ctx, courseName);
        await createPathwayIndexes(collection, courseName);
    }

    const collection = await getPathwaysCollection(ctx, courseName);
    await healRemoveOffTopicPathway(collection, courseName);
    await ensureEvaluationPromptDoc(collection, courseName);
    return courseName;
}

/**
 * ensurePathwaysCollectionByCourseName - Chat-path ensure when only courseName is known.
 */
export async function ensurePathwaysCollectionByCourseName(
    ctx: MongoDalContext,
    courseName: string
): Promise<void> {
    const course = (await fetchActiveCourseDocByCourseName(ctx.db, courseName)) as activeCourse | null;
    if (!course) {
        appLogger.warn(`[pathways] Course not found for name ${courseName}; using computed collection`);
        const collection = await getPathwaysCollection(ctx, courseName);
        try {
            await createPathwayIndexes(collection, courseName);
        } catch {
            /* index may already exist */
        }
        await healRemoveOffTopicPathway(collection, courseName);
        await ensureEvaluationPromptDoc(collection, courseName);
        return;
    }
    await ensurePathwaysCollection(ctx, course.id);
}

function normalizeCta(raw: unknown, index: number): PathwayCta | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    const url = typeof c.url === 'string' ? c.url.trim() : '';
    if (!label || !url) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    const color = normalizeCtaColor(c.color, c.style);
    const id =
        typeof c.id === 'string' && c.id.trim()
            ? c.id.trim()
            : `cta-${Date.now()}-${index}`;
    return { id, label, url, color };
}

function normalizeCtas(raw: unknown): PathwayCta[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeCta).filter((c): c is PathwayCta => c !== null);
}

function docToPathway(doc: any): GuidedPathway {
    const id = String(doc.id);
    return {
        id,
        order: typeof doc.order === 'number' ? doc.order : 0,
        title: normalizeTitle(doc.title, id),
        enabled: resolveEnabled(doc),
        triggerDescription: typeof doc.triggerDescription === 'string' ? doc.triggerDescription : '',
        assistantResponse: typeof doc.assistantResponse === 'string' ? doc.assistantResponse : '',
        ctas: normalizeCtas(doc.ctas),
        updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now(),
    };
}

/**
 * listPathways - Pathway cards for instructor UI, sorted by order (excludes evaluation shell).
 */
export async function listPathways(ctx: MongoDalContext, courseName: string): Promise<GuidedPathway[]> {
    const collection = await getPathwaysCollection(ctx, courseName);
    await healRemoveOffTopicPathway(collection, courseName);
    const docs = await collection.find(PATHWAY_CARD_FILTER as any).sort({ order: 1 }).toArray();
    return docs.map(docToPathway);
}

/**
 * listPathwaysForEvaluation - Same as list, after ensure by course name (chat path).
 */
export async function listPathwaysForEvaluation(
    ctx: MongoDalContext,
    courseName: string
): Promise<GuidedPathway[]> {
    await ensurePathwaysCollectionByCourseName(ctx, courseName);
    return listPathways(ctx, courseName);
}

/**
 * createPathway - Append a new pathway at the end of the list.
 */
export async function createPathway(
    ctx: MongoDalContext,
    courseName: string,
    input: CreatePathwayInput
): Promise<GuidedPathway> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const existing = await collection.find(PATHWAY_CARD_FILTER as any).project({ order: 1 }).toArray();
    const maxOrder = existing.reduce((max, d) => Math.max(max, typeof d.order === 'number' ? d.order : 0), -1);
    const now = Date.now();
    const triggerDescription = (input.triggerDescription ?? '').trim();
    const pathway: GuidedPathway = {
        id: `pathway-${ctx.idGenerator.uniqueIDGenerator(`${courseName}-${triggerDescription}-${now}`)}`,
        order: maxOrder + 1,
        title: normalizeTitle(input.title),
        enabled: input.enabled !== false,
        triggerDescription,
        assistantResponse: (input.assistantResponse ?? '').trim(),
        ctas: normalizeCtas(input.ctas),
        updatedAt: now,
    };

    if (pathway.id.startsWith('__') || pathway.id === PATHWAY_EVALUATION_PROMPT_ID) {
        throw new Error('Reserved pathway id');
    }

    await collection.insertOne(pathway as any);
    return pathway;
}

/**
 * updatePathway - Patch mutable fields on one pathway.
 */
export async function updatePathway(
    ctx: MongoDalContext,
    courseName: string,
    pathwayId: string,
    input: UpdatePathwayInput
): Promise<GuidedPathway | null> {
    if (pathwayId === PATHWAY_EVALUATION_PROMPT_ID || pathwayId.startsWith('__')) {
        return null;
    }
    const collection = await getPathwaysCollection(ctx, courseName);
    const existing = await collection.findOne({ id: pathwayId });
    if (!existing || existing.docType === PATHWAY_EVALUATION_PROMPT_DOC_TYPE) return null;

    const $set: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof input.title === 'string') {
        $set.title = normalizeTitle(input.title);
    }
    if (typeof input.triggerDescription === 'string') {
        $set.triggerDescription = input.triggerDescription.trim();
    }
    if (typeof input.assistantResponse === 'string') {
        $set.assistantResponse = input.assistantResponse.trim();
    }
    if (typeof input.enabled === 'boolean') {
        $set.enabled = input.enabled;
    }
    if (input.ctas !== undefined) {
        $set.ctas = normalizeCtas(input.ctas);
    }

    // Self-heal legacy field name on every patch
    await collection.updateOne({ id: pathwayId }, { $set, $unset: { enabledGlobally: '' } });
    const updated = await collection.findOne({ id: pathwayId });
    return updated ? docToPathway(updated) : null;
}

/**
 * deletePathway - Hard-delete one pathway by id (refuses reserved evaluation-prompt id).
 */
export async function deletePathway(
    ctx: MongoDalContext,
    courseName: string,
    pathwayId: string
): Promise<boolean> {
    if (pathwayId === PATHWAY_EVALUATION_PROMPT_ID || pathwayId.startsWith('__')) {
        return false;
    }
    const collection = await getPathwaysCollection(ctx, courseName);
    const result = await collection.deleteOne({
        id: pathwayId,
        docType: { $ne: PATHWAY_EVALUATION_PROMPT_DOC_TYPE },
    } as any);
    return result.deletedCount === 1;
}

/**
 * reorderPathways - Rewrite `order` from an ordered id list (must include all existing pathway ids).
 */
export async function reorderPathways(
    ctx: MongoDalContext,
    courseName: string,
    orderedIds: string[]
): Promise<GuidedPathway[]> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const existing = await listPathways(ctx, courseName);
    const existingIds = new Set(existing.map((p) => p.id));

    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
        throw new Error('orderedIds must be a permutation of existing pathway ids');
    }

    const now = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
        await collection.updateOne({ id: orderedIds[i] }, { $set: { order: i, updatedAt: now } });
    }
    return listPathways(ctx, courseName);
}

/**
 * resetPathwaysToDefaults - Wipe pathway cards + evaluation shell, re-insert platform defaults.
 *
 * Destructive instructor action (confirm in UI). Returns the fresh sorted pathway list.
 *
 * @param ctx - Mongo DAL context
 * @param courseName - Course whose pathways collection to reset
 * @returns Platform default pathways after re-seed
 */
export async function resetPathwaysToDefaults(
    ctx: MongoDalContext,
    courseName: string
): Promise<GuidedPathway[]> {
    const collection = await getPathwaysCollection(ctx, courseName);
    await collection.deleteMany({});
    const seeds = buildPlatformPathwaySeeds();
    if (seeds.length > 0) {
        await collection.insertMany(seeds as any[]);
    }
    await collection.insertOne(buildPlatformEvaluationPromptDoc() as any);
    appLogger.log(`[pathways] Reset ${courseName} to ${seeds.length} platform default pathway(s)`);
    return listPathways(ctx, courseName);
}

/**
 * seedPathwaysForNewCourse - Called from postActiveCourse after collection create.
 */
export async function seedPathwaysForNewCourse(ctx: MongoDalContext, courseName: string): Promise<void> {
    const collection = await getPathwaysCollection(ctx, courseName);
    try {
        await createPathwayIndexes(collection, courseName);
    } catch (error) {
        appLogger.warn(`[pathways] Index create warning for ${courseName}:`, error);
    }
    await seedPathwaysIfEmpty(ctx, courseName);
}
