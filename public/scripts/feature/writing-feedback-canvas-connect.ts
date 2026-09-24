/**
 * Writing Feedback Canvas connect link
 *
 * Every Connect Canvas link the server hands the workspace names an `/api/...` request as its
 * return address, because both builders read `req.originalUrl` and the request that discovered
 * the missing authorization is always an API call. Following it unchanged lands staff on a raw
 * JSON envelope after authorizing. Only the page knows where staff actually are.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Points a Canvas connect link back at the page that offered it.
 */

/**
 * Rewrites a Canvas connect URL so authorization returns to the given page.
 *
 * The OAuth router accepts only a same-site path, so the return address is a path with its
 * query and hash, never an absolute URL. The result keeps the server's own login path and any
 * other parameters it chose.
 *
 * @param connectUrl - Connect URL from the server, e.g. `/api/lms/canvas/auth/login?returnTo=...`
 * @param returnPath - Same-site path to come back to, e.g. `location.pathname + location.search`
 * @returns The connect URL as a path with `returnTo` replaced by `returnPath`
 */
export function connectUrlReturningTo(connectUrl: string, returnPath: string): string {
    // The base only lets a relative URL parse; it is stripped again on the way out.
    const url = new URL(connectUrl, 'http://placeholder.invalid');
    url.searchParams.set('returnTo', returnPath);
    return `${url.pathname}${url.search}`;
}
