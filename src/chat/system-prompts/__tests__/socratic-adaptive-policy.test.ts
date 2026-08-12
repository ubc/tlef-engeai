import { getPlatformModeDefaults, reloadPlatformDefaultsCache } from '../system-prompt-defaults-loader';

describe('Socratic adaptive policy', () => {
    beforeAll(() => {
        reloadPlatformDefaultsCache();
    });

    function moduleBody(id: string): string {
        const mod = getPlatformModeDefaults('socratic').instructorModules.find(
            (candidate) => candidate.id === id
        );
        if (!mod) throw new Error(`Missing Socratic module: ${id}`);
        return mod.body;
    }

    it('permits representations while preserving student ownership', () => {
        const body = moduleBody('socratic conversation');

        expect(body).toContain('student still performs the target reasoning');
        expect(body).toContain('LaTeX, lists, tables, diagrams');
        expect(body).not.toContain('Exactly **one** question mark');
        expect(body).not.toContain('No `<ol>`, `<ul>`');
    });

    it('escalates help after impasse and requires transfer after explanation', () => {
        const body = moduleBody('socratic conversation');

        expect(body).toContain('prompt → hint → partial representation → one modelled step → brief explanation → transfer');
        expect(body).toContain('do not indefinitely rephrase questions');
        expect(body).toContain('explain, complete, or apply');
    });

    it('keeps formal mastery separate from teaching scaffolds', () => {
        expect(moduleBody('practice questions')).toContain('formal understanding check');
        expect(moduleBody('socratic analyser')).toContain('never qualifies for emit');
    });
});
