/**
 * qdrant-ops — migrate ops B, C, D
 *
 * B strip extra payload keys. C register point UUIDs onto Mongo `qdrantChunkIds`.
 * D Mongo-wins titles and delete orphan points. C must run before D.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.1.0
 * @description: Qdrant payload strip, chunk-id register, Mongo-wins validate.
 */

import type { Db } from 'mongodb';
import { ACTIVE_COURSE_LIST_COLLECTION } from '../db/mongo/mongo-constants';
import type { CourseCatalogMap } from './catalog-map';
import { printCatalogMap } from './catalog-map';
import { QDRANT_PAYLOAD_ALLOWLIST } from './schemas';
import { hoistMaterialFile } from './schema-walker';

export interface QdrantPoint {
    id: string | number;
    payload: Record<string, unknown>;
}

export interface MaterialIndexEntry {
    courseId: string;
    courseName: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    name: string;
    fileName?: string;
    deleted: boolean;
}

/**
 * collectMaterials - index live additionalMaterials by id (after hoist) for C/D joins.
 */
export function collectMaterials(courses: Record<string, unknown>[]): Map<string, MaterialIndexEntry> {
    const index = new Map<string, MaterialIndexEntry>();
    for (const course of courses) {
        const courseId = String(course.id ?? '');
        const courseName = String(course.courseName ?? '');
        const instances = Array.isArray(course.topicOrWeekInstances) ? course.topicOrWeekInstances : [];
        for (const instance of instances) {
            if (!instance || typeof instance !== 'object') continue;
            const week = instance as Record<string, unknown>;
            const items = Array.isArray(week.items) ? week.items : [];
            for (const item of items) {
                if (!item || typeof item !== 'object') continue;
                const row = item as Record<string, unknown>;
                const materials = Array.isArray(row.additionalMaterials) ? row.additionalMaterials : [];
                for (const raw of materials) {
                    const material = hoistMaterialFile(raw);
                    const id = typeof material.id === 'string' ? material.id : '';
                    if (!id) continue;
                    index.set(id, {
                        courseId,
                        courseName,
                        topicOrWeekTitle: String(material.topicOrWeekTitle ?? week.title ?? ''),
                        itemTitle: String(material.itemTitle ?? row.itemTitle ?? row.title ?? ''),
                        name: String(material.name ?? ''),
                        fileName: typeof material.fileName === 'string' ? material.fileName : undefined,
                        deleted: material.deleted === true,
                    });
                }
            }
        }
    }
    return index;
}

/**
 * stripQdrantPayload - keep QDRANT_PAYLOAD_ALLOWLIST keys; orphan if payload.id is missing.
 */
export function stripQdrantPayload(payload: Record<string, unknown>): {
    next: Record<string, unknown>;
    changed: boolean;
    orphan: boolean;
} {
    const next: Record<string, unknown> = {};
    let changed = false;
    for (const key of QDRANT_PAYLOAD_ALLOWLIST) {
        if (payload[key] !== undefined) {
            next[key] = payload[key];
        }
    }
    for (const key of Object.keys(payload)) {
        if (!(QDRANT_PAYLOAD_ALLOWLIST as readonly string[]).includes(key)) {
            changed = true;
        }
    }
    if (Object.keys(next).length !== Object.keys(payload).length) {
        changed = true;
    }
    const materialId = typeof next.id === 'string' ? next.id : '';
    return { next, changed, orphan: !materialId };
}

/**
 * classifyQdrantPoint - keep / patch titles from Mongo / orphan (UNTRACKED).
 *
 * Orphan: no payload.id, unknown material, deleted material, or course not in catalog.
 */
export function classifyQdrantPoint(
    point: QdrantPoint,
    materials: Map<string, MaterialIndexEntry>,
    catalog: CourseCatalogMap
): 'keep' | 'patch' | 'orphan' {
    const payload = point.payload ?? {};
    const materialId = typeof payload.id === 'string' ? payload.id : '';
    if (!materialId) {
        return 'orphan';
    }
    const material = materials.get(materialId);
    if (!material || material.deleted) {
        return 'orphan';
    }
    if (!catalog.byName.has(material.courseName) && !catalog.byId.has(material.courseId)) {
        return 'orphan';
    }
    const needsPatch =
        payload.courseName !== material.courseName ||
        payload.topicOrWeekTitle !== material.topicOrWeekTitle ||
        payload.name !== material.name ||
        payload.itemTitle !== material.itemTitle;
    return needsPatch ? 'patch' : 'keep';
}

/**
 * groupChunkIdsByMaterial - map live material id → Qdrant point UUIDs.
 *
 * Orphans (no matching Mongo material) are listed separately and never registered.
 */
