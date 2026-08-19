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

/** Colours belonging to Bootstrap or an unrelated slate palette, never to EngE-AI. */
const BANNED_COLOURS = ['#0d6efd', '#198754', '#ffc107', '#dee2e6', '#adb5bd', '#2c3e50', '#495057', '#f8f9fa'];

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

    it.each(BANNED_COLOURS)('does not use the off-palette literal %s', colour => {
        expect(css.toLowerCase()).not.toContain(colour.toLowerCase());
    });

    it('uses no left-accent callout bars', () => {
        expect(css).not.toMatch(/border-left:\s*4px/);
        expect(css).not.toMatch(/border-left-width:\s*4px/);
    });

    it('defines the shared callout primitive', () => {
        expect(css).toContain('.onboarding__note');
    });

    it('covers every onboarding component', () => {
        expect(onboardingComponents()).toHaveLength(8);
    });

    it.each(onboardingComponents())('%s contains no emoji', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).not.toMatch(EMOJI);
    });
});
