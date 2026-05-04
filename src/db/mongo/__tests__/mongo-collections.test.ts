import { ACTIVE_COURSE_LIST_COLLECTION, ACTIVE_USERS_COLLECTION } from '../mongo-constants';
import { activeCourseListCollection, activeUsersMongoCollection } from '../mongo-collections';

describe('mongo collections helpers', () => {
    function mockDb() {
        const map = new Map<string, unknown>();
        return {
            collection: (name: string) =>
                ({
                    collectionName: name,
                    _: map.set('_last', name)
                }) as any
        } as import('mongodb').Db;
    }

    it('activeCourseListCollection uses canonical name', () => {
        expect(activeCourseListCollection(mockDb()).collectionName).toBe(ACTIVE_COURSE_LIST_COLLECTION);
    });

    it('activeUsersMongoCollection uses canonical name', () => {
        expect(activeUsersMongoCollection(mockDb()).collectionName).toBe(ACTIVE_USERS_COLLECTION);
    });
});
