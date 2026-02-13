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

import { activeCourse, InitialAssistantPrompt, DEFAULT_PROMPT_ID } from '../../../src/functions/types.js';
import { renderFeatherIcons } from '../functions/api.js';
import { showConfirmModal, showSimpleErrorModal, showErrorModal } from '../modal-overlay.js';
import { showSuccessToast, showErrorToast } from '../toast-notification.js';

const DRAFT_PROMPT_ID = 'draft-new';

let currentCourse: activeCourse | null = null;
let prompts: InitialAssistantPrompt[] = [];
let editingPromptId: string | null = null;
let draftPrompt: InitialAssistantPrompt | null = null;

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
            console.log(`✅ [ASSISTANT-PROMPTS] Loaded ${prompts.length} prompts`);
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

    const promptsToRender = prompts.concat(draftPrompt ? [draftPrompt] : []);

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
    const isEditing = editingPromptId === prompt.id;
    const isDefault = prompt.isDefault || prompt.id === DEFAULT_PROMPT_ID;
    const selectedClass = isSelected ? 'selected' : '';
    const selectedBadge = isSelected ? '<span class="selected-badge">Selected</span>' : '';
    const defaultBadge = isDefault ? '<span class="default-badge">Default</span>' : '';
    
    // Truncate content for display (3 lines) - but only if not editing
    const truncatedContent = truncateContent(prompt.content || '', 3);
    const isTruncated = !isEditing && (prompt.content || '').length > truncatedContent.length;
    const displayContent = isTruncated ? truncatedContent : (prompt.content || '');

    return `
        <div class="prompt-card ${selectedClass}" data-prompt-id="${prompt.id}">
            ${selectedBadge}
            ${defaultBadge}
            <div class="prompt-header">
                <div class="prompt-title" 
                     contenteditable="${isEditing && !isDefault ? 'true' : 'false'}" 
                     data-field="title"
                     data-prompt-id="${prompt.id}"
                     ${isEditing ? 'data-editing="true"' : ''}>
                    ${escapeHtml(prompt.title || 'Untitled')}
                </div>
            </div>
            <div class="prompt-content-wrapper">
                <div class="prompt-content" 
                     contenteditable="${isEditing && !isDefault ? 'true' : 'false'}" 
                     data-field="content"
                     data-prompt-id="${prompt.id}"
                     ${isEditing ? 'data-editing="true"' : ''}>
                    ${escapeHtml(displayContent)}
                </div>
                ${isTruncated ? `
                    <button class="expand-toggle" data-prompt-id="${prompt.id}" data-expanded="false">
                        <i data-feather="chevron-down"></i>
                    </button>
                ` : ''}
            </div>
            <div class="prompt-actions">
                ${isEditing ? `
                    <button class="btn-save" data-prompt-id="${prompt.id}">
                        <i data-feather="check"></i>
                        <span>Save</span>
                    </button>
                    <button class="btn-cancel" data-prompt-id="${prompt.id}">
                        <i data-feather="x"></i>
                        <span>Cancel</span>
                    </button>
                ` : `
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
                `}
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

    // Save button
    const saveBtn = card.querySelector('.btn-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => handleSavePrompt(promptId));
    }

    // Cancel button
    const cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => handleCancelEdit(promptId));
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
        expandToggle.addEventListener('click', () => handleToggleExpand(promptId));
    }

    // Handle inline editing for title and content - only when in edit mode
    const titleField = card.querySelector('[data-field="title"]') as HTMLElement;
    const contentField = card.querySelector('[data-field="content"]') as HTMLElement;
    const isCurrentlyEditing = editingPromptId === promptId;

    if (titleField && isCurrentlyEditing) {
        // Track if title was changed
        let titleChanged = false;

        titleField.addEventListener('input', () => {
            titleChanged = true;
        });

        titleField.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                contentField?.focus();
            }
            if (e.key === 'Escape' && editingPromptId === promptId) {
                handleCancelEdit(promptId);
            }
        });
    }

    if (contentField && isCurrentlyEditing) {
        // Track if content was changed
        let contentChanged = false;

        contentField.addEventListener('input', () => {
            contentChanged = true;
        });

        contentField.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && editingPromptId === promptId) {
                handleCancelEdit(promptId);
            }
            // Allow Enter for new lines, Ctrl+Enter or Cmd+Enter to save
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSavePrompt(promptId);
            }
        });
    }
}

/**
 * Handle adding a new prompt.
 * Creates a draft in the UI first; only persists to server when user saves.
 * Cancel removes the draft without creating anything.
 */
function handleAddPrompt(): void {
    if (!currentCourse?.id) {
        showErrorToast('Course ID is missing. Please refresh the page.');
        return;
    }

    if (draftPrompt) {
        showErrorToast('Please save or cancel the current prompt first.');
        return;
    }

    draftPrompt = {
        id: DRAFT_PROMPT_ID,
        title: 'Untitled',
        content: '',
        dateCreated: new Date(),
        isSelected: false,
        isDefault: false
    };
    editingPromptId = DRAFT_PROMPT_ID;
    renderPrompts();

    setTimeout(() => {
        const newCard = document.querySelector(`[data-prompt-id="${DRAFT_PROMPT_ID}"]`) as HTMLElement;
        if (newCard) {
            const titleField = newCard.querySelector('[data-field="title"]') as HTMLElement;
            if (titleField) {
                titleField.focus();
                const range = document.createRange();
                range.selectNodeContents(titleField);
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    }, 100);
}

/**
 * Handle editing a prompt
 * @param promptId - The prompt ID
 */
function handleEditPrompt(promptId: string): void {
    // If already editing this prompt, do nothing
    if (editingPromptId === promptId) {
        return;
    }
    editingPromptId = promptId;
    renderPrompts();
    
    // Focus on title field after render
    setTimeout(() => {
        const card = document.querySelector(`[data-prompt-id="${promptId}"]`) as HTMLElement;
        if (card) {
            const titleField = card.querySelector('[data-field="title"]') as HTMLElement;
            if (titleField) {
                titleField.focus();
            }
        }
    }, 100);
}

/**
 * Handle saving a prompt
 * @param promptId - The prompt ID
 */
async function handleSavePrompt(promptId: string): Promise<void> {
    if (!currentCourse?.id) {
        await showErrorModal('Course ID is missing. Please refresh the page.', 'Error');
        return;
    }

    const card = document.querySelector(`[data-prompt-id="${promptId}"]`) as HTMLElement;
    if (!card) {
        return;
    }

    const titleField = card.querySelector('[data-field="title"]') as HTMLElement;
    const contentField = card.querySelector('[data-field="content"]') as HTMLElement;

    if (!titleField || !contentField) {
        return;
    }

    const title = titleField.textContent?.trim() || '';
    const content = contentField.textContent?.trim() || '';

    if (!title) {
        showErrorToast('Title cannot be empty.');
        titleField.focus();
        return;
    }

    if (!content) {
        showErrorToast('Content cannot be empty.');
        contentField.focus();
        return;
    }

    const isDraft = promptId === DRAFT_PROMPT_ID;

    try {
        if (isDraft) {
            // Create new prompt on server
            const response = await fetch(`/api/courses/${currentCourse.id}/assistant-prompts`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, content })
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to create prompt');
            }

            const result = await response.json();
            if (result.success) {
                draftPrompt = null;
                editingPromptId = null;
                await loadPrompts();
                renderPrompts();
                showSuccessToast('Prompt created successfully!');
            } else {
                throw new Error(result.error || 'Failed to create prompt');
            }
        } else {
            const response = await fetch(`/api/courses/${currentCourse.id}/assistant-prompts/${promptId}`, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: title,
                    content: content
                })
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to update prompt');
            }

            const result = await response.json();
            if (result.success) {
                editingPromptId = null;
                await loadPrompts();
                renderPrompts();
                showSuccessToast('Prompt updated successfully!');
            } else {
                throw new Error(result.error || 'Failed to update prompt');
            }
        }
    } catch (error) {
        console.error('❌ [ASSISTANT-PROMPTS] Error saving prompt:', error);
        showErrorToast(
            error instanceof Error ? error.message : 'Failed to save prompt. Please try again.'
        );
    }
}

/**
 * Handle canceling edit
 * @param promptId - The prompt ID
 */
function handleCancelEdit(promptId: string): void {
    if (promptId === DRAFT_PROMPT_ID) {
        draftPrompt = null;
        editingPromptId = null;
        renderPrompts();
    } else {
        editingPromptId = null;
        loadPrompts().then(() => {
            renderPrompts();
        });
    }
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
 * Handle toggling content expansion
 * @param promptId - The prompt ID
 */
function handleToggleExpand(promptId: string): void {
    const card = document.querySelector(`[data-prompt-id="${promptId}"]`) as HTMLElement;
    if (!card) return;

    const expandToggle = card.querySelector('.expand-toggle') as HTMLElement;
    const contentField = card.querySelector('.prompt-content') as HTMLElement;
    
    if (!expandToggle || !contentField) return;

    const isExpanded = expandToggle.getAttribute('data-expanded') === 'true';
    const prompt = promptId === DRAFT_PROMPT_ID ? draftPrompt : prompts.find(p => p.id === promptId);
    
    if (!prompt) return;

    if (isExpanded) {
        // Collapse
        contentField.textContent = truncateContent(prompt.content, 3);
        expandToggle.setAttribute('data-expanded', 'false');
        expandToggle.innerHTML = '<i data-feather="chevron-down"></i>';
    } else {
        // Expand
        contentField.textContent = prompt.content;
        expandToggle.setAttribute('data-expanded', 'true');
        expandToggle.innerHTML = '<i data-feather="chevron-up"></i>';
    }

    renderFeatherIcons();
}

/**
 * Truncate content to specified number of lines
 * @param content - The content to truncate
 * @param maxLines - Maximum number of lines
 * @returns Truncated content
 */
function truncateContent(content: string, maxLines: number): string {
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
        return content;
    }
    return lines.slice(0, maxLines).join('\n') + '...';
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
    return editingPromptId !== null || draftPrompt !== null;
}

/**
 * Reset unsaved changes flag
 */
export function resetUnsavedPromptChanges(): void {
    editingPromptId = null;
    draftPrompt = null;
}

