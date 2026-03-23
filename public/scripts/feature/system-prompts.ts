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

import { activeCourse, SystemPromptItem, DEFAULT_BASE_PROMPT_ID, DEFAULT_LEARNING_OBJECTIVES_ID, DEFAULT_STRUGGLE_TOPICS_ID, LearningObjective } from '../types.js';
import { renderFeatherIcons } from '../api/api.js';
import { showConfirmModal, showSimpleErrorModal, showErrorModal, openContentInputModal } from '../ui/modal-overlay.js';
import { DocumentUploadModule } from '../services/document-upload-module.js';
import { showSuccessToast, showErrorToast } from '../ui/toast-notification.js';

let currentCourse: activeCourse | null = null;
let items: SystemPromptItem[] = [];
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

    // console.log(`✅ [SYSTEM-PROMPTS] Initializing with courseId: ${course.id}`); // 🟢 MEDIUM: Course ID exposure

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
            // console.log(`✅ [SYSTEM-PROMPTS] Loaded ${items.length} items`);
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

    // Separate default components from custom items
    const basePrompt = items.find(item => item.componentType === 'base' || item.id === DEFAULT_BASE_PROMPT_ID);
    const learningObjectives = items.find(item => item.componentType === 'learning-objectives' || item.id === DEFAULT_LEARNING_OBJECTIVES_ID);
    const struggleTopics = items.find(item => item.componentType === 'struggle-topics' || item.id === DEFAULT_STRUGGLE_TOPICS_ID);
    const customItems = items.filter(item => item.componentType === 'custom');
    const itemsToRender = customItems;

    let html = '';

    // Render base system prompt
    if (basePrompt) {
        html += renderPromptCard(basePrompt);
    }

    // Render learning objectives component (always included default component)
    html += renderLearningObjectivesComponent();

    // Render struggle topics component (always included default component)
    html += renderStruggleTopicsComponent([]);

    // Render custom items
    itemsToRender.forEach(item => {
        html += renderPromptCard(item);
    });

    container.innerHTML = html;
    
    // Setup event listeners for each card
    itemsToRender.forEach(item => {
        setupCardEventListeners(item.id);
    });

    // Setup event listeners for base prompt (it's not in itemsToRender)
    if (basePrompt) {
        setupCardEventListeners(basePrompt.id);
    }

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

    // Debug logging - commented out for production security
    // console.log('Struggle Topics Debug:', {
    //     fullContentLength: fullContent.length,
    //     truncatedContentLength: truncatedContent.length,
    //     fullContentLines: fullContent.split('\n').length,
    //     truncatedContentLines: truncatedContent.split('\n').length,
    //     isTruncated,
    //     fullContent: fullContent.substring(0, 100) + '...',
    //     truncatedContent: truncatedContent.substring(0, 100) + '...'
    // }); // 🟢 MEDIUM: Debug data exposure

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
    const isDefault = item.isDefault || ['base', 'learning-objectives', 'struggle-topics'].includes(item.componentType || '');
    const isBase = item.componentType === 'base' || item.id === DEFAULT_BASE_PROMPT_ID;
    const isCustom = item.componentType === 'custom';
    const appendedClass = isAppended ? 'appended' : '';
    const appendedBadge = isAppended ? '<span class="appended-badge">Appended</span>' : '';
    const alwaysIncludedBadge = isDefault ? '<span class="always-included-badge">Always Included</span>' : '';

    const truncatedContent = truncateContent(item.content || '', 3);
    const isTruncated = (item.content || '').length > truncatedContent.length;
    const displayContent = isTruncated ? truncatedContent : (item.content || '');

    return `
        <div class="prompt-card ${appendedClass}" data-prompt-id="${item.id}">
            ${appendedBadge}
            ${alwaysIncludedBadge}
            <div class="prompt-header">
                <div class="prompt-title" data-field="title" data-prompt-id="${item.id}">
                    ${escapeHtml(item.title || 'Untitled')}
                </div>
            </div>
            <div class="prompt-content-wrapper">
                <div class="prompt-content" data-field="content" data-prompt-id="${item.id}">
                    ${escapeHtml(displayContent)}
                </div>
                ${isTruncated ? `
                    <button class="expand-toggle" data-prompt-id="${item.id}" data-expanded="false">
                        <i data-feather="chevron-down"></i>
                    </button>
                ` : ''}
            </div>
            <div class="prompt-actions">
                ${isBase || isCustom ? `
                    <button class="btn-edit" data-prompt-id="${item.id}">
                        <i data-feather="edit"></i>
                        <span>Edit</span>
                    </button>
                ` : ''}
                ${isCustom ? `
                    <button class="btn-delete" data-prompt-id="${item.id}">
                        <i data-feather="trash-2"></i>
                        <span>Delete</span>
                    </button>
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

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const isDefault = item.isDefault || ['base', 'learning-objectives', 'struggle-topics'].includes(item.componentType || '');

    const editBtn = card.querySelector('.btn-edit');
    if (editBtn) {
        editBtn.addEventListener('click', () => handleEditPrompt(itemId));
    }

    if (!isDefault) {
        const deleteBtn = card.querySelector('.btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeletePrompt(itemId));
        }
    }

    if (item.componentType === 'custom') {
        const appendBtn = card.querySelector('.btn-append');
        if (appendBtn) {
            appendBtn.addEventListener('click', () => handleToggleAppend(itemId, true));
        }

        const removeBtn = card.querySelector('.btn-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => handleToggleAppend(itemId, false));
        }
    }

    const expandToggle = card.querySelector('.expand-toggle');
    const isDefaultComponent = item.componentType === 'learning-objectives' || item.componentType === 'struggle-topics';
    if (expandToggle && !isDefaultComponent) {
        expandToggle.addEventListener('click', () => handleToggleExpand(itemId));
    }
}

