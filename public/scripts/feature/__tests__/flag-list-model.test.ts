import {
    ALL_MANUAL_FLAG_TYPES,
    applyFlagFilters,
    defaultFlagManagementFilters,
    defaultGuidedCategorySet,
    guidedCategoryKey,
    guidedWorkflowStatus,
    GUIDED_CATEGORY_OTHERS,
    manualWorkflowStatus,
    normalizeGuidedFlag,
    normalizeManualFlag,
} from '../flag-list-model';

describe('flag-list-model', () => {
    it('maps manual escalated status to escalated workflow tab', () => {
        expect(manualWorkflowStatus('escalated')).toBe('escalated');
    });

    it('maps guided dismissed status to resolved workflow tab', () => {
        expect(guidedWorkflowStatus('dismissed')).toBe('resolved');
    });

    it('classifies GP flags by pathway id membership only', () => {
        const library = new Set(['p1', 'p2']);
        expect(guidedCategoryKey('p1', library)).toBe('p1');
        expect(guidedCategoryKey('deleted-pathway', library)).toBe(GUIDED_CATEGORY_OTHERS);
        expect(guidedCategoryKey('', library)).toBe(GUIDED_CATEGORY_OTHERS);
        expect(guidedCategoryKey('p1', new Set())).toBe(GUIDED_CATEGORY_OTHERS);
    });

    it('filters by workflow tab and manual categories without hiding guided rows', () => {
        const manual = normalizeManualFlag({
            id: 'm1',
            courseName: 'demo',
            date: new Date('2026-02-10'),
            flagType: 'harassment',
            reportType: 'Harassment',
            chatContent: 'manual',
            userId: '1',
            status: 'unresolved',
            createdAt: new Date('2026-02-10'),
            updatedAt: new Date('2026-02-10'),
        });
        const guided = normalizeGuidedFlag({
            id: 'g1',
            courseId: 'c1',
            courseName: 'demo',
            pathwayId: 'p1',
            pathwayTitle: 'EDI',
            messageText: 'guided',
            status: 'pending',
            triggeredAt: '2026-02-11T12:00:00.000Z',
            origin: 'student',
        });
        const filters = defaultFlagManagementFilters(['p1']);
        filters.manualCategories = new Set(['innacurate_response']);
        const visible = applyFlagFilters([manual, guided], {
            ...filters,
            workflowStatus: 'unresolved',
        }, { libraryPathwayIds: new Set(['p1']) });
        expect(visible).toHaveLength(1);
        expect(visible[0].source).toBe('guided-pathway');
    });

    it('keeps a GP flag when its pathway category is selected', () => {
        const guided = normalizeGuidedFlag({
            id: 'g1',
            courseId: 'c1',
            courseName: 'demo',
            pathwayId: 'p1',
            pathwayTitle: 'EDI',
            messageText: 'guided',
            status: 'pending',
            triggeredAt: '2026-02-11T12:00:00.000Z',
            origin: 'student',
        });
        const filters = defaultFlagManagementFilters(['p1']);
        filters.guidedCategories = new Set(['p1', GUIDED_CATEGORY_OTHERS]);
        const visible = applyFlagFilters([guided], { ...filters, workflowStatus: 'unresolved' }, {
            libraryPathwayIds: new Set(['p1']),
        });
        expect(visible).toHaveLength(1);
    });

    it('drops a GP flag when its pathway category is unchecked', () => {
        const guided = normalizeGuidedFlag({
            id: 'g1',
            courseId: 'c1',
            courseName: 'demo',
            pathwayId: 'p1',
            pathwayTitle: 'EDI',
            messageText: 'guided',
            status: 'pending',
            triggeredAt: '2026-02-11T12:00:00.000Z',
            origin: 'student',
        });
        const filters = defaultFlagManagementFilters(['p1']);
        filters.guidedCategories = new Set([GUIDED_CATEGORY_OTHERS]);
        const visible = applyFlagFilters([guided], { ...filters, workflowStatus: 'unresolved' }, {
            libraryPathwayIds: new Set(['p1']),
        });
        expect(visible).toHaveLength(0);
    });

    it('routes deleted-library pathway ids to Others only', () => {
        const guided = normalizeGuidedFlag({
            id: 'g1',
            courseId: 'c1',
            courseName: 'demo',
            pathwayId: 'deleted',
            pathwayTitle: 'Old pathway title',
            messageText: 'guided',
            status: 'pending',
            triggeredAt: '2026-02-11T12:00:00.000Z',
            origin: 'student',
        });
        expect(guidedCategoryKey('deleted', new Set(['p1']))).toBe(GUIDED_CATEGORY_OTHERS);

        const filters = defaultFlagManagementFilters(['p1']);
        filters.guidedCategories = new Set([GUIDED_CATEGORY_OTHERS]);
        const visible = applyFlagFilters([guided], { ...filters, workflowStatus: 'unresolved' }, {
            libraryPathwayIds: new Set(['p1']),
        });
        expect(visible).toHaveLength(1);

        filters.guidedCategories = new Set(['p1']);
        const hidden = applyFlagFilters([guided], { ...filters, workflowStatus: 'unresolved' }, {
            libraryPathwayIds: new Set(['p1']),
        });
        expect(hidden).toHaveLength(0);
    });

    it('default guided categories include library ids and Others', () => {
        expect([...defaultGuidedCategorySet(['a', 'b'])]).toEqual(
            expect.arrayContaining(['a', 'b', GUIDED_CATEGORY_OTHERS])
        );
        expect(defaultFlagManagementFilters(['a']).guidedCategories.has('a')).toBe(true);
        expect(defaultFlagManagementFilters(['a']).manualCategories.size).toBe(
            ALL_MANUAL_FLAG_TYPES.length
        );
    });
});
