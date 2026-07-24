/**
 * pathways-mongo.ts
 *
 * Domain logic for `{courseName}_pathways` — ensure/seed, list, CRUD, reorder.
 * Lazy provision for legacy courses mirrors scenario-questions SQ-001.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.0.0
 * @description: Guided Pathway Library Mongo delegates.
 */

import type { Collection } from 'mongodb';
import type { activeCourse, GuidedPathway, PathwayCta, PathwayCtaStyle } from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { fetchActiveCourseDocById, fetchActiveCourseDocByCourseName } from './active-course-queries-mongo';
import { buildPlatformPathwaySeeds } from '../../guided-pathways/pathway-seed';
import { appLogger } from '../../utils/logger';

const CTA_STYLES: readonly PathwayCtaStyle[] = [
    'primary',
    'secondary',
    'tertiary',
    'quaternary',
    'link',
];

/** Input for creating a pathway — server assigns id/order/updatedAt when omitted. */
export interface CreatePathwayInput {
    triggerDescription?: string;
    assistantResponse?: string;
    enabledGlobally?: boolean;
    ctas?: PathwayCta[];
}

/** Patch fields accepted by updatePathway. */
export interface UpdatePathwayInput {
    triggerDescription?: string;
    assistantResponse?: string;
    enabledGlobally?: boolean;
    ctas?: PathwayCta[];
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
 * seedPathwaysIfEmpty - Insert platform defaults when the collection has zero docs (idempotent).
 */
export async function seedPathwaysIfEmpty(ctx: MongoDalContext, courseName: string): Promise<number> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const count = await collection.countDocuments();
    if (count > 0) return 0;

    const seeds = buildPlatformPathwaySeeds();
    await collection.insertMany(seeds as any[]);
    appLogger.log(`[pathways] Seeded ${seeds.length} default pathway(s) for ${courseName}`);
    return seeds.length;
}

/**
 * ensurePathwaysCollection - Lazy migration: create collection, register name, seed defaults.
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

    if (course.collections?.pathways) {
        await seedPathwaysIfEmpty(ctx, courseName);
        return courseName;
    }

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
    await seedPathwaysIfEmpty(ctx, courseName);
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
        await seedPathwaysIfEmpty(ctx, courseName);
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
    const style = CTA_STYLES.includes(c.style as PathwayCtaStyle)
        ? (c.style as PathwayCtaStyle)
        : 'primary';
    const id =
        typeof c.id === 'string' && c.id.trim()
            ? c.id.trim()
            : `cta-${Date.now()}-${index}`;
    return { id, label, url, style };
}

function normalizeCtas(raw: unknown): PathwayCta[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeCta).filter((c): c is PathwayCta => c !== null);
}

function docToPathway(doc: any): GuidedPathway {
    return {
        id: String(doc.id),
        order: typeof doc.order === 'number' ? doc.order : 0,
        enabledGlobally: doc.enabledGlobally !== false,
        triggerDescription: typeof doc.triggerDescription === 'string' ? doc.triggerDescription : '',
        assistantResponse: typeof doc.assistantResponse === 'string' ? doc.assistantResponse : '',
        ctas: normalizeCtas(doc.ctas),
        updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now(),
    };
}

/**
 * listPathways - All pathways for instructor UI, sorted by order.
 */
export async function listPathways(ctx: MongoDalContext, courseName: string): Promise<GuidedPathway[]> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const docs = await collection.find({}).sort({ order: 1 }).toArray();
    return docs.map(docToPathway);
}

/**
 * listPathwaysForEvaluation - Same as list, after ensure+seed by course name (chat path).
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
    const existing = await collection.find({}).project({ order: 1 }).toArray();
    const maxOrder = existing.reduce((max, d) => Math.max(max, typeof d.order === 'number' ? d.order : 0), -1);
    const now = Date.now();
    const triggerDescription = (input.triggerDescription ?? '').trim();
    const pathway: GuidedPathway = {
        id: `pathway-${ctx.idGenerator.uniqueIDGenerator(`${courseName}-${triggerDescription}-${now}`)}`,
        order: maxOrder + 1,
        enabledGlobally: input.enabledGlobally !== false,
        triggerDescription,
        assistantResponse: (input.assistantResponse ?? '').trim(),
        ctas: normalizeCtas(input.ctas),
        updatedAt: now,
    };

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
    const collection = await getPathwaysCollection(ctx, courseName);
    const existing = await collection.findOne({ id: pathwayId });
    if (!existing) return null;

    const $set: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof input.triggerDescription === 'string') {
        $set.triggerDescription = input.triggerDescription.trim();
    }
    if (typeof input.assistantResponse === 'string') {
        $set.assistantResponse = input.assistantResponse.trim();
    }
    if (typeof input.enabledGlobally === 'boolean') {
        $set.enabledGlobally = input.enabledGlobally;
    }
    if (input.ctas !== undefined) {
        $set.ctas = normalizeCtas(input.ctas);
    }

    await collection.updateOne({ id: pathwayId }, { $set });
    const updated = await collection.findOne({ id: pathwayId });
    return updated ? docToPathway(updated) : null;
}

/**
 * deletePathway - Hard-delete one pathway by id.
 */
export async function deletePathway(
    ctx: MongoDalContext,
    courseName: string,
    pathwayId: string
): Promise<boolean> {
    const collection = await getPathwaysCollection(ctx, courseName);
    const result = await collection.deleteOne({ id: pathwayId });
    return result.deletedCount === 1;
}

/**
 * reorderPathways - Rewrite `order` from an ordered id list (must include all existing ids).
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
