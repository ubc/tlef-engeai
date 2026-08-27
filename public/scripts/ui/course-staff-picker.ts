// public/scripts/ui/course-staff-picker.ts

/**
 * course-staff-picker.ts — Course Staff multi-select for admin edit-course modal.
 *
 * Renders platform-admin chips (read-only), roster faculty, and a separate incoming-additions row.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-26
 * @version: 1.0.0
 * @description: Admin course staff roster UI with pending-removal confirmation stack.
 */

import { createTypedNameConfirmInput } from './typed-name-confirm-input.js';

export interface CourseStaffMember {
    userId: string;
    name: string;
    isPlatformAdmin: boolean;
}

export interface CourseStaffPickerOptions {
    /** Initial roster from GET /api/admin/course-selection */
    staff: CourseStaffMember[];
    /** Called when faculty add list changes (not pending removals) */
    onChange?: () => void;
    searchUrl?: string;
}

export interface CourseStaffPickerHandle {
    root: HTMLElement;
    confirmationContainer: HTMLElement;
    getInstructorUserIdsToAdd: () => string[];
    getRemoveInstructorUserIds: () => string[];
    areRemovalsConfirmed: () => boolean;
    hasPendingRemovals: () => boolean;
    refreshSaveState: () => void;
    refreshChipIcons: () => void;
    onSaveStateChange: (listener: () => void) => void;
}

interface FacultyPickerUser {
    userId: string;
    name: string;
    affiliation: string;
}

/** Replace feather icons only inside a subtree (works before/after attach). */
function replaceFeatherIn(root: HTMLElement): void {
    const featherLib = (window as {
        feather?: { icons: Record<string, { toSvg: (attrs?: Record<string, string | number>) => string }> };
    }).feather;
    if (!featherLib) {
        return;
    }

    root.querySelectorAll('[data-feather]').forEach((node) => {
        if (!(node instanceof HTMLElement)) {
            return;
        }
        const name = node.getAttribute('data-feather');
        if (!name || !featherLib.icons[name]) {
            return;
        }
        const holder = document.createElement('span');
        holder.innerHTML = featherLib.icons[name].toSvg({
            class: node.className,
            width: 14,
            height: 14,
            'aria-hidden': 'true'
        });
        const svg = holder.firstElementChild;
        if (svg) {
            node.replaceWith(svg);
        }
    });
}

/** Graduation cap icon — feather has no mortarboard; inline SVG matches chip stroke style. */
function createGraduationCapIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'user-search-chip-icon user-search-chip-icon--graduation');
    svg.setAttribute('aria-hidden', 'true');

    const cap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cap.setAttribute(
        'd',
        'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z'
    );

    const tassel = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tassel.setAttribute('d', 'M22 10v6');

    const base = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    base.setAttribute('d', 'M6 12v5c0 2 2 3 6 3s6-1 6-3v-5');

    svg.append(cap, tassel, base);
    return svg;
}

/**
 * createCourseStaffPicker - Admin Course Staff section with admin vs instructor chips.
 *
 * Platform admins: red chip, shield icon, no remove control.
 * Roster faculty: removable via typed confirmation below the modal divider.
 * New searches land in a To add row (green chips) until Save.
 *
 * @param options - Initial staff roster and optional change callback
 * @returns Picker root, confirmation container, and save payload helpers
 */
