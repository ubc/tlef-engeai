/**
 * Initial Assistant Prompts Management
 * 
 * This module handles the creation, editing, deletion, and selection of initial assistant prompts
 * for courses. Prompts are used as the initial message when students start new chats.
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { activeCourse, InitialAssistantPrompt, DEFAULT_PROMPT_ID } from '../types.js';
import { renderFeatherIcons } from '../api/api.js';
import { showConfirmModal, showSimpleErrorModal, showErrorModal, openContentInputModal, openPromptReviewModal } from '../ui/modal-overlay.js';
import { needsExpandButton, truncateToFirstLine } from '../utils/prompt-preview.js';
import { DocumentUploadModule } from '../services/document-upload-module.js';
import { showSuccessToast, showErrorToast } from '../ui/toast-notification.js';

let currentCourse: activeCourse | null = null;
let prompts: InitialAssistantPrompt[] = [];

/**
 * Initialize the assistant prompts page
 * @param course - The current course
 */
export async function initializeAssistantPrompts(course: activeCourse): Promise<void> {
    currentCourse = course;
    
    // Validate courseId
    if (!course.id || course.id.trim() === '') {
        console.error('❌ [ASSISTANT-PROMPTS] Cannot initialize: courseId is missing');
        await showSimpleErrorModal('Cannot load assistant prompts: Course ID is missing. Please refresh the page.', 'Initialization Error');
        return;
    }

    // console.log(`✅ [ASSISTANT-PROMPTS] Initializing with courseId: ${course.id}`); // 🟢 MEDIUM: Course ID exposure

    // Setup event listeners
    setupEventListeners();

    // Load prompts from server
    await loadPrompts();

    // Render the page
    renderPrompts();

    // Render feather icons
    renderFeatherIcons();
}

/**
 * Setup event listeners for the page
 */
function setupEventListeners(): void {
    const addPromptBtn = document.getElementById('assistant-add-prompt-btn');
    if (addPromptBtn) {
        addPromptBtn.addEventListener('click', handleAddPrompt);
    }
}

/**
 * Load prompts from the server
 */
async function loadPrompts(): Promise<void> {
    if (!currentCourse?.id) {
        console.error('❌ [ASSISTANT-PROMPTS] Cannot load prompts: courseId is missing');
        return;
    }

    try {
        const response = await fetch(`/api/courses/${currentCourse.id}/assistant-prompts`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load prompts: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
            prompts = result.data || [];
            // console.log(`✅ [ASSISTANT-PROMPTS] Loaded ${prompts.length} prompts`);
        } else {
            throw new Error(result.error || 'Failed to load prompts');
        }
    } catch (error) {
        console.error('❌ [ASSISTANT-PROMPTS] Error loading prompts:', error);
        await showErrorModal('Failed to load assistant prompts. Please try again.', 'Error');
    }
}

/**
 * Render all prompts on the page
 */
