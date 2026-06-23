/**
 * user-search-multi-select.ts
 *
 * Searchable faculty multi-select combobox for admin course modals.
 */

export interface FacultyPickerUser {
    userId: string;
    name: string;
    affiliation: string;
}

export interface UserSearchMultiSelectOptions {
    selected: FacultyPickerUser[];
    onChange: (selected: FacultyPickerUser[]) => void;
    searchUrl?: string;
}

/**
 * Builds a combobox + selected chips list. Queries faculty via admin search API.
 */
export function createUserSearchMultiSelect(options: UserSearchMultiSelectOptions): HTMLElement {
    const root = document.createElement('div');
    root.className = 'user-search-multi-select';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'admin-modal-input user-search-input';
    searchInput.placeholder = 'Search faculty by name';
    searchInput.setAttribute('autocomplete', 'off');

    const results = document.createElement('ul');
    results.className = 'user-search-results';
    results.hidden = true;

    const chips = document.createElement('div');
    chips.className = 'user-search-chips';

    let selected = [...options.selected];
    const searchUrl = options.searchUrl ?? '/api/admin/users/search';

    const renderChips = () => {
        chips.innerHTML = '';
        for (const user of selected) {
            const chip = document.createElement('span');
            chip.className = 'user-search-chip';
            chip.setAttribute('data-user-id', user.userId);
            chip.appendChild(document.createTextNode(user.name));

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'user-search-chip-remove';
            removeBtn.setAttribute('aria-label', `Remove ${user.name}`);
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                selected = selected.filter((u) => u.userId !== user.userId);
                options.onChange(selected);
                renderChips();
            });

            chip.appendChild(removeBtn);
            chips.appendChild(chip);
        }
    };

    const addUser = (user: FacultyPickerUser) => {
        if (selected.some((u) => u.userId === user.userId)) {
            return;
        }
        selected = [...selected, user];
        options.onChange(selected);
        renderChips();
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
                    const li = document.createElement('li');
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'user-search-result-item';
                    btn.textContent = user.name;
                    btn.addEventListener('click', () => addUser(user));
                    li.appendChild(btn);
                    results.appendChild(li);
                }
                results.hidden = users.length === 0;
            } catch {
                results.hidden = true;
            }
        }, 250);
    });

    renderChips();
    root.appendChild(chips);
    root.appendChild(searchInput);
    root.appendChild(results);
    return root;
}

export function getSelectedFromMultiSelect(root: HTMLElement): FacultyPickerUser[] {
    const chips = root.querySelectorAll('.user-search-chip');
    return Array.from(chips).map((chip) => ({
        userId: chip.getAttribute('data-user-id') ?? '',
        name: chip.textContent?.replace('×', '').trim() ?? '',
        affiliation: 'faculty'
    }));
}
