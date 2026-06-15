/**
 * predetermined-struggle-catalog.ts
 *
 * Loads fixed APSC 183 instructor struggle-topic labels for Test 3 uploads
 * (deterministic replacement for LLM generation).
 */

import fs from 'fs';
import path from 'path';
import { MAX_STRUGGLE_TOPICS } from './struggle-generation-schema';

export const PREDETERMINED_STRUGGLE_COURSE_NAME = 'Test 3';

const TOPIC_NUMBER_PATTERN = /Topic\s*(\d+)/i;

export interface PredeterminedStruggleTopicEntry {
    topicNumber: number;
    topicTitle: string;
    struggleTopics: string[];
}

export interface PredeterminedStruggleCatalog {
    courseName: string;
    source: string;
    topics: PredeterminedStruggleTopicEntry[];
}

let cachedCatalog: PredeterminedStruggleCatalog | null = null;
let cachedByTopicNumber: Map<number, string[]> | null = null;

function resolveCatalogPath(): string {
    const candidates = [
        path.join(process.cwd(), 'dist/fixtures/APSC183-instructor-struggle-topics.json'),
        path.join(process.cwd(), 'src/fixtures/APSC183-instructor-struggle-topics.json'),
    ];

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }

    throw new Error(
        `APSC183-instructor-struggle-topics.json not found. Expected one of: ${candidates.join(', ')}`
    );
}

function parseCatalog(raw: unknown): PredeterminedStruggleCatalog {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Invalid APSC183 instructor struggle catalog: root must be an object');
    }

    const body = raw as Record<string, unknown>;
    const topicsRaw = body.topics;
    if (!Array.isArray(topicsRaw)) {
        throw new Error('Invalid APSC183 instructor struggle catalog: topics must be an array');
    }

    const topics: PredeterminedStruggleTopicEntry[] = topicsRaw.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Invalid catalog topic at index ${index}`);
        }
        const row = entry as Record<string, unknown>;
        const topicNumber = row.topicNumber;
        const struggleTopics = row.struggleTopics;
        if (typeof topicNumber !== 'number' || !Number.isInteger(topicNumber) || topicNumber < 1) {
            throw new Error(`Invalid topicNumber at index ${index}`);
        }
        if (!Array.isArray(struggleTopics) || !struggleTopics.every((t) => typeof t === 'string')) {
            throw new Error(`Invalid struggleTopics at index ${index}`);
        }
        return {
            topicNumber,
            topicTitle: typeof row.topicTitle === 'string' ? row.topicTitle : `Topic ${topicNumber}`,
            struggleTopics: struggleTopics.map((t) => t.trim()).filter(Boolean),
        };
    });

    return {
        courseName: typeof body.courseName === 'string' ? body.courseName : PREDETERMINED_STRUGGLE_COURSE_NAME,
        source: typeof body.source === 'string' ? body.source : '',
        topics,
    };
}

function buildTopicNumberMap(catalog: PredeterminedStruggleCatalog): Map<number, string[]> {
    const map = new Map<number, string[]>();
    for (const entry of catalog.topics) {
        map.set(entry.topicNumber, [...entry.struggleTopics]);
    }
    return map;
}

/** Clears cached catalog (for tests). */
export function clearPredeterminedStruggleCatalogCache(): void {
    cachedCatalog = null;
    cachedByTopicNumber = null;
}

/**
 * Loads and caches the committed APSC183 instructor struggle catalog.
 */
export function loadPredeterminedStruggleCatalog(): PredeterminedStruggleCatalog {
    if (cachedCatalog) {
        return cachedCatalog;
    }

    const filePath = resolveCatalogPath();
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    cachedCatalog = parseCatalog(raw);
    cachedByTopicNumber = buildTopicNumberMap(cachedCatalog);
    return cachedCatalog;
}

/**
 * Extracts topic number from section title or material filename (e.g. "Topic 7", "APSC 183 Topic 7.md").
 */
export function resolveTopicNumber(topicOrWeekTitle: string, materialName: string): number | null {
    for (const source of [topicOrWeekTitle, materialName]) {
        const match = source.match(TOPIC_NUMBER_PATTERN);
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
 * Returns predetermined catalog labels for a chapter, excluding FIFO prior labels.
 * At most {@link MAX_STRUGGLE_TOPICS} labels are returned (upload product rule).
 */
export function getPredeterminedLabels(
    topicNumber: number,
    excludedSet: ReadonlySet<string>
): string[] {
    if (!cachedByTopicNumber) {
        loadPredeterminedStruggleCatalog();
    }

    const labels = cachedByTopicNumber?.get(topicNumber) ?? [];
    const result: string[] = [];

    for (const label of labels) {
        if (excludedSet.has(label)) {
            continue;
        }
        result.push(label);
        if (result.length >= MAX_STRUGGLE_TOPICS) {
            break;
        }
    }

    return result;
}

/**
 * Returns true when the course should use predetermined struggle labels instead of LLM generation.
 */
export function usesPredeterminedStruggleCatalog(courseName: string): boolean {
    return courseName === PREDETERMINED_STRUGGLE_COURSE_NAME;
}

/** All catalog labels (flat, for validation). */
export function getAllPredeterminedCatalogLabels(): string[] {
    const catalog = loadPredeterminedStruggleCatalog();
    const labels: string[] = [];
    for (const entry of catalog.topics) {
        labels.push(...entry.struggleTopics);
    }
    return labels;
}
