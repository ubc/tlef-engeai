import { courseSummaryEngagementFacetPipeline } from '../course-user-mongo';

describe('course-user-mongo course summary engagement', () => {
    it('facet pipeline matches snapshot (aligned with export student filters)', () => {
        expect(courseSummaryEngagementFacetPipeline()).toMatchSnapshot();
    });
});
