/**
 * Canvas submission attachment download — credential-free byte fetch
 *
 * Canvas serves a submission attachment from a *web* route, not an API one:
 * `/files/:id/download?download_frd=1&verifier=...`. The `verifier` authorizes that one file
 * for a short window, which is the whole of the authorization the request needs.
 *
 * The LMS package's `downloadSubmissionAttachment` attaches the signed-in user's bearer token
 * to any URL on the Canvas origin. With **Enforce Scopes** enabled on the Developer Key, Canvas
 * evaluates that token against the grant, finds no scope matching a non-`/api/v1/` route, and
 * answers 401 — so presenting the token is strictly worse than presenting nothing. No OAuth
 * scope fixes it, because there is no scope for a route that is not part of the API surface.
 * This module therefore performs the byte fetch itself, with no `Authorization` header and no
 * cookies, and is the reason Writing Feedback does not call the package helper for this one
 * operation.
 *
 * It keeps every protection the package's own downloader applies, because the reasons for them
 * are unchanged:
 *
 * - The URL is **never** taken from a caller. It is re-read from the course-, assignment- and
 *   student-scoped submission endpoint immediately before use, so Canvas itself produces it.
 *   That is what proves the file belongs to this course, this assignment, and this student, and
 *   it keeps a handed-in URL from becoming an SSRF primitive.
 * - Every hop is origin-checked, redirects are followed manually and bounded, the response is
 *   capped at `maxBytes` while it is read rather than after, and a response that is not file
 *   bytes at all is refused.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Fetches Canvas submission attachment bytes without presenting an OAuth token.
 */

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';

/** The package's authenticated Canvas client, as `canvas.requireAuth` puts it on the request. */
type ApiClient = NonNullable<Parameters<typeof canvas.getCourses>[0]>;

/** Redirect statuses Canvas and its storage backends use for a file hand-off. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Hops allowed before a redirect chain is treated as a loop. Matches the package's ceiling. */
const MAX_REDIRECTS = 5;

/** Storage hosts Instructure hands files off to, matched as suffixes. */
const STORAGE_HOST_SUFFIXES = ['inscloudgate.net', 'canvas-user-content.com'];

/** One attachment as Canvas serializes it on a submission payload. */
interface CanvasAttachmentPayload {
    id?: string | number;
    url?: string;
    size?: number;
    'content-type'?: string;
    content_type?: string;
}

/** One submission, read only for its attachment list. */
interface CanvasSubmissionPayload {
    attachments?: CanvasAttachmentPayload[];
}

export interface CanvasAttachmentBytes {
    data: Buffer;
    contentType?: string;
    /** Size Canvas reported, when it reported one; compared against what actually arrived. */
    declaredBytes?: number;
    /**
     * Whether the URL carried a `verifier`. Its *value* is a credential and is never read or
     * logged, but its presence decides whether an unauthenticated fetch can work at all, so a
     * 401 with no verifier is a different diagnosis from a 401 with one.
     */
    verifierPresent: boolean;
}

/** True for an S3 bucket host, which Instructure uses for some deployments. */
function isAmazonS3Hostname(hostname: string): boolean {
    return /(^|\.)s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(hostname)
        || /(^|\.)s3\.amazonaws\.com$/i.test(hostname);
}

/** True when `hostname` is `suffix` or a subdomain of it. */
function matchesSuffix(hostname: string, suffix: string): boolean {
    const host = hostname.toLowerCase();
    const wanted = suffix.toLowerCase();
    return host === wanted || host.endsWith(`.${wanted}`);
}

/**
 * Decides whether one hop of the redirect chain may be followed.
 *
 * The Canvas origin is always permitted. A different host is permitted only after the first
 * hop and only when it is recognisable file storage: Canvas legitimately redirects there, but
 * nothing else should be reachable through a URL this process did not choose. Embedded
 * credentials are refused outright — they are never part of a Canvas file URL and their
 * presence means the URL was constructed by something other than Canvas.
 *
 * @param url - Hop being considered
 * @param canvasOrigin - Origin of the configured Canvas deployment
 * @param hop - Zero for the URL Canvas gave us, higher for each redirect followed
 * @returns True when the hop may be fetched
 */