function renderPrompts(): void {
    const container = document.getElementById('assistant-prompts-container');
    if (!container) {
        console.error('❌ [ASSISTANT-PROMPTS] Prompts container not found');
        return;
    }

    const promptsToRender = prompts;

    if (promptsToRender.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No initial assistant prompts yet. Click "Add New Initial Assistant Prompt" to create one.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = promptsToRender.map(prompt => renderPromptCard(prompt)).join('');
    
    // Setup event listeners for each card
    promptsToRender.forEach(prompt => {
        setupCardEventListeners(prompt.id);
    });

    // Render feather icons again after DOM update
    renderFeatherIcons();
}

/**
 * Render a single prompt card
 * @param prompt - The prompt to render
 * @returns HTML string for the card
 */
function renderPromptCard(prompt: InitialAssistantPrompt): string {
    const isSelected = prompt.isSelected;
    const isDefault = prompt.isDefault || prompt.id === DEFAULT_PROMPT_ID;
    const selectedClass = isSelected ? 'selected' : '';
    const selectedBadge = isSelected ? '<span class="selected-badge">Selected</span>' : '';
    const defaultBadge = isDefault ? '<span class="default-badge">Default</span>' : '';

    const rawContent = prompt.content || '';
    const previewLine = truncateToFirstLine(rawContent);
    const showExpand = needsExpandButton(rawContent);

    return `
        <div class="prompt-card ${selectedClass}" data-prompt-id="${prompt.id}">
            ${selectedBadge}
            ${defaultBadge}
            <div class="prompt-header">
                <div class="prompt-title" data-field="title" data-prompt-id="${prompt.id}">
                    ${escapeHtml(prompt.title || 'Untitled')}
                </div>
            </div>
            <div class="prompt-content-wrapper">
                <div class="prompt-content prompt-content--preview" data-field="content" data-prompt-id="${prompt.id}">
                    ${escapeHtml(previewLine)}
                </div>
                ${showExpand ? `
                    <button type="button" class="expand-toggle" data-prompt-id="${prompt.id}" aria-label="View full prompt">
                        <i data-feather="chevron-down"></i>
                    </button>
                ` : ''}
            </div>
            <div class="prompt-actions">
                ${!isDefault ? `
                    <button class="btn-edit" data-prompt-id="${prompt.id}">
                        <i data-feather="edit"></i>
                        <span>Edit</span>
                    </button>
                    <button class="btn-delete" data-prompt-id="${prompt.id}">
                        <i data-feather="trash-2"></i>
                        <span>Delete</span>
                    </button>
                ` : ''}
                <button class="btn-choose" data-prompt-id="${prompt.id}" ${isSelected ? 'disabled' : ''}>
                    <i data-feather="check-circle"></i>
                    <span>Choose</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Setup event listeners for a prompt card
 * @param promptId - The prompt ID
 */
function setupCardEventListeners(promptId: string): void {
    const card = document.querySelector(`[data-prompt-id="${promptId}"]`) as HTMLElement;
    if (!card) return;

    // Edit button
    const editBtn = card.querySelector('.btn-edit');
    if (editBtn) {
        editBtn.addEventListener('click', () => handleEditPrompt(promptId));
    }

    // Delete button
    const deleteBtn = card.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeletePrompt(promptId));
    }

    // Choose button
    const chooseBtn = card.querySelector('.btn-choose');
    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => handleSelectPrompt(promptId));
    }

    // Expand/collapse toggle
    const expandToggle = card.querySelector('.expand-toggle');
    if (expandToggle) {
        expandToggle.addEventListener('click', () => handleOpenReviewModal(promptId));
    }

}

/**
 * Handle adding a new prompt via shared content modal (file or text).
 */
function handleAddPrompt(): void {
    if (!currentCourse?.id) {
        showErrorToast('Course ID is missing. Please refresh the page.');
        return;
    }

    void openContentInputModal({
        title: 'Add initial assistant prompt',
        initialMethod: 'text',
        allowEmptyText: true,
        strings: {
            nameLabel: 'Title',
            namePlaceholder: 'Prompt title...',
            textLabel: 'Prompt text',
            textPlaceholder: 'Paste or type the assistant prompt text...',
            submitLabel: 'Submit',
            cancelLabel: 'Cancel'
        },
        loadingContent: {
            title: 'Saving',
            line1: 'Creating your prompt...',
            line2: 'Please wait.'
        },
        onSubmit: async (payload) => {
            const title = payload.name.trim();
            if (!title) {
                alert('Please enter a title.');
                return { success: false };
            }
            let content = payload.text;
            if (payload.sourceType === 'file' && payload.file) {
                const mod = new DocumentUploadModule();
                const v = mod.validateFile(payload.file);
                if (!v.isValid) {
                    alert(v.error);
                    return { success: false };
                }
                const parsed = await mod.parseDocument(payload.file);
                content = parsed.extractedText;
            }
            const response = await fetch(`/api/courses/${currentCourse!.id}/assistant-prompts`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: content.trim() })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to create prompt');
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to create prompt');
            }
            await loadPrompts();
            renderPrompts();
            showSuccessToast('Prompt created successfully!');
            return { success: true, skipSuccessModal: true };
        }
    });
}

/**
 * Handle editing a prompt via content modal
 * @param promptId - The prompt ID
 */
function handleEditPrompt(promptId: string): void {
    if (!currentCourse?.id) {
        showErrorToast('Course ID is missing. Please refresh the page.');
        return;
    }
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;
    const isDefault = prompt.isDefault || prompt.id === DEFAULT_PROMPT_ID;
    if (isDefault) return;

    void openContentInputModal({
        mode: 'edit',
        title: `Edit: ${prompt.title || 'Untitled'}`,
        initialMethod: 'text',
        initialValues: {
            title: prompt.title || '',
            text: prompt.content || '',
            method: 'text'
        },
        allowEmptyText: true,
        strings: {
            nameLabel: 'Title',
            namePlaceholder: 'Prompt title...',
            textLabel: 'Prompt text',
            textPlaceholder: 'Paste or type the assistant prompt text...',
            submitLabel: 'Save edit',
            cancelLabel: 'Cancel'
        },
        loadingContent: {
            title: 'Saving',
            line1: 'Updating your prompt...',
            line2: 'Please wait.'
        },
        onSubmit: async (payload) => {
            const title = payload.name.trim();
            if (!title) {
                alert('Please enter a title.');
                return { success: false };
            }
            let content = payload.text;
            if (payload.sourceType === 'file' && payload.file) {
                const mod = new DocumentUploadModule();
                const v = mod.validateFile(payload.file);
                if (!v.isValid) {
                    alert(v.error);
                    return { success: false };
                }
                const parsed = await mod.parseDocument(payload.file);
                content = parsed.extractedText;
            }
            const response = await fetch(`/api/courses/${currentCourse!.id}/assistant-prompts/${promptId}`, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: content.trim() })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to update prompt');
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to update prompt');
            }
            await loadPrompts();
            renderPrompts();
            showSuccessToast('Prompt updated successfully!');
            return { success: true, skipSuccessModal: true };
        }
    });
}

/**
 * Handle deleting a prompt
 * @param promptId - The prompt ID
 */
async function handleDeletePrompt(promptId: string): Promise<void> {
    if (!currentCourse?.id) {
        await showErrorModal('Course ID is missing. Please refresh the page.', 'Error');
        return;
    }

    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) {
        return;
    }

    // Prevent deletion of default prompt
    const isDefault = prompt.isDefault || prompt.id === DEFAULT_PROMPT_ID;
    if (isDefault) {
        showErrorToast('Cannot delete the default prompt. This prompt is always available and cannot be removed.');
        return;
    }

    const modalResult = await showConfirmModal(
        'Delete Prompt',
        `Are you sure you want to delete "${prompt.title}"?`,
        'Delete',
        'Cancel'
    );

    if (modalResult.action === 'cancel') {
        return;
    }

    try {
        const response = await fetch(`/api/courses/${currentCourse.id}/assistant-prompts/${promptId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errResult = await response.json();
            throw new Error(errResult.error || 'Failed to delete prompt');
        }

        const result = await response.json();
        if (result.success) {
            await loadPrompts();
            renderPrompts();
            showSuccessToast('Prompt deleted successfully!');
        } else {
            throw new Error(result.error || 'Failed to delete prompt');
        }
    } catch (error) {
        console.error('❌ [ASSISTANT-PROMPTS] Error deleting prompt:', error);
        showErrorToast(
            error instanceof Error ? error.message : 'Failed to delete prompt. Please try again.'
        );
    }
}

