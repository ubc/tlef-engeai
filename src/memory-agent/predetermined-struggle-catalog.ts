/**
 * Predetermined struggle catalog — fixture-backed instructor struggle labels
 *
 * Discovers `*-instructor-struggle-topics.json` files under `src/fixtures/` and
 * `dist/fixtures/`, indexes them by `courseName`, and supplies deterministic labels
 * for post-upload struggle generation when a catalog exists (skips LLM generation).
 *
 * @author: EngE-AI Team
 * @date: 2026-07-23
 * @version: 2.0.0
 * @description: Fixture discovery, parse, cache, and lookup for predetermined struggle-topic catalogs.
 */

import fs from 'fs';
import path from 'path';

const CATALOG_FILENAME_SUFFIX = '-instructor-struggle-topics.json';

/** One topic/chapter row in a fixture catalog JSON file. */
export interface PredeterminedStruggleTopicEntry {
    topicNumber: number; // 1-based chapter index used for upload matching
    topicTitle: string; // display title; defaults to `Topic N` when omitted in JSON
    struggleTopics: string[]; // verbatim instructor labels for this chapter
}

/**
 * Parsed fixture catalog for one course.
 *
 * Loaded from JSON at startup (lazy) and cached in memory. `topicNumberPattern` and
 * `maxStruggleTopics` are required in the fixture file — not hardcoded in this module.
 */
export interface PredeterminedStruggleCatalog {
    courseName: string; // must match active course `courseName` for lookup
    source: string; // optional provenance string from JSON (informational)
    topicNumberPattern: RegExp; // compiled from JSON `topicNumberPattern` (case-insensitive)
    maxStruggleTopics: number; // per-upload cap when appending labels from this catalog
    topics: PredeterminedStruggleTopicEntry[]; // chapter rows in fixture order
}

let catalogsByCourseName: Map<string, PredeterminedStruggleCatalog> | null = null;
let labelsByCourseAndTopic: Map<string, Map<number, string[]>> | null = null;

function discoverCatalogFiles(): string[] {
    // Prefer src/fixtures in dev so edits win over stale dist copies
    const fixtureDirs = [
        path.join(process.cwd(), 'src/fixtures'),
        path.join(process.cwd(), 'dist/fixtures'),
    ].filter((dir) => fs.existsSync(dir));

    const seenFilenames = new Set<string>();
    const files: string[] = [];

    for (const dir of fixtureDirs) {
        for (const entry of fs.readdirSync(dir)) {
            if (!entry.endsWith(CATALOG_FILENAME_SUFFIX)) {
                continue;
            }
            // Skip duplicate filenames across dirs (first dir wins)
            if (seenFilenames.has(entry)) {
                continue;
            }
            seenFilenames.add(entry);
            files.push(path.join(dir, entry));
        }
    }

    return files;
}

function parseTopicNumberPattern(raw: unknown, filePath: string): RegExp {
    if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error(
            `Invalid instructor struggle catalog ${filePath}: topicNumberPattern must be a non-empty string`
        );
    }
    try {
        return new RegExp(raw, 'i');
    } catch {
        throw new Error(
            `Invalid instructor struggle catalog ${filePath}: topicNumberPattern is not a valid RegExp`
        );
    }
}

function parseMaxStruggleTopics(raw: unknown, filePath: string): number {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
        throw new Error(
            `Invalid instructor struggle catalog ${filePath}: maxStruggleTopics must be a positive integer`
        );
    }
    return raw;
}

