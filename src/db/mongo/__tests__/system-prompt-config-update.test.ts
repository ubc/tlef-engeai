/**
 * Regression: reset must keep usePlatformDefault true (modules: [] must not flip the flag).
 */

import type { ModeSystemPromptState } from '../../../types/shared';
import type { UpdateModeSystemPromptInput } from '../system-prompt-config-mongo';

/** Mirrors updateModeSystemPrompt flag/module merging (no Mongo). */
function applyModeUpdateForTest(
    prior: ModeSystemPromptState,
    input: UpdateModeSystemPromptInput
): ModeSystemPromptState {
    const modeState = { ...prior };

    if (input.usePlatformDefault !== undefined) {
        modeState.usePlatformDefault = input.usePlatformDefault;
        if (input.usePlatformDefault) {
            modeState.modules = [];
        }
    }

    if (input.modules !== undefined && input.usePlatformDefault !== true) {
        modeState.modules = input.modules.map((m, index) => ({
            id: m.id,
            body: m.body,
            sortOrder: index,
        }));
        modeState.usePlatformDefault = false;
    }

    return modeState;
}

describe('system prompt mode update (reset regression)', () => {
    const base: ModeSystemPromptState = {
        usePlatformDefault: false,
        modules: [{ id: 'custom_a', body: 'x', sortOrder: 0 }],
        updatedAt: '2026-06-02T00:00:00.000Z',
    };

    it('reset input keeps usePlatformDefault true', () => {
        const next = applyModeUpdateForTest(base, { usePlatformDefault: true });
        expect(next.usePlatformDefault).toBe(true);
        expect(next.modules).toEqual([]);
    });

    it('legacy reset input (usePlatformDefault + modules: []) must not flip flag', () => {
        const next = applyModeUpdateForTest(base, { usePlatformDefault: true, modules: [] });
        expect(next.usePlatformDefault).toBe(true);
        expect(next.modules).toEqual([]);
    });

    it('custom save still sets usePlatformDefault false', () => {
        const next = applyModeUpdateForTest(base, {
            modules: [{ id: 'a', body: 'b', sortOrder: 0 }],
        });
        expect(next.usePlatformDefault).toBe(false);
        expect(next.modules).toHaveLength(1);
    });
});
