/**
 * writing-feedback-autosave.ts
 *
 * The rubric page's background save, with no DOM in sight.
 *
 * An instructor filling in a rubric can be signed out mid-edit and lose the lot. This
 * keeps a stored draft close behind what is on screen without changing what explicit
 * Save means: Save still validates, still reports, and is still what an instructor
 * presses before approving.
 *
 * DOM-free on purpose, in the same idiom as writing-feedback-rubric-progress.ts: the
 * Jest project runs in Node with no jsdom, so timing and single-flight logic that lives
 * here can be tested and logic that lives in the renderer cannot.
 *
 * @author: @rdschrs
 * @date: 2026-09-05
 * @version: 1.0.0
 */

/** Where the loop is, in the words the status line uses. */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'stopped';

/** One observable step of the loop. `savedAt` is set only once a write has succeeded. */
export interface AutosaveState {
    status: AutosaveStatus;
    savedAt?: number;
    message?: string;
}

/** Thrown by a caller's `write` when the session has expired; stops the loop for good. */
export class AutosaveSignedOutError extends Error {
    constructor(message = 'Signed out') {
        super(message);
        this.name = 'AutosaveSignedOutError';
    }
}

export interface AutosaveOptions {
    /** Performs one write. Resolving means stored; throwing means not stored. */
    write: () => Promise<void>;
    /** Called on every state change, for the status line. */
    onStatus: (state: AutosaveState) => void;
    /** Quiet period after the last edit. Default two seconds. */
    debounceMs?: number;
    /** Longest a dirty draft may go unwritten while edits keep arriving. Default thirty seconds. */
    maxWaitMs?: number;
    /** Injectable clock, so tests can assert the saved-at stamp. */
    now?: () => number;
}

export interface Autosave {
    /** Records an edit and arms the timer. */
    markDirty(): void;
    /** Writes now if dirty. Used on visibility change and page hide. */
    flush(): Promise<void>;
    /** Stops the loop permanently and shows `message`. */
    stop(message: string): void;
    /** Current state, for callers that need it outside a status callback. */
    state(): AutosaveState;
}

/**
 * createAutosave - debounced, single-flight background save.
 *
 * Edits arriving during a write do not queue another write; they re-arm the timer once
 * the in-flight one settles, so a fast typist produces one write per quiet period rather
 * than a backlog of them.
 *
 * @param options - Write function, status sink, and cadence overrides
 * @returns Handle the page drives from its input and lifecycle events
 */
export function createAutosave(options: AutosaveOptions): Autosave {
    const debounceMs = options.debounceMs ?? 2000;
    const maxWaitMs = options.maxWaitMs ?? 30000;
    const now = options.now ?? (() => Date.now());

    let current: AutosaveState = { status: 'idle' };
    let dirty = false;
    let inFlight = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirtySince = 0;
    // Set when the last write failed for an ordinary reason, which suppresses the automatic
    // re-arm. Cleared as soon as a write starts, so a later attempt reports normally.
    let failed = false;

    const publish = (next: AutosaveState): void => {
        current = next;
        options.onStatus(current);
    };

    const clear = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };

    const arm = (): void => {
        clear();
        // The forced flush is what keeps a continuous typist from going unsaved: the quiet
        // period never arrives, so the deadline decides instead.
        const deadline = dirtySince + maxWaitMs;
        const delay = Math.max(0, Math.min(debounceMs, deadline - now()));
        timer = setTimeout(() => { void run(); }, delay);
    };

    const run = async (): Promise<void> => {
        clear();
        if (stopped || inFlight || !dirty) return;
        inFlight = true;
        failed = false;
        dirty = false;
        publish({ status: 'saving', ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}) });
        try {
            await options.write();
            publish({ status: 'saved', savedAt: now() });
        } catch (error) {
            if (error instanceof AutosaveSignedOutError) {
                stopped = true;
                publish({
                    status: 'stopped',
                    ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}),
                    message: error.message
                });
                return;
            }
            // An ordinary failure leaves the draft dirty so the next edit, or the next forced
            // flush, tries again. It deliberately does not re-arm the timer: a server that is
            // failing for a reason of its own would otherwise be retried every couple of
            // seconds for as long as the page stays open, with nobody asking for it.
            dirty = true;
            failed = true;
            // Restart the dirty clock with the failure. Left where it was, its forced-flush
            // deadline is already behind us, and the next keystroke would arm a zero-delay
            // write against the server that just refused this one.
            dirtySince = now();
            publish({
                status: 'error',
                ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}),
                message: error instanceof Error ? error.message : 'Could not save'
            });
        } finally {
            inFlight = false;
            // Step: re-arm once, for edits that arrived while this write was in the air.
            if (dirty && !stopped && !failed) arm();
        }
    };

    return {
        markDirty(): void {
            if (stopped) return;
            if (!dirty) dirtySince = now();
            dirty = true;
            if (current.status !== 'saving') {
                publish({ status: 'pending', ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}) });
            }
            if (!inFlight) arm();
        },
        async flush(): Promise<void> {
            if (stopped || !dirty) return;
            await run();
        },
        stop(message: string): void {
            stopped = true;
            dirty = false;
            clear();
            publish({ status: 'stopped', ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}), message });
        },
        state(): AutosaveState {
            return current;
        }
    };
}
