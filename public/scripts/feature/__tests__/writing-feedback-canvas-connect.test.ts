/**
 * Canvas connect link tests.
 *
 * The server's connect URL returns to the API request that found the missing authorization,
 * which leaves staff on raw JSON after authorizing. These pin the page's rewrite of it.
 */

import { connectUrlReturningTo } from '../writing-feedback-canvas-connect';

describe('connectUrlReturningTo', () => {
    it('replaces an API return address with the page path', () => {
        const serverUrl = `/api/lms/canvas/auth/login?returnTo=${encodeURIComponent('/api/courses/abc/writing-feedback/canvas/status')}`;
        const result = connectUrlReturningTo(serverUrl, '/course/abc/instructor/writing-feedback?wfView=assignments');

        const parsed = new URL(result, 'http://localhost');
        expect(parsed.pathname).toBe('/api/lms/canvas/auth/login');
        expect(parsed.searchParams.get('returnTo')).toBe('/course/abc/instructor/writing-feedback?wfView=assignments');
    });

    it('adds a return address when the server sent none', () => {
        const result = connectUrlReturningTo('/api/lms/canvas/auth/login', '/course/abc');
        expect(new URL(result, 'http://localhost').searchParams.get('returnTo')).toBe('/course/abc');
    });

    it('keeps other parameters and returns a same-site path', () => {
        const result = connectUrlReturningTo('/api/lms/canvas/auth/login?returnTo=%2Fapi%2Fx&prompt=login', '/course/abc');
        const parsed = new URL(result, 'http://localhost');

        expect(result.startsWith('/api/lms/canvas/auth/login?')).toBe(true);
        expect(parsed.searchParams.get('prompt')).toBe('login');
        expect(parsed.searchParams.getAll('returnTo')).toEqual(['/course/abc']);
    });
});
