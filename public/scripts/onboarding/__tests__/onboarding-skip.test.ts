/**
 * onboarding-skip.test.ts
 *
 * Pins the skip client's request shape and error surfacing.
 *
 * Jest runs without a DOM here, so the modal itself is proven in the browser pass; what is
 * covered is everything that decides whether an irreversible write happens and what the
 * instructor is told when it fails.
 *
 * @author: @rdschrs
 */

jest.mock('../../ui/modal-overlay.js', () => ({
    SKIP_TUTORIAL_CONFIRM_ACTION: 'yes,-skip-it',
    showSkipTutorialModal: jest.fn(),
    showErrorModal: jest.fn()
}));

import { offerSkipTutorial, skipRemainingOnboarding } from '../onboarding-skip';
import { showErrorModal, showSkipTutorialModal } from '../../ui/modal-overlay.js';

function mockFetch(response: unknown): jest.Mock {
    const fetchMock = jest.fn().mockResolvedValue(response);
    (global as any).fetch = fetchMock;
    return fetchMock;
}

afterEach(() => {
    delete (global as any).fetch;
});

describe('skipRemainingOnboarding', () => {
    it('posts to the skip endpoint with same-origin credentials', async () => {
        const fetchMock = mockFetch({
            ok: true,
            json: async () => ({ success: true, instructorOnboarding: { contentSetup: true } })
        });

        await skipRemainingOnboarding();

        expect(fetchMock).toHaveBeenCalledWith('/api/user/onboarding/skip-remaining', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        });
    });

    it('throws the server message when the request fails', async () => {
        mockFetch({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Failed to skip instructor onboarding' })
        });

        await expect(skipRemainingOnboarding()).rejects.toThrow('Failed to skip instructor onboarding');
    });

    it('throws when the body reports failure despite a 200', async () => {
        mockFetch({ ok: true, json: async () => ({ success: false, error: 'User not found' }) });

        await expect(skipRemainingOnboarding()).rejects.toThrow('User not found');
    });

    it('throws on an unparseable body rather than reporting success', async () => {
        mockFetch({
            ok: false,
            status: 502,
            json: async () => {
                throw new Error('not json');
            }
        });

        await expect(skipRemainingOnboarding()).rejects.toThrow('Failed to skip instructor onboarding');
    });
});

describe('offerSkipTutorial', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes and reports skipped only on an explicit confirm', async () => {
        (showSkipTutorialModal as jest.Mock).mockResolvedValue({ action: 'yes,-skip-it' });
        const fetchMock = mockFetch({ ok: true, json: async () => ({ success: true }) });

        await expect(offerSkipTutorial()).resolves.toBe('skipped');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(['no,-continue-with-the-tutorial', 'escape', 'close'])(
        'writes nothing when the modal resolves %s',
        async (action) => {
            (showSkipTutorialModal as jest.Mock).mockResolvedValue({ action });
            const fetchMock = mockFetch({ ok: true, json: async () => ({ success: true }) });

            await expect(offerSkipTutorial()).resolves.toBe('continued');
            expect(fetchMock).not.toHaveBeenCalled();
        }
    );

    it('keeps the instructor in place behind an error modal when the write fails', async () => {
        (showSkipTutorialModal as jest.Mock).mockResolvedValue({ action: 'yes,-skip-it' });
        mockFetch({ ok: false, status: 500, json: async () => ({ error: 'Failed to skip instructor onboarding' }) });

        await expect(offerSkipTutorial()).resolves.toBe('continued');
        expect(showErrorModal).toHaveBeenCalledWith(
            'Could not skip the tutorial',
            'Failed to skip instructor onboarding'
        );
    });
});
