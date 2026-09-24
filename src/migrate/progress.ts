/**
 * progress — CHECKED/FAIL/SKIP lines for migrate CLI
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.0.0
 * @description: Flushed progress printer.
 */

export type ProgressStatus = 'CHECKED' | 'FAIL' | 'SKIP' | 'MISSING' | 'UNTRACKED';

export interface ProgressCounts {
    checked: number;
    fail: number;
    skip: number;
    missing: number;
    untracked: number;
}

/**
 * createProgressCounts - zeroed CHECKED/FAIL/SKIP/MISSING/UNTRACKED tallies.
 */
export function createProgressCounts(): ProgressCounts {
    return { checked: 0, fail: 0, skip: 0, missing: 0, untracked: 0 };
}

/** recordStatus - increment one bucket on the running tally. */
export function recordStatus(counts: ProgressCounts, status: ProgressStatus): void {
    if (status === 'CHECKED') counts.checked += 1;
    else if (status === 'FAIL') counts.fail += 1;
    else if (status === 'SKIP') counts.skip += 1;
    else if (status === 'MISSING') counts.missing += 1;
    else counts.untracked += 1;
}

/**
 * formatProgressLine - `[i/total] label  extra  STATUS` with aligned counters.
 */
export function formatProgressLine(
    index: number,
    total: number,
    label: string,
    extra: string,
    status: ProgressStatus
): string {
    const pad = String(total).length;
    return `[${String(index).padStart(pad, ' ')}/${total}] ${label}  ${extra}  ${status}`;
}

/** allChecked - true when no FAIL lines were recorded (MISSING/UNTRACKED are ok). */
export function allChecked(counts: ProgressCounts): boolean {
    return counts.fail === 0;
}
