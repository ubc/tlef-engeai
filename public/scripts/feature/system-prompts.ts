/**
 * System Prompts Management
 * 
 * This module handles the creation, editing, deletion, and append/remove functionality
 * for system prompt items. System prompts are composed of base prompt, learning objectives,
 * struggle topics (always included), and custom appended items.
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { activeCourse, SystemPromptItem, DEFAULT_BASE_PROMPT_ID, DEFAULT_LEARNING_OBJECTIVES_ID, DEFAULT_STRUGGLE_TOPICS_ID, LearningObjective } from '../../../src/functions/types.js';
import { renderFeatherIcons } from '../functions/api.js';
import { showConfirmModal, showSimpleErrorModal, showErrorModal } from '../modal-overlay.js';
import { showSuccessToast, showErrorToast } from '../toast-notification.js';

const DRAFT_PROMPT_ID = 'draft-new';

let currentCourse: activeCourse | null = null;
let items: SystemPromptItem[] = [];
let editingItemId: string | null = null;
let draftItem: SystemPromptItem | null = null;
let learningObjectivesCount: number = 0;

/**
 * Initialize the system prompts page
 * @param course - The current course
 */
export async function initializeSystemPrompts(course: activeCourse): Promise<void> {
    currentCourse = course;
    
    // Validate courseId
    if (!course.id || course.id.trim() === '') {
        console.error('❌ [SYSTEM-PROMPTS] Cannot initialize: courseId is missing');
        await showSimpleErrorModal('Cannot load system prompts: Course ID is missing. Please refresh the page.', 'Initialization Error');
        return;
    }

    console.log(`✅ [SYSTEM-PROMPTS] Initializing with courseId: ${course.id}`);

    // Setup event listeners
    setupEventListeners();

    // Load learning objectives count
    await loadLearningObjectivesCount();

    // Load items from server
    await loadSystemPrompts();

    // Render the page
    renderPrompts();

    // Render feather icons
    renderFeatherIcons();
}

/**
 * Setup event listeners for the page
 */
function setupEventListeners(): void {
    const addPromptBtn = document.getElementById('system-add-prompt-btn');
    if (addPromptBtn) {
        addPromptBtn.addEventListener('click', handleAddPrompt);
    }
}

/**
 * Setup event listeners for default components (learning objectives and struggle topics)
 */
function setupDefaultComponentEventListeners(): void {
    // Setup expand/collapse for learning objectives
    const learningObjectivesCard = document.querySelector(`[data-prompt-id="${DEFAULT_LEARNING_OBJECTIVES_ID}"]`);
    if (learningObjectivesCard) {
        const expandToggle = learningObjectivesCard.querySelector('.expand-toggle') as HTMLElement;
        if (expandToggle) {
            expandToggle.addEventListener('click', () => handleDefaultComponentToggleExpand(DEFAULT_LEARNING_OBJECTIVES_ID));
        }
    }

    // Setup expand/collapse for struggle topics
    const struggleTopicsCard = document.querySelector(`[data-prompt-id="${DEFAULT_STRUGGLE_TOPICS_ID}"]`);
    if (struggleTopicsCard) {
        const expandToggle = struggleTopicsCard.querySelector('.expand-toggle') as HTMLElement;
        if (expandToggle) {
            expandToggle.addEventListener('click', () => handleDefaultComponentToggleExpand(DEFAULT_STRUGGLE_TOPICS_ID));
        }
    }
}

/**
 * Load learning objectives count for display
 * Gets count from course content items
 */
async function loadLearningObjectivesCount(): Promise<void> {
    if (!currentCourse?.id) return;

    try {
        // Get learning objectives count from course content items
        // We'll calculate it from topicOrWeekInstances
        let count = 0;
        if (currentCourse.topicOrWeekInstances) {
            currentCourse.topicOrWeekInstances.forEach(instance => {
                if (instance.items) {
                    instance.items.forEach(item => {
                        if (item.learningObjectives && Array.isArray(item.learningObjectives)) {
                            count += item.learningObjectives.length;
                        }
                    });
                }
            });
        }
        learningObjectivesCount = count;
    } catch (error) {
        console.error('❌ [SYSTEM-PROMPTS] Error loading learning objectives count:', error);
        // Continue with default count of 0
        learningObjectivesCount = 0;
    }
}

/**
 * Load system prompt items from the server
 */
