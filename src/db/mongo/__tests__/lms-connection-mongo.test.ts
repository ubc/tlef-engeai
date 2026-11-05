/**
 * findLmsConnectedUserIds
 *
 * @description Presence-only reads of the LMS token collections: one `userKey $in` query per LMS
 * projecting `userKey` alone (never a token), env-overridable collection names, and no query at
 * all for an empty page.
 */

import { findLmsConnectedUserIds } from '../lms-connection-mongo';
import type { MongoDalContext } from '../mongo-context';

function fakeCtx(rows: Record<string, { userKey: string }[]>) {
    const queries: { collection: string; filter: unknown; options: unknown }[] = [];
    const db = {
        collection: (name: string) => ({
            find: (filter: unknown, options: unknown) => {
                queries.push({ collection: name, filter, options });
                return { toArray: async () => rows[name] ?? [] };
            }
        })
    };
    return { ctx: { db } as unknown as MongoDalContext, queries };
}

describe('findLmsConnectedUserIds', () => {
    const saved = { canvas: process.env.CANVAS_TOKEN_COLLECTION_NAME, moodle: process.env.MOODLE_TOKEN_COLLECTION_NAME };
    afterEach(() => {
        process.env.CANVAS_TOKEN_COLLECTION_NAME = saved.canvas;
        process.env.MOODLE_TOKEN_COLLECTION_NAME = saved.moodle;
        if (saved.canvas === undefined) delete process.env.CANVAS_TOKEN_COLLECTION_NAME;
        if (saved.moodle === undefined) delete process.env.MOODLE_TOKEN_COLLECTION_NAME;
    });

    it('returns connected userIds per LMS, projecting userKey only', async () => {
        delete process.env.CANVAS_TOKEN_COLLECTION_NAME;
        delete process.env.MOODLE_TOKEN_COLLECTION_NAME;
        const { ctx, queries } = fakeCtx({ canvas_tokens: [{ userKey: 'u-1' }], moodle_tokens: [{ userKey: 'u-2' }] });

        const result = await findLmsConnectedUserIds(ctx, ['u-1', 'u-2', 'u-3']);

        expect(result).toEqual({ canvas: new Set(['u-1']), moodle: new Set(['u-2']) });
        expect(queries).toEqual([
            { collection: 'canvas_tokens', filter: { userKey: { $in: ['u-1', 'u-2', 'u-3'] } }, options: { projection: { _id: 0, userKey: 1 } } },
            { collection: 'moodle_tokens', filter: { userKey: { $in: ['u-1', 'u-2', 'u-3'] } }, options: { projection: { _id: 0, userKey: 1 } } }
        ]);
    });

    it('follows the token collection name overrides', async () => {
        process.env.CANVAS_TOKEN_COLLECTION_NAME = 'canvas_tokens_staging';
        process.env.MOODLE_TOKEN_COLLECTION_NAME = 'moodle_tokens_staging';
        const { ctx, queries } = fakeCtx({});
        await findLmsConnectedUserIds(ctx, ['u-1']);
        expect(queries.map((q) => q.collection)).toEqual(['canvas_tokens_staging', 'moodle_tokens_staging']);
    });

    it('skips the database for an empty page', async () => {
        const { ctx, queries } = fakeCtx({});
        await expect(findLmsConnectedUserIds(ctx, [])).resolves.toEqual({ canvas: new Set(), moodle: new Set() });
        expect(queries).toEqual([]);
    });
});
