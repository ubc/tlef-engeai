/**
 * Material coverage — which assignment expectations the course materials actually teach
 *
 * Built from the genre pass and its relevance verdicts, so a ✓ means a published document
 * was judged to support the expectation, not merely that a search returned something.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Coverage rows, course-material fingerprint, and cache currency.
 */

import { createHash } from 'crypto';
import type { MaterialCoverage, MaterialCoverageRow } from './contracts';
import type { GroundingExcerpt, RetrievalNeed } from './course-material-mentions';

/** Needs that describe the assignment; contrast and finding needs are per-submission. */
const COVERAGE_KINDS = new Set(['genre', 'stage', 'task_requirement', 'language_function']);

/**
 * buildCoverageRows - one row per assignment-level need.
 *
 * @param needs - Genre-pass needs
 * @param excerpts - Genre-pass excerpts
 * @param supported - Need id to supporting excerpt ids
 * @returns Rows in need order; covered only by published supporting excerpts
 */
export function buildCoverageRows(
    needs: RetrievalNeed[],
    excerpts: GroundingExcerpt[],
    supported: Map<string, Set<string>>
): MaterialCoverageRow[] {
    const byId = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));
    return needs.filter((need) => COVERAGE_KINDS.has(need.kind)).map((need) => {
        const labels = [...(supported.get(need.id) ?? [])]
            .map((excerptId) => byId.get(excerptId))
            .filter((excerpt): excerpt is GroundingExcerpt => Boolean(excerpt?.published && excerpt.mention))
            .map((excerpt) => excerpt.mention!.label);
        const materialLabels = [...new Set(labels)];
        return { needId: need.id, kind: need.kind, label: need.label, covered: materialLabels.length > 0, materialLabels };
    });
}

interface FingerprintCourse {
    topicOrWeekInstances?: Array<{
        id?: string;
        published?: boolean;
        items?: Array<{ id?: string; updatedAt?: Date | string; additionalMaterials?: Array<{ id?: string }> }>;
    }>;
}

/**
 * courseMaterialFingerprint - a stable hash of the course's published material.
 *
 * @param course - Active course record
 * @returns Hex digest that changes when published items or their materials change
 */
export function courseMaterialFingerprint(course: FingerprintCourse | null | undefined): string {
    const parts = (course?.topicOrWeekInstances ?? [])
        .filter((topic) => topic.published === true)
        .flatMap((topic) => (topic.items ?? []).map((item) => [
            topic.id ?? '',
            item.id ?? '',
            item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
            (item.additionalMaterials ?? []).map((material) => material.id ?? '').sort().join(',')
        ].join('|')))
        .sort();
    return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

/**
 * isCoverageCurrent - whether cached coverage still describes the assignment.
 *
 * @param coverage - Cached coverage, if any
 * @param rubricVersion - Current approved rubric version
 * @param fingerprint - Current course-material fingerprint
 * @returns True when both keys match
 */
export function isCoverageCurrent(coverage: MaterialCoverage | undefined, rubricVersion: number, fingerprint: string): boolean {
    return Boolean(coverage && coverage.rubricVersion === rubricVersion && coverage.materialFingerprint === fingerprint);
}
