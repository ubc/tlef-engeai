/**
 * Golden tests for assembleCourseSystemPrompt (JSON defaults + XML assembly).
 */

import { assembleCourseSystemPrompt, resolveInstructorModulesForDisplay } from '../system-prompts/assemble-course-system-prompt';
import { getPlatformModeDefaults, getPlatformInstructorModules, reloadPlatformDefaultsCache } from '../system-prompts/system-prompt-defaults-loader';
import { parseSystemPromptXml } from '../system-prompts/system-prompt-xml';

/** Key phrases that must appear in order in assembled socratic XML (v1.3.0 body format). */
const SOCRATIC_CONTENT_MARKERS = [
    'This prompt is a stack of self-contained modules',
    'When struggle topics are active',
    'TEXT & LIST FORMATTING RULES',
    'LATEX MATHEMATICS FORMATTING',
    '**WHEN TO OFFER:**',
    '**CRITICAL MERMAID SYNTAX RULES:**',
    'After presenting a diagram, continue with guided discovery',
    '**PROHIBITED CONTENT:**',
    '**CORE PRINCIPLE: ASK ONLY ONE QUESTION AT A TIME**',
    'APPLY LEVEL (Bloom',
    '**ITERATION TRACKING:**',
    'SOCRATIC RESPONSE CHECKLIST BEFORE SENDING',
    'You will help students with [your course name, e.g. CHBE 241]',
] as const;

const EXPLANATORY_CONTENT_MARKERS = [
    'This prompt is a stack of self-contained modules',
    'TEXT & LIST FORMATTING RULES',
    '**WHEN TO OFFER:**',
    '**CRITICAL MERMAID SYNTAX RULES:**',
    'After presenting a diagram, briefly recap',
    '**PROHIBITED CONTENT:**',
    'PROSE framework',
    'Explanatory PROSE rubric criteria satisfied',
    'You will help students with [your course name, e.g. CHBE 241]',
] as const;

function assertHeadersInOrder(prompt: string, headers: readonly string[]): void {
    let lastIndex = -1;
    for (const header of headers) {
        const index = prompt.indexOf(header);
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
    }
}

