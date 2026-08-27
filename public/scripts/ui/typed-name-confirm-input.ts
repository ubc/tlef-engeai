// public/scripts/ui/typed-name-confirm-input.ts

/**
 * typed-name-confirm-input.ts — Typed full-name confirmation for destructive admin actions.
 *
 * Blocks paste/drop; visual states for focus, match, and paste rejection.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-26
 * @version: 1.0.0
 * @description: Reusable name-typing gate before instructor removal.
 */

export interface TypedNameConfirmInputOptions {
    expectedName: string;
    /** When set, shows a green Revert control below the input (course-staff undo removal). */
    onRevert?: () => void;
}

export interface TypedNameConfirmInputHandle {
    element: HTMLElement;
    isConfirmed: () => boolean;
    onChange: (listener: () => void) => void;
}

/**
 * createTypedNameConfirmInput - Build a removal confirmation block with typed name gate.
 *
 * Renders one-line prompt and an input that must exactly match `expectedName`.
 * Paste and drop are blocked with shake + notice.
 *
 * @param options - expectedName to type for confirmation
 * @returns DOM root, isConfirmed(), and onChange subscription
 */
export function createTypedNameConfirmInput(
    options: TypedNameConfirmInputOptions
): TypedNameConfirmInputHandle {
    const expected = options.expectedName.trim();
    const listeners: Array<() => void> = [];

    const block = document.createElement('div');
    block.className = 'typed-name-confirm-block';

    const prompt = document.createElement('p');
    prompt.className = 'typed-name-confirm-prompt';
    prompt.append(
        document.createTextNode('Type '),
        (() => {
            const nameEl = document.createElement('strong');
            nameEl.className = 'typed-name-confirm-name';
            nameEl.textContent = expected;
            return nameEl;
        })(),
        document.createTextNode(' to remove them from this course.')
    );

    const inputWrap = document.createElement('div');
    inputWrap.className = 'typed-name-confirm-input-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'admin-modal-input typed-name-confirm-input';
    input.placeholder = 'Full name';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    const check = document.createElement('span');
    check.className = 'typed-name-confirm-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    check.hidden = true;

    const pasteNotice = document.createElement('p');
    pasteNotice.className = 'typed-name-confirm-paste-notice';
    pasteNotice.hidden = true;
    pasteNotice.textContent = 'Paste is disabled — type the name manually.';

    inputWrap.append(input, check);
    block.append(prompt, inputWrap);

    if (options.onRevert) {
        const actions = document.createElement('div');
        actions.className = 'typed-name-confirm-actions';

        const revertBtn = document.createElement('button');
        revertBtn.type = 'button';
        revertBtn.className = 'typed-name-confirm-revert';
        revertBtn.textContent = 'Revert';
        revertBtn.addEventListener('click', () => options.onRevert?.());

        actions.appendChild(revertBtn);
        block.appendChild(actions);
    }

    block.appendChild(pasteNotice);

    const notify = () => listeners.forEach((fn) => fn());

    const updateVisualState = () => {
        const value = input.value.trim();
        const matched = value === expected && value.length > 0;
        const focused = document.activeElement === input;

        inputWrap.classList.toggle('typed-name-confirm-input-wrap--match', matched);
        inputWrap.classList.toggle('typed-name-confirm-input-wrap--focus', focused && !matched);
        input.classList.toggle('typed-name-confirm-input--match', matched);
        input.classList.toggle('typed-name-confirm-input--focus', focused && !matched);
        check.hidden = !matched;
        notify();
    };

    const shakeOnPaste = () => {
        pasteNotice.hidden = false;
        inputWrap.classList.remove('typed-name-confirm-input-wrap--shake');
        void inputWrap.offsetWidth;
        inputWrap.classList.add('typed-name-confirm-input-wrap--shake', 'typed-name-confirm-input-wrap--paste-error');
        window.setTimeout(() => {
            inputWrap.classList.remove('typed-name-confirm-input-wrap--shake');
        }, 450);
    };

    const blockClipboard = (event: Event) => {
        event.preventDefault();
        shakeOnPaste();
    };

    // Block paste/drop — user must type the name manually
    input.addEventListener('paste', blockClipboard);
    input.addEventListener('drop', blockClipboard);
    input.addEventListener('cut', (e) => e.preventDefault());
    input.addEventListener('copy', (e) => e.preventDefault());

    input.addEventListener('input', () => {
        inputWrap.classList.remove('typed-name-confirm-input-wrap--paste-error');
        updateVisualState();
    });

    input.addEventListener('focus', updateVisualState);
    input.addEventListener('blur', updateVisualState);

    return {
        element: block,
        isConfirmed: () => input.value.trim() === expected && expected.length > 0,
        onChange: (listener: () => void) => {
            listeners.push(listener);
        }
    };
}
