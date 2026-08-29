/**
 * onboarding-design-guard.test.ts
 *
 * Pins the onboarding redesign against silent regression.
 *
 * The redesign's outcome is visual, and this repository has no DOM or browser
 * test layer, so appearance cannot be asserted. What can be asserted is the
 * absence of the specific patterns that made the tutorials look generated:
 * off-palette Bootstrap literals, left-accent callout bars, and emoji. Those are
 * checked here as text, which needs no DOM and runs in the existing Node project.
 *
 * @author: @rdschrs
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const ONBOARDING_CSS = join(REPO_ROOT, 'public', 'styles', 'instructor-components', 'onboarding.css');
const COMPONENT_DIR = join(REPO_ROOT, 'public', 'components', 'onboarding');
const STAFF_COMPONENTS = [
    'course-setup.html',
    'document-setup.html',
    'flag-setup.html',
    'monitor-setup.html',
    'scenario-generation-setup.html',
    'writing-feedback-setup.html',
    'guided-pathway-setup.html'
] as const;
const TA_ACCESSIBLE_COMPONENTS = STAFF_COMPONENTS.filter(file => file !== 'course-setup.html');

/**
 * The only hex literals permitted anywhere in onboarding.css. Everything else must
 * come from the palette via `var()` or an `rgba()` tint, never a bare hex literal,
 * so the stylesheet cannot drift back toward Bootstrap or an unrelated palette one
 * literal at a time while this test stays green.
 */
const PERMITTED_HEX = ['#fff', '#ffffff', '#000', '#e67e22'];

/**
 * Matches pictographic emoji.
 *
 * Deliberately excludes the Miscellaneous Symbols range that feather icon names
 * never occupy, and is applied only to component markup, never to CSS.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function onboardingComponents(): string[] {
    return readdirSync(COMPONENT_DIR).filter(name => name.endsWith('.html'));
}

describe('onboarding design guard', () => {
    const css = readFileSync(ONBOARDING_CSS, 'utf8');

    it('uses no hex literal outside the permitted set', () => {
        const literals = [...css.matchAll(/#[0-9a-fA-F]{3,6}/g)].map(m => m[0].toLowerCase());
        const offenders = [...new Set(literals)].filter(hex => !PERMITTED_HEX.includes(hex));
        expect(offenders).toEqual([]);
    });

    it('uses no left-accent callout bars', () => {
        expect(css).not.toMatch(/border-left:\s*\d/);
        expect(css).not.toMatch(/border-left-width:\s*\d/);
    });

    it('defines the shared callout primitive', () => {
        expect(css).toContain('.onboarding__note');
    });

    it('covers every onboarding component', () => {
        expect(onboardingComponents()).toHaveLength(8);
    });

    it.each(STAFF_COMPONENTS)('%s uses the shared staff onboarding shell', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).toContain('class="onboarding staff-onboarding');
    });

    it('keeps the student tutorial outside the staff shell', () => {
        const markup = readFileSync(join(COMPONENT_DIR, 'student-onboarding.html'), 'utf8');
        expect(markup).not.toContain('staff-onboarding');
    });

    it.each(TA_ACCESSIBLE_COMPONENTS)('%s uses course-staff rather than instructor-mode framing', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).not.toMatch(/Instructor Mode|Welcome, Professor|As an instructor/i);
    });

    it.each(STAFF_COMPONENTS)('%s avoids misleading novice-facing terms', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).not.toMatch(/\bLMS\b|PowerPoint|Process Files|Clear All/i);
    });

    it.each(onboardingComponents())('%s contains no emoji', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).not.toMatch(EMOJI);
    });

    it('scenario generation mounts the real generate partial rather than a copy', () => {
        const controller = readFileSync(
            join(REPO_ROOT, 'public', 'scripts', 'onboarding', 'scenario-generation-setup.ts'),
            'utf8'
        );
        expect(controller).toContain('/components/scenarios/scenario-questions-generate.html');

        const markup = readFileSync(join(COMPONENT_DIR, 'scenario-generation-setup.html'), 'utf8');
        expect(markup).not.toContain('sg-setup-form');
    });

    it('teaches only subquestion types the product actually has', () => {
        // SUB_QUESTION_TYPE_LABELS defines calculation, troubleshoot, action,
        // corrective. The original copy invented two others.
        const markup = readFileSync(join(COMPONENT_DIR, 'scenario-generation-setup.html'), 'utf8');
        expect(markup).not.toMatch(/Conceptual/i);
        expect(markup).not.toMatch(/Interpretation/i);
    });

    it('keeps scenario generation local and renders edited text through DOM APIs', () => {
        const controller = readFileSync(
            join(REPO_ROOT, 'public', 'scripts', 'onboarding', 'scenario-generation-setup.ts'),
            'utf8'
        );
        expect(controller).not.toContain('/api/');
        expect(controller).toContain("fetch('/components/scenarios/scenario-questions-generate.html')");
        expect(controller).toContain('prompt.textContent = preview.prompt');
        expect(controller).toContain('document.createTextNode(part.prompt)');
        expect(controller).toContain("submit.textContent = 'Update sample'");
    });

    it('presents Canvas and manual assignment intake as simulations', () => {
        const markup = readFileSync(join(COMPONENT_DIR, 'writing-feedback-setup.html'), 'utf8');
        const controller = readFileSync(
            join(REPO_ROOT, 'public', 'scripts', 'onboarding', 'writing-feedback-setup.ts'),
            'utf8'
        );
        expect(markup).toContain('id="wfSetupImportCanvasBtn"');
        expect(markup).toContain('Import from Canvas');
        expect(markup).toContain('id="wfSetupAddAssignmentBtn"');
        expect(markup).toContain('Add assignment');
        expect(markup).toContain('do not import, create, or save anything');
        expect(controller).not.toMatch(/\bfetch\s*\(/);
    });

    it('lists the supported document inputs and removes inaccurate processing controls', () => {
        const markup = readFileSync(join(COMPONENT_DIR, 'document-setup.html'), 'utf8');
        expect(markup).toMatch(/PDF, DOCX, HTML, Markdown, and TXT/);
        expect(markup).toContain('Direct text');
        expect(markup).not.toMatch(/processDemoFiles|clearDemoFiles|clearDemo|delete-demo-btn|delete-file-btn/);
    });

    it('uses the shared progress helper in feature and legacy controllers', () => {
        const controllers = [
            'feature-tutorial-runtime.ts',
            'course-setup.ts',
            'document-setup.ts',
            'flag-setup.ts',
            'monitor-setup.ts'
        ];
        controllers.forEach(file => {
            const source = readFileSync(join(REPO_ROOT, 'public', 'scripts', 'onboarding', file), 'utf8');
            expect(source).toContain('updateStaffOnboardingProgress');
        });
    });
});