describe('assembleCourseSystemPrompt', () => {
    beforeAll(() => {
        reloadPlatformDefaultsCache();
    });

    describe('platform defaults path (usePlatformDefault)', () => {
        it('assembles socratic XML with instructor modules and LOs in course main intro', () => {
            const xml = assembleCourseSystemPrompt({
                mode: 'socratic',
                learningObjectives: [
                    {
                        LearningObjective: 'Explain phase diagrams',
                        topicOrWeekTitle: 'Week 3',
                        itemTitle: 'Lecture',
                    },
                ],
            });

            expect(xml).toMatch(/^<system_prompt mode="socratic">/);
            expect(xml).toContain('</system_prompt>');
            expect(xml).not.toContain('_system_');
            expect(xml).not.toContain('_runtime_');
            expect(xml).toContain('<module id="system prompt guidance">');
            expect(xml).toContain('<module id="struggle topics">');
            assertHeadersInOrder(xml, SOCRATIC_CONTENT_MARKERS);
            expect(xml).toContain('<module id="course main intro">');
            expect(xml).toContain('[Week 3 - Lecture]: Explain phase diagrams');
            expect(xml).toContain('<course_learning_objectives>');
            expect(xml).not.toContain('{{course_learning_objectives}}');
            expect(xml.indexOf('[Week 3 - Lecture]: Explain phase diagrams')).toBeGreaterThan(
                xml.indexOf('SOCRATIC RESPONSE CHECKLIST BEFORE SENDING')
            );
        });

        it('assembles explanatory XML without struggle topics module', () => {
            const xml = assembleCourseSystemPrompt({
                mode: 'explanatory',
            });

            expect(xml).toMatch(/^<system_prompt mode="explanatory">/);
            expect(xml).not.toContain('<module id="struggle topics">');
            assertHeadersInOrder(xml, EXPLANATORY_CONTENT_MARKERS);
            expect(xml).toContain('<module id="course main intro">');
            expect(xml).toContain('<course_learning_objectives></course_learning_objectives>');
        });

        it('uses empty LO tags inside course main intro when no objectives provided', () => {
            const xml = assembleCourseSystemPrompt({ mode: 'socratic' });
            expect(xml).toContain('<module id="course main intro">');
            expect(xml).toContain('<course_learning_objectives></course_learning_objectives>');
            expect(xml).not.toContain('<module id="_runtime_learning_objectives"');
        });
    });

    describe('custom Mongo modules path', () => {
        it('uses instructor modules from config when usePlatformDefault is false', () => {
            const xml = assembleCourseSystemPrompt({
                mode: 'socratic',
                config: {
                    schemaVersion: 1,
                    defaultConversationMode: 'socratic',
                    modes: {
                        socratic: {
                            usePlatformDefault: false,
                            updatedAt: '2026-06-02T00:00:00.000Z',
                            modules: [
                                { id: 'custom_a', body: 'Custom instructor block A', sortOrder: 0 },
                                { id: 'custom_b', body: 'Custom instructor block B', sortOrder: 1 },
                            ],
                        },
                        explanatory: {
                            usePlatformDefault: true,
                            updatedAt: '2026-06-02T00:00:00.000Z',
                            modules: [],
                        },
                    },
                },
            });

            expect(xml).toContain('Custom instructor block A');
            expect(xml).toContain('Custom instructor block B');
            expect(xml).not.toContain('**CORE PRINCIPLE: ASK ONLY ONE QUESTION AT A TIME**');
        });

        it('injects LOs into custom course main intro module', () => {
            const xml = assembleCourseSystemPrompt({
                mode: 'explanatory',
                learningObjectives: [
                    {
                        LearningObjective: 'Define enthalpy',
                        topicOrWeekTitle: 'Week 2',
                        itemTitle: 'Thermo',
                    },
                ],
                config: {
                    schemaVersion: 1,
                    defaultConversationMode: 'explanatory',
                    modes: {
                        socratic: {
                            usePlatformDefault: true,
                            updatedAt: '2026-06-02T00:00:00.000Z',
                            modules: [],
                        },
                        explanatory: {
                            usePlatformDefault: false,
                            updatedAt: '2026-06-02T00:00:00.000Z',
                            modules: [
                                {
                                    id: 'course main intro',
                                    body: 'Custom intro.\n\n{{course_learning_objectives}}',
                                    sortOrder: 0,
                                },
                            ],
                        },
                    },
                },
            });

            expect(xml).toContain('Custom intro.');
            expect(xml).toContain('[Week 2 - Thermo]: Define enthalpy');
            expect(xml).not.toContain('{{course_learning_objectives}}');
        });
    });

    describe('defaults loader', () => {
        it('loads both mode JSON files with version 1.3.0', () => {
            expect(getPlatformModeDefaults('socratic').version).toBe('1.3.0');
            expect(getPlatformModeDefaults('explanatory').version).toBe('1.3.0');
            expect(getPlatformModeDefaults('socratic').instructorModules.some((m) => m.id === 'text list formatting')).toBe(
                true
            );
            expect(getPlatformModeDefaults('socratic').systemModules).toHaveLength(0);
        });

        it('reloads cache from disk', () => {
            reloadPlatformDefaultsCache();
            expect(getPlatformModeDefaults('socratic').instructorModules.length).toBeGreaterThan(0);
        });
    });

    describe('instructor display after reset (usePlatformDefault)', () => {
        it('resolveInstructorModulesForDisplay reads socratic.json when usePlatformDefault is true', () => {
            const platformCount = getPlatformInstructorModules('socratic').length;
            expect(platformCount).toBeGreaterThan(0);

            const display = resolveInstructorModulesForDisplay('socratic', {
                usePlatformDefault: true,
                modules: [],
                updatedAt: '2026-06-02T00:00:00.000Z',
            });

            expect(display).toHaveLength(platformCount);
            expect(display.some((m) => m.id === 'system prompt guidance')).toBe(true);
            expect(display.some((m) => m.id === 'course main intro')).toBe(true);
        });

        it('broken state: usePlatformDefault false with empty modules shows nothing (pre-fix reset bug)', () => {
            const display = resolveInstructorModulesForDisplay('socratic', {
                usePlatformDefault: false,
                modules: [],
                updatedAt: '2026-06-02T00:00:00.000Z',
            });

            expect(display).toHaveLength(0);
        });
    });

    describe('XML round-trip for plain editor', () => {
        it('parses instructor plain XML and skips reserved ids', () => {
            const source = assembleCourseSystemPrompt({ mode: 'explanatory' });
            const parsed = parseSystemPromptXml(source);
            expect(parsed.mode).toBe('explanatory');
            expect(parsed.modules.length).toBeGreaterThan(0);
            expect(parsed.modules.every((m) => !m.id.startsWith('_system_'))).toBe(true);
            expect(parsed.modules.every((m) => !m.id.startsWith('_runtime_'))).toBe(true);
        });
    });
});