async function loadSystemPrompts(): Promise<void> {
    if (!currentCourse?.id) {
        console.error('❌ [SYSTEM-PROMPTS] Cannot load items: courseId is missing');
        return;
    }

    try {
        const response = await fetch(`/api/courses/${currentCourse.id}/system-prompts`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load system prompts: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
            items = result.data || [];
            console.log(`✅ [SYSTEM-PROMPTS] Loaded ${items.length} items`);
        } else {
            throw new Error(result.error || 'Failed to load system prompts');
        }
    } catch (error) {
        console.error('❌ [SYSTEM-PROMPTS] Error loading system prompts:', error);
        await showErrorModal('Failed to load system prompts. Please try again.', 'Error');
    }
}

/**
 * Render all prompts on the page
 */
function renderPrompts(): void {
    const container = document.getElementById('system-prompts-container');
    if (!container) {
        console.error('❌ [SYSTEM-PROMPTS] Prompts container not found');
        return;
    }

    // Separate default components from custom items (exclude draft from items)
    const basePrompt = items.find(item => item.componentType === 'base' || item.id === DEFAULT_BASE_PROMPT_ID);
    const learningObjectives = items.find(item => item.componentType === 'learning-objectives' || item.id === DEFAULT_LEARNING_OBJECTIVES_ID);
    const struggleTopics = items.find(item => item.componentType === 'struggle-topics' || item.id === DEFAULT_STRUGGLE_TOPICS_ID);
    const customItems = items.filter(item => item.componentType === 'custom');
    const itemsToRender = customItems.concat(draftItem ? [draftItem] : []);

    let html = '';

    // Render base system prompt
    if (basePrompt) {
        html += renderPromptCard(basePrompt);
    }

    // Render learning objectives component (always included default component)
    html += renderLearningObjectivesComponent();

    // Render struggle topics component (always included default component)
    html += renderStruggleTopicsComponent([]);

    // Render custom items (including draft if present)
    itemsToRender.forEach(item => {
        html += renderPromptCard(item);
    });

    container.innerHTML = html;
    
    // Setup event listeners for each card
    itemsToRender.forEach(item => {
        setupCardEventListeners(item.id);
    });

    // Setup event listeners for default components (learning objectives and struggle topics)
    setupDefaultComponentEventListeners();

    // Render feather icons again after DOM update
    renderFeatherIcons();
}

/**
 * Render learning objectives component (informational display)
 */
