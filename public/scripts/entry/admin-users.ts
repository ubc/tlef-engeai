// public/scripts/entry/admin-users.ts

/**
 * Admin user directory — search, filter, and page through `active-users`.
 *
 * Each row shows the fields admins scan for; a Details button expands a second row underneath
 * with dates, onboarding progress, Canvas verification, LMS connections, and every course with
 * the person's role in it.
 * PUIDs are shown as plain text, so nothing here may log a row or the search text.
 */

import type { InstructorOnboardingProgress, UserDirectoryEntry, UserDirectoryPage } from '../types.js';

const PAGE_SIZE = 50;
/** Course names listed in the row before the rest are summarised as "and N more". */
const INLINE_COURSE_LIMIT = 2;

const AFFILIATION_LABELS: Record<UserDirectoryEntry['affiliation'], string> = {
    student: 'Student',
    faculty: 'Faculty',
    staff: 'Staff',
    empty: 'None'
};

/** Instructor tutorial stages in the order the onboarding flow teaches them. */
const ONBOARDING_STAGE_LABELS: ReadonlyArray<[keyof InstructorOnboardingProgress, string]> = [
    ['contentSetup', 'Content setup'],
    ['flagSetup', 'Flag setup'],
    ['monitorSetup', 'Monitor setup'],
    ['scenarioGeneration', 'Scenario generation'],
    ['writingFeedback', 'Writing feedback'],
    ['guidedPathway', 'Guided pathway']
];

const DATE_TIME = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    dateStyle: 'medium',
    timeStyle: 'short'
});

interface DirectoryState {
    search: string;
    affiliation: string;
    page: number;
    total: number;
}

const state: DirectoryState = { search: '', affiliation: '', page: 1, total: 0 };
/** Ignores responses that arrive after a newer request was sent. */
let requestSequence = 0;
/** Set once the signed-in admin is confirmed and the controls are wired; Retry re-runs whichever step failed. */
let initialized = false;

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing #${id}`);
    return found as T;
}

function formatDate(iso: string | null): string {
    if (!iso) return 'Unknown';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? 'Unknown' : DATE_TIME.format(date);
}

const COURSE_ROLE_LABELS: Record<NonNullable<UserDirectoryEntry['courses'][number]['role']>, string> = {
    instructor: 'Instructor',
    ta: 'TA',
    student: 'Student'
};

function courseLabel(course: UserDirectoryEntry['courses'][number]): string {
    return course.courseName ?? `Deleted course (${course.id})`;
}

function courseWithRole(course: UserDirectoryEntry['courses'][number]): string {
    return course.role ? `${courseLabel(course)}: ${COURSE_ROLE_LABELS[course.role]}` : courseLabel(course);
}

function textCell(text: string, className?: string): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
}

function coursesSummary(user: UserDirectoryEntry): string {
    if (user.courses.length === 0) return 'None';
    const shown = user.courses.slice(0, INLINE_COURSE_LIMIT).map(courseLabel).join(', ');
    const rest = user.courses.length - INLINE_COURSE_LIMIT;
    return rest > 0 ? `${shown}, and ${rest} more` : shown;
}

/**
 * Adds one term/value pair. `field` names the stored `active-users` field, so what the page
 * shows can be matched to the database.
 */
function appendDetail(list: HTMLDListElement, term: string, value: string | Node, field?: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-users__detail';
    const dt = document.createElement('dt');
    dt.textContent = term;
    if (field) {
        const fieldName = document.createElement('code');
        fieldName.className = 'admin-users__field-name';
        fieldName.textContent = field;
        dt.append(' ', fieldName);
    }
    const dd = document.createElement('dd');
    if (typeof value === 'string') dd.textContent = value;
    else dd.appendChild(value);
    wrapper.append(dt, dd);
    list.appendChild(wrapper);
}

function bulletList(items: string[]): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'admin-users__detail-list';
    for (const item of items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
    }
    return list;
}

