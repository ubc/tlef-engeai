/**
 * Shared dialog chrome and drag-reorder helpers for the catalog edit (learning objectives,
 * struggle topics) and division reorder dialogs.
 *
 * The chrome is a native `<dialog id="catalog-modal">` in the Documents page markup
 * (`documents-instructor.html`). Each open fills in its heading and intro, and consumers add rows
 * and extras; the browser handles focus, Escape, the backdrop and the focus trap.
 */

/** Id of the shared catalog `<dialog>` in documents-instructor.html. */
export const CATALOG_MODAL_ID = 'catalog-modal';

/** Returned when the dialog closed after a successful save, so the close handler skips `onDismiss`. */
const SAVED_RETURN_VALUE = 'saved';

/** Tears down the use currently holding the dialog; `null` while it is closed. */
let activeTeardown: ((saved: boolean) => void) | null = null;

export function getCatalogModalDialog(): HTMLDialogElement | null {
    const el = document.getElementById(CATALOG_MODAL_ID);
    return el instanceof HTMLDialogElement ? el : null;
}

export function isOrderDirty(initialIds: string[], currentIds: string[]): boolean {
    if (currentIds.length !== initialIds.length) return true;
    return currentIds.some((id, i) => id !== initialIds[i]);
}

export type CatalogModalVariant = 'edit' | 'division';

export interface CatalogModalChromeOptions {
    title: string;
    intro: string;
    variant?: CatalogModalVariant;
    onDismiss?: () => void | Promise<void>;
    /**
     * Where focus goes on close when the control that opened the dialog is gone (e.g. a save
     * re-rendered it). The browser returns focus to that control itself when it still exists.
     */
    returnFocus?: () => HTMLElement | null;
}

export interface CatalogModalChrome {
    dialog: HTMLDialogElement;
    body: HTMLElement;
    list: HTMLUListElement;
    errorBox: HTMLElement;
    saveBtn: HTMLButtonElement;
    dismissBtn: HTMLButtonElement;
    closeBtn: HTMLButtonElement;
    /** Aborted when the dialog closes; pass it to listeners added to the dialog's own elements. */
    signal: AbortSignal;
    /** Closes the dialog; `dismissed` runs `onDismiss`, otherwise the close counts as a save. */
    closeModal: (dismissed: boolean) => Promise<void>;
    /** While busy, Dismiss, Close and Escape cannot close the dialog. */
    setBusy: (busy: boolean) => void;
    showError: (message: string) => void;
    clearError: () => void;
    registerCleanup: (fn: () => void) => void;
}

function requireChild<T extends HTMLElement>(dialog: HTMLDialogElement, selector: string): T {
    const el = dialog.querySelector<T>(selector);
    if (!el) {
        throw new Error(`Catalog dialog is missing ${selector}.`);
    }
    return el;
}

/**
 * createCatalogModalChrome — resets the shared catalog dialog for a new use and opens it.
 *
 * Listeners that consumers add to the dialog's persistent elements (Save, Dismiss) must pass
 * `chrome.signal`; elements consumers create should be removed via `registerCleanup`.
 *
 * @throws When the page has no catalog dialog markup
 */
