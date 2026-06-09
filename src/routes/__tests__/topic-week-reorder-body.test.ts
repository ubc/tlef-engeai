import { parseOrderedIdsBody } from '../topic-week-reorder-body';

describe('parseOrderedIdsBody', () => {
    it('returns string ids from a valid array', () => {
        expect(parseOrderedIdsBody({ orderedIds: ['tw-1', 'tw-2'] })).toEqual([
            'tw-1',
            'tw-2'
        ]);
    });

    it('coerces numeric ids to strings', () => {
        expect(parseOrderedIdsBody({ orderedIds: [1, 2] })).toEqual(['1', '2']);
    });

    it('returns null when orderedIds is missing', () => {
        expect(parseOrderedIdsBody({})).toBeNull();
        expect(parseOrderedIdsBody(null)).toBeNull();
        expect(parseOrderedIdsBody(undefined)).toBeNull();
    });

    it('returns null when orderedIds is not an array', () => {
        expect(parseOrderedIdsBody({ orderedIds: 'tw-1' })).toBeNull();
    });

    it('returns null when array contains non-string/non-number values', () => {
        expect(parseOrderedIdsBody({ orderedIds: ['tw-1', {}] })).toBeNull();
    });
});