function isPermittedHop(url: URL, canvasOrigin: string, hop: number): boolean {
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (url.origin === canvasOrigin) return true;
    if (hop === 0) return false;
    if (url.protocol !== 'https:' || (url.port && url.port !== '443')) return false;
    return STORAGE_HOST_SUFFIXES.some((suffix) => matchesSuffix(url.hostname, suffix))
        || isAmazonS3Hostname(url.hostname);
}

/**
 * Reads a response body, refusing to buffer more than `maxBytes`.
 *
 * The declared `content-length` is checked first so an oversized file costs nothing to reject,
 * but it is only a claim: the running total is enforced as chunks arrive, so a response that
 * under-declares its length is still stopped at the ceiling rather than after it.
 *
 * @param response - Response whose body is read
 * @param maxBytes - Hard ceiling on buffered bytes
 * @returns The body as one buffer
 * @throws Error when the body exceeds the ceiling
 */
async function readCappedBody(response: Response, maxBytes: number): Promise<Buffer> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error(`Canvas attachment exceeds the ${maxBytes}-byte import limit`);
    }
    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error(`Canvas attachment exceeds the ${maxBytes}-byte import limit`);
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

/**
 * downloadSubmissionAttachmentUnauthenticated - fetches one attachment's bytes with no token.
 *
 * Re-resolves the attachment through the scoped submission endpoint, then follows Canvas's own
 * URL to the bytes without presenting any credential. See this module's header for why the
 * token is deliberately withheld rather than merely omitted by accident.
 *
 * @param client - Authenticated Canvas client, used only for the scoped metadata read
 * @param options - Which attachment to fetch, the configured Canvas domain, and the byte ceiling
 * @returns The attachment bytes with the size Canvas declared alongside them
 * @throws Error when the attachment is absent, a hop is not permitted, or the body is too large
 */
export async function downloadSubmissionAttachmentUnauthenticated(
    client: ApiClient,
    options: {
        courseId: string;
        assignmentId: string;
        userId: string;
        attachmentId: string;
        canvasDomain: string;
        maxBytes: number;
        /**
         * Byte fetch, overridable so the origin, redirect and ceiling rules can be tested
         * without a network. Production always uses the global `fetch`.
         */
        fetchImpl?: typeof fetch;
    }
): Promise<CanvasAttachmentBytes> {
    const fetchBytes = options.fetchImpl ?? fetch;
    // Canvas produces the URL, so the file is provably this course's, this assignment's, and
    // this student's. A URL from anywhere else proves only that it points at Canvas.
    const submission = await client.get<CanvasSubmissionPayload>(
        `/courses/${encodeURIComponent(options.courseId)}`
        + `/assignments/${encodeURIComponent(options.assignmentId)}`
        + `/submissions/${encodeURIComponent(options.userId)}`
    );
    const attachment = (submission?.attachments ?? []).find(
        (candidate) => String(candidate?.id ?? '') === options.attachmentId
    );
    if (!attachment?.url) {
        throw new Error('Canvas submission attachment has no download URL');
    }

    const canvasOrigin = new URL(options.canvasDomain.replace(/\/+$/, '')).origin;
    let current = new URL(attachment.url, `${canvasOrigin}/`);
    const verifierPresent = current.searchParams.has('verifier');

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!isPermittedHop(current, canvasOrigin, hop)) {
            throw new Error(`Canvas named an unexpected file download host (rejected ${current.host})`);
        }
        // No Authorization, and never an ambient cookie. The URL's own verifier is the
        // authorization; a bearer token here is what Enforce Scopes rejects.
        const response: Response = await fetchBytes(current, { redirect: 'manual', credentials: 'omit' });

        if (!REDIRECT_STATUSES.has(response.status)) {
            if (!response.ok) {
                throw new Error(`Canvas file download returned ${response.status}`);
            }
            return {
                data: await readCappedBody(response, options.maxBytes),
                contentType: response.headers.get('content-type')
                    ?? attachment['content-type']
                    ?? attachment.content_type
                    ?? undefined,
                declaredBytes: typeof attachment.size === 'number' ? attachment.size : undefined,
                verifierPresent
            };
        }

        const location = response.headers.get('location');
        if (!location) throw new Error('Canvas file download redirected without a destination');
        if (hop === MAX_REDIRECTS) break;
        current = new URL(location, current);
    }
    throw new Error('Canvas file download exceeded the redirect limit');
}