function buildDetails(user: UserDirectoryEntry): HTMLDListElement {
    const list = document.createElement('dl');
    list.className = 'admin-users__details';
    appendDetail(list, 'User ID', user.userId);
    appendDetail(list, 'Created', formatDate(user.createdAt));
    appendDetail(list, 'Last updated', formatDate(user.updatedAt));
    appendDetail(list, 'Student onboarding', user.studentOnboardingCompleted ? 'Complete' : 'Not complete', 'studentOnboardingCompleted');
    appendDetail(
        list,
        'Instructor tutorial stages',
        bulletList(ONBOARDING_STAGE_LABELS.map(([key, label]) => `${label}: ${user.instructorOnboarding[key] ? 'done' : 'not done'}`)),
        'instructorOnboarding'
    );
    appendDetail(
        list,
        'Canvas account',
        user.canvasVerifiedUserId
            ? `Verified ${formatDate(user.canvasVerifiedAt)} (Canvas user ${user.canvasVerifiedUserId})`
            : 'Not verified'
    );
    appendDetail(
        list,
        'LMS connections',
        bulletList([
            `Canvas: ${user.lmsConnections.canvas ? 'connected' : 'not connected'}`,
            `Moodle: ${user.lmsConnections.moodle ? 'connected' : 'not connected'}`
        ])
    );
    appendDetail(list, 'Courses and roles', user.courses.length ? bulletList(user.courses.map(courseWithRole)) : 'None');
    return list;
}

function toggleDetails(button: HTMLButtonElement, detailsRow: HTMLTableRowElement): void {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    detailsRow.hidden = expanded;
}

function buildRows(user: UserDirectoryEntry, index: number): [HTMLTableRowElement, HTMLTableRowElement] {
    const detailsId = `admin-users-details-${index}`;
    const row = document.createElement('tr');
    row.className = 'admin-users__row';

    const nameCell = document.createElement('th');
    nameCell.scope = 'row';
    nameCell.textContent = user.name || 'Unnamed user';
    row.appendChild(nameCell);
    row.appendChild(textCell(user.puid, 'admin-users__puid'));
    row.appendChild(textCell(AFFILIATION_LABELS[user.affiliation] ?? user.affiliation));
    row.appendChild(textCell(user.status === 'active' ? 'Active' : 'Inactive'));
    row.appendChild(textCell(coursesSummary(user)));
    row.appendChild(textCell(user.isAdmin ? 'Yes' : 'No'));

    const detailsRow = document.createElement('tr');
    detailsRow.id = detailsId;
    detailsRow.className = 'admin-users__details-row';
    detailsRow.hidden = true;
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 7;
    detailsCell.appendChild(buildDetails(user));
    detailsRow.appendChild(detailsCell);

    const actionCell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-users__details-toggle';
    button.textContent = 'Details';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', `Details for ${user.name || 'unnamed user'}`);
    button.addEventListener('click', () => toggleDetails(button, detailsRow));
    actionCell.appendChild(button);
    row.appendChild(actionCell);

    return [row, detailsRow];
}

function totalPages(): number {
    return Math.max(1, Math.ceil(state.total / PAGE_SIZE));
}

function renderPage(data: UserDirectoryPage): void {
    const tbody = element<HTMLTableSectionElement>('admin-users-rows');
    tbody.replaceChildren(...data.items.flatMap((user, index) => buildRows(user, index)));

    const status = element<HTMLParagraphElement>('admin-users-status');
    if (data.total === 0) {
        status.textContent = state.search || state.affiliation ? 'No users match these filters.' : 'No users yet.';
    } else {
        const first = (data.page - 1) * data.pageSize + 1;
        const last = first + data.items.length - 1;
        status.textContent = `Showing ${first}–${last} of ${data.total} ${data.total === 1 ? 'user' : 'users'}.`;
    }

    element<HTMLElement>('admin-users-table-region').hidden = data.total === 0;
    element<HTMLSpanElement>('admin-users-page-label').textContent =
        data.total === 0 ? '' : `Page ${data.page} of ${totalPages()}`;
    updatePaginationButtons();
}

