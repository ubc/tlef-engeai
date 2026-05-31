/**
 * Conversation mode picker — pill beside send.
 * Unlocked: label + CSS chevron. Locked: label + Feather lock (CSS toggled via `.is-locked`).
 */

import { fetchConversationModes } from '../api/chat-api.js';
import {
    ConversationModeCatalogItem,
    ConversationModeId,
} from '../types.js';

export interface ConversationModePickerOptions {
    getSelectedModeId: () => ConversationModeId;
    onModeSelect: (modeId: ConversationModeId) => void;
    /** Called after catalog fetch so ChatManager can re-sync lock state. */
    onCatalogLoaded?: () => void;
}

export interface ComposerModeVisibility {
    modeId: ConversationModeId;
    isLocked: boolean;
}

export class ConversationModePicker {
    private modes: ConversationModeCatalogItem[] = [];
    private selectedId: ConversationModeId = 'socratic';
    private isLocked = false;
    private catalogLoaded = false;
    private trigger: HTMLButtonElement | null = null;
    private labelEl: HTMLElement | null = null;
    private popover: HTMLElement | null = null;
    private popoverOpen = false;
    private isPending = false;

    constructor(
        private readonly options: ConversationModePickerOptions
    ) {
        this.bindToDom();
        document.addEventListener('click', (e) => this.handleDocumentClick(e));
    }

    bindToDom(): void {
        const trigger = document.getElementById('conversation-mode-trigger') as HTMLButtonElement | null;
        const popover = document.getElementById('conversation-mode-popover');

        if (trigger === this.trigger && popover === this.popover) {
            return;
        }

        this.trigger = trigger;
        this.labelEl = this.trigger?.querySelector('.conversation-mode-label') ?? null;
        this.popover = popover;
        this.bindTrigger();
        this.syncTriggerLabel();
        this.applyLockedPresentation(this.isLocked);
        this.renderPopover();
    }

    async loadCatalog(): Promise<void> {
        if (this.catalogLoaded) {
            this.options.onCatalogLoaded?.();
            return;
        }

        const response = await fetchConversationModes();
        if (!response.success || !response.modes?.length) {
            return;
        }

        this.modes = [...response.modes].sort((a, b) => a.sortOrder - b.sortOrder);
        this.catalogLoaded = true;

        const defaultMode =
            this.modes.find((m) => m.isDefault && m.status === 'active') ??
            this.modes.find((m) => m.status === 'active');

        const currentSelection = this.options.getSelectedModeId();
        const currentIsActive = this.modes.some(
            (m) => m.id === currentSelection && m.status === 'active'
        );
        this.selectedId = currentIsActive
            ? currentSelection
            : (defaultMode?.id ?? 'socratic');

        this.renderPopover();
        this.syncTriggerLabel();
        this.options.onCatalogLoaded?.();
    }

    setSelectedModeId(modeId: ConversationModeId): void {
        this.selectedId = modeId;
        this.syncTriggerLabel();
        this.renderPopover();
    }

    setPending(isPending: boolean): void {
        this.isPending = isPending;
        this.applyLockedPresentation(this.isLocked);
        this.renderPopover();
    }

    getSelectedModeId(): ConversationModeId {
        return this.options.getSelectedModeId();
    }

    syncComposerVisibility({ modeId, isLocked }: ComposerModeVisibility): void {
        this.isLocked = isLocked;
        this.selectedId = modeId;
        this.syncTriggerLabel();
        this.applyLockedPresentation(isLocked);

        if (isLocked) {
            this.closePopover();
        } else {
            this.renderPopover();
        }
    }

    /** Re-apply `.is-locked` after global `renderFeatherIcons()` elsewhere in the app. */
    refreshPresentationAfterIcons(): void {
        this.applyLockedPresentation(this.isLocked);
    }

    private applyLockedPresentation(isLocked: boolean): void {
        this.trigger?.classList.toggle('is-locked', isLocked);
        this.trigger?.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
        this.trigger?.setAttribute('aria-busy', this.isPending ? 'true' : 'false');

        if (isLocked) {
            this.trigger?.removeAttribute('aria-haspopup');
            this.trigger?.setAttribute('aria-expanded', 'false');
        } else {
            this.trigger?.setAttribute('aria-haspopup', 'listbox');
        }
    }

    private bindTrigger(): void {
        this.trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isLocked || this.isPending) {
                return;
            }
            this.popoverOpen = !this.popoverOpen;
            this.popover?.classList.toggle('is-open', this.popoverOpen);
            this.trigger?.setAttribute('aria-expanded', this.popoverOpen ? 'true' : 'false');
        });
    }

    private handleDocumentClick(e: MouseEvent): void {
        const target = e.target as Node;
        if (
            this.popover?.contains(target) ||
            this.trigger?.contains(target)
        ) {
            return;
        }
        this.closePopover();
    }

    private closePopover(): void {
        this.popoverOpen = false;
        this.popover?.classList.remove('is-open');
        this.trigger?.setAttribute('aria-expanded', 'false');
    }

    private syncTriggerLabel(): void {
        if (!this.labelEl) {
            return;
        }
        const meta = this.modes.find((m) => m.id === this.selectedId);
        this.labelEl.textContent = meta?.displayName ?? this.selectedId;
    }

    private renderPopover(): void {
        if (!this.popover || this.isLocked) {
            return;
        }
        this.popover.innerHTML = '';
        this.popover.setAttribute('role', 'listbox');

        for (const mode of this.modes) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'conversation-mode-option';
            option.setAttribute('role', 'option');
            option.dataset.modeId = mode.id;

            const isDisabled = mode.status !== 'active' || this.isPending;
            const isSelected = mode.id === this.selectedId;
            option.disabled = isDisabled;
            option.setAttribute('aria-selected', isSelected ? 'true' : 'false');

            const title = document.createElement('span');
            title.className = 'conversation-mode-option-title';
            title.textContent =
                mode.status === 'coming_soon'
                    ? `${mode.displayName} — Coming soon`
                    : mode.displayName;

            const subtitle = document.createElement('span');
            subtitle.className = 'conversation-mode-option-subtitle';
            subtitle.textContent = mode.shortDescription;

            option.appendChild(title);
            option.appendChild(subtitle);

            if (isSelected && !isDisabled) {
                const check = document.createElement('span');
                check.className = 'conversation-mode-option-check';
                check.textContent = '✓';
                option.appendChild(check);
            }

            option.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isDisabled) {
                    return;
                }
                this.selectedId = mode.id;
                this.options.onModeSelect(mode.id);
                this.syncTriggerLabel();
                this.renderPopover();
                this.closePopover();
            });

            this.popover.appendChild(option);
        }
    }
}
