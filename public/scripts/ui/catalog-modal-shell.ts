/**
 * Shared modal chrome and drag-reorder helpers for catalog and division reorder modals.
 */

export const CATALOG_MODAL_MOUNT_ID = 'catalog-edit-modal-mount';

export function getCatalogModalMount(): HTMLElement | null {
    let el = document.getElementById(CATALOG_MODAL_MOUNT_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = CATALOG_MODAL_MOUNT_ID;
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    return el;
}

export function isOrderDirty(initialIds: string[], currentIds: string[]): boolean {
    if (currentIds.length !== initialIds.length) return true;
    return currentIds.some((id, i) => id !== initialIds[i]);
}

export type CatalogModalVariant = 'edit' | 'division';

export interface CatalogModalChromeOptions {
    title: string;
    intro: string;
    titleId?: string;
    variant?: CatalogModalVariant;
    onDismiss?: () => void | Promise<void>;
}

export interface CatalogModalChrome {
    mount: HTMLElement;
    overlay: HTMLDivElement;
    modal: HTMLDivElement;
    body: HTMLDivElement;
    list: HTMLUListElement;
    errorBox: HTMLDivElement;
    saveBtn: HTMLButtonElement;
    dismissBtn: HTMLButtonElement;
    closeBtn: HTMLButtonElement;
    closeModal: (dismissed: boolean) => Promise<void>;
    showError: (message: string) => void;
    clearError: () => void;
    registerCleanup: (fn: () => void) => void;
}

export function createCatalogModalChrome(options: CatalogModalChromeOptions): CatalogModalChrome {
    const mount = getCatalogModalMount();
    if (!mount) {
        throw new Error('Catalog modal mount could not be created.');
    }

    const titleId = options.titleId ?? 'catalog-edit-title';
    const variant = options.variant ?? 'edit';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay upload-modal-overlay catalog-modal__overlay';
    mount.innerHTML = '';
    mount.appendChild(overlay);
    document.body.classList.add('modal-open');

    const modal = document.createElement('div');
    modal.className = 'modal-container catalog-modal';
    if (variant === 'division') {
        modal.classList.add('catalog-modal--division');
    }
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', titleId);
    overlay.appendChild(modal);
    overlay.offsetHeight;
    overlay.classList.add('show');

    const header = document.createElement('div');
    header.className = 'catalog-modal__header';

    const titleEl = document.createElement('h2');
    titleEl.id = titleId;
    titleEl.className = 'catalog-modal__title';
    if (variant === 'division') {
        titleEl.classList.add('catalog-modal__title--division');
    }
    titleEl.textContent = options.title;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'catalog-modal__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body catalog-modal__body';

    const intro = document.createElement('p');
    intro.className = 'catalog-modal__intro';
    intro.textContent = options.intro;
    body.appendChild(intro);

    const list = document.createElement('ul');
    list.className = 'catalog-modal__list';
    list.setAttribute('role', 'list');
    body.appendChild(list);

    const errorBox = document.createElement('div');
    errorBox.className = 'catalog-modal__error';
    errorBox.hidden = true;
    body.appendChild(errorBox);

    const footer = document.createElement('div');
    footer.className = 'modal-footer catalog-modal__footer';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'catalog-modal__dismiss';
    dismissBtn.textContent = 'Dismiss';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'catalog-modal__save';
    saveBtn.textContent = 'Save';
    saveBtn.disabled = true;

    footer.appendChild(dismissBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    const cleanupFns: Array<() => void> = [];

    const showError = (message: string) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
    };

    const clearError = () => {
        errorBox.textContent = '';
        errorBox.hidden = true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            void closeModal(true);
        }
    };

    const closeModal = async (dismissed: boolean) => {
        document.removeEventListener('keydown', onKeyDown);
        cleanupFns.forEach((fn) => fn());
        overlay.classList.remove('show');
        document.body.classList.remove('modal-open');
        setTimeout(() => {
            mount.innerHTML = '';
        }, 200);
        if (dismissed && options.onDismiss) {
            await options.onDismiss();
        }
    };

    dismissBtn.addEventListener('click', () => void closeModal(true));
    closeBtn.addEventListener('click', () => void closeModal(true));
    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) void closeModal(true);
    });

    return {
        mount,
        overlay,
        modal,
        body,
        list,
        errorBox,
        saveBtn,
        dismissBtn,
        closeBtn,
        closeModal,
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