/**
 * Handle selecting a prompt
 * @param promptId - The prompt ID
 */
async function handleSelectPrompt(promptId: string): Promise<void> {
    if (!currentCourse?.id) {
        await showErrorModal('Course ID is missing. Please refresh the page.', 'Error');
        return;
    }

    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) {
        return;
    }

    const modalResult = await showConfirmModal(
        'Select Prompt',
        `Set "${prompt.title}" as the active initial assistant prompt? This will replace any currently selected prompt.`,
        'Select',
        'Cancel'
    );

    if (modalResult.action === 'cancel') {
        return;
    }

    try {
        const response = await fetch(`/api/courses/${currentCourse.id}/assistant-prompts/${promptId}/select`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to select prompt');
        }

        const result = await response.json();
        if (result.success) {
            await loadPrompts();
            renderPrompts();
            showSuccessToast('Prompt selected successfully!');
        } else {
            throw new Error(result.error || 'Failed to select prompt');
        }
    } catch (error) {
        console.error('❌ [ASSISTANT-PROMPTS] Error selecting prompt:', error);
        showErrorToast(
            error instanceof Error ? error.message : 'Failed to select prompt. Please try again.'
        );
    }
}

/**
 * Open read-only review modal with full prompt body
 */
function handleOpenReviewModal(promptId: string): void {
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;
    openPromptReviewModal({
        title: prompt.title || 'Untitled',
        body: prompt.content || ''
    });
}

/**
 * Escape HTML to prevent XSS
 * @param text - Text to escape
 * @returns Escaped HTML
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Check if there are unsaved changes (for navigation warnings)
 * @returns True if there are unsaved changes
 */
export function hasUnsavedPromptChanges(): boolean {
    return false;
}

/**
 * Reset unsaved changes flag
 */
export function resetUnsavedPromptChanges(): void {
    /* Prompt edits use modal; no page-level draft state */
}

