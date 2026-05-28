/**
 * Conversation mode picker — Anthropic-style text trigger + popover (no mode icons).
 *
 * @latest app version: 1.2.10.10
 */

import { fetchConversationModes } from '../api/chat-api.js';
import {
    ConversationModeCatalogItem,
    ConversationModeId,
} from '../types.js';

export interface ConversationModePickerOptions {
    getSelectedModeId: () => ConversationModeId;
    onModeSelect: (modeId: ConversationModeId) => void;
}

export class ConversationModePicker {
    private modes: ConversationModeCatalogItem[] = [];
    private selectedId: ConversationModeId = 'socratic';
    private readonly trigger: HTMLButtonElement | null;
    private readonly popover: HTMLElement | null;
    private readonly readonlyLabel: HTMLElement | null;
    private readonly wrap: HTMLElement | null;
    private popoverOpen = false;

    constructor(
        private readonly options: ConversationModePickerOptions
    ) {
        this.trigger = document.getElementById('conversation-mode-trigger') as HTMLButtonElement | null;
        this.popover = document.getElementById('conversation-mode-popover');
        this.readonlyLabel = document.getElementById('conversation-mode-readonly');
        this.wrap = document.getElementById('conversation-mode-wrap');
        this.bindTrigger();
        document.addEventListener('click', (e) => this.handleDocumentClick(e));
    }

    async loadCatalog(): Promise<void> {
        const response = await fetchConversationModes();
        if (!response.success || !response.modes?.length) {
            return;
        }
        this.modes = [...response.modes].sort((a, b) => a.sortOrder - b.sortOrder);
        const defaultMode =
            this.modes.find((m) => m.isDefault && m.status === 'active') ??
            this.modes.find((m) => m.status === 'active');
        if (defaultMode) {
            this.selectedId = defaultMode.id;
            this.options.onModeSelect(this.selectedId);
        }
        this.renderPopover();
        this.syncTriggerLabel();
    }

    setSelectedModeId(modeId: ConversationModeId): void {
        this.selectedId = modeId;
        this.syncTriggerLabel();
        this.renderPopover();
    }

    getSelectedModeId(): ConversationModeId {
        return this.options.getSelectedModeId();
    }

    /**
     * @param activeChatModeId - When set, picker is locked and shows read-only label
     */
    syncComposerVisibility(activeChatModeId: ConversationModeId | null | undefined): void {
        const hasActiveChat = Boolean(activeChatModeId);
        if (this.wrap) {
            this.wrap.hidden = hasActiveChat;
        }
        if (this.readonlyLabel) {
            this.readonlyLabel.hidden = !hasActiveChat;
            if (hasActiveChat && activeChatModeId) {
                const meta = this.modes.find((m) => m.id === activeChatModeId);
                this.readonlyLabel.textContent = meta?.displayName ?? activeChatModeId;
            }
        }
        if (hasActiveChat) {
            this.closePopover();
        }
    }

    private bindTrigger(): void {
        this.trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.trigger?.disabled) {
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
        if (!this.trigger) {
            return;
        }
        const meta = this.modes.find((m) => m.id === this.selectedId);
        this.trigger.textContent = meta?.displayName ?? this.selectedId;
    }

    private renderPopover(): void {
        if (!this.popover) {
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

            const isDisabled = mode.status !== 'active';
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