function renderLearningObjectivesComponent(): string {
    // Build full content
    const fullContent = 'The following are ALL learning objectives for this course, organized by week/topic and subsection:\n\n\nWhen helping students, reference these learning objectives to ensure alignment with course goals.';

    // Truncate content for display (3 lines)
    const truncatedContent = truncateContent(fullContent, 3);
    const isTruncated = fullContent !== truncatedContent;

    return `
        <div class="prompt-card appended default-component" data-prompt-id="${DEFAULT_LEARNING_OBJECTIVES_ID}">
            <span class="appended-badge">Appended</span>
            <span class="always-included-badge">Always Included</span>
            <div class="prompt-header">
                <div class="prompt-title">Learning Objectives</div>
            </div>
            <div class="prompt-content-wrapper">
                <div class="prompt-content informational">
                    ${escapeHtml(truncatedContent)}
                </div>
                ${isTruncated ? `
                    <button class="expand-toggle" data-prompt-id="${DEFAULT_LEARNING_OBJECTIVES_ID}" data-expanded="false">
                        <i data-feather="chevron-down"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Render struggle topics component (informational display)
 */
function renderStruggleTopicsComponent(struggleTopics?: string[]): string {
    // Create quoted struggle topics string
    const struggleTopicsQuoted = struggleTopics && struggleTopics.length > 0
        ? struggleTopics.map((topic) => `"${topic}"`).join(', ')
        : '"thermodynamics", "kinetics", "equilibrium"'; // Default placeholder

    // Build full content
    const fullContent = `\n\n===========================================
STRUGGLE TOPICS HANDLING
===========================================\n\n
Student struggles with the following topics:\n
${struggleTopicsQuoted}\n\n
Before responding when struggle topics are discussed, verify:\n
☐ STOPPED using Socratic or guided-discovery questioning\n
☐ Providing direct, clear, step-by-step explanations\n
☐ Using concrete numerical examples\n
☐ Breaking concepts into simple, explicit steps\n
☐ Asked at MOST ONE follow-up question (simple understanding check, not Socratic)\n
`;

    // Truncate content for display (3 lines)
    const truncatedContent = truncateContent(fullContent, 3);
    const isTruncated = fullContent !== truncatedContent;

    // Debug logging
    console.log('Struggle Topics Debug:', {
        fullContentLength: fullContent.length,
        truncatedContentLength: truncatedContent.length,
        fullContentLines: fullContent.split('\n').length,
        truncatedContentLines: truncatedContent.split('\n').length,
        isTruncated,
        fullContent: fullContent.substring(0, 100) + '...',
        truncatedContent: truncatedContent.substring(0, 100) + '...'
    });

    return `
        <div class="prompt-card appended default-component" data-prompt-id="${DEFAULT_STRUGGLE_TOPICS_ID}">
            <span class="appended-badge">Appended</span>
            <span class="always-included-badge">Always Included</span>
            <div class="prompt-header">
                <div class="prompt-title">Struggle Topics</div>
            </div>
            <div class="prompt-content-wrapper">
                <div class="prompt-content informational">
                    ${escapeHtml(truncatedContent)}
                </div>
                ${isTruncated ? `
                    <button class="expand-toggle" data-prompt-id="${DEFAULT_STRUGGLE_TOPICS_ID}" data-expanded="false">
                        <i data-feather="chevron-down"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Render a single prompt card
 * @param item - The system prompt item to render
 * @returns HTML string for the card
 */
function renderPromptCard(item: SystemPromptItem): string {
    const isAppended = item.isAppended;
    const isEditing = editingItemId === item.id;
    const isDefault = item.isDefault || ['base', 'learning-objectives', 'struggle-topics'].includes(item.componentType || '');
    const appendedClass = isAppended ? 'appended' : '';
    const appendedBadge = isAppended ? '<span class="appended-badge">Appended</span>' : '';
    const alwaysIncludedBadge = isDefault ? '<span class="always-included-badge">Always Included</span>' : '';
    
    // Truncate content for display (3 lines) - but only if not editing
    const truncatedContent = truncateContent(item.content || '', 3);
    const isTruncated = !isEditing && (item.content || '').length > truncatedContent.length;
    const displayContent = isTruncated ? truncatedContent : (item.content || '');

    return `
        <div class="prompt-card ${appendedClass}" data-prompt-id="${item.id}">
            ${appendedBadge}
            ${alwaysIncludedBadge}
            <div class="prompt-header">
                <div class="prompt-title" 
                     contenteditable="${isEditing && !isDefault ? 'true' : 'false'}" 
                     data-field="title"
                     data-prompt-id="${item.id}"
                     ${isEditing ? 'data-editing="true"' : ''}>
                    ${escapeHtml(item.title || 'Untitled')}
                </div>
            </div>
            <div class="prompt-content-wrapper">
                <div class="prompt-content" 
                     contenteditable="${isEditing && !isDefault ? 'true' : 'false'}" 
                     data-field="content"
                     data-prompt-id="${item.id}"
                     ${isEditing ? 'data-editing="true"' : ''}>
                    ${escapeHtml(displayContent)}
                </div>
                ${isTruncated ? `
                    <button class="expand-toggle" data-prompt-id="${item.id}" data-expanded="false">
                        <i data-feather="chevron-down"></i>
                    </button>
                ` : ''}
            </div>
            <div class="prompt-actions">
                ${isEditing ? `
                    <button class="btn-save" data-prompt-id="${item.id}">
                        <i data-feather="check"></i>
                        <span>Save</span>
                    </button>
                    <button class="btn-cancel" data-prompt-id="${item.id}">
                        <i data-feather="x"></i>
                        <span>Cancel</span>
                    </button>
                ` : `
                    ${!isDefault ? `
                        <button class="btn-edit" data-prompt-id="${item.id}">
                            <i data-feather="edit"></i>
                            <span>Edit</span>
                        </button>
                        <button class="btn-delete" data-prompt-id="${item.id}">
                            <i data-feather="trash-2"></i>
                            <span>Delete</span>
                        </button>
                    ` : ''}
                    ${item.componentType === 'custom' ? `
                        ${isAppended ? `
                            <button class="btn-remove" data-prompt-id="${item.id}">
                                <i data-feather="minus-circle"></i>
                                <span>Remove</span>
                            </button>
                        ` : `
                            <button class="btn-append" data-prompt-id="${item.id}">
                                <i data-feather="plus-circle"></i>
                                <span>Append</span>
                            </button>
                        `}
                    ` : ''}
                `}
            </div>
        </div>
    `;
}

/**
 * Setup event listeners for a prompt card
 * @param itemId - The item ID
 */
function setupCardEventListeners(itemId: string): void {
    const card = document.querySelector(`[data-prompt-id="${itemId}"]`) as HTMLElement;
    if (!card) return;

    const item = itemId === DRAFT_PROMPT_ID ? draftItem : items.find(i => i.id === itemId);
    if (!item) return;

    const isDefault = item.isDefault || ['base', 'learning-objectives', 'struggle-topics'].includes(item.componentType || '');

    // Edit button (only for base and custom items; draft is always in edit mode)
    if ((!isDefault || item.componentType === 'base') && itemId !== DRAFT_PROMPT_ID) {
        const editBtn = card.querySelector('.btn-edit');
        if (editBtn) {
            editBtn.addEventListener('click', () => handleEditPrompt(itemId));
        }
    }

    // Save button
    const saveBtn = card.querySelector('.btn-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => handleSavePrompt(itemId));
    }

    // Cancel button
    const cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => handleCancelEdit(itemId));
    }

    // Delete button (only for custom items, not for draft)
    if (!isDefault && itemId !== DRAFT_PROMPT_ID) {
        const deleteBtn = card.querySelector('.btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeletePrompt(itemId));
        }
    }

    // Append button (only for custom items, not for draft)
    if (item.componentType === 'custom' && itemId !== DRAFT_PROMPT_ID) {
        const appendBtn = card.querySelector('.btn-append');
        if (appendBtn) {
            appendBtn.addEventListener('click', () => handleToggleAppend(itemId, true));
        }

        const removeBtn = card.querySelector('.btn-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => handleToggleAppend(itemId, false));
        }
    }

    // Expand/collapse toggle (skip default components and draft to avoid double binding)
    const expandToggle = card.querySelector('.expand-toggle');
    const isDefaultComponent = item.componentType === 'learning-objectives' || item.componentType === 'struggle-topics';
    if (expandToggle && !isDefaultComponent && itemId !== DRAFT_PROMPT_ID) {
        expandToggle.addEventListener('click', () => handleToggleExpand(itemId));
    }

    // Handle inline editing for title and content - only when in edit mode
    const titleField = card.querySelector('[data-field="title"]') as HTMLElement;
    const contentField = card.querySelector('[data-field="content"]') as HTMLElement;
    const isCurrentlyEditing = editingItemId === itemId;

    if (titleField && isCurrentlyEditing) {
        titleField.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                contentField?.focus();
            }
            if (e.key === 'Escape' && editingItemId === itemId) {
                handleCancelEdit(itemId);
            }
        });
    }

    if (contentField && isCurrentlyEditing) {
        contentField.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && editingItemId === itemId) {
                handleCancelEdit(itemId);
            }
            // Allow Enter for new lines, Ctrl+Enter or Cmd+Enter to save
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSavePrompt(itemId);
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

    if (draftItem) {
        showErrorToast('Please save or cancel the current prompt first.');
        return;
    }

    draftItem = {
        id: DRAFT_PROMPT_ID,
        title: 'Untitled',
        content: '',
        dateCreated: new Date(),
        componentType: 'custom',
        isAppended: false,
        isDefault: false
    };
    editingItemId = DRAFT_PROMPT_ID;
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
 * @param itemId - The item ID
 */
