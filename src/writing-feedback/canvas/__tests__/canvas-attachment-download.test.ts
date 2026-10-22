/**
 * Canvas attachment download tests — credential suppression and hop rules
 *
 * The behaviour under test is why this module exists at all: the bytes are fetched with no
 * Authorization header, because Canvas serves attachments from a web route that Enforce Scopes
 * rejects any token against. The protections the package's downloader applies are kept, so they
 * are asserted here rather than assumed.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Guards the no-token rule, origin allowlist, redirect ceiling, and byte cap.
 */

import { downloadSubmissionAttachmentUnauthenticated } from '../canvas-attachment-download';

const CANVAS_DOMAIN = 'https://canvas.test';

/** Submission payload the scoped metadata read returns. */
function submissionWith(url: string, size?: number) {
    return { attachments: [{ id: 7, url, size, 'content-type': 'application/pdf' }] };
}

/** Minimal client whose `get` returns one fixed submission and records the path read. */
function fakeClient(submission: unknown) {
    const paths: string[] = [];
    const client = {
        async get(path: string) {
            paths.push(path);
            return submission;
        }
    } as any;
    return { client, paths };
}

function options(overrides: Partial<Parameters<typeof downloadSubmissionAttachmentUnauthenticated>[1]> = {}) {
    return {
        courseId: '55',
        assignmentId: '101',
        userId: '901',
        attachmentId: '7',
        canvasDomain: CANVAS_DOMAIN,
        maxBytes: 1024,
        ...overrides
    };
}

describe('downloadSubmissionAttachmentUnauthenticated', () => {
    it('never sends an Authorization header or cookies', async () => {
        const { client } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download?verifier=abc`, 3));
        const seen: RequestInit[] = [];
        const fetchImpl = (async (_url: URL, init: RequestInit) => {
            seen.push(init);
            return new Response(Buffer.from('pdf'), { status: 200 });
        }) as unknown as typeof fetch;

        await downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl }));

        expect(seen).toHaveLength(1);
        expect(seen[0].credentials).toBe('omit');
        // No headers at all is the strongest form of the guarantee.
        expect(seen[0].headers).toBeUndefined();
    });

    it('resolves the URL through the course-, assignment- and student-scoped endpoint', async () => {
        const { client, paths } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`, 3));
        const fetchImpl = (async () => new Response(Buffer.from('pdf'), { status: 200 })) as unknown as typeof fetch;

        await downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl }));

        expect(paths).toEqual(['/courses/55/assignments/101/submissions/901']);
    });

    it('reports whether the URL carried a verifier without exposing it', async () => {
        const fetchImpl = (async () => new Response(Buffer.from('pdf'), { status: 200 })) as unknown as typeof fetch;

        const withVerifier = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download?verifier=secret`, 3));
        const a = await downloadSubmissionAttachmentUnauthenticated(withVerifier.client, options({ fetchImpl }));
        expect(a.verifierPresent).toBe(true);

        const without = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`, 3));
        const b = await downloadSubmissionAttachmentUnauthenticated(without.client, options({ fetchImpl }));
        expect(b.verifierPresent).toBe(false);
    });

    it('follows a redirect to recognised Instructure storage', async () => {
        const { client } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`, 3));
        const hosts: string[] = [];
        const fetchImpl = (async (url: URL) => {
            hosts.push(url.host);
            if (hosts.length === 1) {
                return new Response(null, {
                    status: 302,
                    headers: { location: 'https://files.inscloudgate.net/signed/7' }
                });
            }
            return new Response(Buffer.from('pdf'), { status: 200 });
        }) as unknown as typeof fetch;

        const result = await downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl }));

        expect(hosts).toEqual(['canvas.test', 'files.inscloudgate.net']);
        expect(result.data.toString()).toBe('pdf');
    });

    it('refuses a redirect to a host that is not Canvas or known storage', async () => {
        const { client } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`, 3));
        const fetchImpl = (async () => new Response(null, {
            status: 302,
            headers: { location: 'https://attacker.example/steal' }
        })) as unknown as typeof fetch;

        await expect(downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl })))
            .rejects.toThrow(/unexpected file download host \(rejected attacker\.example\)/);
    });

    it('refuses an off-origin first hop, before any redirect has been followed', async () => {
        const { client } = fakeClient(submissionWith('https://files.inscloudgate.net/signed/7', 3));
        const fetchImpl = (async () => new Response(Buffer.from('pdf'), { status: 200 })) as unknown as typeof fetch;

        await expect(downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl })))
            .rejects.toThrow(/unexpected file download host/);
    });

    it('stops a body that exceeds the ceiling even when content-length under-declares it', async () => {
        const { client } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`));
        const fetchImpl = (async () => new Response(Buffer.alloc(4096), {
            status: 200,
            headers: { 'content-length': '8' }
        })) as unknown as typeof fetch;

        await expect(downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl, maxBytes: 1024 })))
            .rejects.toThrow(/exceeds the 1024-byte import limit/);
    });

    it('bounds the redirect chain', async () => {
        const { client } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`, 3));
        const fetchImpl = (async () => new Response(null, {
            status: 302,
            headers: { location: `${CANVAS_DOMAIN}/files/7/download?again` }
        })) as unknown as typeof fetch;

        await expect(downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl })))
            .rejects.toThrow(/redirect limit/);
    });

    it('surfaces the status when Canvas refuses the download', async () => {
        const { client } = fakeClient(submissionWith(`${CANVAS_DOMAIN}/files/7/download`, 3));
        const fetchImpl = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;

        await expect(downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl })))
            .rejects.toThrow('Canvas file download returned 401');
    });

    it('refuses an attachment the submission does not carry', async () => {
        const { client } = fakeClient({ attachments: [] });
        const fetchImpl = (async () => new Response(Buffer.from('pdf'), { status: 200 })) as unknown as typeof fetch;

        await expect(downloadSubmissionAttachmentUnauthenticated(client, options({ fetchImpl })))
            .rejects.toThrow('Canvas submission attachment has no download URL');
    });
});
