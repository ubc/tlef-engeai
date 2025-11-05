

/**
 * This file contains the functions for the documents page.
 * 
 * @author: @gatahcha
 * @date: 2025-08-25
 * @version: 1.0.0
 * @description: This file contains the functions for the documents page.
 * 
 * @param currentClass the currently active class
 * @returns null
 */

/**
 * This file contains the functions for the documents page.
 * 
 * @param currentClass the currently active class
 * @returns null
 */

import { 
    ContentDivision, 
    courseItem, 
    AdditionalMaterial, 
    activeCourse 
} from '../../../src/functions/types';
import { uploadRAGContent } from '../services/RAGService.js';
import { DocumentUploadModule, UploadResult } from '../services/DocumentUploadModule.js';
import { showConfirmModal, openUploadModal, showSimpleErrorModal, showDeleteConfirmationModal, showUploadLoadingModal, showInputModal, showSuccessModal, showErrorModal, showTitleUpdateLoadingModal, closeModal } from '../modal-overlay.js';
import { renderFeatherIcons } from '../functions/api.js';

// In-memory store for the course data
let courseData: ContentDivision[] = [];

// Function to initialize the documents page
export async function initializeDocumentsPage( currentClass : activeCourse) {

        // Sync from server so refresh reflects latest divisions/items
        await syncCourseFromServer();
        // Build initial in-memory data (prefers server divisions)
        loadClassroomData(currentClass);
        
        // Update button labels based on frameType
        updateDivisionButtonLabels(currentClass);
        
        // Load learning objectives from database for all content items
        await loadAllLearningObjectives();
    // Render DOM using safe DOM APIs (no string concatenation)
    renderDocumentsPage();
    setupEventListeners();

    /**
     * Generate initial data based according to the currentClass
     * 
     * @param currentClass the currently active class
     */
    function loadClassroomData( currentClass : activeCourse ) {
        // If server provided divisions, trust them completely
        if (currentClass.divisions && currentClass.divisions.length > 0) {
            courseData = currentClass.divisions;
            return;
        }

        // Fallback to generating defaults based on tilesNumber when no divisions are present
        const total = currentClass.tilesNumber;
        courseData = [];
        for (let i = 0; i < total; i++) {
            const defaultDivision: ContentDivision = {
                id: String(i + 1),
                date: new Date(),
                title: currentClass.frameType === 'byWeek' ? `Week ${i + 1}` : `Topic ${i + 1}`,
                courseName: currentClass.courseName,
                published: false,
                items: [
                    {
                        id: String(i + 1),
                        date: new Date(),
                        title: currentClass.frameType === 'byWeek' ? `Lecture ${i + 1}` : `Session ${i + 1}`,
                        courseName: currentClass.courseName,
                        divisionTitle: currentClass.frameType === 'byWeek' ? `Week ${i + 1}` : `Topic ${i + 1}`,
                        itemTitle: currentClass.frameType === 'byWeek' ? `Lecture ${i + 1}` : `Session ${i + 1}`,
                        learningObjectives: [],
                        additionalMaterials: [],
                        completed: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            courseData.push(defaultDivision);
        }
    }

    async function syncCourseFromServer(): Promise<void> {
        try {
            if (!currentClass || !currentClass.id) return;
            const res = await fetch(`/api/courses/${currentClass.id}`);
            if (!res.ok) {
                console.warn('⚠️ Failed to fetch latest course from server:', res.status, res.statusText);
                return;
            }
            const payload = await res.json();
            if (payload && payload.success && payload.data) {
                const course = payload.data;
                // Update currentClass with latest divisions count and data
                currentClass.divisions = course.divisions || currentClass.divisions;
                currentClass.tilesNumber = (course.divisions && course.divisions.length) ? course.divisions.length : currentClass.tilesNumber;
            }
        } catch (e) {
            console.warn('⚠️ Exception fetching latest course:', e);
        }
    }

    /**
     * Render the documentPage
     * 
     * @returns null
     */
    function renderDocumentsPage() {
        const container = document.getElementById('documents-container');
        if (!container) return;

        //return; //for debugging purposes, do not change this line

        // Clear existing children
        while (container.firstChild) container.removeChild(container.firstChild);

        // Append each division element
        courseData.forEach((division) => {
            const el = createDivisionElement(division);
            container.appendChild(el);
        });
        
        // Render feather icons (including rename icons)
        renderFeatherIcons();
    }

    /**
     * Create a division (week/topic) section element
     * 
     * @param division the division to create an element for
     * @returns the created element
     */
    function createDivisionElement(division: ContentDivision): HTMLElement {

        // create the wrapper for the division
        const wrapper = document.createElement('div');
        wrapper.className = 'content-session';

        // create the header for the division
        const header = document.createElement('div');
        header.className = 'week-header';
        header.setAttribute('data-division', division.id);
        // Layout: make header a flexible row so left area can grow
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';

        // create the left side of the header
        // display the title and the completed status of the division
        const left = document.createElement('div');
        // Left grows, prevents overflow clipping
        left.style.flex = '1 1 auto';
        left.style.minWidth = '0';
        const title = document.createElement('div');
        title.className = 'week-title';
        // Title row as flex so input and buttons align and expand nicely
        title.style.display = 'flex';
        title.style.alignItems = 'center';
        title.style.gap = '8px';
        
        // Create title text span
        const titleText = document.createElement('span');
        titleText.textContent = division.title;
        title.appendChild(titleText);
        
        // Create rename icon (handled via delegated listener in setupEventListeners)
        const renameIcon = document.createElement('i');
        renameIcon.setAttribute('data-feather', 'edit-2');
        renameIcon.className = 'rename-icon';
        renameIcon.setAttribute('data-division-id', division.id);
        renameIcon.style.cursor = 'pointer';
        renameIcon.style.marginLeft = '8px';
        renameIcon.style.width = '16px';
        renameIcon.style.height = '16px';
        title.appendChild(renameIcon);
        
        const status = document.createElement('div');
        status.className = 'completion-status';

        const sectionsCompleted = division.items.filter(c=> c.completed).length;
        const totalSections = division.items.length;
        status.textContent = `${sectionsCompleted} / ${totalSections} Sections completed`;
        left.appendChild(title);
        left.appendChild(status);

        // create the right side of the header (add session, publish toggle/status, then expand arrow)
        const right = document.createElement('div');
        right.className = 'week-status';
        // Right side does not grow
        right.style.flex = '0 0 auto';

        // Add Session badge/button
        const addSessionBadge = document.createElement('div');
        addSessionBadge.className = 'content-status status-add-session';
        addSessionBadge.textContent = 'Add Section';
        // Prevent header toggle when clicking Add Section
        addSessionBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            addSection(division);
        });

        // Toggle switch
        const toggleWrap = document.createElement('label');
        toggleWrap.className = 'toggle-switch';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = !!division.published;
        toggleInput.setAttribute('aria-label', `Toggle publish status for ${division.title}`);
        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'toggle-slider';
        toggleWrap.appendChild(toggleInput);
        toggleWrap.appendChild(toggleSlider);

        // Published status
        const statusBadge = document.createElement('div');
        const isPublished = !!division.published;
        statusBadge.className = `content-status ${isPublished ? 'status-published' : 'status-draft'}`;
        statusBadge.textContent = isPublished ? 'Published' : 'Draft';

        // Expand icon (arrow)
        const expandIcon = document.createElement('div');
        expandIcon.className = 'expand-icon';
        expandIcon.id = `icon-${division.id}`;
        expandIcon.textContent = '▼';

        // Wire toggle behaviour (update in-memory state, badge, and persist to backend)
        toggleInput.addEventListener('change', async (e) => {
            const checked = (e.currentTarget as HTMLInputElement).checked;
            const originalChecked = !checked; // Store original state for error rollback
            
            // Optimistically update UI
            division.published = checked;
            statusBadge.className = `content-status ${checked ? 'status-published' : 'status-draft'}`;
            statusBadge.textContent = checked ? 'Published' : 'Draft';
            
            // Persist to backend
            try {
                if (!currentClass || !currentClass.id) {
                    throw new Error('Current class not found');
                }
                
                const response = await fetch(`/api/courses/${currentClass.id}/divisions/${division.id}/published`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        published: checked
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to update published status: ${response.statusText}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    // Update local data with backend response
                    if (result.data) {
                        division.published = result.data.published;
                    }
                    console.log(`✅ Division ${division.id} published status updated to ${checked}`);
                } else {
                    throw new Error(result.error || 'Failed to update published status');
                }
            } catch (error) {
                // Revert UI on error
                console.error('Error updating published status:', error);
                toggleInput.checked = originalChecked;
                division.published = originalChecked;
                statusBadge.className = `content-status ${originalChecked ? 'status-published' : 'status-draft'}`;
                statusBadge.textContent = originalChecked ? 'Published' : 'Draft';
                
                // Show error modal
                const errorMessage = error instanceof Error ? error.message : 'Failed to update published status. Please try again.';
                await showSimpleErrorModal(errorMessage, 'Update Published Status Error');
            }
        });

        right.appendChild(addSessionBadge);
        right.appendChild(statusBadge);
        right.appendChild(toggleWrap);
        right.appendChild(expandIcon);

        // append the left and right sides to the header
        header.appendChild(left);
        header.appendChild(right);

        // create the content for the division
        const contentEl = document.createElement('div');
        contentEl.className = 'division-content';
        contentEl.id = `content-division-${division.id}`;

        //TODO: append all the content of the division.
        division.items.forEach((content) => {
            const item = buildContentItemDOM(division.id, content);
            contentEl.appendChild(item);
        });


        // append the header and the content to the wrapper
        wrapper.appendChild(header);
        wrapper.appendChild(contentEl);
        return wrapper;
    }


    /**
     * Update division control panel button labels based on frameType
     * 
     * @param currentClass the currently active class
     */
    function updateDivisionButtonLabels(currentClass: activeCourse): void {
        // Get references to the control panel buttons
        const addDivisionBtn = document.getElementById('add-division-btn');
        const deleteAllDivisionsBtn = document.getElementById('delete-all-divisions-btn');
        
        // Update button text based on frameType
        if (currentClass.frameType === 'byWeek') {
            if (addDivisionBtn) {
                addDivisionBtn.textContent = 'Add Week';
            }
            if (deleteAllDivisionsBtn) {
                deleteAllDivisionsBtn.textContent = 'Delete All Weeks';
            }
        } else if (currentClass.frameType === 'byTopic') {
            if (addDivisionBtn) {
                addDivisionBtn.textContent = 'Add Topic';
            }
            if (deleteAllDivisionsBtn) {
                deleteAllDivisionsBtn.textContent = 'Delete All Topics';
            }
        }
    }

    /**
     * Setup all event listeners for the page (delegated, with safety checks)
     * 
     * @returns null    
     */
    function setupEventListeners() {
        const container = document.getElementById('documents-container');
        if (!container) return;

        // Remove any existing event listeners to prevent accumulation
        const existingHandler = (container as any)._documentsClickHandler;
        if (existingHandler) {
            container.removeEventListener('click', existingHandler);
            console.log('🔧 Removed existing documents click handler');
        }

        // Create the click handler function
        const clickHandler = (event: Event) => {
            const target = event.target as HTMLElement;
            
            // PRIORITY: Handle inline edit controls BEFORE any header toggles
            // a) Pen icon (rename)
            const earlyRenameIcon = target.closest('.rename-icon') as HTMLElement | null;
            if (earlyRenameIcon) {
                event.stopPropagation();
                let divisionId = earlyRenameIcon.getAttribute('data-division-id') || '';
                let itemId = earlyRenameIcon.getAttribute('data-item-id') || '';

                // Derive from nearest containers if attributes are missing (feather replacement case)
                const contentItem = earlyRenameIcon.closest('.content-item') as HTMLElement | null;
                if (contentItem) {
                    const ids = contentItem.id.split('-'); // content-item-divisionId-contentId
                    if (!divisionId && ids[2]) divisionId = ids[2];
                    if (!itemId && ids[3]) itemId = ids[3];
                }
                if (!divisionId) {
                    const header = earlyRenameIcon.closest('.week-header') as HTMLElement | null;
                    if (header) divisionId = header.getAttribute('data-division') || '';
                }
                if (!divisionId) return;

                if (itemId) {
                    const division = courseData.find(d => d.id === divisionId);
                    const item = division?.items.find(i => i.id === itemId);
                    if (item) enterEditMode(divisionId, itemId, item.title);
                } else {
                    const division = courseData.find(d => d.id === divisionId);
                    if (division) enterEditMode(divisionId, null, division.title);
                }
                return; // Avoid header toggle
            }

            // b) OK button during edit
            const earlyOk = target.closest('.edit-ok-button') as HTMLElement | null;
            if (earlyOk) {
                event.stopPropagation();
                const contentItem = earlyOk.closest('.content-item') as HTMLElement | null;
                if (contentItem) {
                    const ids = contentItem.id.split('-');
                    const divisionId = ids[2] || '0';
                    const itemId = ids[3] || '0';
                    const input = contentItem.querySelector('.title-edit-input') as HTMLInputElement | null;
                    if (!input) return;
                    const newTitle = input.value.trim();
                    if (!newTitle) { showErrorModal('Validation Error', 'Section name cannot be empty.'); return; }
                    if (newTitle.length > 100) { showErrorModal('Validation Error', 'Section name is too long (max 100 characters).'); return; }
                    saveTitleChange(divisionId, itemId, newTitle);
                } else {
                    const header = earlyOk.closest('.week-header') as HTMLElement | null;
                    if (!header) return;
                    const divisionId = header.getAttribute('data-division') || '0';
                    const titleWrap = header.querySelector('.week-title') as HTMLElement | null;
                    const input = titleWrap?.querySelector('.title-edit-input') as HTMLInputElement | null;
                    if (!input) return;
                    const newTitle = input.value.trim();
                    if (!newTitle) { showErrorModal('Validation Error', 'Division name cannot be empty.'); return; }
                    if (newTitle.length > 100) { showErrorModal('Validation Error', 'Division name is too long (max 100 characters).'); return; }
                    saveTitleChange(divisionId, null, newTitle);
                }
                return; // Avoid header toggle
            }

            // c) Cancel button during edit
            const earlyCancel = target.closest('.edit-cancel-button') as HTMLElement | null;
            if (earlyCancel) {
                event.stopPropagation();
                const contentItem = earlyCancel.closest('.content-item') as HTMLElement | null;
                if (contentItem) {
                    const ids = contentItem.id.split('-');
                    const divisionId = ids[2] || '0';
                    const itemId = ids[3] || '0';
                    const division = courseData.find(d => d.id === divisionId);
                    const item = division?.items.find(i => i.id === itemId);
                    if (division && item) exitEditMode(divisionId, itemId, item.title);
                } else {
                    const header = earlyCancel.closest('.week-header') as HTMLElement | null;
                    if (!header) return;
                    const divisionId = header.getAttribute('data-division') || '0';
                    const division = courseData.find(d => d.id === divisionId);
                    if (division) exitEditMode(divisionId, null, division.title);
                }
                return; // Avoid header toggle
            }

            // Division header toggles
            const divisionHeader = target.closest('.week-header') as HTMLElement | null;
            if (divisionHeader) {
                const divisionId = divisionHeader.getAttribute('data-division') || '0';
                if (!divisionId) return;
                console.log('🔍 DIVISION CLICKED - Division ID:', divisionId);
                toggleDivision(divisionId);
                return;
            }

            // Objectives accordion toggles
            const objectivesHeader = target.closest('.objectives-header') as HTMLElement | null;
            if (objectivesHeader) {
                const divisionId = objectivesHeader.getAttribute('data-division') || '0';
                const contentId = objectivesHeader.getAttribute('data-content') || '0';
                if (!divisionId || !contentId) return;
                toggleObjectives(divisionId, contentId);
                return;
            }

            // Handle delete section clicks FIRST (before other button handling)
            const deleteSectionElement = target.closest('.status-delete-section') as HTMLElement | null;
            if (deleteSectionElement && deleteSectionElement.dataset.action === 'delete-section') {
                event.stopPropagation();
                //START DEBUG LOG : DEBUG-CODE(014)
                console.log('🗑️ Delete section clicked via event delegation');
                //END DEBUG LOG : DEBUG-CODE(014)
                const sectionDivisionId = deleteSectionElement.dataset.divisionId || '0';
                const sectionContentId = deleteSectionElement.dataset.contentId || '0';
                deleteSection(sectionDivisionId, sectionContentId);
                return; // Prevent further event handling
            }

        // Handle rename/edit buttons FIRST (before header clicks)
        // 1) Rename icon click (pen)
        const renameIconEl = target.closest('.rename-icon') as HTMLElement | null;
        if (renameIconEl) {
            event.stopPropagation();
            // Attributes on icon may be lost after feather replacement; derive robustly
            let divisionId = renameIconEl.getAttribute('data-division-id') || '';
            let itemId = renameIconEl.getAttribute('data-item-id') || '';

            // Try to derive from nearest content item if missing
            const contentItem = renameIconEl.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                const ids = contentItem.id.split('-'); // content-item-divisionId-contentId
                if (!divisionId && ids[2]) divisionId = ids[2];
                if (!itemId && ids[3]) itemId = ids[3];
            }

            // For division header, derive from closest week-header
            if (!divisionId) {
                const header = renameIconEl.closest('.week-header') as HTMLElement | null;
                if (header) {
                    divisionId = header.getAttribute('data-division') || '';
                }
            }

            if (!divisionId) return;

            if (itemId) {
                // Item title edit
                const division = courseData.find(d => d.id === divisionId);
                const item = division?.items.find(i => i.id === itemId);
                if (item) {
                    enterEditMode(divisionId, itemId, item.title);
                }
            } else {
                // Division title edit
                const division = courseData.find(d => d.id === divisionId);
                if (division) {
                    enterEditMode(divisionId, null, division.title);
                }
            }
            return; // Prevent header toggle
        }

        // 2) OK button (check) during edit mode
        const okButtonEl = target.closest('.edit-ok-button') as HTMLElement | null;
        if (okButtonEl) {
            event.stopPropagation();
            // Determine context (division vs item) via closest containers
            const contentItem = okButtonEl.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                // Item OK
                const ids = contentItem.id.split('-'); // content-item-divisionId-contentId
                const divisionId = ids[2] || '0';
                const itemId = ids[3] || '0';
                const input = contentItem.querySelector('.title-edit-input') as HTMLInputElement | null;
                if (!input) return;
                const newTitle = input.value.trim();
                if (!newTitle) { showErrorModal('Validation Error', 'Section name cannot be empty.'); return; }
                if (newTitle.length > 100) { showErrorModal('Validation Error', 'Section name is too long (max 100 characters).'); return; }
                saveTitleChange(divisionId, itemId, newTitle);
            } else {
                // Division OK
                const header = okButtonEl.closest('.week-header') as HTMLElement | null;
                if (!header) return;
                const divisionId = header.getAttribute('data-division') || '0';
                const titleWrap = header.querySelector('.week-title') as HTMLElement | null;
                const input = titleWrap?.querySelector('.title-edit-input') as HTMLInputElement | null;
                if (!input) return;
                const newTitle = input.value.trim();
                if (!newTitle) { showErrorModal('Validation Error', 'Division name cannot be empty.'); return; }
                if (newTitle.length > 100) { showErrorModal('Validation Error', 'Division name is too long (max 100 characters).'); return; }
                saveTitleChange(divisionId, null, newTitle);
            }
            return; // Prevent header toggle
        }

        // 3) Cancel button (x) during edit mode
        const cancelButtonEl = target.closest('.edit-cancel-button') as HTMLElement | null;
        if (cancelButtonEl) {
            event.stopPropagation();
            const contentItem = cancelButtonEl.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                const ids = contentItem.id.split('-');
                const divisionId = ids[2] || '0';
                const itemId = ids[3] || '0';
                const division = courseData.find(d => d.id === divisionId);
                const item = division?.items.find(i => i.id === itemId);
                if (division && item) {
                    exitEditMode(divisionId, itemId, item.title);
                }
            } else {
                const header = cancelButtonEl.closest('.week-header') as HTMLElement | null;
                if (!header) return;
                const divisionId = header.getAttribute('data-division') || '0';
                const division = courseData.find(d => d.id === divisionId);
                if (division) {
                    exitEditMode(divisionId, null, division.title);
                }
            }
            return; // Prevent header toggle
        }

        // Handle actions on buttons FIRST (before header clicks)
            const button = target.closest('button') as HTMLButtonElement | null;
            if (button) {
                const action = button.dataset.action;
                if (action) {
                    const objectiveItem = button.closest('.objective-item');
                    const headerElement = objectiveItem?.querySelector('.objective-header') as HTMLElement | null;
                    const divisionId = button.dataset.week || headerElement?.dataset.division || '0';
                    const contentId = button.dataset.content || headerElement?.dataset.content || '0';
                    const objectiveIndex = parseInt(headerElement?.dataset.objective || '-1', 10);

                    switch (action) {
                        case 'add':
                            addObjective(divisionId, contentId);
                            return; // Prevent further event handling
                        case 'edit':
                            event.stopPropagation();
                            editObjective(divisionId, contentId, objectiveIndex);
                            return; // Prevent further event handling
                        case 'delete':
                            event.stopPropagation();
                            deleteObjective(divisionId, contentId, objectiveIndex);
                            return; // Prevent further event handling
                        case 'save':
                            event.stopPropagation();
                            saveObjective(divisionId, contentId, objectiveIndex);
                            return; // Prevent further event handling
                        case 'cancel':
                            event.stopPropagation();
                            cancelEdit(divisionId, contentId);
                            return; // Prevent further event handling
                        case 'delete-material':
                            event.stopPropagation();
                            // For additional materials, get IDs from the content item container
                            const additionalMaterialRow = button.closest('.additional-material') as HTMLElement | null;
                            const contentItem = button.closest('.content-item') as HTMLElement | null;
                            if (!contentItem) return;
                            
                            const contentItemId = contentItem.id; // content-item-divisionId-contentId
                            const ids = contentItemId.split('-'); // ['content', 'item', 'divisionId', 'contentId']
                            const materialDivisionId = ids[2] || '0';
                            const materialContentId = ids[3] || '0';
                            
                            console.log('DEBUG #13: divisionId : ', materialDivisionId, ' ; contentId : ', materialContentId, ' ; materialId : ', button.dataset.materialId);
                            deleteAdditionalMaterial(materialDivisionId, materialContentId, button.dataset.materialId || '');
                            return; // Prevent further event handling
                    }
                }
            }

            // Individual objective item toggles
            const objectiveHeader = target.closest('.objective-header') as HTMLElement | null;
            if (objectiveHeader) {
                const divisionId = objectiveHeader.getAttribute('data-division') || '0';
                const contentId = objectiveHeader.getAttribute('data-content') || '0';
                const objectiveIndex = parseInt(objectiveHeader.getAttribute('data-objective') || '-1', 10);
                if (!divisionId || !contentId || objectiveIndex < 0) return;
                toggleObjectiveItem(divisionId, contentId, objectiveIndex);
                return;
            }
            
            // Upload area -> open modal
            const uploadArea = target.closest('.upload-area');
            if (uploadArea) {
                const contentItem = uploadArea.closest('.content-item') as HTMLElement | null;
                if (!contentItem) return;
                const ids = contentItem.id.split('-'); // content-item-divisionId-contentId
                const divisionId = ids[2] || '0';
                const contentId = ids[3] || '0';
                if (!divisionId || !contentId) return;
                console.log('🔍 UPLOAD AREA CLICKED - Division ID:', divisionId, 'Item ID:', contentId);
                openUploadModal(divisionId, contentId, handleUploadMaterial);
                    return;
            }

            // Content item click -> log item info
            const contentItem = target.closest('.content-item') as HTMLElement | null;
            if (contentItem) {
                const ids = contentItem.id.split('-'); // content-item-divisionId-contentId
                const divisionId = ids[2] || '0';
                const contentId = ids[3] || '0';
                if (!divisionId || !contentId) return;
                console.log('🔍 ITEM CLICKED - Division ID:', divisionId, 'Item ID:', contentId);
                return;
            }
        };

        // Store the handler reference and add the event listener
        (container as any)._documentsClickHandler = clickHandler;
        container.addEventListener('click', clickHandler);
        console.log('🔧 Added documents click handler');
    }

    // ----- Divisions (Week/Topic) management -----
    async function addDivision(): Promise<void> {
        try {
            if (!currentClass) {
                console.error('❌ No current class found for adding division');
                return;
            }

            // Compute next numeric id (server will compute as well; client uses server response)
            const existingNumericIds = courseData
                .map(d => parseInt(d.id, 10))
                .filter(n => !Number.isNaN(n));
            const nextIdNum = (existingNumericIds.length ? Math.max(...existingNumericIds) : 0) + 1;

            console.log('📡 Making API call to add division...');
            console.log('🌐 API URL:', `/api/courses/${currentClass.id}/divisions`);

            const response = await fetch(`/api/courses/${currentClass.id}/divisions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                // Send optional title; server may override to ensure consistency
                body: JSON.stringify({
                    title: currentClass.frameType === 'byWeek' ? `Week ${nextIdNum}` : `Topic ${nextIdNum}`
                })
            });

            console.log('📡 Add Division API Response status:', response.status, response.statusText);

            // Handle unauthorized gracefully
            if (response.status === 401 || response.status === 403) {
                await showSimpleErrorModal('You are not authorized to add divisions. Please sign in as an instructor.', 'Authorization Error');
                return;
            }

            const result = await response.json();
            console.log('📡 Add Division API Response body:', result);

            if (!result.success) {
                await showSimpleErrorModal('Failed to add division: ' + (result.error || 'Unknown error'), 'Add Division Error');
                return;
            }

            const createdDivision: ContentDivision = result.data;

            // Update local state
            courseData.push(createdDivision);

            // Append to DOM
            const container = document.getElementById('documents-container');
            if (container) {
                const el = createDivisionElement(createdDivision);
                container.appendChild(el);
                // Re-render icons for newly added elements
                renderFeatherIcons();
            }

            // Update control panel labels (if frame type-dependent)
            updateDivisionButtonLabels(currentClass);

            console.log('✅ Division added successfully');
        } catch (error) {
            console.error('❌ Exception caught while adding division:', error);
            await showSimpleErrorModal('An error occurred while adding the division. Please try again.', 'Add Division Error');
        }
    }

    // Add event listener for delete all documents button
    const deleteAllDocumentsBtn = document.getElementById('delete-all-documents-btn');
    if (deleteAllDocumentsBtn) {
        // Remove any existing event listeners to prevent accumulation
        const existingDeleteHandler = (deleteAllDocumentsBtn as any)._deleteAllHandler;
        if (existingDeleteHandler) {
            deleteAllDocumentsBtn.removeEventListener('click', existingDeleteHandler);
            console.log('🔧 Removed existing delete all documents handler');
        }

        // Create the delete handler function
        const deleteHandler = async () => {
            await deleteAllDocuments();
        };

        // Store the handler reference and add the event listener
        (deleteAllDocumentsBtn as any)._deleteAllHandler = deleteHandler;
        deleteAllDocumentsBtn.addEventListener('click', deleteHandler);
        console.log('🔧 Added delete all documents handler');
    }

    // Add event listener for nuclear clear button
    const nuclearClearBtn = document.getElementById('nuclear-clear-btn');
    if (nuclearClearBtn) {
        // Remove any existing event listeners to prevent accumulation
        const existingNuclearHandler = (nuclearClearBtn as any)._nuclearHandler;
        if (existingNuclearHandler) {
            nuclearClearBtn.removeEventListener('click', existingNuclearHandler);
            console.log('🔧 Removed existing nuclear clear handler');
        }

        // Create the nuclear clear handler function
        const nuclearHandler = async () => {
            await nuclearClearDocuments();
        };

        // Store the handler reference and add the event listener
        (nuclearClearBtn as any)._nuclearHandler = nuclearHandler;
        nuclearClearBtn.addEventListener('click', nuclearHandler);
        console.log('🔧 Added nuclear clear handler');
    }

    // Add event listener for add division (Week/Topic) button
    const addDivisionBtn = document.getElementById('add-division-btn');
    if (addDivisionBtn) {
        const existingAddDivisionHandler = (addDivisionBtn as any)._addDivisionHandler;
        if (existingAddDivisionHandler) {
            addDivisionBtn.removeEventListener('click', existingAddDivisionHandler);
            console.log('🔧 Removed existing add division handler');
        }

        const addDivisionHandler = async () => {
            await addDivision();
        };

        (addDivisionBtn as any)._addDivisionHandler = addDivisionHandler;
        addDivisionBtn.addEventListener('click', addDivisionHandler);
        console.log('🔧 Added add division handler');
    }

    // --- Event Handler Functions ---

    /**
     * Handles the upload of additional materials using DocumentUploadModule
     * 
     * @param material - The material object from the upload modal
     * @returns Promise<void>
     */
    async function handleUploadMaterial(material: any): Promise<void> {
        console.log('🔍 HANDLE UPLOAD MATERIAL CALLED - FUNCTION STARTED');
        console.log('  - material:', material);
        console.log('  - material.divisionId:', material.divisionId);
        console.log('  - material.itemId:', material.itemId);
        console.log('  - courseData:', courseData);
        console.log('  - currentClass:', currentClass);
        
        try {
            // Get the division and the content item
            const division = courseData.find(d => d.id === material.divisionId);
            console.log('  - division found:', !!division);
            
            const contentItem = division?.items.find(c => c.id === material.itemId);
            console.log('  - contentItem found:', !!contentItem);
            
            if (!contentItem) {
                console.error('❌ Content item not found for itemId:', material.itemId);
                alert('Content item not found. Please try again.');
                return;
            }
            if (!contentItem.additionalMaterials) contentItem.additionalMaterials = [];

            // Create the additional material object
            const additionalMaterial: AdditionalMaterial = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: material.name,
                courseName: currentClass.courseName,
                divisionTitle: division?.title || 'Unknown Content',
                itemTitle: contentItem.title,
                sourceType: material.sourceType,
                file: material.file,
                text: material.text,
                fileName: material.fileName,
                date: new Date(),
                // Add these three lines:
    courseId: currentClass.id,
    divisionId: material.divisionId,
    itemId: material.itemId
            };

            console.log('🔍 CREATING DOCUMENT UPLOAD MODULE');
            console.log('  - additionalMaterial:', additionalMaterial);
            
            // Use DocumentUploadModule for upload
            const uploadModule = new DocumentUploadModule((progress, stage) => {
                console.log(`Upload progress: ${progress}% - ${stage}`);
                // You could update a progress bar here if needed
            });

            console.log('🔍 CALLING UPLOAD MODULE.uploadDocument');
            const uploadResult: UploadResult = await uploadModule.uploadDocument(additionalMaterial);
            console.log('🔍 UPLOAD RESULT:', uploadResult);
            
            if (!uploadResult.success) {
                console.error(`Upload failed: ${uploadResult.error}`);
                alert(`Failed to upload content: ${uploadResult.error}`);
                return;
            }

            if (!uploadResult.document) {
                console.error('Upload succeeded but no document returned');
                alert('Upload succeeded but no document was returned. Please try again.');
                return;
            }

            // Add the uploaded document to the content item
            contentItem.additionalMaterials.push(uploadResult.document);

            // Refresh the content item
            refreshContentItem(material.divisionId, material.itemId);

            console.log('Material uploaded successfully:', uploadResult.document);
            console.log(`Generated ${uploadResult.chunksGenerated} chunks in Qdrant`);
            alert(`Document uploaded successfully! Generated ${uploadResult.chunksGenerated} searchable chunks.`);
            
        } catch (error) {
            console.error('Error in upload process:', error);
            alert('An error occurred during upload. Please try again.');
        }
    }

    /**
     * Toggle the expansion state of a division
     * 
     * @param divisionId the id of the division to toggle
     * @returns null
     */
    function toggleDivision(divisionId: string) {
        const content = document.getElementById(`content-division-${divisionId}`);
        const icon = document.getElementById(`icon-${divisionId}`);
        if (!content || !icon) return;
            content.classList.toggle('expanded');
            icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    /**
     * Toggle the expansion state of the objectives for a content item
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns null
     */
    function toggleObjectives(divisionId: string, contentId: string) {
        const content = document.getElementById(`objectives-${divisionId}-${contentId}`);
        const icon = document.getElementById(`obj-icon-${divisionId}-${contentId}`);
        if (!content || !icon) return;
            content.classList.toggle('expanded');
            icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    /**
     * Toggle the expansion state of an objective item
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    function toggleObjectiveItem(divisionId: string, contentId: string, index: number) {
        const content = document.getElementById(`objective-content-${divisionId}-${contentId}-${index}`);
        const icon = document.getElementById(`item-icon-${divisionId}-${contentId}-${index}`);
        if (!content || !icon) return;
            content.classList.toggle('expanded');
            icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    /**
     * Load learning objectives from database for all content items
     * 
     * @returns Promise<void>
     */
    async function loadAllLearningObjectives(): Promise<void> {
        if (!currentClass) return;

        try {
            // Load learning objectives for each division and content item
            for (const division of courseData) {
                for (const contentItem of division.items) {
                    await loadLearningObjectives(division.id, contentItem.id);
                }
            }
        } catch (error) {
            console.error('Error loading all learning objectives:', error);
        }
    }

    /**
     * Load learning objectives from database for a specific content item
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns Promise<void>
     */
    async function loadLearningObjectives(divisionId: string, contentId: string): Promise<void> {
        if (!currentClass) return;

        try {
            const response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives`, {
                method: 'GET'
            });
            const result = await response.json();
            
            if (result.success) {
                // Find the division and content item
                const division = courseData.find(d => d.id === divisionId);
                const content = division?.items.find(c => c.id === contentId);
                
                if (content) {
                    // Update the learning objectives in local data
                    content.learningObjectives = result.data || [];
                    // Refresh the UI
                    refreshContentItem(divisionId, contentId);
                }
            } else {
                console.error('Failed to load learning objectives:', result.error);
                await showSimpleErrorModal('Failed to load learning objectives: ' + result.error, 'Load Learning Objectives Error');
            }
        } catch (error) {
            console.error('Error loading learning objectives:', error);
            await showSimpleErrorModal('An error occurred while loading learning objectives. Please try again.', 'Load Learning Objectives Error');
        }
    }

    /**
     * Add a new objective to a content item
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns null
     */
    async function addObjective(divisionId: string, contentId: string) {
        //START DEBUG LOG : DEBUG-CODE(015)
        console.log('🎯 addObjective called with divisionId:', divisionId, 'contentId:', contentId);
        console.log('🔍 Current class available:', !!currentClass);
        console.log('🔍 Current class ID:', currentClass?.id);
        console.log('🔍 Current class name:', currentClass?.courseName);
        //END DEBUG LOG : DEBUG-CODE(015)
        
        const objectiveInput = document.getElementById(`new-title-${divisionId}-${contentId}`) as HTMLInputElement | null;
        if (!objectiveInput) {
            //START DEBUG LOG : DEBUG-CODE(016)
            console.error('❌ Objective input element not found for divisionId:', divisionId, 'contentId:', contentId);
            //END DEBUG LOG : DEBUG-CODE(016)
            return;
        }

        // get the learning objective from the input field
        const learningObjective = objectiveInput.value.trim();
        if (!learningObjective) {
            alert('Please fill in the learning objective.');
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(017)
        console.log('📝 Learning objective text:', learningObjective);
        //END DEBUG LOG : DEBUG-CODE(017)

        // find the division and the content item
        const division = courseData.find(d => d.id === divisionId);
        const content = division?.items.find(c => c.id === contentId);
        if (!content || !currentClass) {
            //START DEBUG LOG : DEBUG-CODE(018)
            console.error('❌ Content or currentClass not found - content:', !!content, 'currentClass:', !!currentClass);
            //END DEBUG LOG : DEBUG-CODE(018)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(019)
        console.log('✅ Found content item:', content.title, 'currentClass:', currentClass.courseName);
        //END DEBUG LOG : DEBUG-CODE(019)

        const newObjective = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            LearningObjective: learningObjective,
            courseName: currentClass.courseName,
            divisionTitle: division?.title || '',
            itemTitle: content.title,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        try {
            //START DEBUG LOG : DEBUG-CODE(020)
            console.log('📡 Making API call to add learning objective...');
            console.log('🌐 API URL:', `/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives`);
            console.log('📦 Request body:', { learningObjective: newObjective });
            //END DEBUG LOG : DEBUG-CODE(020)
            
            // Call backend API to add learning objective
            const response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    learningObjective: newObjective
                })
            });

            //START DEBUG LOG : DEBUG-CODE(021)
            console.log('📡 API Response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(021)

            const result = await response.json();
            
            //START DEBUG LOG : DEBUG-CODE(022)
            console.log('📡 API Response body:', result);
            //END DEBUG LOG : DEBUG-CODE(022)
            
            if (result.success) {
                //START DEBUG LOG : DEBUG-CODE(023)
                console.log('✅ Learning objective added successfully to database');
                //END DEBUG LOG : DEBUG-CODE(023)
                
                // Clear the input field
                objectiveInput.value = '';
                // Reload learning objectives from database to ensure consistency
                await loadLearningObjectives(divisionId, contentId);
                console.log('Learning objective added successfully');
            } else {
                //START DEBUG LOG : DEBUG-CODE(024)
                console.error('❌ API returned error:', result.error);
                //END DEBUG LOG : DEBUG-CODE(024)
                await showSimpleErrorModal('Failed to add learning objective: ' + result.error, 'Add Learning Objective Error');
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(025)
            console.error('❌ Exception caught while adding learning objective:', error);
            //END DEBUG LOG : DEBUG-CODE(025)
            console.error('Error adding learning objective:', error);
            await showSimpleErrorModal('An error occurred while adding the learning objective. Please try again.', 'Add Learning Objective Error');
        }
    }

    /**
     * Edit an learning objective
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    function editObjective(divisionId: string, contentId: string, index: number) {
        //START DEBUG LOG : DEBUG-CODE(036)
        console.log('✏️ editObjective called with divisionId:', divisionId, 'contentId:', contentId, 'index:', index);
        //END DEBUG LOG : DEBUG-CODE(036)
        
        const objective = courseData.find(d => d.id === divisionId)
                                    ?.items.find(c => c.id === contentId)
                                    ?.learningObjectives[index];
        if (!objective) {
            //START DEBUG LOG : DEBUG-CODE(037)
            console.error('❌ Objective not found for edit - divisionId:', divisionId, 'contentId:', contentId, 'index:', index);
            //END DEBUG LOG : DEBUG-CODE(037)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(038)
        console.log('✅ Found objective to edit:', objective.LearningObjective);
        //END DEBUG LOG : DEBUG-CODE(038)

        let contentDiv = document.getElementById(`objective-content-${divisionId}-${contentId}-${index}`) as HTMLElement | null;
        if (!contentDiv) {
            // If the target container doesn't exist (e.g., due to markup changes), create it on demand
            const headerEl = document.querySelector(
                `.objective-header[data-division="${divisionId}"][data-content="${contentId}"][data-objective="${index}"]`
            ) as HTMLElement | null;
            const itemEl = headerEl?.parentElement as HTMLElement | null; // .objective-item
            if (!itemEl) {
                console.error('❌ Could not locate objective item container to create edit region.');
                return;
            }
            contentDiv = document.createElement('div');
            contentDiv.className = 'objective-content';
            contentDiv.id = `objective-content-${divisionId}-${contentId}-${index}`;
            itemEl.appendChild(contentDiv);
        }

        //START DEBUG LOG : DEBUG-CODE(040)
        console.log('✅ Found content div, creating edit form...');
        //END DEBUG LOG : DEBUG-CODE(040)

        // Clear and build edit form via DOM APIs
        while (contentDiv.firstChild) contentDiv.removeChild(contentDiv.firstChild);

        const form = document.createElement('div');
        form.className = 'edit-form';

        const objectiveInput = document.createElement('input');
        objectiveInput.type = 'text';
        objectiveInput.className = 'edit-input';
        objectiveInput.id = `edit-title-${divisionId}-${contentId}-${index}`;
        objectiveInput.value = objective.LearningObjective;

        const actions = document.createElement('div');
        actions.className = 'edit-actions';
        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-btn';
        saveBtn.dataset.action = 'save';
        saveBtn.dataset.week = String(divisionId);
        saveBtn.dataset.content = String(contentId);
        saveBtn.dataset.objective = String(index);
        saveBtn.textContent = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.dataset.action = 'cancel';
        cancelBtn.dataset.week = String(divisionId);
        cancelBtn.dataset.content = String(contentId);
        cancelBtn.textContent = 'Cancel';
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);

        form.appendChild(objectiveInput);
        form.appendChild(actions);

        contentDiv.appendChild(form);
        contentDiv.classList.add('expanded');
        // Ensure visible during editing
        contentDiv.style.display = 'block';
        
        //START DEBUG LOG : DEBUG-CODE(041)
        console.log('✅ Edit form created and added to DOM successfully');
        //END DEBUG LOG : DEBUG-CODE(041)
    }

    /**
     * Save the edited objective
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    async function saveObjective(divisionId: string, contentId: string, index: number) {
        //START DEBUG LOG : DEBUG-CODE(026)
        console.log('💾 saveObjective called with divisionId:', divisionId, 'contentId:', contentId, 'index:', index);
        //END DEBUG LOG : DEBUG-CODE(026)
        
        const learningObjective = (document.getElementById(`edit-title-${divisionId}-${contentId}-${index}`) as HTMLInputElement).value.trim();

        if (!learningObjective) {
            alert('Learning objective cannot be empty.');
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(027)
        console.log('📝 Updated learning objective text:', learningObjective);
        //END DEBUG LOG : DEBUG-CODE(027)

        const objective = courseData.find(d => d.id === divisionId)
                                    ?.items.find(c => c.id === contentId)
                                    ?.learningObjectives[index];
        if (!objective || !currentClass) {
            //START DEBUG LOG : DEBUG-CODE(028)
            console.error('❌ Objective or currentClass not found - objective:', !!objective, 'currentClass:', !!currentClass);
            //END DEBUG LOG : DEBUG-CODE(028)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(029)
        console.log('✅ Found objective to update:', objective.id, 'currentClass:', currentClass.courseName);
        //END DEBUG LOG : DEBUG-CODE(029)

        const updateData = {
            LearningObjective: learningObjective
        };

        try {
            //START DEBUG LOG : DEBUG-CODE(030)
            console.log('📡 Making API call to update learning objective...');
            console.log('🌐 API URL:', `/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives/${objective.id}`);
            console.log('📦 Request body:', { updateData: updateData });
            //END DEBUG LOG : DEBUG-CODE(030)
            
            // Call backend API to update learning objective
            const response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives/${objective.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    updateData: updateData
                })
            });

            //START DEBUG LOG : DEBUG-CODE(031)
            console.log('📡 API Response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(031)

            const result = await response.json();
            
            //START DEBUG LOG : DEBUG-CODE(032)
            console.log('📡 API Response body:', result);
            //END DEBUG LOG : DEBUG-CODE(032)
            
            if (result.success) {
                //START DEBUG LOG : DEBUG-CODE(033)
                console.log('✅ Learning objective updated successfully in database');
                //END DEBUG LOG : DEBUG-CODE(033)
                
                // Reload learning objectives from database to ensure consistency
                await loadLearningObjectives(divisionId, contentId);
                console.log('Learning objective updated successfully');
            } else {
                //START DEBUG LOG : DEBUG-CODE(034)
                console.error('❌ API returned error:', result.error);
                //END DEBUG LOG : DEBUG-CODE(034)
                await showSimpleErrorModal('Failed to update learning objective: ' + result.error, 'Update Learning Objective Error');
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(035)
            console.error('❌ Exception caught while updating learning objective:', error);
            //END DEBUG LOG : DEBUG-CODE(035)
            console.error('Error updating learning objective:', error);
            await showSimpleErrorModal('An error occurred while updating the learning objective. Please try again.', 'Update Learning Objective Error');
        }
    }

    /**
     * Cancel the edit of an objective
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns null
     */
    function cancelEdit(divisionId: string, contentId: string) {
        refreshContentItem(divisionId, contentId);
    }

    async function deleteObjective(divisionId: string, contentId: string, index: number) {
        //START DEBUG LOG : DEBUG-CODE(042)
        console.log('🗑️ deleteObjective called with divisionId:', divisionId, 'contentId:', contentId, 'index:', index);
        console.log('🔍 Current class available:', !!currentClass);
        console.log('🔍 Current class ID:', currentClass?.id);
        console.log('🔍 Current class name:', currentClass?.courseName);
        //END DEBUG LOG : DEBUG-CODE(042)
        
        // Get the objective to show its name in confirmation
        const content = courseData.find(d => d.id === divisionId)
                                        ?.items.find(c => c.id === contentId);
        const objective = content?.learningObjectives[index];
        
        if (!objective) {
            //START DEBUG LOG : DEBUG-CODE(043)
            console.error('❌ Objective not found for deletion - divisionId:', divisionId, 'contentId:', contentId, 'index:', index);
            //END DEBUG LOG : DEBUG-CODE(043)
            return;
        }
        
        //START DEBUG LOG : DEBUG-CODE(044)
        console.log('✅ Found objective to delete:', objective.LearningObjective);
        //END DEBUG LOG : DEBUG-CODE(044)
        
        // Show confirmation modal
        const result = await showDeleteConfirmationModal(
            'Learning Objective',
            objective?.LearningObjective
        );
        
        //START DEBUG LOG : DEBUG-CODE(045)
        console.log('📋 Delete confirmation result:', result);
        //END DEBUG LOG : DEBUG-CODE(045)

        if (result.action === 'delete') {
            //START DEBUG LOG : DEBUG-CODE(046)
            console.log('✅ User confirmed deletion, proceeding with API call...');
            //END DEBUG LOG : DEBUG-CODE(046)
            
            const content = courseData.find(d => d.id === divisionId)
                                        ?.items.find(c => c.id === contentId);
            const objective = content?.learningObjectives[index];
            
            if (!content || !objective || !currentClass) {
                //START DEBUG LOG : DEBUG-CODE(047)
                console.error('❌ Missing data for deletion - content:', !!content, 'objective:', !!objective, 'currentClass:', !!currentClass);
                //END DEBUG LOG : DEBUG-CODE(047)
                return;
            }

            try {
                //START DEBUG LOG : DEBUG-CODE(048)
                console.log('📡 Making API call to delete learning objective...');
                console.log('🌐 API URL:', `/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives/${objective.id}`);
                //END DEBUG LOG : DEBUG-CODE(048)
                
                // Call backend API to delete learning objective
                const response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/objectives/${objective.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                //START DEBUG LOG : DEBUG-CODE(049)
                console.log('📡 Delete API Response status:', response.status, response.statusText);
                //END DEBUG LOG : DEBUG-CODE(049)

                const result = await response.json();
                
                //START DEBUG LOG : DEBUG-CODE(050)
                console.log('📡 Delete API Response body:', result);
                //END DEBUG LOG : DEBUG-CODE(050)
                
                if (result.success) {
                    //START DEBUG LOG : DEBUG-CODE(051)
                    console.log('✅ Learning objective deleted successfully from database');
                    //END DEBUG LOG : DEBUG-CODE(051)
                    
                    // Reload learning objectives from database to ensure consistency
                    await loadLearningObjectives(divisionId, contentId);
                    console.log('Learning objective deleted successfully');
                } else {
                    //START DEBUG LOG : DEBUG-CODE(052)
                    console.error('❌ API returned error:', result.error);
                    //END DEBUG LOG : DEBUG-CODE(052)
                    await showSimpleErrorModal('Failed to delete learning objective: ' + result.error, 'Delete Learning Objective Error');
                }
            } catch (error) {
                //START DEBUG LOG : DEBUG-CODE(053)
                console.error('❌ Exception caught while deleting learning objective:', error);
                //END DEBUG LOG : DEBUG-CODE(053)
                console.error('Error deleting learning objective:', error);
                await showSimpleErrorModal('An error occurred while deleting the learning objective. Please try again.', 'Delete Learning Objective Error');
            }
        }
    }

    /**
     * Refresh a single content item instead of the whole page
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns null
     */
    function refreshContentItem(divisionId: string, contentId: string) {
        const division = courseData.find(d => d.id === divisionId);
        const content = division?.items.find(c => c.id === contentId);
        const itemContainer = document.getElementById(`content-item-${divisionId}-${contentId}`);
        if (!division || !content || !itemContainer) return;
        
        // Preserve accordion state before rebuilding
        const objectivesContent = document.getElementById(`objectives-${divisionId}-${contentId}`);
        const wasExpanded = objectivesContent?.classList.contains('expanded') || false;
        
        // Rebuild via DOM and replace
        const built = buildContentItemDOM(divisionId, content);
        const parent = itemContainer.parentElement;
        if (!parent) return;
        parent.replaceChild(built, itemContainer);
        
        // Restore accordion state after rebuilding
        if (wasExpanded) {
            const newObjectivesContent = document.getElementById(`objectives-${divisionId}-${contentId}`);
            const newIcon = document.getElementById(`obj-icon-${divisionId}-${contentId}`);
            if (newObjectivesContent && newIcon) {
                newObjectivesContent.classList.add('expanded');
                newIcon.style.transform = 'rotate(180deg)';
            }
        }
    }

    /**
     * Build a content item DOM node (helper for refresh)
     * 
     * @param divisionId the id of the division
     * @param content the content item to build the DOM for
     * @returns the created element
     */
    function buildContentItemDOM(divisionId: string, content: courseItem): HTMLElement {
        // Reuse the createContentItemElement pattern used at page render time
        const item = document.createElement('div');
        item.className = 'content-item';
        item.id = `content-item-${divisionId}-${content.id}`;
        // Header
        const header = document.createElement('div');
        header.className = 'content-header';
        // Layout: make header a flexible row so left area can grow
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';
        const title = document.createElement('div');
        title.className = 'content-title';
        // Title row as flex so input and buttons align and expand nicely
        title.style.display = 'flex';
        title.style.alignItems = 'center';
        title.style.gap = '8px';
        // Left grows, prevents overflow clipping
        title.style.flex = '1 1 auto';
        title.style.minWidth = '0';
        
        // Create title text span
        const titleText = document.createElement('span');
        titleText.textContent = content.title;
        title.appendChild(titleText);
        
        // Create rename icon (handled via delegated listener in setupEventListeners)
        const renameIcon = document.createElement('i');
        renameIcon.setAttribute('data-feather', 'edit-2');
        renameIcon.className = 'rename-icon';
        renameIcon.setAttribute('data-division-id', divisionId);
        renameIcon.setAttribute('data-item-id', content.id);
        renameIcon.style.cursor = 'pointer';
        renameIcon.style.marginLeft = '8px';
        renameIcon.style.width = '16px';
        renameIcon.style.height = '16px';
        title.appendChild(renameIcon);
        
        const statusRow = document.createElement('div');
        statusRow.className = 'content-status-row';
        // Right side does not grow
        statusRow.style.flex = '0 0 auto';
        const deleteBadge = document.createElement('div');
        deleteBadge.className = 'content-status status-delete-section';
        deleteBadge.textContent = 'Delete Section';
        deleteBadge.dataset.action = 'delete-section';
        deleteBadge.dataset.divisionId = divisionId;
        deleteBadge.dataset.contentId = content.id;
        const status = document.createElement('div');
        status.className = 'content-status status-completed';
        status.textContent = 'Completed';
        statusRow.appendChild(deleteBadge);
        statusRow.appendChild(status);
        header.appendChild(title);
        header.appendChild(statusRow);

        // Delete badge will be handled by event delegation in setupEventListeners()
        // No direct event listener needed - prevents double event listeners

        // Objectives
        const objectivesContainer = document.createElement('div');
        objectivesContainer.className = 'learning-objectives';

        // create the accordion for the objectives
        const accordion = document.createElement('div');
        accordion.className = 'objectives-accordion';

        // create the header for the objectives
        const headerRow = document.createElement('div');
        headerRow.className = 'objectives-header';
        headerRow.setAttribute('data-division', String(divisionId));
        headerRow.setAttribute('data-content', String(content.id));

        // create the title for the objectives
        const headerTitle = document.createElement('div');
        headerTitle.className = 'objectives-title';
        headerTitle.textContent = 'Learning Objectives';

        // create the count for the objectives
        const headerCount = document.createElement('div');
        headerCount.className = 'objectives-count';
        const countSpan = document.createElement('span');
        countSpan.id = `count-${divisionId}-${content.id}`;
        countSpan.textContent = String(content.learningObjectives.length);

        // create the expand icon for the objectives
        const countText = document.createTextNode(' objectives ');
        const expandSpan = document.createElement('span');
        expandSpan.className = 'expand-icon';
        expandSpan.id = `obj-icon-${divisionId}-${content.id}`;
        expandSpan.textContent = '▼';

        // append the count, text, and expand icon to the header
        headerCount.appendChild(countSpan);
        headerCount.appendChild(countText);
        headerCount.appendChild(expandSpan);

        // append the title and count to the header
        headerRow.appendChild(headerTitle);
        headerRow.appendChild(headerCount);

        // create the content for the objectives
        const objectivesContent = document.createElement('div');
        objectivesContent.className = 'objectives-content';
        objectivesContent.id = `objectives-${divisionId}-${content.id}`;
        objectivesContent.appendChild(createObjectivesListElement(divisionId, content.id));

        // Add event listener for delete badge
        deleteBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSection(divisionId, content.id);
        });
        accordion.appendChild(headerRow);
        accordion.appendChild(objectivesContent);
        objectivesContainer.appendChild(accordion);

        // Upload
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'document-upload';
        const uploadArea = document.createElement('div');
        uploadArea.className = 'upload-area';
        const uploadText = document.createElement('div');
        uploadText.className = 'upload-text';
        uploadText.textContent = ' + Upload your document here';
        uploadArea.appendChild(uploadText);
        uploadWrap.appendChild(uploadArea);

        const materialsEl = createAdditionalMaterialsElement(content);

        item.appendChild(header);
        item.appendChild(objectivesContainer);
        item.appendChild(uploadWrap);
        // Append uploaded files list directly under the upload box
        if (materialsEl) item.appendChild(materialsEl);
        return item;
    }

    // ----- Sections management -----
    async function addSection(division: ContentDivision) {
        //START DEBUG LOG : DEBUG-CODE(054)
        console.log('➕ addSection called for division:', division.id, division.title);
        //END DEBUG LOG : DEBUG-CODE(054)
        
        if (!currentClass) {
            //START DEBUG LOG : DEBUG-CODE(055)
            console.error('❌ No current class found for adding section');
            //END DEBUG LOG : DEBUG-CODE(055)
            return;
        }

        // Prepare minimal payload; server assigns IDs and timestamps
        const newContentTitle = `New Section ${division.items.length + 1}`;
        const minimalContentPayload = {
            title: newContentTitle,
            completed: false,
            learningObjectives: [],
            additionalMaterials: []
        };

        try {
            //START DEBUG LOG : DEBUG-CODE(056)
            console.log('📡 Making API call to add section...');
            console.log('🌐 API URL:', `/api/courses/${currentClass.id}/divisions/${division.id}/items`);
            console.log('📦 Request body:', { contentItem: minimalContentPayload });
            //END DEBUG LOG : DEBUG-CODE(056)
            
            // Call backend API to add the section
            const response = await fetch(`/api/courses/${currentClass.id}/divisions/${division.id}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contentItem: minimalContentPayload
                })
            });

            //START DEBUG LOG : DEBUG-CODE(057)
            console.log('📡 Add Section API Response status:', response.status, response.statusText);
            //END DEBUG LOG : DEBUG-CODE(057)

            const result = await response.json();
            
            //START DEBUG LOG : DEBUG-CODE(058)
            console.log('📡 Add Section API Response body:', result);
            //END DEBUG LOG : DEBUG-CODE(058)
            
            if (result.success) {
                //START DEBUG LOG : DEBUG-CODE(059)
                console.log('✅ Section added successfully to database');
                //END DEBUG LOG : DEBUG-CODE(059)
                
                // Use server-returned item (ensures IDs and timestamps are consistent)
                const createdItem: courseItem = result.data;
                // Add to local data only after successful database save
                division.items.push(createdItem);
                
                // Append to DOM
                const container = document.getElementById(`content-division-${division.id}`);
                if (!container) return;
                const built = buildContentItemDOM(division.id, createdItem);
                container.appendChild(built);
                
                // Update header completion count
                updateDivisionCompletion(division.id);
                
                console.log('Section added successfully');
            } else {
                //START DEBUG LOG : DEBUG-CODE(060)
                console.error('❌ API returned error:', result.error);
                //END DEBUG LOG : DEBUG-CODE(060)
                await showSimpleErrorModal('Failed to add section: ' + result.error, 'Add Section Error');
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(061)
            console.error('❌ Exception caught while adding section:', error);
            //END DEBUG LOG : DEBUG-CODE(061)
            console.error('Error adding section:', error);
            await showSimpleErrorModal('An error occurred while adding the section. Please try again.', 'Add Section Error');
        }
    }

    function deleteSection(divisionId: string, contentId: string) {
        const division = courseData.find(d => d.id === divisionId);
        if (!division) return;
        if (!confirm('Delete this section?')) return;
        division.items = division.items.filter(c => c.id !== contentId);
        const item = document.getElementById(`content-item-${divisionId}-${contentId}`);
        if (item && item.parentElement) item.parentElement.removeChild(item);
        updateDivisionCompletion(divisionId);
    }

    function updateDivisionCompletion(divisionId: string) {
        const division = courseData.find(d => d.id === divisionId);
        if (!division) return;
        const sectionsCompleted = division.items.filter(c => c.completed).length;
        const totalSections = division.items.length;
        const container = document.querySelector(`.week-header[data-division="${divisionId}"] .completion-status`) as HTMLElement | null;
        if (container) container.textContent = `${sectionsCompleted} / ${totalSections} Sections completed`;
    }

    /**
     * Enter edit mode for a division or item title
     * 
     * @param divisionId - The ID of the division
     * @param itemId - Optional item ID (if editing an item title)
     * @param currentTitle - The current title text
     */
    function enterEditMode(divisionId: string, itemId: string | null, currentTitle: string): void {
        let titleSpan: HTMLElement | null = null;
        let titleContainer: HTMLElement | null = null;
        
        if (itemId) {
            // Editing an item title
            titleSpan = document.querySelector(`#content-item-${divisionId}-${itemId} .content-title span`) as HTMLElement | null;
            titleContainer = document.querySelector(`#content-item-${divisionId}-${itemId} .content-title`) as HTMLElement | null;
        } else {
            // Editing a division title
            titleSpan = document.querySelector(`.week-header[data-division="${divisionId}"] .week-title span`) as HTMLElement | null;
            titleContainer = document.querySelector(`.week-header[data-division="${divisionId}"] .week-title`) as HTMLElement | null;
        }
        
        if (!titleSpan || !titleContainer) {
            console.error('Title element not found for edit mode');
            return;
        }
        
        // Store original title for cancel
        const originalTitle = currentTitle;
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'title-edit-input';
        // Allow input to expand to available width
        input.style.minWidth = '0';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.flex = '1 1 auto';
        input.style.padding = '4px 8px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '4px';
        input.style.fontSize = 'inherit';
        input.style.fontFamily = 'inherit';
        
        // Find the rename icon and replace with OK/Cancel buttons
        const renameIcon = titleContainer.querySelector('.rename-icon') as HTMLElement | null;
        if (!renameIcon) return;
        
        // Ensure title container is flex so input can grow next to buttons
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = '8px';

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'edit-mode-buttons';
        buttonContainer.style.display = 'inline-flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginLeft = '8px';
        buttonContainer.style.alignItems = 'center';
        
        // Create OK button (check icon)
        const okButton = document.createElement('i');
        okButton.setAttribute('data-feather', 'check');
        okButton.className = 'edit-ok-button';
        okButton.style.cursor = 'pointer';
        okButton.style.width = '16px';
        okButton.style.height = '16px';
        okButton.style.color = '#4CAF50';
        okButton.title = 'Save';
        
        // Create Cancel button (x icon)
        const cancelButton = document.createElement('i');
        cancelButton.setAttribute('data-feather', 'x');
        cancelButton.className = 'edit-cancel-button';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.width = '16px';
        cancelButton.style.height = '16px';
        cancelButton.style.color = '#f44336';
        cancelButton.title = 'Cancel';
        
        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);
        
        // Replace span with input
        titleSpan.replaceWith(input);
        renameIcon.replaceWith(buttonContainer);
        
        // Focus and select input text
        input.focus();
        input.select();
        
        // Re-render feather icons
        renderFeatherIcons();
        
        // Handle OK button click
        okButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newTitle = input.value.trim();
            
            // Validate input
            if (!newTitle) {
                await showErrorModal('Validation Error', `${itemId ? 'Section' : 'Division'} name cannot be empty.`);
                input.focus();
                return;
            }
            
            if (newTitle.length > 100) {
                await showErrorModal('Validation Error', `${itemId ? 'Section' : 'Division'} name is too long (max 100 characters).`);
                input.focus();
                return;
            }
            
            // Only proceed if title changed
            if (newTitle === originalTitle) {
                exitEditMode(divisionId, itemId, originalTitle);
                return;
            }
            
            // Save the title change
            await saveTitleChange(divisionId, itemId, newTitle);
        });
        
        // Handle Cancel button click
        cancelButton.addEventListener('click', (e) => {
            e.stopPropagation();
            exitEditMode(divisionId, itemId, originalTitle);
        });
        
        // Handle Escape key
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                exitEditMode(divisionId, itemId, originalTitle);
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Handle Enter key
        input.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                okButton.click();
            }
        });
        
        // Store escape handler on button container for cleanup
        (buttonContainer as any)._escapeHandler = escapeHandler;
    }
    
    /**
     * Exit edit mode and restore display mode
     * 
     * @param divisionId - The ID of the division
     * @param itemId - Optional item ID (if editing an item title)
     * @param title - The title to display
     */
    function exitEditMode(divisionId: string, itemId: string | null, title: string): void {
        let titleContainer: HTMLElement | null = null;
        
        if (itemId) {
            titleContainer = document.querySelector(`#content-item-${divisionId}-${itemId} .content-title`) as HTMLElement | null;
        } else {
            titleContainer = document.querySelector(`.week-header[data-division="${divisionId}"] .week-title`) as HTMLElement | null;
        }
        
        if (!titleContainer) return;
        
        // Find input field
        const input = titleContainer.querySelector('.title-edit-input') as HTMLInputElement | null;
        const buttonContainer = titleContainer.querySelector('.edit-mode-buttons') as HTMLElement | null;
        
        if (!input || !buttonContainer) return;
        
        // Remove escape handler if exists
        const escapeHandler = (buttonContainer as any)._escapeHandler;
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
        }
        
        // Create title span
        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;
        
        // Create rename icon
        const renameIcon = document.createElement('i');
        renameIcon.setAttribute('data-feather', 'edit-2');
        renameIcon.className = 'rename-icon';
        renameIcon.setAttribute('data-division-id', divisionId);
        if (itemId) {
            renameIcon.setAttribute('data-item-id', itemId);
        }
        renameIcon.style.cursor = 'pointer';
        renameIcon.style.marginLeft = '8px';
        renameIcon.style.width = '16px';
        renameIcon.style.height = '16px';
        
        // Replace input with span and restore rename icon (handled via delegated listener)
        input.replaceWith(titleSpan);
        buttonContainer.replaceWith(renameIcon);
        
        // Re-render feather icons
        renderFeatherIcons();
    }
    
    /**
     * Save title change via API
     * 
     * @param divisionId - The ID of the division
     * @param itemId - Optional item ID (if updating an item title)
     * @param newTitle - The new title to save
     */
    async function saveTitleChange(divisionId: string, itemId: string | null, newTitle: string): Promise<void> {
        if (!currentClass) {
            console.error('❌ No current class found for saving title');
            return;
        }
        
        // Show loading modal (don't await - it stays open until we close it)
        showTitleUpdateLoadingModal(itemId ? 'Section' : 'Division');
        
        try {
            let response: Response;
            let responseData: any;
            
            if (itemId) {
                // Update item title
                console.log(`📝 Saving item ${itemId} in division ${divisionId} with new title: "${newTitle}"`);
                
                response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/items/${itemId}/title`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        title: newTitle
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to rename section: ${response.statusText}`);
                }
                
                responseData = await response.json();
                
                if (responseData.success) {
                    // Find and update item in local data
                    const division = courseData.find(d => d.id === divisionId);
                    const item = division?.items.find(i => i.id === itemId);
                    if (item) {
                        // Update title from backend response if available
                        const updatedTitle = responseData.data?.title || newTitle;
                        item.title = updatedTitle;
                        item.itemTitle = updatedTitle;
                        
                        // Close loading modal before exiting edit mode
                        closeModal('success');
                        
                        // Exit edit mode with backend title
                        exitEditMode(divisionId, itemId, updatedTitle);
                        
                        console.log('✅ Item title saved successfully');
                    }
                } else {
                    throw new Error(responseData.error || 'Failed to rename section');
                }
            } else {
                // Update division title
                console.log(`📝 Saving division ${divisionId} with new title: "${newTitle}"`);
                
                response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/title`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        title: newTitle
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to rename division: ${response.statusText}`);
                }
                
                responseData = await response.json();
                
                if (responseData.success) {
                    // Find and update division in local data
                    const division = courseData.find(d => d.id === divisionId);
                    if (division) {
                        // Update title from backend response if available
                        const updatedTitle = responseData.data?.title || newTitle;
                        division.title = updatedTitle;
                        
                        // Close loading modal before exiting edit mode
                        closeModal('success');
                        
                        // Exit edit mode with backend title
                        exitEditMode(divisionId, null, updatedTitle);
                        
                        console.log('✅ Division title saved successfully');
                    }
                } else {
                    throw new Error(responseData.error || 'Failed to rename division');
                }
            }
            
        } catch (error) {
            // Close loading modal on error
            closeModal('error');
            
            console.error('❌ Error saving title:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to save title. Please try again.';
            await showErrorModal('Error', errorMessage);
            
            // Don't exit edit mode on error - let user try again
        }
    }

    /**
     * Rename a division (week/topic) - enters inline edit mode
     * 
     * @param division - The division to rename
     */
    async function renameDivision(division: ContentDivision): Promise<void> {
        if (!currentClass) {
            console.error('❌ No current class found for renaming division');
            return;
        }

        // Enter inline edit mode
        enterEditMode(division.id, null, division.title);
    }

    /**
     * Rename a course item (section) - enters inline edit mode
     * 
     * @param divisionId - The ID of the division containing the item
     * @param item - The item to rename
     */
    async function renameItem(divisionId: string, item: courseItem): Promise<void> {
        if (!currentClass) {
            console.error('❌ No current class found for renaming item');
            return;
        }

        // Enter inline edit mode
        enterEditMode(divisionId, item.id, item.title);
    }

    // Make functions globally available for inline event handlers if needed,
    // but the delegated event listener is the primary method.
    // Example: (window as any).toggleWeek = toggleWeek;

    // ----- Additional Materials (front-end only) -----

    /**
     * Build the additional materials container via DOM APIs
     * 
     * @param content the content item to build the DOM for
     * @returns the created element
     */
    function createAdditionalMaterialsElement(content: courseItem): HTMLElement | null {
        const items = content.additionalMaterials || [];
        if (items.length === 0) return null;

        const wrap = document.createElement('div');
        wrap.className = 'additional-materials';

        items.forEach((m: AdditionalMaterial) => {
            const row = document.createElement('div');
            row.className = 'additional-material';
            row.setAttribute('data-material-id', m.id);

            const title = document.createElement('div');
            title.className = 'am-title';
            title.textContent = m.name;

            // Show actual filename if it's a file upload
            const fileName = document.createElement('div');
            fileName.className = 'am-filename';
            if (m.sourceType === 'file' && m.fileName) {
                fileName.textContent = `📄 ${m.fileName}`;
                fileName.style.fontSize = '0.9em';
                fileName.style.color = '#666';
                fileName.style.marginTop = '2px';
            } else {
                fileName.style.display = 'none';
            }

            const meta = document.createElement('div');
            meta.className = 'am-meta';
            meta.textContent = m.sourceType === 'file' ? 'File' : m.sourceType === 'url' ? 'URL' : 'Text';

            const actions = document.createElement('div');
            actions.className = 'am-actions';
            const del = document.createElement('button');
            del.className = 'action-btn delete-btn';
            del.dataset.action = 'delete-material';
            del.dataset.materialId = m.id;
            del.textContent = 'Delete';
            actions.appendChild(del);

            row.appendChild(title);
            row.appendChild(fileName);
            row.appendChild(meta);
            row.appendChild(actions);
            wrap.appendChild(row);
        });

        return wrap;
    }


    /**
     * Delete an additional material
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param materialId the id of the material to delete
     * @returns null
     */
    // function deleteAdditionalMaterial(
    //     divisionId: string,
    //     contentId: string,
    //     materialId: string
    // ) {

    //             // Upload to Qdrant if we have content
    //             if (contentToUpload) {
    //                 try {
    //                     const qdrantResult = await uploadRAGContent(contentToUpload);
    //                     console.log('Successfully uploaded to Qdrant:', qdrantResult);
    //                     material.uploaded = true;
    //                     // Store the Qdrant document ID in the material
    //                     material.qdrantId = qdrantResult.id;
    //                 } catch (error) {
    //                     console.error('Failed to upload to Qdrant:', error);
    //                     alert('Failed to upload content to Qdrant. Please try again.');
    //                     return;
    //                 }
    //             }

    //             // add the material to the content item
    //             contentItem.additionalMaterials.push(material);

    //             // refresh the content item
    //             refreshContentItem(divisionId, contentId);

    //             // close the modal
    //             close();
    //         } catch (error) {
    //             console.error('Error in upload process:', error);
    //             alert('An error occurred during upload. Please try again.');
    //         }
    //     });
    // }

    /**
     * Delete an additional material
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param materialId the id of the material to delete
     * @returns null
     */
    async function deleteAdditionalMaterial(
        divisionId: string,
        contentId: string,
        materialId: string
    ) {

        console.log('DEBUG #11');
        // get the division and the content item
        const division = courseData.find(d => d.id === divisionId);
        if (!division) {
            //print the divisionId
            console.log('DEBUG #11.1', divisionId);
            await showSimpleErrorModal('Division not found', 'Delete Material Error');
            return;
        }

        const content = division.items.find(c => c.id === contentId);
        if (!content || !content.additionalMaterials) {
            await showSimpleErrorModal('Content not found', 'Delete Material Error');
            return;
        }

        // Get the material to show its name in confirmation
        const material = content.additionalMaterials.find(m => m.id === materialId);
        const result = await showDeleteConfirmationModal(
            'Document',
            material?.name || 'this document'
        );
        
        if (result.action === 'delete') {
            try {
                // Call backend API to soft delete from MongoDB
                const response = await fetch(`/api/courses/${currentClass.id}/divisions/${divisionId}/items/${contentId}/materials/${materialId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                const result = await response.json();
                if (!result.success) {
                    await showSimpleErrorModal('Failed to delete document: ' + result.error, 'Delete Document Error');
                    return;
                }
                
                // Remove from local array after successful backend deletion
                content.additionalMaterials = content.additionalMaterials.filter(m => m.id !== materialId);
                refreshContentItem(divisionId, contentId);
                console.log('DEBUG #12 - Document deleted successfully');
            } catch (error) {
                console.error('Error deleting document:', error);
                await showSimpleErrorModal('An error occurred while deleting the document. Please try again.', 'Delete Document Error');
            }
        } else {
            console.log('🗑️ Document deletion cancelled by user');
        }
    }

    // Build the Objectives list + Add form via DOM APIs
    function createObjectivesListElement(divisionId: string, contentId: string): HTMLElement {

        // create the wrapper for the objectives
        const wrapper = document.createElement('div');
        const division = courseData.find(d => d.id === divisionId);
        const content = division?.items.find(c => c.id === contentId);
        if (!content) return wrapper;

        // create the list of objectives
        content.learningObjectives.forEach((obj, index) => {
            const item = document.createElement('div');
            item.className = 'objective-item';

            // create the header for the objective
            const header = document.createElement('div');
            header.className = 'objective-header';
            header.setAttribute('data-division', String(divisionId));
            header.setAttribute('data-content', String(contentId));
            header.setAttribute('data-objective', String(index));

            // create the title for the objective
            const title = document.createElement('div');
            title.className = 'objective-title';
            title.textContent = obj.LearningObjective;

            const actions = document.createElement('div');
            actions.className = 'objective-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit-btn';
            editBtn.dataset.action = 'edit';
            editBtn.textContent = 'Edit';

            const delBtn = document.createElement('button');
            delBtn.className = 'action-btn delete-btn';
            delBtn.dataset.action = 'delete';
            delBtn.textContent = 'Delete';

            const expand = document.createElement('span');
            expand.className = 'expand-icon';
            expand.id = `item-icon-${divisionId}-${contentId}-${index}`;
            expand.textContent = '▼';

            // append the edit, delete, and expand icon to the actions
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            actions.appendChild(expand);

            // append the title and actions to the header
            header.appendChild(title);
            header.appendChild(actions);

            // append the header to the item
            item.appendChild(header);
            wrapper.appendChild(item);
        });

        // create the wrapper for the add objective form
        const addWrap = document.createElement('div');
        addWrap.className = 'add-objective';

        // create the form for the add objective
        const addForm = document.createElement('div');
        addForm.className = 'add-objective-form';

        // create the objective label for the add objective form
        const objectiveLabel = document.createElement('div');
        objectiveLabel.className = 'input-label';
        objectiveLabel.textContent = 'Learning Objective:';

        // create the objective input for the add objective form
        const objectiveInput = document.createElement('input');
        objectiveInput.type = 'text';
        objectiveInput.className = 'objective-title-input';
        objectiveInput.id = `new-title-${divisionId}-${contentId}`;
        objectiveInput.placeholder = 'Enter the learning objective...';

        // create the add button for the add objective form
        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.dataset.action = 'add';
        addBtn.dataset.week = String(divisionId);
        addBtn.dataset.content = String(contentId);
        addBtn.textContent = 'Add Objective';

        // append the objective input and add button to the form
        addForm.appendChild(objectiveLabel);
        addForm.appendChild(objectiveInput);
        addForm.appendChild(addBtn);
        addWrap.appendChild(addForm);
        wrapper.appendChild(addWrap);

        return wrapper;
    }

    /**
     * Nuclear clear - delete entire RAG collection (nuclear option)
     */
    async function nuclearClearDocuments(): Promise<void> {
        try {
            // Show confirmation modal with stronger warning
            const result = await showDeleteConfirmationModal(
                '💥 Nuclear Clear',
                'the ENTIRE RAG collection from ALL courses. This will permanently delete the entire Qdrant collection and is IRREVERSIBLE!'
            );

            if (result.action !== 'delete') {
                console.log('Nuclear clear cancelled by user');
                return;
            }

            console.log('💥 Starting nuclear clear of entire RAG collection...');

            // Call the nuclear clear API endpoint
            console.log('🔍 NUCLEAR CLEAR - Request Details:');
            console.log('  URL:', `/api/rag/nuclear-clear`);
            console.log('  Method: DELETE');
            
            const response = await fetch(`/api/rag/nuclear-clear`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });

            console.log('🔍 NUCLEAR CLEAR - Response Details:');
            console.log('  Status:', response.status);
            console.log('  Status Text:', response.statusText);
            console.log('  Headers:', Object.fromEntries(response.headers.entries()));
            console.log('  Content-Type:', response.headers.get('content-type'));

            if (!response.ok) {
                const responseText = await response.text();
                console.log('🔍 NUCLEAR CLEAR - Error Response Body (raw):');
                console.log('  Raw Response:', responseText);
                
                try {
                    const errorData = JSON.parse(responseText);
                    console.log('🔍 NUCLEAR CLEAR - Error Response Body (parsed):');
                    console.log('  Parsed Error:', errorData);
                    throw new Error(errorData.message || errorData.details || `HTTP ${response.status}`);
                } catch (parseError) {
                    console.log('🔍 NUCLEAR CLEAR - JSON Parse Error:');
                    console.log('  Parse Error:', parseError);
                    throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
                }
            }

            const responseText = await response.text();
            console.log('🔍 NUCLEAR CLEAR - Success Response Body (raw):');
            console.log('  Raw Response:', responseText);
            
            let result_data;
            try {
                result_data = JSON.parse(responseText);
                console.log('🔍 NUCLEAR CLEAR - Success Response Body (parsed):');
                console.log('  Parsed Result:', result_data);
            } catch (parseError) {
                console.log('🔍 NUCLEAR CLEAR - JSON Parse Error:');
                console.log('  Parse Error:', parseError);
                throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
            }
            console.log('💥 Nuclear clear completed:', result_data);

            // Clear all additional materials from local data
            courseData.forEach(division => {
                division.items.forEach(item => {
                    item.additionalMaterials = [];
                });
            });

            // Refresh the UI to show empty state
            renderDocumentsPage();

            // Show success message
            alert(`💥 Nuclear clear completed! Entire RAG collection deleted. Removed ${result_data.data?.deletedCount || 0} documents from the entire system.`);

        } catch (error) {
            console.error('Error nuclear clearing RAG collection:', error);
            alert(`Failed to nuclear clear RAG collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete all documents from both MongoDB and Qdrant
     */
    async function deleteAllDocuments(): Promise<void> {
        try {
            // Show confirmation modal
            const result = await showDeleteConfirmationModal(
                'All Documents',
                `all documents from the RAG database for course "${currentClass.courseName}"`
            );

            if (result.action !== 'delete') {
                console.log('Delete all documents cancelled by user');
                return;
            }

            console.log('🗑️ Starting wipe of all RAG documents for current course...');

            // Get course ID from currentClass
            const courseId = currentClass.id;
            if (!courseId) {
                throw new Error('Course ID not found');
            }

            // Call the new wipe-all API endpoint with courseId
            console.log('🔍 WIPE ALL DOCUMENTS - Request Details:');
            console.log('  URL:', `/api/rag/wipe-all?courseId=${courseId}`);
            console.log('  Method: DELETE');
            console.log('  Course ID:', courseId);
            
            const response = await fetch(`/api/rag/wipe-all?courseId=${courseId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include'
            });

            console.log('🔍 WIPE ALL DOCUMENTS - Response Details:');
            console.log('  Status:', response.status);
            console.log('  Status Text:', response.statusText);
            console.log('  Headers:', Object.fromEntries(response.headers.entries()));
            console.log('  Content-Type:', response.headers.get('content-type'));

            if (!response.ok) {
                const responseText = await response.text();
                console.log('🔍 WIPE ALL DOCUMENTS - Error Response Body (raw):');
                console.log('  Raw Response:', responseText);
                
                try {
                    const errorData = JSON.parse(responseText);
                    console.log('🔍 WIPE ALL DOCUMENTS - Error Response Body (parsed):');
                    console.log('  Parsed Error:', errorData);
                    throw new Error(errorData.message || errorData.details || `HTTP ${response.status}`);
                } catch (parseError) {
                    console.log('🔍 WIPE ALL DOCUMENTS - JSON Parse Error:');
                    console.log('  Parse Error:', parseError);
                    throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
                }
            }

            const responseText = await response.text();
            console.log('🔍 WIPE ALL DOCUMENTS - Success Response Body (raw):');
            console.log('  Raw Response:', responseText);
            
            let result_data;
            try {
                result_data = JSON.parse(responseText);
                console.log('🔍 WIPE ALL DOCUMENTS - Success Response Body (parsed):');
                console.log('  Parsed Result:', result_data);
            } catch (parseError) {
                console.log('🔍 WIPE ALL DOCUMENTS - JSON Parse Error:');
                console.log('  Parse Error:', parseError);
                throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
            }
            console.log('✅ RAG database wipe completed:', result_data);

            // Clear all additional materials from local data
            courseData.forEach(division => {
                division.items.forEach(item => {
                    item.additionalMaterials = [];
                });
            });

            // Refresh the UI to show empty state
            renderDocumentsPage();

            // Show success message
            alert(`Successfully wiped all documents from RAG database for course "${currentClass.courseName}"! Deleted ${result_data.data?.deletedCount || 0} documents.`);

        } catch (error) {
            console.error('Error deleting all documents:', error);
            alert(`Failed to delete documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}