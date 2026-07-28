import {
    getPageSlice,
    getTotalPages,
    INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE,
    needsFetch,
    shouldPrefetch,
} from '../../../public/scripts/utils/instructor-response-carousel';

describe('instructor-response-carousel helpers', () => {
    it('getTotalPages returns 0 for empty totals', () => {
        expect(getTotalPages(0)).toBe(0);
    });

    it('getTotalPages rounds up for partial last pages', () => {
        expect(getTotalPages(10)).toBe(1);
        expect(getTotalPages(11)).toBe(2);
        expect(getTotalPages(25)).toBe(3);
    });

    it('getPageSlice returns only the requested display page', () => {
        const buffer = Array.from({ length: 20 }, (_, i) => i);
        expect(getPageSlice(buffer, 0)).toEqual(buffer.slice(0, INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE));
        expect(getPageSlice(buffer, 1)).toEqual(buffer.slice(10, 20));
    });

    it('needsFetch is true when the page extends past the buffer but more exist server-side', () => {
        expect(needsFetch(20, 10, 25)).toBe(false);
        expect(needsFetch(20, 20, 25)).toBe(true);
        expect(needsFetch(25, 20, 25)).toBe(false);
    });

    it('shouldPrefetch when near the end of the cached batch', () => {
        expect(shouldPrefetch(20, 0, 40)).toBe(true);
        expect(shouldPrefetch(20, 1, 40)).toBe(true);
        expect(shouldPrefetch(40, 2, 40)).toBe(false);
        expect(shouldPrefetch(15, 0, 15)).toBe(false);
    });
});