function updatePaginationButtons(): void {
    const prev = element<HTMLButtonElement>('admin-users-prev');
    const next = element<HTMLButtonElement>('admin-users-next');
    const focused = document.activeElement;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= totalPages();
    // A button that just disabled itself would drop keyboard focus to the page body.
    if ((focused === prev && prev.disabled) || (focused === next && next.disabled)) {
        element<HTMLElement>('admin-users-table-region').focus();
    }
}

async function loadUsers(): Promise<void> {
    const sequence = ++requestSequence;
    const params = new URLSearchParams({ page: String(state.page), pageSize: String(PAGE_SIZE) });
    if (state.search) params.set('q', state.search);
    if (state.affiliation) params.set('affiliation', state.affiliation);

    element<HTMLParagraphElement>('admin-users-status').textContent = 'Loading users…';
    element<HTMLElement>('admin-users-error').hidden = true;
    try {
        const response = await fetch(`/api/admin/user-directory?${params.toString()}`, { credentials: 'same-origin' });
        if (response.status === 401) {
            window.location.href = '/';
            return;
        }
        if (response.status === 403) {
            window.location.href = '/course-selection';
            return;
        }
        if (!response.ok) throw new Error(`User directory request failed (${response.status})`);
        const json = await response.json();
        if (sequence !== requestSequence) return;
        const data = json.data as UserDirectoryPage;
        state.total = data.total;
        renderPage(data);
    } catch (error) {
        if (sequence !== requestSequence) return;
        // Status code only: the request URL can carry a PUID in `q`.
        console.error('[ADMIN-USERS] Failed to load users', error instanceof Error ? error.message : '');
        element<HTMLParagraphElement>('admin-users-status').textContent = '';
        element<HTMLElement>('admin-users-error').hidden = false;
    }
}

function setupFilters(): void {
    const form = element<HTMLFormElement>('admin-users-filters');
    const searchInput = element<HTMLInputElement>('admin-users-search');
    const affiliationSelect = element<HTMLSelectElement>('admin-users-affiliation');

    const applyFilters = () => {
        state.search = searchInput.value.trim();
        state.affiliation = affiliationSelect.value;
        state.page = 1;
        void loadUsers();
    };
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        applyFilters();
    });
    affiliationSelect.addEventListener('change', applyFilters);

    element<HTMLButtonElement>('admin-users-prev').addEventListener('click', () => {
        if (state.page <= 1) return;
        state.page -= 1;
        void loadUsers();
    });
    element<HTMLButtonElement>('admin-users-next').addEventListener('click', () => {
        if (state.page >= totalPages()) return;
        state.page += 1;
        void loadUsers();
    });
    element<HTMLButtonElement>('logout-btn').addEventListener('click', () => {
        window.location.href = '/auth/logout';
    });
}

async function initializeAdminUsers(): Promise<void> {
    const response = await fetch('/auth/current-user', { credentials: 'same-origin' });
    const authData = response.ok ? await response.json() : null;
    if (!authData?.authenticated || !authData.globalUser) {
        window.location.href = '/';
        return;
    }
    if (authData.globalUser.isAdmin !== true) {
        window.location.href = '/course-selection';
        return;
    }
    element<HTMLSpanElement>('user-name').textContent = String(authData.globalUser.name ?? '').split(' ')[0];

    setupFilters();
    initialized = true;
    await loadUsers();
}

function showInitError(): void {
    element<HTMLParagraphElement>('admin-users-status').textContent = '';
    element<HTMLElement>('admin-users-error').hidden = false;
}

element<HTMLButtonElement>('admin-users-retry').addEventListener('click', () => {
    if (initialized) {
        void loadUsers();
        return;
    }
    element<HTMLElement>('admin-users-error').hidden = true;
    element<HTMLParagraphElement>('admin-users-status').textContent = 'Loading users…';
    void initializeAdminUsers().catch(showInitError);
});

void initializeAdminUsers().catch(showInitError);
