/**
 * canvas-roster-sync.ts
 *
 * The "Sync roster" button in the instructor dashboard header, under the course code.
 *
 * Reads the course's Canvas student list into EngE-AI so enrolled students see the course when
 * they next sign in. Students authorize nothing (no OAuth for students).
 *
 * The button is hidden outright for a course with no `lmsLink`. An admin-created course has no
 * roster to read and the API answers 409.
 *
 * ## Why there is no confirmation dialog
 *
 * Guarding is proportional to what an accidental click costs, and here it costs almost nothing:
 * the sync is idempotent, enrolls nobody at click time (enrollment happens at login), never
 * un-enrolls, and leaves the previous roster intact when it fails. A confirm in front of that
 * trains people to dismiss dialogs unread, a cost paid at the next genuinely destructive prompt.
 * What the click does deserve is protection against *repetition* — an in-flight guard against
 * double-clicks, and {@link COOLDOWN_MS} against an impatient instructor hammering Canvas's
 * rate limit.
 *
 * ## Why a 200 is not necessarily good news
 *
 * A sync can succeed as an HTTP call and still report that Canvas withheld SIS identifiers, or
 * that the stored Canvas connection is dead. Those are real outcomes the instructor must act on,
 * so this raises the server's own message as an error toast rather than a generic "done" —
 * which is the whole reason the backend returns a status instead of a boolean.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Wires the dashboard header's Canvas roster sync button.
 */

import type { activeCourse, CourseRosterSyncSummary, RosterSyncStatus } from '../types.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';

/** Status values that mean the instructor has something to fix. */
const ACTIONABLE: ReadonlySet<RosterSyncStatus> = new Set<RosterSyncStatus>([
    'identifiers_withheld',
    'no_credential',
    'failed',
]);

/**
 * How long the button stays disabled after a completed run.
 *
 * Not a safety guard — the action is idempotent and safe to repeat. If an instructor 
 * repeatedly presses the sync button, this prevents us from exceeding Canvas's
 * rate limit, and is short enough that a deliberate re-run is never actually blocked.
 */
const COOLDOWN_MS = 10_000;

/**
 * A roster message can name a permission or a reconnection step, which takes longer to read than
 * the default toast lifetime allows.
 */
const TOAST_MS = 8_000;

/**
 * Tooltip prefix, so the tooltip never loses the button's purpose when the roster's age is
 * appended to it. The accessible name comes from `aria-label` and is never touched, so a screen
 * reader announces the action rather than a sentence about the last sync.
 */
const TOOLTIP_ACTION = 'Sync roster with Canvas';

/** Composes the tooltip: what the button does, then the state of the roster. */
function setTooltip(button: HTMLButtonElement, detail: string): void {
    button.title = detail ? `${TOOLTIP_ACTION} — ${detail}` : TOOLTIP_ACTION;
}

/**
 * wireCanvasRosterSync — shows and binds the roster sync button.
 *
 * Safe to call for any course: returns immediately when the course is not Canvas-linked, and
 * when the dashboard markup is absent.
 *
 * @param currentClass - the active course; `lmsLink` decides whether the button appears at all
 * @param canManage - true for course instructors and platform admins. Other course staff see the
 * button and its last-synced tooltip — a TA fielding "why can't I see this course?" needs that —
 * but cannot press it, matching the server's `requireRosterManageAPI` gate. Disabling here is a
 * UI convenience, never the enforcement; the route re-checks.
 */
export function wireCanvasRosterSync(currentClass: activeCourse, canManage: boolean): void {
    const button = document.getElementById('syncCanvasRoster') as HTMLButtonElement | null;
    if (!button) return;

    if (!currentClass.lmsLink) {
        button.hidden = true;
        return;
    }

    button.hidden = false;
    button.disabled = !canManage;

    let isSyncing = false;
    let cooldownUntil = 0;

    // Resting state: the roster's age lives in the tooltip, so it costs no layout.
    void loadStatus(currentClass.id, button, canManage);

    button.addEventListener('click', async () => {
        if (!canManage || isSyncing || Date.now() < cooldownUntil) return;

        isSyncing = true;
        button.disabled = true;
        // A roster read paginates a whole class and can take a while; silence would read as a
        // dead button and invite the second click this is trying to avoid.
        button.setAttribute('aria-busy', 'true');
        setTooltip(button, 'Reading the roster from Canvas…');

        try {
            const response = await fetch(
                `/api/lms/canvas/courses/${encodeURIComponent(currentClass.id)}/sync-roster`,
                { method: 'POST', credentials: 'same-origin' }
            );
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                // The server's message names the actual problem (no Canvas link, no salt
                // configured); a generic string would strip the only actionable part.
                showErrorToast(result.error || 'The roster could not be synced.', TOAST_MS);
                return;
            }

            const summary = result.summary as CourseRosterSyncSummary | undefined;
            if (!summary) {
                showErrorToast('The roster could not be synced.', TOAST_MS);
                return;
            }

            if (ACTIONABLE.has(summary.status)) {
                showErrorToast(summary.message, TOAST_MS);
            } else {
                showSuccessToast(summary.message, TOAST_MS);
            }
            setTooltip(button, describeLastRun(summary));
        } catch {
            showErrorToast('Could not reach EngE-AI. Check your connection and try again.', TOAST_MS);
        } finally {
            isSyncing = false;
            button.removeAttribute('aria-busy');
            cooldownUntil = Date.now() + COOLDOWN_MS;
            if (canManage) {
                window.setTimeout(() => {
                    // Re-check: a second run may have started during the pause.
                    if (!isSyncing) button.disabled = false;
                }, COOLDOWN_MS);
            }
        }
    });
}

/**
 * loadStatus — puts the roster's age in the button tooltip, without running a sync.
 *
 * Silent on failure. This is supporting information on a page whose main job is elsewhere; a
 * dashboard that raised a toast about a failed status read on every load would be worse than one
 * whose tooltip is simply less specific.
 */
async function loadStatus(courseId: string, button: HTMLButtonElement, canManage: boolean): Promise<void> {
    const cannotSync = canManage ? '' : ' Only an instructor or platform admin can sync.';

    try {
        const response = await fetch(
            `/api/lms/canvas/courses/${encodeURIComponent(courseId)}/roster-status`,
            { credentials: 'same-origin' }
        );
        if (!response.ok) return;

        const summary = (await response.json()).summary as CourseRosterSyncSummary | null;
        setTooltip(
            button,
            (summary ? describeLastRun(summary) : 'This roster has not been synced yet.') + cannotSync
        );
    } catch {
        // Deliberately silent — see above.
    }
}

/**
 * describeLastRun — the tooltip sentence about the most recent sync.
 *
 * Reports matched-of-total rather than a single number, because those two differing is the
 * instructor's only signal that some students have no SIS identifier in Canvas and will need to
 * join with the course code. A non-`ok` status says the roster is stale rather than broken — the
 * previous roster is still in service.
 */
function describeLastRun(summary: CourseRosterSyncSummary): string {
    const when = new Date(summary.syncedAt).toLocaleString();
    if (summary.status !== 'ok') {
        return `Last attempted ${when}. The last sync did not complete; students may be missing.`;
    }
    return `Last synced ${when} — ${summary.identifiedCount} of ${summary.rosterSize} students matched.`;
}
