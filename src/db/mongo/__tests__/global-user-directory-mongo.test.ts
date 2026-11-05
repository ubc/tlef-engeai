/**
 * listGlobalUsersForDirectory
 *
 * @description The `active-users` filter the admin directory sends: test students always excluded,
 * name matched as an escaped case-insensitive substring, PUID and userId matched exactly, and the
 * requested page applied with a stable name sort.
 */

import { listGlobalUsersForDirectory } from '../global-user-mongo';
import type { MongoDalContext } from '../mongo-context';

function fakeCtx(docs: unknown[] = [], total = 0) {
    const calls: { filter?: unknown; sort?: unknown; skip?: number; limit?: number; countFilter?: unknown } = {};
    const cursor = {
        sort(sort: unknown) { calls.sort = sort; return cursor; },
        skip(skip: number) { calls.skip = skip; return cursor; },
        limit(limit: number) { calls.limit = limit; return cursor; },
        toArray: async () => docs
    };
    const collection = {
        find(filter: unknown) { calls.filter = filter; return cursor; },
        countDocuments: async (filter: unknown) => { calls.countFilter = filter; return total; }
    };
    const ctx = { db: { collection: () => collection } } as unknown as MongoDalContext;
    return { ctx, calls };
}

describe('listGlobalUsersForDirectory', () => {
    it('excludes test students and pages by name with no other filter', async () => {
        const { ctx, calls } = fakeCtx([{ userId: 'u-1' }], 51);
        const result = await listGlobalUsersForDirectory(ctx, { page: 2, pageSize: 50 });

        expect(result).toEqual({ users: [{ userId: 'u-1' }], total: 51 });
        expect(calls.filter).toEqual({ isTestStudent: { $ne: true } });
        expect(calls.countFilter).toEqual(calls.filter);
        expect(calls).toMatchObject({ sort: { name: 1, userId: 1 }, skip: 50, limit: 50 });
    });

    it('matches names by escaped substring and PUID / userId exactly, with the affiliation filter', async () => {
        const { ctx, calls } = fakeCtx();
        await listGlobalUsersForDirectory(ctx, { search: ' a.b ', affiliation: 'staff', page: 1, pageSize: 20 });

        expect(calls.filter).toEqual({
            isTestStudent: { $ne: true },
            affiliation: 'staff',
            $or: [
                { name: { $regex: 'a\\.b', $options: 'i' } },
                { puid: 'a.b' },
                { userId: 'a.b' }
            ]
        });
    });
});
