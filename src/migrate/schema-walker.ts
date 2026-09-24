/**
 * schema-walker — recursive allowlist walk for migrate op A
 *
 * Keeps `_id`. Strips unknown keys. Fills missing defaults. Resets invalid enums.
 * Identity fields (`id`, `userId`, `puid`) missing → skip the document; never invent ids.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.0.0
 * @description: Pure schema sanitizer used by npm run migrate.
 */

export interface FieldSpec {
    key: string;
    identity?: boolean;
    optional?: boolean;
    default?: unknown;
    enum?: readonly string[];
    kind?: 'value' | 'object' | 'array' | 'opaque';
    fields?: FieldSpec[];
    itemFields?: FieldSpec[];
    preprocess?: (value: unknown, parent: Record<string, unknown>) => unknown;
}

export interface WalkResult {
    value: Record<string, unknown> | null;
    changed: boolean;
    skipped: boolean;
    skipReason?: string;
}

const KEEP = new Set(['_id']);

function cloneDefault(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }
    if (value instanceof Date) {
        return new Date(value.getTime());
    }
    if (Array.isArray(value) || (value && typeof value === 'object')) {
        return JSON.parse(JSON.stringify(value));
    }
    return value;
}

/**
 * hoistMaterialFile - flatten nested `file` metadata onto the material root.
 *
 * Copies fileName / qdrantId / chunksGenerated / uploaded / uploadedBy when missing
 * at the root, seeds qdrantChunkIds from qdrantId, then drops `file`, `extractedText`,
 * and singular `qdrantId`.
 *
 * @param raw - Material object (possibly with nested file)
 * @returns Hoisted material copy
 */
export function hoistMaterialFile(raw: unknown): Record<string, unknown> {
    const material =
        raw && typeof raw === 'object' && !Array.isArray(raw)
            ? { ...(raw as Record<string, unknown>) }
            : {};
    const nested = material.file;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const file = nested as Record<string, unknown>;
        // Copy leftover nested upload metadata onto the persist/UI fields.
        if (material.fileName == null && typeof file.fileName === 'string') {
            material.fileName = file.fileName;
        }
        if (material.qdrantId == null && file.qdrantId != null) {
            material.qdrantId = file.qdrantId;
        }
        if (material.chunksGenerated == null && typeof file.chunksGenerated === 'number') {
            material.chunksGenerated = file.chunksGenerated;
        }
        if (material.uploaded == null && typeof file.uploaded === 'boolean') {
            material.uploaded = file.uploaded;
        }
        if (material.uploadedBy == null && file.uploadedBy != null) {
            material.uploadedBy = file.uploadedBy;
        }
    }
    delete material.file;
    delete material.extractedText;
    // Seed at most one id from leftover qdrantId; op C fills the full Qdrant point list.
    const existingIds = Array.isArray(material.qdrantChunkIds)
        ? material.qdrantChunkIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
    if (existingIds.length === 0 && typeof material.qdrantId === 'string' && material.qdrantId) {
        material.qdrantChunkIds = [material.qdrantId];
    } else {
        material.qdrantChunkIds = existingIds;
    }
    delete material.qdrantId;
    if (Array.isArray(material.qdrantChunkIds)) {
        material.chunksGenerated = material.qdrantChunkIds.length;
    }
    return material;
}

/**
 * materialChunkIds - qdrantChunkIds after the same hoist migrate uses.
 *
 * @param raw - Material as stored or leftover nested `file`
 * @returns Point UUIDs; empty when none
 */