export function createCourseStaffPicker(options: CourseStaffPickerOptions): CourseStaffPickerHandle {
    const root = document.createElement('div');
    root.className = 'course-staff-picker user-search-multi-select';

    const rosterChips = document.createElement('div');
    rosterChips.className = 'user-search-chips course-staff-roster-chips';

    const incomingSection = document.createElement('div');
    incomingSection.className = 'course-staff-incoming';
    incomingSection.hidden = true;

    const incomingLabel = document.createElement('div');
    incomingLabel.className = 'course-staff-incoming-label';
    incomingLabel.textContent = 'To add';

    const incomingChips = document.createElement('div');
    incomingChips.className = 'user-search-chips course-staff-incoming-chips';

    incomingSection.append(incomingLabel, incomingChips);

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'admin-modal-input user-search-input';
    searchInput.placeholder = 'Search faculty by name';
    searchInput.setAttribute('autocomplete', 'off');

    const results = document.createElement('ul');
    results.className = 'user-search-results';
    results.hidden = true;

    const confirmationContainer = document.createElement('div');
    confirmationContainer.className = 'course-staff-removal-confirmations';

    const searchUrl = options.searchUrl ?? '/api/admin/users/search';
    const saveListeners: Array<() => void> = [];

    // Faculty already on the course roster (non-admin, not pending removal)
    let rosterFaculty: FacultyPickerUser[] = options.staff
        .filter((s) => !s.isPlatformAdmin)
        .map((s) => ({ userId: s.userId, name: s.name, affiliation: 'faculty' }));

    // Faculty chosen via search — applied on Save, not mixed into roster chips
    let incomingFaculty: FacultyPickerUser[] = [];

    const adminStaff = options.staff.filter((s) => s.isPlatformAdmin);

    // Pending removals — userId -> name
    const pendingRemovals = new Map<string, string>();
    const confirmHandles = new Map<string, ReturnType<typeof createTypedNameConfirmInput>>();

    const notifySaveState = () => saveListeners.forEach((fn) => fn());
    const notifyChange = () => options.onChange?.();

    const REVERT_ANIM_MS = 220;

    const revertingIds = new Set<string>();

    const revertPendingRemoval = (userId: string) => {
        const name = pendingRemovals.get(userId);
        if (!name || revertingIds.has(userId)) {
            return;
        }

        revertingIds.add(userId);

        const confirmEl = confirmHandles.get(userId)?.element;
        const chip = rosterChips.querySelector<HTMLElement>(`[data-user-id="${userId}"]`);

        confirmEl?.classList.remove('typed-name-confirm-block--enter');
        confirmEl?.classList.add('typed-name-confirm-block--exit');
        chip?.classList.add('user-search-chip--reverting-removal');

        window.setTimeout(() => {
            pendingRemovals.delete(userId);
            confirmEl?.remove();
            confirmHandles.delete(userId);
            revertingIds.delete(userId);

            if (!rosterFaculty.some((f) => f.userId === userId)) {
                rosterFaculty = [...rosterFaculty, { userId, name, affiliation: 'faculty' }];
            }

            renderRosterChips(userId);
            renderIncomingChips();
            confirmationContainer.hidden = pendingRemovals.size === 0;
            notifyChange();
            notifySaveState();
        }, REVERT_ANIM_MS);
    };

    const syncConfirmations = () => {
        // Drop DOM + handles for users no longer pending removal
        for (const userId of [...confirmHandles.keys()]) {
            if (!pendingRemovals.has(userId)) {
                confirmHandles.get(userId)?.element.remove();
                confirmHandles.delete(userId);
            }
        }

        // Append a confirmation block only for newly pending users — keep existing inputs intact
        for (const [userId, name] of pendingRemovals.entries()) {
            if (confirmHandles.has(userId)) {
                continue;
            }
            const handle = createTypedNameConfirmInput({
                expectedName: name,
                onRevert: () => revertPendingRemoval(userId)
            });
            handle.onChange(() => notifySaveState());
            confirmHandles.set(userId, handle);
            handle.element.classList.add('typed-name-confirm-block--enter');
            handle.element.setAttribute('data-user-id', userId);
            confirmationContainer.appendChild(handle.element);
        }

        confirmationContainer.hidden = pendingRemovals.size === 0;
        notifySaveState();
    };

    const markPendingRemoval = (userId: string, name: string, chip: HTMLElement) => {
        // Brief exit animation before chip moves to pending-removal state
        chip.classList.add('user-search-chip--marking-removal');
        window.setTimeout(() => {
            pendingRemovals.set(userId, name);
            rosterFaculty = rosterFaculty.filter((f) => f.userId !== userId);
            renderAllChips();
            syncConfirmations();
            notifyChange();
        }, 220);
    };

    const createInstructorChip = (
        userId: string,
        name: string,
        options: { pendingRemoval?: boolean; onRemove?: () => void; incoming?: boolean } = {}
    ): HTMLElement => {
        const chip = document.createElement('span');
        chip.className = 'user-search-chip user-search-chip--instructor';
        if (options.pendingRemoval) {
            chip.classList.add('user-search-chip--pending-removal');
        }
        if (options.incoming) {
            chip.classList.add('user-search-chip--incoming');
        }
        chip.setAttribute('data-user-id', userId);

        const icon = createGraduationCapIcon();

        const label = document.createElement('span');
        label.className = 'user-search-chip-label';
        label.textContent = name;

        chip.append(icon, label);

        if (options.onRemove) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'user-search-chip-remove';
            removeBtn.setAttribute('aria-label', `Remove ${name}`);
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', options.onRemove);
            chip.appendChild(removeBtn);
        }

        return chip;
    };

    const renderRosterChips = (restoredUserId?: string) => {
        rosterChips.innerHTML = '';

        for (const admin of adminStaff) {
            const chip = document.createElement('span');
            chip.className = 'user-search-chip user-search-chip--admin';
            chip.setAttribute('data-user-id', admin.userId);

            const icon = document.createElement('i');
            icon.setAttribute('data-feather', 'shield');
            icon.className = 'user-search-chip-icon';
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'user-search-chip-label';
            label.textContent = admin.name;

            chip.append(icon, label);
            rosterChips.appendChild(chip);
        }

        const allFacultyIds = new Set([
            ...rosterFaculty.map((f) => f.userId),
            ...pendingRemovals.keys()
        ]);

        for (const userId of allFacultyIds) {
            const pending = pendingRemovals.has(userId);
            const faculty = rosterFaculty.find((f) => f.userId === userId);
            const name = pending ? pendingRemovals.get(userId)! : faculty?.name ?? 'Unknown';

            const chip = createInstructorChip(userId, name, {
                pendingRemoval: pending,
                onRemove: pending
                    ? undefined
                    : () => {
                          markPendingRemoval(userId, name, chip);
                      }
            });
            if (!pending && userId === restoredUserId) {
                chip.classList.add('user-search-chip--restore-enter');
            }
            rosterChips.appendChild(chip);
        }

        replaceFeatherIn(rosterChips);
    };

    const renderIncomingChips = () => {
        incomingChips.innerHTML = '';
        incomingSection.hidden = incomingFaculty.length === 0;

        for (const faculty of incomingFaculty) {
            const chip = createInstructorChip(faculty.userId, faculty.name, {
                incoming: true,
                onRemove: () => {
                    incomingFaculty = incomingFaculty.filter((f) => f.userId !== faculty.userId);
                    renderIncomingChips();
                    notifyChange();
                }
            });
            incomingChips.appendChild(chip);
        }
    };

    const renderAllChips = (restoredUserId?: string) => {
        renderRosterChips(restoredUserId);
        renderIncomingChips();
    };

    const isUserAlreadySelected = (userId: string): boolean =>
        adminStaff.some((a) => a.userId === userId) ||
        rosterFaculty.some((f) => f.userId === userId) ||
        incomingFaculty.some((f) => f.userId === userId) ||
        pendingRemovals.has(userId);

    const addUser = (user: FacultyPickerUser) => {
        if (isUserAlreadySelected(user.userId)) {
            return;
        }
        incomingFaculty = [...incomingFaculty, user];
        renderIncomingChips();
        notifyChange();
        searchInput.value = '';
        results.hidden = true;
    };

    let debounce: ReturnType<typeof setTimeout> | undefined;
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        if (debounce) {
            clearTimeout(debounce);
        }
        if (!q) {
            results.hidden = true;
            return;
        }
        debounce = setTimeout(async () => {
            try {
                const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`, {
                    credentials: 'same-origin'
                });
                const data = await res.json();
                const users = (data.data ?? []) as FacultyPickerUser[];
                results.innerHTML = '';
                for (const user of users) {
                    if (isUserAlreadySelected(user.userId)) {
                        continue;
                    }
                    const li = document.createElement('li');
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'user-search-result-item';
                    btn.textContent = user.name;
                    btn.addEventListener('click', () => addUser(user));
                    li.appendChild(btn);
                    results.appendChild(li);
                }
                results.hidden = results.children.length === 0;
            } catch {
                results.hidden = true;
            }
        }, 250);
    });

    renderAllChips();
    root.append(rosterChips, incomingSection, searchInput, results);

    return {
        root,
        confirmationContainer,
        getInstructorUserIdsToAdd: () => incomingFaculty.map((f) => f.userId),
        getRemoveInstructorUserIds: () => [...pendingRemovals.keys()],
        areRemovalsConfirmed: () => {
            if (pendingRemovals.size === 0) {
                return true;
            }
            for (const handle of confirmHandles.values()) {
                if (!handle.isConfirmed()) {
                    return false;
                }
            }
            return true;
        },
        hasPendingRemovals: () => pendingRemovals.size > 0,
        refreshSaveState: () => notifySaveState(),
        refreshChipIcons: () => replaceFeatherIn(rosterChips),
        onSaveStateChange: (listener: () => void) => {
            saveListeners.push(listener);
        }
    };
}
