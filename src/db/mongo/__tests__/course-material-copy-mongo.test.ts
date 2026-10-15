import type { Db } from 'mongodb';
import type { MongoDalContext } from '../mongo-context';
import {
    acquireMaterialCopyLease,
    listCoursesForMaterialCopy,
    releaseMaterialCopyLease,
    replaceCourseMaterialsUnderLease
} from '../course-material-copy-mongo';

function makeCtx() {
    const calls: Array<{ op: string; filter: any; update?: any; options?: any }> = [];
    const collection = {
        findOneAndUpdate: async (filter: any, update: any, options: any) => {
            calls.push({ op: 'findOneAndUpdate', filter, update, options });
            return { id: filter.id };
        },
        updateOne: async (filter: any, update: any) => {
            calls.push({ op: 'updateOne', filter, update });
            return { matchedCount: 1 };
        },
        find: (filter: any, options: any) => {
            calls.push({ op: 'find', filter, options });
            return { sort: () => ({ toArray: async () => [] }) };
        }
    };
    const ctx = { db: { collection: () => collection } as unknown as Db } as MongoDalContext;
    return { ctx, calls };
}

describe('course-material-copy-mongo', () => {
    it('claims the lease only when it is free or expired', async () => {
        const { ctx, calls } = makeCtx();
        const lease = { token: 't1', expiresAt: new Date('2026-09-28T12:15:00Z') };

        await acquireMaterialCopyLease(ctx, 'tgt', lease);

        expect(calls[0].filter.id).toBe('tgt');
        expect(calls[0].filter.$or[0]).toEqual({ materialCopyLease: { $exists: false } });
        expect(calls[0].filter.$or[1]['materialCopyLease.expiresAt'].$lt).toBeInstanceOf(Date);
        expect(calls[0].update).toEqual({ $set: { materialCopyLease: lease } });
    });

    it('swaps materials only under its own lease, returning the replaced course', async () => {
        const { ctx, calls } = makeCtx();

        await replaceCourseMaterialsUnderLease(ctx, 'tgt', 't1', {
            frameType: 'byWeek',
            tilesNumber: 3,
            topicOrWeekInstances: []
        });

        const call = calls[0];
        expect(call.filter).toEqual({ id: 'tgt', 'materialCopyLease.token': 't1' });
        expect(call.update.$set).toMatchObject({ frameType: 'byWeek', tilesNumber: 3, topicOrWeekInstances: [], contentSetup: true });
        expect(call.update.$unset).toEqual({ materialCopyLease: '' });
        expect(call.options).toEqual({ returnDocument: 'before' });
    });

    it('releases only its own lease', async () => {
        const { ctx, calls } = makeCtx();

        await releaseMaterialCopyLease(ctx, 'tgt', 't1');

        expect(calls[0]).toMatchObject({
            op: 'updateOne',
            filter: { id: 'tgt', 'materialCopyLease.token': 't1' },
            update: { $unset: { materialCopyLease: '' } }
        });
    });

    it('narrows the source listing to the instructor unless admin, and omits pasted text', async () => {
        const { ctx, calls } = makeCtx();

        await listCoursesForMaterialCopy(ctx, 'u1');
        await listCoursesForMaterialCopy(ctx, null);

        expect(calls[0].filter).toEqual({ $or: [{ instructors: 'u1' }, { 'instructors.userId': 'u1' }] });
        expect(calls[1].filter).toEqual({});
        expect(calls[0].options.projection).toEqual({ 'topicOrWeekInstances.items.additionalMaterials.text': 0 });
    });
});