export function materialChunkIds(raw: unknown): string[] {
    const ids = hoistMaterialFile(raw).qdrantChunkIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

export interface MaterialLeftoverCounts {
    nestedFile: number;
    singularQdrantId: number;
    sampleName?: string;
    sampleFileName?: string;
    sampleQdrantId?: string;
}

/**
 * countMaterialLeftovers - scan raw course docs for nested `file` / singular qdrantId.
 *
 * @param courses - Unwalked active-course-list documents
 */
export function countMaterialLeftovers(courses: unknown[]): MaterialLeftoverCounts {
    const counts: MaterialLeftoverCounts = { nestedFile: 0, singularQdrantId: 0 };
    for (const course of courses) {
        if (!course || typeof course !== 'object') continue;
        const instances = Array.isArray((course as Record<string, unknown>).topicOrWeekInstances)
            ? ((course as Record<string, unknown>).topicOrWeekInstances as unknown[])
            : [];
        for (const instance of instances) {
            if (!instance || typeof instance !== 'object') continue;
            const items = Array.isArray((instance as Record<string, unknown>).items)
                ? ((instance as Record<string, unknown>).items as unknown[])
                : [];
            for (const item of items) {
                if (!item || typeof item !== 'object') continue;
                const materials = Array.isArray((item as Record<string, unknown>).additionalMaterials)
                    ? ((item as Record<string, unknown>).additionalMaterials as unknown[])
                    : [];
                for (const raw of materials) {
                    if (!raw || typeof raw !== 'object') continue;
                    const material = raw as Record<string, unknown>;
                    const nested = material.file;
                    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
                        counts.nestedFile += 1;
                        if (!counts.sampleName) {
                            const file = nested as Record<string, unknown>;
                            counts.sampleName = typeof material.name === 'string' ? material.name : undefined;
                            counts.sampleFileName = typeof file.fileName === 'string' ? file.fileName : undefined;
                            counts.sampleQdrantId =
                                typeof file.qdrantId === 'string'
                                    ? file.qdrantId
                                    : typeof material.qdrantId === 'string'
                                      ? material.qdrantId
                                      : undefined;
                        }
                    }
                    if (typeof material.qdrantId === 'string' && material.qdrantId) {
                        counts.singularQdrantId += 1;
                    }
                }
            }
        }
    }
    return counts;
}

/**
 * walkObject - apply an allowlist schema to one document or nested object.
 *
 * @param input - Raw Mongo-shaped object
 * @param fields - Allowlist specs
 * @returns Walked object, skip flag, and whether anything changed
 */
export function walkObject(input: unknown, fields: FieldSpec[]): WalkResult {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { value: null, changed: false, skipped: true, skipReason: 'not-object' };
    }

    const src: Record<string, unknown> = { ...(input as Record<string, unknown>) };
    let changed = false;

    // 1. Preprocess (e.g. hoist nested additionalMaterials.file).
    for (const spec of fields) {
        if (!spec.preprocess || !(spec.key in src)) {
            continue;
        }
        const next = spec.preprocess(src[spec.key], src);
        if (next !== src[spec.key]) {
            src[spec.key] = next;
            changed = true;
        }
    }

    // 2. Skip the document if identity fields are missing — never invent ids.
    for (const spec of fields) {
        if (!spec.identity) {
            continue;
        }
        const value = src[spec.key];
        if (typeof value !== 'string' || !value.trim()) {
            return { value: null, changed: false, skipped: true, skipReason: `missing ${spec.key}` };
        }
    }

    // 3. Drop keys that are not on the allowlist (keep `_id`).
    for (const key of Object.keys(src)) {
        if (KEEP.has(key)) {
            continue;
        }
        if (!fields.some((spec) => spec.key === key)) {
            delete src[key];
            changed = true;
        }
    }

    // 4. Fill defaults, reset bad enums, recurse into objects/arrays.
    for (const spec of fields) {
        let value = src[spec.key];
        if (value === undefined || value === null) {
            if (spec.optional || spec.identity) {
                continue;
            }
            if (spec.default !== undefined) {
                src[spec.key] = cloneDefault(spec.default);
                changed = true;
                continue;
            }
            if (spec.kind === 'array') {
                src[spec.key] = [];
                changed = true;
                continue;
            }
            continue;
        }

        if (spec.enum && typeof value === 'string' && !spec.enum.includes(value)) {
            if (spec.default !== undefined) {
                src[spec.key] = cloneDefault(spec.default);
                changed = true;
            }
            continue;
        }

        if (spec.kind === 'object' && spec.fields && value && typeof value === 'object' && !Array.isArray(value)) {
            const nested = walkObject(value, spec.fields);
            if (!nested.skipped && nested.value) {
                src[spec.key] = nested.value;
                if (nested.changed) {
                    changed = true;
                }
            }
            continue;
        }

        if (spec.kind === 'array' && spec.itemFields && Array.isArray(value)) {
            const nextArr: Record<string, unknown>[] = [];
            let arrayChanged = false;
            for (const item of value) {
                const nested = walkObject(item, spec.itemFields);
                if (nested.skipped || !nested.value) {
                    arrayChanged = true;
                    continue;
                }
                nextArr.push(nested.value);
                if (nested.changed) {
                    arrayChanged = true;
                }
            }
            src[spec.key] = nextArr;
            if (arrayChanged || nextArr.length !== value.length) {
                changed = true;
            }
        }
    }

    return { value: src, changed, skipped: false };
}
