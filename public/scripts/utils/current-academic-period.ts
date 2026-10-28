/**
 * current-academic-period.ts
 *
 * Picks the academic period running today, which course selection opens by default.
 */

/** The date fields of an academic period, as stored (Date) or as received over JSON (string). */
export interface DatedPeriod {
    id: string;
    startDate: Date | string;
    endDate: Date | string;
}

/** Calendar date of a stored period boundary. Periods are entered as dates and stored as midnight UTC. */
function storedDay(value: Date | string): string {
    return new Date(value).toISOString().slice(0, 10);
}

/** The viewer's local calendar date as `YYYY-MM-DD`. */
function localDay(now: Date): string {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Returns the id of the period whose dates contain today, or `null` when none does.
 *
 * Both the start and end dates count as inside the period. When periods overlap, the most
 * recently started one wins.
 *
 * @param periods - Academic periods with their start and end dates
 * @param now - The current time (defaults to now)
 * @returns The current period's id, or `null`
 */
export function currentAcademicPeriodId(periods: DatedPeriod[], now: Date = new Date()): string | null {
    const today = localDay(now);
    const running = periods
        .filter((p) => storedDay(p.startDate) <= today && today <= storedDay(p.endDate))
        .sort((a, b) => storedDay(b.startDate).localeCompare(storedDay(a.startDate)));
    return running[0]?.id ?? null;
}