export function groupChunkIdsByMaterial(
    points: QdrantPoint[],
    materials: Map<string, MaterialIndexEntry>,
    catalog: CourseCatalogMap
): { idsByMaterial: Map<string, string[]>; untrackedPointIds: Array<string | number> } {
    const idsByMaterial = new Map<string, string[]>();
    const untrackedPointIds: Array<string | number> = [];
    for (const point of points) {
        const kind = classifyQdrantPoint(point, materials, catalog);
        if (kind === 'orphan') {
            untrackedPointIds.push(point.id);
            continue;
        }
        const materialId = String(point.payload.id);
        const list = idsByMaterial.get(materialId) ?? [];
        list.push(String(point.id));
        idsByMaterial.set(materialId, list);
    }
    return { idsByMaterial, untrackedPointIds };
}

/**
 * mongoWinsPayload - payload allowlist with Mongo name/course/week/item titles.
 */
export function mongoWinsPayload(material: MaterialIndexEntry, existing: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const key of QDRANT_PAYLOAD_ALLOWLIST) {
        if (existing[key] !== undefined) {
            next[key] = existing[key];
        }
    }
    next.id = existing.id;
    next.courseName = material.courseName;
    next.topicOrWeekTitle = material.topicOrWeekTitle;
    next.name = material.name;
    next.itemTitle = material.itemTitle;
    return next;
}

async function qdrantHeaders(apiKey?: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
        headers['api-key'] = apiKey;
    }
    return headers;
}

/**
 * scrollAllPoints - page through the Qdrant collection (payload only, no vectors).
 */
export async function scrollAllPoints(input: {
    url: string;
    apiKey?: string;
    collectionName: string;
}): Promise<QdrantPoint[]> {
    const base = input.url.replace(/\/$/, '');
    const headers = await qdrantHeaders(input.apiKey);
    const points: QdrantPoint[] = [];
    let offset: unknown = null;
    for (;;) {
        const response = await fetch(`${base}/collections/${input.collectionName}/points/scroll`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                limit: 100,
                with_payload: true,
                with_vector: false,
                offset,
            }),
        });
        if (!response.ok) {
            throw new Error(`Qdrant scroll failed: ${response.status} ${await response.text()}`);
        }
        const body = (await response.json()) as {
            result?: { points?: Array<{ id: string | number; payload?: Record<string, unknown> }>; next_page_offset?: unknown };
        };
        const batch = body.result?.points ?? [];
        for (const point of batch) {
            points.push({ id: point.id, payload: point.payload ?? {} });
        }
        offset = body.result?.next_page_offset;
        if (offset == null || batch.length === 0) {
            break;
        }
    }
    return points;
}

/** overwritePayload - replace one point's payload (wait for Qdrant ack). */
export async function overwritePayload(
    input: { url: string; apiKey?: string; collectionName: string },
    pointId: string | number,
    payload: Record<string, unknown>
): Promise<void> {
    const base = input.url.replace(/\/$/, '');
    const headers = await qdrantHeaders(input.apiKey);
    const response = await fetch(`${base}/collections/${input.collectionName}/points/payload`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ points: [pointId], payload, wait: true }),
    });
    if (!response.ok) {
        throw new Error(`Qdrant overwrite payload failed: ${response.status} ${await response.text()}`);
    }
}

