import {
    clearPredeterminedStruggleCatalogCache,
    getPredeterminedLabels,
    loadPredeterminedStruggleCatalog,
    resolveTopicNumber,
    usesPredeterminedStruggleCatalog,
} from '../predetermined-struggle-catalog';

describe('predetermined-struggle-catalog', () => {
    beforeEach(() => {
        clearPredeterminedStruggleCatalogCache();
    });

    it('loads committed APSC183 catalog with 7 chapters', () => {
        const catalog = loadPredeterminedStruggleCatalog();
        expect(catalog.courseName).toBe('Test 3');
        expect(catalog.topics).toHaveLength(7);
        expect(catalog.topics[6].struggleTopics).toContain(
            'nernst equation and concentration effects on cell potential'
        );
    });

    it('resolveTopicNumber matches section title and material filename', () => {
        expect(resolveTopicNumber('Topic 7 (Electrochemistry)', 'notes.pdf')).toBe(7);
        expect(resolveTopicNumber('Week 2', 'APSC 183 Topic 3.md')).toBe(3);
        expect(resolveTopicNumber('Intro', 'readme.txt')).toBeNull();
    });

    it('getPredeterminedLabels excludes FIFO prior labels and caps at 5', () => {
        const excluded = new Set([
            'assigning oxidation states using oxidation number rules',
            'balancing redox reactions using the half-equation method',
        ]);
        const labels = getPredeterminedLabels(7, excluded);
        expect(labels).toHaveLength(4);
        expect(labels).not.toContain(
            'assigning oxidation states using oxidation number rules'
        );
        expect(labels[0]).toBe('standard cell potential from standard reduction potentials');
    });

    it('usesPredeterminedStruggleCatalog is true only for Test 3', () => {
        expect(usesPredeterminedStruggleCatalog('Test 3')).toBe(true);
        expect(usesPredeterminedStruggleCatalog('Test 1')).toBe(false);
    });
});
