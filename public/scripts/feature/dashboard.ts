// public/scripts/feature/dashboard.ts
/**
 * Dashboard — instructor home cards with gated optional features.
 *
 * Renders curated navigation cards; Writing Feedback and Pathway Library appear
 * only when their course capabilities are enabled. Settings is always shown.
 * Header shows a personalized time-of-day welcome and today's date.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 1.2.0
 * @description: Instructor dashboard card grid.
 */

import { activeCourse } from '../types.js';
import { navigateToInstructorView } from '../utils/url-parser.js';
import { renderFeatherIcons } from '../api/api.js';
import { authService } from '../services/auth-service.js';

interface DashboardCardDef {
    view: string;
    title: string;
    feather: string;
    feature?: 'writingFeedback' | 'guidedPathway';
}

const CARD_DEFS: DashboardCardDef[] = [
    { view: 'documents', title: 'Documents', feather: 'file-text' },
    { view: 'chat', title: 'Chat with EngE-AI', feather: 'message-circle' },
    { view: 'assistant-prompts', title: 'Initial Assistant Prompt', feather: 'sun' },
    { view: 'system-prompts', title: 'System Prompt', feather: 'sliders' },
    { view: 'monitor', title: 'Monitor', feather: 'monitor' },
    { view: 'writing-feedback', title: 'Writing Feedback', feather: 'edit-3', feature: 'writingFeedback' },
    { view: 'pathway-library', title: 'Pathway Library', feather: 'git-branch', feature: 'guidedPathway' },
    { view: 'settings', title: 'Settings', feather: 'settings' }
];

/**
 * initializeDashboard - render capability-aware dashboard cards and greeting.
 *
 * @param currentClass - Active course used for feature gating
 */
export function initializeDashboard(currentClass: activeCourse): void {
    renderWelcomeHeader();
    renderDashboardCards(currentClass);
    renderFeatherIcons();
}

/**
 * firstNameFromDisplayName - take the leading token for a short greeting.
 *
 * @param fullName - Auth display name (may be empty)
 * @returns First name token, or empty string when missing
 */
function firstNameFromDisplayName(fullName: string | undefined): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return '';
    return trimmed.split(/\s+/)[0] || '';
}

/**
 * renderWelcomeHeader - fill personalized greeting and today's date.
 */
function renderWelcomeHeader(): void {
    const welcomeEl = document.getElementById('dashboard-welcome');
    const dateEl = document.getElementById('dashboard-date');
    const now = new Date();
    const hour = now.getHours();

    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';

    const firstName = firstNameFromDisplayName(authService.getAuthState().user?.name);
    if (welcomeEl) {
        welcomeEl.textContent = firstName
            ? `${greeting}, ${firstName}. Welcome to EngE-AI.`
            : `${greeting}. Welcome to EngE-AI.`;
    }
    if (dateEl) {
        dateEl.textContent = new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(now);
    }
}

/**
 * renderDashboardCards - rebuild the card grid from current course features.
 *
 * @param currentClass - Active course whose features gate optional cards
 */
export function renderDashboardCards(currentClass: activeCourse): void {
    const container = document.getElementById('dashboard-cards');
    if (!container) return;

    const cards = CARD_DEFS.filter((card) => {
        if (!card.feature) return true;
        return currentClass.features?.[card.feature]?.enabled === true;
    });

    container.innerHTML = cards
        .map(
            (card) => `
        <button type="button" class="dashboard-card" data-view="${card.view}" role="listitem">
            <span class="dashboard-card-title">${escapeHtml(card.title)}</span>
            <span class="dashboard-card-cta" aria-hidden="true">Learn more <i data-feather="arrow-right" aria-hidden="true"></i></span>
            <i class="dashboard-card-icon" data-feather="${card.feather}" aria-hidden="true"></i>
        </button>`
        )
        .join('');

    container.querySelectorAll<HTMLButtonElement>('.dashboard-card').forEach((btn) => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view) navigateToInstructorView(view);
        });
    });

    renderFeatherIcons();
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