/** deletePoints - drop orphan point ids. Irreversible without re-upload. */
export async function deletePoints(
    input: { url: string; apiKey?: string; collectionName: string },
    ids: Array<string | number>
): Promise<void> {
    if (ids.length === 0) {
        return;
    }
    const base = input.url.replace(/\/$/, '');
    const headers = await qdrantHeaders(input.apiKey);
    const response = await fetch(`${base}/collections/${input.collectionName}/points/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ points: ids, wait: true }),
    });
    if (!response.ok) {
        throw new Error(`Qdrant delete failed: ${response.status} ${await response.text()}`);
    }
}

/** loadCourseDocs - raw active-course-list rows for C/D. */
export async function loadCourseDocs(db: Db): Promise<Record<string, unknown>[]> {
    return db.collection(ACTIVE_COURSE_LIST_COLLECTION).find({}).toArray() as Promise<Record<string, unknown>[]>;
}

/**
 * runQdrantAttributeCheck - op B: strip extra payload keys. Does not delete points.
 *
 * @param apply - PUT payload when true
 */
export async function runQdrantAttributeCheck(
    cfg: { url: string; apiKey?: string; collectionName: string },
    apply: boolean,
    log: (line: string) => void
): Promise<{ stripped: number; orphan: number }> {
    const points = await scrollAllPoints(cfg);
    let stripped = 0;
    let orphan = 0;
    for (const [index, point] of points.entries()) {
        const result = stripQdrantPayload(point.payload);
        if (result.orphan) {
            orphan += 1;
            log(`[${index + 1}/${points.length}] point=${point.id}  UNTRACKED`);
        } else {
            log(`[${index + 1}/${points.length}] point=${point.id}  ${result.changed ? 'stripped' : 'ok'}  CHECKED`);
        }
        if (result.changed) {
            stripped += 1;
            if (apply) {
                await overwritePayload(cfg, point.id, result.next);
            }
        }
    }
    log('');
    log(`DONE  qdrant-attribute-check  points=${points.length} stripped=${stripped} untracked=${orphan}`);
    return { stripped, orphan };
}

/**
 * runQdrantValidateFromMongo - op D: Mongo-wins titles; --apply deletes UNTRACKED points.
 *
 * Run after op C so chunk ids are already registered.
 */
export async function runQdrantValidateFromMongo(
    db: Db,
    catalog: CourseCatalogMap,
    cfg: { url: string; apiKey?: string; collectionName: string },
    apply: boolean,
    log: (line: string) => void
): Promise<{ patched: number; deleted: number }> {
    printCatalogMap(catalog, log);
    const courses = await loadCourseDocs(db);
    const materials = collectMaterials(courses);
    const points = await scrollAllPoints(cfg);
    let patched = 0;
    const orphans: Array<string | number> = [];
    // Classify every point against live Mongo materials before any delete.
    for (const [index, point] of points.entries()) {
        const kind = classifyQdrantPoint(point, materials, catalog);
        if (kind === 'orphan') {
            orphans.push(point.id);
            log(`[${index + 1}/${points.length}] point=${point.id}  UNTRACKED`);
            continue;
        }
        if (kind === 'patch') {
            patched += 1;
            const materialId = String(point.payload.id);
            const material = materials.get(materialId)!;
            log(`[${index + 1}/${points.length}] point=${point.id} material=${materialId}  patch  CHECKED`);
            if (apply) {
                await overwritePayload(cfg, point.id, mongoWinsPayload(material, point.payload));
            }
            continue;
        }
        log(`[${index + 1}/${points.length}] point=${point.id}  CHECKED`);
    }
    if (apply) {
        // Op D: delete vectors whose payload.id is not a live additionalMaterials.id.
        await deletePoints(cfg, orphans);
    }
    log('');
    log(`DONE  qdrant-validate  patched=${patched} orphans=${orphans.length} apply=${apply}`);
    return { patched, deleted: apply ? orphans.length : 0 };
}

/**
 * runQdrantResolveToMongo - op C: write Qdrant point UUIDs onto Mongo qdrantChunkIds.
 *
 * UNTRACKED points are listed but not registered. Must run before op D.
 */
export async function runQdrantResolveToMongo(
    db: Db,
    catalog: CourseCatalogMap,
    cfg: { url: string; apiKey?: string; collectionName: string },
    apply: boolean,
    log: (line: string) => void
): Promise<{ registered: number; untracked: number }> {
    printCatalogMap(catalog, log);
    const courses = await loadCourseDocs(db);
    const materials = collectMaterials(courses);
    const points = await scrollAllPoints(cfg);
    const { idsByMaterial, untrackedPointIds } = groupChunkIdsByMaterial(points, materials, catalog);
    for (const [index, point] of points.entries()) {
        const kind = classifyQdrantPoint(point, materials, catalog);
        if (kind === 'orphan') {
            log(`[${index + 1}/${points.length}] point=${point.id}  UNTRACKED`);
            continue;
        }
        log(`[${index + 1}/${points.length}] point=${point.id} material=${String(point.payload.id)}  CHECKED`);
    }
    log('');
    log(`would-be qdrantChunkIds (${idsByMaterial.size} materials)`);
    for (const [materialId, ids] of idsByMaterial) {
        log(`  material=${materialId}  chunks=${ids.length}  qdrantChunkIds=${ids.join(',')}`);
    }
    log('');

    if (apply) {
        // Replace course docs only when at least one material gained chunk ids.
        for (const course of courses) {
            const instances = Array.isArray(course.topicOrWeekInstances) ? course.topicOrWeekInstances : [];
            let courseChanged = false;
            for (const instance of instances) {
                if (!instance || typeof instance !== 'object') continue;
                const week = instance as Record<string, unknown>;
                const items = Array.isArray(week.items) ? week.items : [];
                for (const item of items) {
                    if (!item || typeof item !== 'object') continue;
                    const row = item as Record<string, unknown>;
                    const materialsArr = Array.isArray(row.additionalMaterials) ? row.additionalMaterials : [];
                    row.additionalMaterials = materialsArr.map((raw) => {
                        const material = hoistMaterialFile(raw);
                        const id = String(material.id ?? '');
                        const extra = idsByMaterial.get(id);
                        if (!extra) {
                            return material;
                        }
                        const merged = Array.from(new Set([...(material.qdrantChunkIds as string[]), ...extra]));
                        material.qdrantChunkIds = merged;
                        material.chunksGenerated = merged.length;
                        courseChanged = true;
                        return material;
                    });
                }
            }
            if (courseChanged) {
                await db.collection(ACTIVE_COURSE_LIST_COLLECTION).replaceOne({ id: course.id }, course as any);
            }
        }
    }

    log(`DONE  qdrant-resolve  registeredMaterials=${idsByMaterial.size} untracked=${untrackedPointIds.length} apply=${apply}`);
    return { registered: idsByMaterial.size, untracked: untrackedPointIds.length };
}