function handleEditPrompt(itemId: string): void {
    if (editingItemId === itemId) {
        return;
    }
    editingItemId = itemId;
    renderPrompts();
    
    // Focus on title field after render
    setTimeout(() => {
        const card = document.querySelector(`[data-prompt-id="${itemId}"]`) as HTMLElement;
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
 * @param itemId - The item ID
 */
async function handleSavePrompt(itemId: string): Promise<void> {
    if (!currentCourse?.id) {
        showErrorToast('Course ID is missing. Please refresh the page.');
        return;
    }

    const card = document.querySelector(`[data-prompt-id="${itemId}"]`) as HTMLElement;
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

    const isDraft = itemId === DRAFT_PROMPT_ID;

    try {
        if (isDraft) {
            // Create new prompt on server
            const response = await fetch(`/api/courses/${currentCourse.id}/system-prompts`, {
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
                draftItem = null;
                editingItemId = null;
                await loadSystemPrompts();
                renderPrompts();
                showSuccessToast('Prompt created successfully!');
            } else {
                throw new Error(result.error || 'Failed to create prompt');
            }
        } else {
            // Update existing prompt
            const response = await fetch(`/api/courses/${currentCourse.id}/system-prompts/${itemId}`, {
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
                editingItemId = null;
                await loadSystemPrompts();
                renderPrompts();
                showSuccessToast('Prompt updated successfully!');
            } else {
                throw new Error(result.error || 'Failed to update prompt');
            }
        }
    } catch (error) {
        console.error('❌ [SYSTEM-PROMPTS] Error saving prompt:', error);
        showErrorToast(
            error instanceof Error ? error.message : 'Failed to save prompt. Please try again.'
        );
    }
}

/**
 * Handle canceling edit
 * @param itemId - The item ID
 */
function handleCancelEdit(itemId: string): void {
    if (itemId === DRAFT_PROMPT_ID) {
        draftItem = null;
        editingItemId = null;
        renderPrompts();
    } else {
        editingItemId = null;
        loadSystemPrompts().then(() => {
            renderPrompts();
        });
    }
}

/**
 * Handle deleting a prompt
 * @param itemId - The item ID
 */
async function handleDeletePrompt(itemId: string): Promise<void> {
    if (!currentCourse?.id) {
        await showErrorModal('Course ID is missing. Please refresh the page.', 'Error');
        return;
    }

    const item = items.find(i => i.id === itemId);
    if (!item) {
        return;
    }

    const result = await showConfirmModal(
        `Are you sure you want to delete "${item.title}"?`,
        'Delete Prompt',
        'Delete',
        'Cancel'
    );

    // Check if user cancelled
    if (result.action === 'cancel') {
        // User cancelled - do nothing
        return;
    }

    try {
        const response = await fetch(`/api/courses/${currentCourse.id}/system-prompts/${itemId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to delete prompt');
        }

        const result = await response.json();
        if (result.success) {
            await loadSystemPrompts();
            renderPrompts();
            showSuccessToast('Prompt deleted successfully!');
        } else {
            throw new Error(result.error || 'Failed to delete prompt');
        }
    } catch (error) {
        console.error('❌ [SYSTEM-PROMPTS] Error deleting prompt:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete prompt. Please try again.';
        showErrorToast(errorMessage);
    }
}

/**
 * Handle toggling append status (immediate action with modal confirmation)
 * @param itemId - The item ID
 * @param append - Whether to append (true) or remove (false)
 */
async function handleToggleAppend(itemId: string, append: boolean): Promise<void> {
    if (!currentCourse?.id) {
        await showErrorModal('Course ID is missing. Please refresh the page.', 'Error');
        return;
    }

    const item = items.find(i => i.id === itemId);
    if (!item) {
        return;
    }

    const actionText = append ? 'append' : 'remove';
    const actionTextCapitalized = append ? 'Append' : 'Remove';
    
    // Show confirmation modal
    const result = await showConfirmModal(
        `${actionTextCapitalized} "${item.title}" ${append ? 'to' : 'from'} the system prompt? This will ${append ? 'add' : 'remove'} this component ${append ? 'to' : 'from'} all chat conversations.`,
        `${actionTextCapitalized} System Prompt Item`,
        actionTextCapitalized,
        'Cancel'
    );

    // Check if user cancelled
    // The action is the button text converted to lowercase with spaces replaced by hyphens
    // Cancel button text "Cancel" becomes action "cancel"
    // Confirm button text "Append" becomes action "append", "Remove" becomes "remove"
    if (result.action === 'cancel') {
        // User cancelled - do nothing
        return;
    }

    // User confirmed - proceed with append/remove
    // The action should be 'append' or 'remove' (from the confirm button text)
    try {
        const response = await fetch(`/api/courses/${currentCourse.id}/system-prompts/${itemId}/append`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ append })
        });

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.error || `Failed to ${actionText} prompt`);
        }

        const responseResult = await response.json();
        if (responseResult.success) {
            await loadSystemPrompts();
            renderPrompts();
            showSuccessToast(`System prompt item ${append ? 'appended' : 'removed'} successfully!`);
        } else {
            throw new Error(responseResult.error || `Failed to ${actionText} prompt`);
        }
    } catch (error) {
        console.error(`❌ [SYSTEM-PROMPTS] Error ${actionText}ing prompt:`, error);
        showErrorToast(
            error instanceof Error ? error.message : `Failed to ${actionText} prompt. Please try again.`
        );
    }
}

/**
 * Handle toggling content expansion
 * @param itemId - The item ID
 */
function handleToggleExpand(itemId: string): void {
    const card = document.querySelector(`[data-prompt-id="${itemId}"]`) as HTMLElement;
    if (!card) return;

    const expandToggle = card.querySelector('.expand-toggle') as HTMLElement;
    const contentField = card.querySelector('.prompt-content') as HTMLElement;

    if (!expandToggle || !contentField) return;

    const isExpanded = expandToggle.getAttribute('data-expanded') === 'true';
    const item = items.find(i => i.id === itemId);

    if (!item) return;

    if (isExpanded) {
        // Collapse
        contentField.textContent = truncateContent(item.content, 3);
        expandToggle.setAttribute('data-expanded', 'false');
        expandToggle.innerHTML = '<i data-feather="chevron-down"></i>';
    } else {
        // Expand
        contentField.textContent = item.content;
        expandToggle.setAttribute('data-expanded', 'true');
        expandToggle.innerHTML = '<i data-feather="chevron-up"></i>';
    }

    renderFeatherIcons();
}

/**
 * Handle expand/collapse for default components (learning objectives and struggle topics)
 */
function handleDefaultComponentToggleExpand(componentId: string): void {
    const card = document.querySelector(`[data-prompt-id="${componentId}"]`) as HTMLElement;
    if (!card) return;

    const expandToggle = card.querySelector('.expand-toggle') as HTMLElement;
    const contentField = card.querySelector('.prompt-content') as HTMLElement;

    if (!expandToggle || !contentField) return;

    const isExpanded = expandToggle.getAttribute('data-expanded') === 'true';

    // Get the full content based on component type
    let fullContent = '';
    if (componentId === DEFAULT_LEARNING_OBJECTIVES_ID) {
        fullContent = 'The following are ALL learning objectives for this course, organized by week/topic and subsection:\n\n\nWhen helping students, reference these learning objectives to ensure alignment with course goals.';
    } else if (componentId === DEFAULT_STRUGGLE_TOPICS_ID) {
        fullContent = `\n\n
===========================================
STRUGGLE TOPICS HANDLING
===========================================

Student struggles with the following topics:
[struggle_topics][struggleTopicsQuoted][/struggle_topics]

Before responding when struggle topics are discussed, verify:
☐ STOPPED using Socratic or guided-discovery questioning
☐ Providing direct, clear, step-by-step explanations
☐ Using concrete numerical examples
☐ Breaking concepts into simple, explicit steps
☐ Asked at MOST ONE follow-up question (simple understanding check, not Socratic)
☐ Chose SINGLE most relevant struggle topic from exact list above
☐ Did NOT use synonyms, related concepts, or variations - ONLY exact topic name

Example (correct usage):
You've explained the Nernst equation really well. Let's walk through a concrete example step by step using actual values so the relationship is clear.

===========================================
UNSTRUGGLE TOPICS HANDLING
===========================================

If you find <questionUnstruggle reveal="TRUE"> at the end of the response, then please add <questionUnstruggle Topic="topic"> to the end of the response, where the topic is the single most relevant struggle topic from the exact list above.

Before adding the <questionUnstruggle> tag, verify:
☐ The chosen topic is the single most relevant struggle topic from the exact list above.
☐ The chosen topic is not a synonym, related concept, or variation of the exact topic name.
☐ If the chat does not explicitly display <questionUnstruggle reveal="TRUE">, then do not add the <questionUnstruggle Topic="topic"> tag.
☐ Make sure you put the <questionUnstruggle Topic="topic"> tag at the end of the response.

Example:
User prompt: .....user prompt..... (with no struggle topic)
Assistant response: .....assistant response..... (with no struggle topic)

User prompt: .....user prompt...<questionUnstruggle reveal="TRUE">...
Assistant response: ...assistant response...
<questionUnstruggle Topic="thermodynamics"> `
;


    }

    if (isExpanded) {
        // Collapse
        contentField.textContent = truncateContent(fullContent, 3);
        expandToggle.setAttribute('data-expanded', 'false');
        expandToggle.innerHTML = '<i data-feather="chevron-down"></i>';
    } else {
        // Expand
        contentField.textContent = fullContent;
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
export function hasUnsavedSystemPromptChanges(): boolean {
    return editingItemId !== null || draftItem !== null;
}

/**
 * Reset unsaved changes flag
 */
export function resetUnsavedSystemPromptChanges(): void {
    editingItemId = null;
    draftItem = null;
}
