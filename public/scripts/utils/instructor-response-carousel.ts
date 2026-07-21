/** Display page size for instructor student-response carousel. */
export const INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE = 10;

export function getTotalPages(total: number, pageSize = INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE): number {
    if (total <= 0) return 0;
    return Math.ceil(total / pageSize);
}

export function getPageSlice<T>(
    buffer: T[],
    page: number,
    pageSize = INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE
): T[] {
    const start = page * pageSize;
    return buffer.slice(start, start + pageSize);
}

export function needsFetch(
    bufferLength: number,
    pageStart: number,
    total: number,
    pageSize = INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE
): boolean {
    return pageStart + pageSize > bufferLength && bufferLength < total;
}

/** Prefetch when the current page end is within one display page of the buffer end. */
export function shouldPrefetch(
    bufferLength: number,
    currentPage: number,
    total: number,
    pageSize = INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE
): boolean {
    const pageEnd = (currentPage + 1) * pageSize;
    return pageEnd >= bufferLength - pageSize && bufferLength < total;
}