function parseCatalog(raw: unknown, filePath: string): PredeterminedStruggleCatalog {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`Invalid instructor struggle catalog ${filePath}: root must be an object`);
    }

    const body = raw as Record<string, unknown>;
    const courseName = body.courseName;
    if (typeof courseName !== 'string' || !courseName.trim()) {
        throw new Error(`Invalid instructor struggle catalog ${filePath}: courseName must be a non-empty string`);
    }

    const topicsRaw = body.topics;
    if (!Array.isArray(topicsRaw)) {
        throw new Error(`Invalid instructor struggle catalog ${filePath}: topics must be an array`);
    }

    const topics: PredeterminedStruggleTopicEntry[] = topicsRaw.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Invalid catalog topic at index ${index} in ${filePath}`);
        }
        const row = entry as Record<string, unknown>;
        const topicNumber = row.topicNumber;
        const struggleTopics = row.struggleTopics;
        if (typeof topicNumber !== 'number' || !Number.isInteger(topicNumber) || topicNumber < 1) {
            throw new Error(`Invalid topicNumber at index ${index} in ${filePath}`);
        }
        if (!Array.isArray(struggleTopics) || !struggleTopics.every((t) => typeof t === 'string')) {
            throw new Error(`Invalid struggleTopics at index ${index} in ${filePath}`);
        }
        return {
            topicNumber,
            topicTitle: typeof row.topicTitle === 'string' ? row.topicTitle : `Topic ${topicNumber}`,
            struggleTopics: struggleTopics.map((t) => t.trim()).filter(Boolean),
        };
    });

    return {
        courseName: courseName.trim(),
        source: typeof body.source === 'string' ? body.source : '',
        topicNumberPattern: parseTopicNumberPattern(body.topicNumberPattern, filePath),
        maxStruggleTopics: parseMaxStruggleTopics(body.maxStruggleTopics, filePath),
        topics,
    };
}

function buildLabelsByCourseAndTopic(
    catalogs: Map<string, PredeterminedStruggleCatalog>
): Map<string, Map<number, string[]>> {
    const outer = new Map<string, Map<number, string[]>>();
    for (const [courseName, catalog] of catalogs) {
        const inner = new Map<number, string[]>();
        for (const entry of catalog.topics) {
            inner.set(entry.topicNumber, [...entry.struggleTopics]);
        }
        outer.set(courseName, inner);
    }
    return outer;
}

function ensureCatalogsLoaded(): void {
    if (catalogsByCourseName) {
        return;
    }

    const catalogs = new Map<string, PredeterminedStruggleCatalog>();

    // Parse each discovered fixture; reject duplicate courseName across files
    for (const filePath of discoverCatalogFiles()) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
        const catalog = parseCatalog(raw, filePath);
        if (catalogs.has(catalog.courseName)) {
            throw new Error(
                `Duplicate instructor struggle catalog for course "${catalog.courseName}" (${filePath})`
            );
        }
        catalogs.set(catalog.courseName, catalog);
    }

    catalogsByCourseName = catalogs;
    labelsByCourseAndTopic = buildLabelsByCourseAndTopic(catalogs);
}

/**
 * clearPredeterminedStruggleCatalogCache - Reset in-memory catalog caches.
 *
 * Used by tests and scripts that swap fixture files between lookups.
 *
 * @returns void
 */
export function clearPredeterminedStruggleCatalogCache(): void {
    catalogsByCourseName = null;
    labelsByCourseAndTopic = null;
}

/**
 * loadPredeterminedStruggleCatalogs - Load and cache all discovered fixture catalogs.
 *
 * Scans fixture directories once per process (unless cache cleared). Each catalog is
 * keyed by its JSON `courseName`. Subsequent calls return the same map without re-reading disk.
 *
 * @returns Read-only map of `courseName` → parsed {@link PredeterminedStruggleCatalog}
 * @throws Error when a fixture file is invalid or two files declare the same `courseName`
 */
export function loadPredeterminedStruggleCatalogs(): ReadonlyMap<string, PredeterminedStruggleCatalog> {
    ensureCatalogsLoaded();
    return catalogsByCourseName!;
}

/**
 * resolveTopicNumber - Extract chapter index from upload section title or material filename.
 *
 * Uses the catalog's `topicNumberPattern` for the given course. Tries `topicOrWeekTitle`
 * first, then `materialName`. The first positive integer capture group wins.
 *
 * @param courseName - Active course name; must match a loaded catalog's `courseName`
 * @param topicOrWeekTitle - Topic/week section title from the upload target (e.g. "Topic 7")
 * @param materialName - Uploaded material filename used as fallback for pattern matching
 * @returns 1-based topic number, or `null` when no catalog exists or pattern does not match
 */
export function resolveTopicNumber(
    courseName: string,
    topicOrWeekTitle: string,
    materialName: string
): number | null {
    ensureCatalogsLoaded();
    const catalog = catalogsByCourseName!.get(courseName);
    if (!catalog) {
        return null;
    }

    for (const source of [topicOrWeekTitle, materialName]) {
        const match = source.match(catalog.topicNumberPattern);
        if (match) {
            const n = Number.parseInt(match[1], 10);
            if (Number.isInteger(n) && n > 0) {
                return n;
            }
        }
    }
    return null;
}

/**
 * getPredeterminedLabels - Return fixture struggle labels for one chapter, FIFO-filtered.
 *
 * Walks the catalog row for `topicNumber` in fixture order, skips labels in `excludedSet`
 * (prior FIFO sections), and stops at the catalog's `maxStruggleTopics` count.
 *
 * @param courseName - Active course name; must match a loaded catalog's `courseName`
 * @param topicNumber - 1-based chapter index from {@link resolveTopicNumber}
 * @param excludedSet - Prior + current-section labels to omit (exact match, case-sensitive)
 * @returns Verbatim label strings to append; empty when no catalog, unknown topic, or all excluded
 */
export function getPredeterminedLabels(
    courseName: string,
    topicNumber: number,
    excludedSet: ReadonlySet<string>
): string[] {
    ensureCatalogsLoaded();
    const labels = labelsByCourseAndTopic!.get(courseName)?.get(topicNumber) ?? [];
    const maxTopics = catalogsByCourseName!.get(courseName)?.maxStruggleTopics ?? 0;
    const result: string[] = [];

    for (const label of labels) {
        if (excludedSet.has(label)) {
            continue;
        }
        result.push(label);
        if (result.length >= maxTopics) {
            break;
        }
    }

    return result;
}

/**
 * usesPredeterminedStruggleCatalog - Whether post-upload struggle generation should skip the LLM.
 *
 * True when a valid fixture catalog was discovered for `courseName`. Callers should still
 * resolve a topic number and confirm labels exist before bypassing LLM generation.
 *
 * @param courseName - Active course `courseName` to look up in loaded fixture catalogs
 * @returns `true` when a fixture catalog exists for this course name
 */
export function usesPredeterminedStruggleCatalog(courseName: string): boolean {
    ensureCatalogsLoaded();
    return catalogsByCourseName!.has(courseName);
}

/**
 * getAllPredeterminedCatalogLabels - Flatten all fixture labels for one course.
 *
 * Used by fixture remap/validation scripts to verify mapped labels exist in the catalog.
 * Does not apply FIFO exclusion or per-upload caps.
 *
 * @param courseName - Active course `courseName` to look up in loaded fixture catalogs
 * @returns All `struggleTopics` strings across every chapter row; empty when no catalog exists
 */
export function getAllPredeterminedCatalogLabels(courseName: string): string[] {
    ensureCatalogsLoaded();
    const catalog = catalogsByCourseName!.get(courseName);
    if (!catalog) {
        return [];
    }
    const labels: string[] = [];
    for (const entry of catalog.topics) {
        labels.push(...entry.struggleTopics);
    }
    return labels;
}