export function createCatalogModalChrome(options: CatalogModalChromeOptions): CatalogModalChrome {
    const dialog = getCatalogModalDialog();
    if (!dialog) {
        throw new Error('Catalog dialog markup is missing from this page.');
    }
    // A previous use still open (e.g. a review opened right after an upload) is torn down as
    // dismissed now: its queued close event would otherwise arrive after this use has opened.
    activeTeardown?.(false);
    if (dialog.open) {
        dialog.close();
    }

    const variant = options.variant ?? 'edit';
    const titleEl = requireChild<HTMLElement>(dialog, '.catalog-modal__title');
    const intro = requireChild<HTMLElement>(dialog, '.catalog-modal__intro');
    const body = requireChild<HTMLElement>(dialog, '.catalog-modal__body');
    const list = requireChild<HTMLUListElement>(dialog, '.catalog-modal__list');
    const errorBox = requireChild<HTMLElement>(dialog, '.catalog-modal__error');
    const saveBtn = requireChild<HTMLButtonElement>(dialog, '.catalog-modal__save');
    const dismissBtn = requireChild<HTMLButtonElement>(dialog, '.catalog-modal__dismiss');
    const closeBtn = requireChild<HTMLButtonElement>(dialog, '.catalog-modal__close');

    // 1. Reset what the previous use left behind
    dialog.classList.toggle('catalog-modal--division', variant === 'division');
    titleEl.classList.toggle('catalog-modal__title--division', variant === 'division');
    titleEl.textContent = options.title;
    intro.textContent = options.intro;
    list.replaceChildren();
    errorBox.textContent = '';
    errorBox.hidden = true;
    saveBtn.textContent = 'Save';
    saveBtn.disabled = true;
    dismissBtn.disabled = false;
    closeBtn.disabled = false;
    dialog.returnValue = '';

    const listeners = new AbortController();
    const { signal } = listeners;
    const cleanupFns: Array<() => void> = [];
    let busy = false;

    const showError = (message: string) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
    };

    const clearError = () => {
        errorBox.textContent = '';
        errorBox.hidden = true;
    };

    const setBusy = (value: boolean) => {
        busy = value;
        dismissBtn.disabled = value;
        closeBtn.disabled = value;
    };

    // 2. Escape must not abandon a save in progress
    dialog.addEventListener(
        'cancel',
        (event) => {
            if (busy) event.preventDefault();
        },
        { signal }
    );

    // 3. However the dialog closes, tidy up once; only a non-save close counts as dismissing
    const teardown = (saved: boolean) => {
        if (activeTeardown !== teardown) return;
        activeTeardown = null;
        cleanupFns.forEach((fn) => fn());
        listeners.abort();
        const active = document.activeElement;
        if (!active || active === document.body || dialog.contains(active)) {
            options.returnFocus?.()?.focus();
        }
        if (!saved && options.onDismiss) {
            void options.onDismiss();
        }
    };
    activeTeardown = teardown;
    dialog.addEventListener(
        'close',
        () => {
            // Reopened before this queued event arrived: the new use owns the dialog now
            if (dialog.open) return;
            teardown(dialog.returnValue === SAVED_RETURN_VALUE);
        },
        { signal }
    );

    const closeModal = async (dismissed: boolean) => {
        if (dialog.open) {
            dialog.close(dismissed ? '' : SAVED_RETURN_VALUE);
        }
    };

    dialog.showModal();

    return {
        dialog,
        body,
        list,
        errorBox,
        saveBtn,
        dismissBtn,
        closeBtn,
        signal,
        closeModal,
        setBusy,
        showError,
        clearError,
        registerCleanup: (fn: () => void) => cleanupFns.push(fn),
    };
}

export interface RowDragOptions {
    canDrag: () => boolean;
    getDragIndex: () => number | null;
    setDragIndex: (index: number | null) => void;
    onMove: (from: number, to: number) => void;
    list: HTMLElement;
}

export function createDragHandle(): HTMLButtonElement {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'catalog-modal__drag-handle';
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.setAttribute('aria-grabbed', 'false');
    handle.textContent = '⋮⋮';
    return handle;
}

export function attachRowDragReorder(
    li: HTMLLIElement,
    index: number,
    rowId: string,
    handle: HTMLButtonElement,
    options: RowDragOptions
): void {
    li.addEventListener('dragstart', (event) => {
        if (!options.canDrag()) {
            event.preventDefault();
            return;
        }
        options.setDragIndex(index);
        handle.setAttribute('aria-grabbed', 'true');
        li.classList.add('catalog-modal__row--dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', rowId);
        }
    });

    li.addEventListener('dragend', () => {
        options.setDragIndex(null);
        handle.setAttribute('aria-grabbed', 'false');
        li.classList.remove('catalog-modal__row--dragging');
        options.list
            .querySelectorAll('.catalog-modal__row--drop-target')
            .forEach((el) => el.classList.remove('catalog-modal__row--drop-target'));
    });

    li.addEventListener('dragover', (event) => {
        event.preventDefault();
        const dragIndex = options.getDragIndex();
        if (dragIndex !== null && dragIndex !== index) {
            li.classList.add('catalog-modal__row--drop-target');
        }
    });

    li.addEventListener('dragleave', () => li.classList.remove('catalog-modal__row--drop-target'));

    li.addEventListener('drop', (event) => {
        event.preventDefault();
        li.classList.remove('catalog-modal__row--drop-target');
        const dragIndex = options.getDragIndex();
        if (dragIndex !== null && dragIndex !== index) {
            options.onMove(dragIndex, index);
        }
    });
}
