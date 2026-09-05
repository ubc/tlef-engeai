/**
 * Autosave state machine tests.
 *
 * The module is deliberately DOM-free (the Jest project is Node with no jsdom), so all of
 * the timing, single-flight, and stop-on-signed-out behaviour is testable here. Only the
 * reading of the form and the drawing of the status line live in the page.
 */

import { AutosaveSignedOutError, createAutosave } from '../writing-feedback-autosave';
import type { AutosaveState } from '../writing-feedback-autosave';

jest.useFakeTimers();

function harness(write: () => Promise<void>, options: { maxWaitMs?: number } = {}) {
    const seen: AutosaveState[] = [];
    const autosave = createAutosave({
        write,
        onStatus: (state) => seen.push(state),
        debounceMs: 2000,
        maxWaitMs: options.maxWaitMs ?? 30000,
        now: () => Date.now()
    });
    return { autosave, seen, statuses: () => seen.map((state) => state.status) };
}

describe('autosave cadence', () => {
    it('writes two seconds after typing stops, not on every keystroke', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);

        autosave.markDirty();
        jest.advanceTimersByTime(1500);
        autosave.markDirty();
        jest.advanceTimersByTime(1500);
        expect(write).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);
        await Promise.resolve();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('forces a write after the max wait even while typing continues', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);

        autosave.markDirty();
        for (let elapsed = 0; elapsed < 30000; elapsed += 1000) {
            jest.advanceTimersByTime(1000);
            autosave.markDirty();
        }
        await Promise.resolve();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('reports saving then saved', async () => {
        const { autosave, statuses } = harness(async () => {});
        autosave.markDirty();
        jest.advanceTimersByTime(2000);
        await jest.runAllTimersAsync();
        expect(statuses()).toEqual(['pending', 'saving', 'saved']);
    });
});

describe('single flight', () => {
    it('does not start a second write while one is in progress', async () => {
        let release = (): void => {};
        const write = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
        const { autosave } = harness(write);

        autosave.markDirty();
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        expect(write).toHaveBeenCalledTimes(1);

        autosave.markDirty();
        jest.advanceTimersByTime(10000);
        expect(write).toHaveBeenCalledTimes(1);

        release();
        await jest.runAllTimersAsync();
        expect(write).toHaveBeenCalledTimes(2);
    });
});

describe('failure handling', () => {
    it('reports an error and keeps trying on an ordinary failure', async () => {
        const write = jest.fn()
            .mockRejectedValueOnce(new Error('Network down'))
            .mockResolvedValueOnce(undefined);
        const { autosave, seen } = harness(write as () => Promise<void>);

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(seen.some((state) => state.status === 'error' && state.message === 'Network down')).toBe(true);

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(write).toHaveBeenCalledTimes(2);
    });

    it('stops the loop when the session has expired', async () => {
        const write = jest.fn(async () => { throw new AutosaveSignedOutError(); });
        const { autosave } = harness(write);

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(autosave.state().status).toBe('stopped');

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('stays stopped once stopped by the page', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);
        autosave.stop('Signed out');
        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(write).not.toHaveBeenCalled();
        expect(autosave.state().message).toBe('Signed out');
    });
});

describe('flush', () => {
    it('writes immediately when dirty', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);
        autosave.markDirty();
        await autosave.flush();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('does nothing when clean', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);
        await autosave.flush();
        expect(write).not.toHaveBeenCalled();
    });
});