/**
 * Handle adding a new system prompt item via shared content modal (file or text).
 */
function handleAddPrompt(): void {
    if (!currentCourse?.id) {
        showErrorToast('Course ID is missing. Please refresh the page.');
        return;
    }

    void openContentInputModal({
        title: 'Add system prompt item',
        initialMethod: 'text',
        allowEmptyText: true,
        strings: {
            nameLabel: 'Title',
            namePlaceholder: 'Prompt item title...',
            textLabel: 'Prompt text',
            textPlaceholder: 'Paste or type the system prompt text...',
            submitLabel: 'Submit',
            cancelLabel: 'Cancel'
        },
        loadingContent: {
            title: 'Saving',
            line1: 'Creating your prompt item...',
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
            const response = await fetch(`/api/courses/${currentCourse!.id}/system-prompts`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: content.trim() })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to create prompt item');
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to create prompt item');
            }
            await loadSystemPrompts();
            renderPrompts();
            showSuccessToast('Prompt item created successfully!');
            return { success: true, skipSuccessModal: true };
        }
    });
}

/**
 * Handle editing a prompt via content modal (base or custom)
 * @param itemId - The item ID
 */
function handleEditPrompt(itemId: string): void {
    if (!currentCourse?.id) {
        showErrorToast('Course ID is missing. Please refresh the page.');
        return;
    }
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const isBase = item.componentType === 'base' || item.id === DEFAULT_BASE_PROMPT_ID;
    const isCustom = item.componentType === 'custom';
    if (!isBase && !isCustom) return;

    void openContentInputModal({
        mode: 'edit',
        title: isBase ? 'Edit base system prompt' : 'Edit system prompt item',
        initialMethod: 'text',
        initialValues: {
            title: item.title || '',
            text: item.content || '',
            method: 'text'
        },
        allowEmptyText: true,
        strings: {
            nameLabel: 'Title',
            namePlaceholder: 'Prompt title...',
            textLabel: 'Prompt text',
            textPlaceholder: 'Paste or type the system prompt text...',
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
            const response = await fetch(`/api/courses/${currentCourse!.id}/system-prompts/${itemId}`, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content: content.trim() })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to update prompt item');
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to update prompt item');
            }
            await loadSystemPrompts();
            renderPrompts();
            showSuccessToast('Prompt updated successfully!');
            return { success: true, skipSuccessModal: true };
        }
    });
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
    return false;
}

/**
 * Reset unsaved changes flag
 */
export function resetUnsavedSystemPromptChanges(): void {
    /* Prompt edits use modal; no page-level draft state */
}
