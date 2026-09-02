/**
 * canvas-roster-sync.ts
 *
 * Instructor-facing "Sync roster" control on the dashboard's Advanced Settings.
 *
 * Reads the course's Canvas student list into EngE-AI so enrolled students see the course when
 * they next sign in. Students authorize nothing — that is the point of the feature, and the
 * copy says so, because an instructor who thinks students must also connect Canvas will tell
 * their class to do something unnecessary.
 *
 * The panel is hidden outright for a course with no `lmsLink`. An admin-created course has no
 * roster to read, and the backend refuses that case with a 409; showing a button whose only
 * outcome is an error would be worse than showing nothing.
 *
 * **Not every failure here is an error.** A sync can succeed as an HTTP call and still report
 * that Canvas withheld SIS identifiers, or that the stored Canvas connection is dead. Those are
 * `200` responses carrying a status the instructor has to act on, so this module renders the
 * server's message rather than inventing a generic "done" — the whole reason the backend returns
 * a status instead of a boolean.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Wires the dashboard's Canvas roster sync button.
 */

import type { activeCourse, CourseRosterSyncSummary, RosterSyncStatus } from '../types.js';

/** Status values that mean the instructor has something to fix. */
const ACTIONABLE: ReadonlySet<RosterSyncStatus> = new Set<RosterSyncStatus>([
    'identifiers_withheld',
    'no_credential',
    'failed',
]);

/**
 * wireCanvasRosterSync — shows and binds the roster sync panel.
 *
 * Safe to call for any course: it returns immediately when the course is not Canvas-linked, and
 * when the dashboard markup is absent.
 *
 * @param currentClass - the active course; `lmsLink` decides whether the panel appears at all
 * @param canManage - true for course instructors and platform admins. TAs see the panel (the
 * roster's state is useful to them) but cannot trigger a sync, matching the server's
 * `requireRosterManageAPI` gate. Disabling the control here is a UI convenience, never the
 * enforcement — the route re-checks.
 */
export function wireCanvasRosterSync(currentClass: activeCourse, canManage: boolean): void {
    const item = document.getElementById('dashboard-roster-accordion');
    const button = document.getElementById('syncCanvasRoster') as HTMLButtonElement | null;
    const status = document.getElementById('rosterSyncStatus');
    const taNote = document.getElementById('dashboard-roster-ta-note');
    if (!item || !button || !status) return;

    if (!currentClass.lmsLink) {
        item.hidden = true;
        return;
    }

    item.hidden = false;
    if (taNote) taNote.hidden = canManage;
    button.disabled = !canManage;

    let isSyncing = false;

    button.addEventListener('click', async () => {
        if (!canManage || isSyncing) return;

        isSyncing = true;
        button.disabled = true;
        // A roster read paginates through a whole class and can take a while; silence would read
        // as a dead button and invite a second click.
        setStatus(status, 'Reading the roster from Canvas…', 'pending');

        try {
            const response = await fetch(
                `/api/lms/canvas/courses/${encodeURIComponent(currentClass.id)}/sync-roster`,
                { method: 'POST', credentials: 'same-origin' }
            );
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                // The server's message names the actual problem (no Canvas link, no salt
                // configured); a generic string would strip the only actionable part.
                setStatus(status, result.error || 'The roster could not be synced.', 'error');
                return;
            }

            const summary = result.summary as CourseRosterSyncSummary | undefined;
            if (!summary) {
                setStatus(status, 'The roster could not be synced.', 'error');
                return;
            }

            setStatus(status, summary.message, ACTIONABLE.has(summary.status) ? 'error' : 'ok');
            renderLastRun(summary);
        } catch {
            setStatus(status, 'Could not reach EngE-AI. Check your connection and try again.', 'error');
        } finally {
            isSyncing = false;
            button.disabled = !canManage;
        }
    });
}

/**
 * setStatus — writes the live region.
 *
 * The element is `aria-live="polite"`, so replacing its text is what announces the outcome to a
 * screen reader. `data-state` carries the colour, keeping the styling decision in CSS.
 */
function setStatus(element: HTMLElement, message: string, state: 'pending' | 'ok' | 'error'): void {
    element.textContent = message;
    element.dataset.state = state;
}

/**
 * renderLastRun — the counts line under the button.
 *
 * Reports roster size alongside how many were matched, because those numbers differing is the
 * instructor's signal that some students have no SIS identifier in Canvas and will need the
 * course code. A single "synced N" would hide that.
 */
function renderLastRun(summary: CourseRosterSyncSummary): void {
    const element = document.getElementById('rosterSyncLastRun');
    if (!element) return;

    if (summary.status !== 'ok') {
        element.textContent = '';
        return;
    }

    const when = new Date(summary.syncedAt).toLocaleString();
    element.textContent =
        `Last synced ${when} — ${summary.identifiedCount} of ${summary.rosterSize} students matched.`;
}
