

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
import { uploadTextToQdrant } from '../services/QdrantService.js';

// In-memory store for the course data
let courseData: ContentDivision[] = [];

// Function to initialize the documents page
export function initializeDocumentsPage( currentClass : activeCourse) {

    // Build initial in-memory data from onboarding selections
    loadClassroomData(currentClass);
    // Render DOM using safe DOM APIs (no string concatenation)
    renderDocumentsPage();
    setupEventListeners();

    /**
     * Generate initial data based according to the currentClass
     * 
     * @param currentClass the currently active class
     */
    function loadClassroomData( currentClass : activeCourse ) {
        const total = currentClass.tilesNumber;
        courseData = [];
        for (let i = 0; i < total; i++) {
            // Check if the content item exists, if not create a default one
            if (currentClass.divisions[i]) {
                courseData.push(currentClass.divisions[i]);
            } else {
                // Create a default content division if it doesn't exist
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

        // create the left side of the header
        // display the title and the completed status of the division
        const left = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'week-title';
        title.textContent = division.title;
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

        // Add Session badge/button
        const addSessionBadge = document.createElement('div');
        addSessionBadge.className = 'content-status status-add-session';
        addSessionBadge.textContent = 'Add Session';
        // Prevent header toggle when clicking Add Session
        addSessionBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            addSession(division);
        });

        // Toggle switch
        const toggleWrap = document.createElement('label');
        toggleWrap.className = 'toggle-switch';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = !!division.published;
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

        // Wire toggle behaviour (update in-memory state and badge only)
        toggleInput.addEventListener('change', (e) => {
            const checked = (e.currentTarget as HTMLInputElement).checked;
            division.published = checked;
            statusBadge.className = `content-status ${checked ? 'status-published' : 'status-draft'}`;
            statusBadge.textContent = checked ? 'Published' : 'Draft';
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
     * Setup all event listeners for the page (delegated, with safety checks)
     * 
     * @returns null    
     */
    function setupEventListeners() {
        const container = document.getElementById('documents-container');
        if (!container) return;

        container.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;

            // Division header toggles
            const divisionHeader = target.closest('.week-header') as HTMLElement | null;
            if (divisionHeader) {
                const divisionId = divisionHeader.getAttribute('data-division') || '0';
                if (!divisionId) return;
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
                openUploadModal(divisionId, contentId);
                    return;
            }
            
            // Handle actions on buttons
            const button = target.closest('button') as HTMLButtonElement | null;
            if (!button) return;

            const action = button.dataset.action;
            if (!action) return;
            
            const objectiveItem = button.closest('.objective-item');
            const headerElement = objectiveItem?.querySelector('.objective-header') as HTMLElement | null;
            const divisionId = button.dataset.week || headerElement?.dataset.division || '0';
            const contentId = button.dataset.content || headerElement?.dataset.content || '0';
            const objectiveIndex = parseInt(headerElement?.dataset.objective || '-1', 10);

            switch (action) {
                case 'add':
                    addObjective(divisionId, contentId);
                    break;
                case 'edit':
                    event.stopPropagation();
                    editObjective(divisionId, contentId, objectiveIndex);
                    break;
                case 'delete':
                    event.stopPropagation();
                    deleteObjective(divisionId, contentId, objectiveIndex);
                    break;
                case 'save':
                    event.stopPropagation();
                    saveObjective(divisionId, contentId, objectiveIndex);
                    break;
                case 'cancel':
                    event.stopPropagation();
                    cancelEdit(divisionId, contentId);
                    break;
                case 'delete-material':
                    event.stopPropagation();
                    //print the divisionId, contentId, and materialId
                    console.log('DEBUG #13: divisionId : ', divisionId, ' ; contentId : ', contentId, ' ; materialId : ', button.dataset.materialId);
                    deleteAdditionalMaterial(divisionId, contentId, button.dataset.materialId || '');
                    break;
            }
        });
    }

    // --- Event Handler Functions ---

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
     * Add a new objective to a content item
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns null
     */
    function addObjective(divisionId: string, contentId: string) {
        const titleInput = document.getElementById(`new-title-${divisionId}-${contentId}`) as HTMLInputElement | null;
        const descriptionInput = document.getElementById(`new-description-${divisionId}-${contentId}`) as HTMLTextAreaElement | null;
        if (!titleInput || !descriptionInput) return;

        // get the title and description from the input fields
        const title = titleInput.value.trim();
        const description = descriptionInput.value.trim();
        if (!title || !description) {
            alert('Please fill in both title and description.');
            return;
        }

        // find the division and the content item
        const division = courseData.find(d => d.id === divisionId);
        const content = division?.items.find(c => c.id === contentId);
        if (content) {
            const newObjective = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // change later once the database is setup
                content: description,
                courseName: currentClass.courseName,
                divisionTitle: division?.title || '',
                itemTitle: content.title,
                subcontentTitle: title,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            content.learningObjectives.push(newObjective);
            titleInput.value = '';
            descriptionInput.value = '';
            // Re-render only the affected content item for efficiency
            refreshContentItem(divisionId, contentId);
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
        const objective = courseData.find(d => d.id === divisionId)
                                    ?.items.find(c => c.id === contentId)
                                    ?.learningObjectives[index];
        if (!objective) return;

        const contentDiv = document.getElementById(`objective-content-${divisionId}-${contentId}-${index}`);
        if (!contentDiv) return;

        // Clear and build edit form via DOM APIs
        while (contentDiv.firstChild) contentDiv.removeChild(contentDiv.firstChild);

        const form = document.createElement('div');
        form.className = 'edit-form';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'edit-input';
        titleInput.id = `edit-title-${divisionId}-${contentId}-${index}`;
        titleInput.value = objective.subcontentTitle;

        const descInput = document.createElement('textarea');
        descInput.className = 'edit-input';
        descInput.id = `edit-desc-${divisionId}-${contentId}-${index}`;
        descInput.value = objective.content;

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

        form.appendChild(titleInput);
        form.appendChild(descInput);
        form.appendChild(actions);

        contentDiv.appendChild(form);
        contentDiv.classList.add('expanded');
    }

    /**
     * Save the edited objective
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param index the index of the objective item
     * @returns null
     */
    function saveObjective(divisionId: string, contentId: string, index: number) {
        const title = (document.getElementById(`edit-title-${divisionId}-${contentId}-${index}`) as HTMLInputElement).value.trim();
        const description = (document.getElementById(`edit-desc-${divisionId}-${contentId}-${index}`) as HTMLTextAreaElement).value.trim();

        if (!title || !description) {
            alert('Title and description cannot be empty.');
            return;
        }
        const objective = courseData.find(d => d.id === divisionId)
                                    ?.items.find(c => c.id === contentId)
                                    ?.learningObjectives[index];
        if (objective) {
            objective.subcontentTitle = title;
            objective.content = description;
            refreshContentItem(divisionId, contentId);
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

    function deleteObjective(divisionId: string, contentId: string, index: number) {
        if (confirm('Are you sure you want to delete this objective?')) {
            const content = courseData.find(d => d.id === divisionId)
                                        ?.items.find(c => c.id === contentId);
            if (content) {
                content.learningObjectives.splice(index, 1);
                refreshContentItem(divisionId, contentId);
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
        // Rebuild via DOM and replace
        const built = buildContentItemDOM(divisionId, content);
        const parent = itemContainer.parentElement;
        if (!parent) return;
        parent.replaceChild(built, itemContainer);
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
        const title = document.createElement('div');
        title.className = 'content-title';
        title.textContent = content.title;
        const statusRow = document.createElement('div');
        statusRow.className = 'content-status-row';
        const deleteBadge = document.createElement('div');
        deleteBadge.className = 'content-status status-delete-section';
        deleteBadge.textContent = 'Delete Section';
        const status = document.createElement('div');
        status.className = 'content-status status-completed';
        status.textContent = 'Completed';
        statusRow.appendChild(deleteBadge);
        statusRow.appendChild(status);
        header.appendChild(title);
        header.appendChild(statusRow);

        // Add event listener for delete badge
        deleteBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSection(divisionId, content.id);
        });

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
        const uploadIcon = document.createElement('div');
        uploadIcon.className = 'upload-icon';
        uploadIcon.textContent = '📁';
        const uploadText = document.createElement('div');
        uploadText.className = 'upload-text';
        uploadText.textContent = 'Upload your document here';
        uploadArea.appendChild(uploadIcon);
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

    // ----- Sessions management -----
    function addSession(division: ContentDivision) {
        // Generate a new unique content id within this division
        const existingIds = division.items.map(c => c.id);
        const base = parseInt(division.id) * 100 + 1; // e.g., week 3 -> 301 base
        let next = base;
        while (existingIds.includes(String(next))) next++;

        const newContent: courseItem = {
            id: String(next),
            title: `New Session ${division.items.length + 1}`,
            date: new Date(),
            courseName: currentClass.courseName,
            divisionTitle: division.title,
            itemTitle: `New Session ${division.items.length + 1}`,
            completed: false,
            learningObjectives: [],
            additionalMaterials: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        division.items.push(newContent);
        // Append to DOM
        const container = document.getElementById(`content-division-${division.id}`);
        if (!container) return;
        const built = buildContentItemDOM(division.id, newContent);
        container.appendChild(built);
        // Update header completion count
        updateDivisionCompletion(division.id);
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
            row.appendChild(meta);
            row.appendChild(actions);
            wrap.appendChild(row);
        });

        return wrap;
    }

    /**
     * Open the upload modal
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @returns null
     */
    function openUploadModal(divisionId: string, contentId: string) {
        // get the mount point for the modal
        const mount = document.getElementById('upload-modal-mount');
        if (!mount) return;

        // create the overlay for the modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay upload-modal-overlay';
        mount.innerHTML = '';
        mount.appendChild(overlay);
        document.body.classList.add('modal-open');

        // create the modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        overlay.appendChild(modal);

        // create the header for the modal
        const header = document.createElement('div');
        header.className = 'modal-header';
        const spacer = document.createElement('div');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'upload-close-btn';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';
        header.appendChild(spacer);
        header.appendChild(closeBtn);

        // create the content for the modal
        const content = document.createElement('div');
        content.className = 'modal-content';

        // create the first section for the modal
        const section1 = document.createElement('div');
        section1.className = 'form-section';

        // create the label for the first section
        const label1 = document.createElement('label');
        label1.className = 'section-label';
        label1.setAttribute('for', 'mat-name');
        label1.textContent = 'Content Title';

        // create the input for the first section
        const nameInput = document.createElement('input');
        nameInput.id = 'mat-name';
        nameInput.type = 'text';
        nameInput.className = 'text-input';
        nameInput.placeholder = 'Enter a name for this additional material...';
        section1.appendChild(label1);
        section1.appendChild(nameInput);



        // create the second section for the modal
        const section2 = document.createElement('div');
        section2.className = 'form-section';

        // create the label for the second section
        const label2 = document.createElement('label');
        label2.className = 'section-label';
        label2.setAttribute('for', 'mat-text');
        label2.textContent = 'Text Area';

        // create the textarea for the second section
        const textArea = document.createElement('textarea');
        textArea.id = 'mat-text';
        textArea.className = 'text-area';
        textArea.placeholder = 'Enter or paste your content directly here...';
        section2.appendChild(label2);
        section2.appendChild(textArea);

        // create the third section for the modal

        // create the upload card for the modal
        const uploadCard = document.createElement('div');
        uploadCard.className = 'upload-card';

        // create the button for the upload card (kept for semantics, but entire card is clickable)
        const uploadFileBtn = document.createElement('button');
        uploadFileBtn.id = 'upload-file-btn';
        uploadFileBtn.className = 'upload-file-btn';
        uploadFileBtn.textContent = '📁 Upload Content';

        // create the hidden input for the upload card
        const hiddenInput = document.createElement('input');
        hiddenInput.id = 'hidden-file-input';
        hiddenInput.type = 'file';
        hiddenInput.style.display = 'none';

        // create the file selected for the upload card
        const fileSelected = document.createElement('div');
        fileSelected.className = 'file-selected';
        const selectedFileName = document.createElement('span');
        selectedFileName.id = 'selected-file-name';
        selectedFileName.textContent = 'No file selected';
        fileSelected.appendChild(selectedFileName);
        uploadCard.appendChild(uploadFileBtn);
        uploadCard.appendChild(hiddenInput);
        uploadCard.appendChild(fileSelected);

        // append the sections to the content
        content.appendChild(section1);
        content.appendChild(section2);
        content.appendChild(uploadCard);



        // create the footer for the modal
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        // create the cancel button for the footer
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'upload-cancel-btn';
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';

        // create the upload button for the footer
        const uploadBtn = document.createElement('button');
        uploadBtn.id = 'upload-submit-btn';
        uploadBtn.className = 'save-btn';
        uploadBtn.textContent = 'Upload';
        footer.appendChild(cancelBtn);
        footer.appendChild(uploadBtn);

        // append the header, content, and footer to the modal
        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);



        // create the close function for the modal
        const close = () => {
            mount.innerHTML = '';
            document.body.classList.remove('modal-open');
        };

        // add the event listeners to the modal
        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
             if (e.target === overlay) close(); 
        });

        // create the event listener for the escape key
        window.addEventListener('keydown', function esc(e) { 
            if (e.key === 'Escape') { 
                close(); window.removeEventListener('keydown', esc); 
            } 
        });

        // create the event listener for the upload file button
        let selectedFile: File | null = null;
        uploadFileBtn.addEventListener('click', () => hiddenInput.click());
        // Make entire upload card act as the trigger
        // uploadCard.addEventListener('click', (e) => {
        //     // Avoid double-trigger from inner button
        //     if ((e.target as HTMLElement).id !== 'hidden-file-input') {
        //         hiddenInput.click();
        //     }
        // });
        hiddenInput.addEventListener('change', () => {
            const f = hiddenInput.files && hiddenInput.files[0] ? hiddenInput.files[0] : null;
            selectedFile = f;
            selectedFileName.textContent = f ? f.name : 'No file selected';
        });

        // create the event listener for the upload button
        uploadBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const text = textArea.value.trim();
            const url = '';
            if (!name) { alert('Please enter a material name.'); return; }
            if (!selectedFile && !url && !text) { alert('Provide a file, URL, or text content.'); return; }

            try {
                // get the division and the content item
                const division = courseData.find(d => d.id === divisionId);
                const contentItem = division?.items.find(c => c.id === contentId);
                if (!contentItem) return;
                if (!contentItem.additionalMaterials) contentItem.additionalMaterials = [];

                // create the id for the material
                const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
                const material: AdditionalMaterial = {
                    id,
                    name,
                    courseName: currentClass.courseName,
                    divisionTitle: division?.title || 'Unknown Content',
                    itemTitle: contentItem.title,
                    sourceType: 'text',
                    date: new Date(),
                    uploaded: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                let contentToUpload: string | null = null;

                // Handle different content sources
                if (selectedFile) {
                    // For now, only handle markdown files
                    if (selectedFile.name.toLowerCase().endsWith('.md')) {
                        const reader = new FileReader();
                        contentToUpload = await new Promise((resolve, reject) => {
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = () => reject(reader.error);
                            if (selectedFile) {
                            reader.readAsText(selectedFile);
                        }
                        });
                        material.sourceType = 'file';
                        material.file = selectedFile;
                        // Note: previewUrl is not part of the AdditionalMaterial interface
                    } else {
                        alert('Currently only supporting markdown (.md) files');
                        return;
                    }
                } else if (text) {
                    contentToUpload = text;
                    material.sourceType = 'text';
                    material.text = text;
                }

                // Upload to Qdrant if we have content
                if (contentToUpload) {
                    try {
                        const qdrantResult = await uploadTextToQdrant(contentToUpload);
                        console.log('Successfully uploaded to Qdrant:', qdrantResult);
                        material.uploaded = true;
                        // Store the Qdrant document ID in the material
                        material.qdrantId = qdrantResult.id;
                    } catch (error) {
                        console.error('Failed to upload to Qdrant:', error);
                        alert('Failed to upload content to Qdrant. Please try again.');
                        return;
                    }
                }

                // add the material to the content item
                contentItem.additionalMaterials.push(material);

                // refresh the content item
                refreshContentItem(divisionId, contentId);

                // close the modal
                close();
            } catch (error) {
                console.error('Error in upload process:', error);
                alert('An error occurred during upload. Please try again.');
            }
        });
    }

    /**
     * Delete an additional material
     * 
     * @param divisionId the id of the division
     * @param contentId the id of the content item
     * @param materialId the id of the material to delete
     * @returns null
     */
    function deleteAdditionalMaterial(
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
            alert('Division not found');
            return;
        }

        const content = division.items.find(c => c.id === contentId);
        if (!content || !content.additionalMaterials) {
            alert('Content not found');
            return;
        }

        content.additionalMaterials = content.additionalMaterials.filter(m => m.id !== materialId);
        refreshContentItem(divisionId, contentId);
        console.log('DEBUG #12');
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
            title.textContent = obj.subcontentTitle;

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

            // create the body for the objective
            const body = document.createElement('div');
            body.className = 'objective-content';
            body.id = `objective-content-${divisionId}-${contentId}-${index}`;

            // create the description for the objective
            const desc = document.createElement('div');
            desc.className = 'objective-description';
            desc.textContent = obj.content;

            // append the description to the body
            body.appendChild(desc);

            // append the header and body to the item
            item.appendChild(header);
            item.appendChild(body);
            wrapper.appendChild(item);
        });

        // create the wrapper for the add objective form
        const addWrap = document.createElement('div');
        addWrap.className = 'add-objective';

        // create the form for the add objective
        const addForm = document.createElement('div');
        addForm.className = 'add-objective-form';

        // create the title label for the add objective form
        const titleLabel = document.createElement('div');
        titleLabel.className = 'input-label';
        titleLabel.textContent = 'Learning Objective Title:';

        // create the title input for the add objective form
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'objective-title-input';
        titleInput.id = `new-title-${divisionId}-${contentId}`;
        titleInput.placeholder = 'Enter the learning objective title...';

        // create the description label for the add objective form
        const descLabel = document.createElement('div');
        descLabel.className = 'input-label';
        descLabel.textContent = 'Learning Objective Description:';

        // create the description input for the add objective form
        const descInput = document.createElement('textarea');
        descInput.className = 'objective-description-input';
        descInput.id = `new-description-${divisionId}-${contentId}`;
        descInput.placeholder = 'Enter a detailed description of what students will learn...';

        // create the add button for the add objective form
        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.dataset.action = 'add';
        addBtn.dataset.week = String(divisionId);
        addBtn.dataset.content = String(contentId);
        addBtn.textContent = 'Add Objective';

        // append the title, description, and add button to the form
        addForm.appendChild(titleLabel);
        addForm.appendChild(titleInput);
        addForm.appendChild(descLabel);
        addForm.appendChild(descInput);
        addForm.appendChild(addBtn);
        addWrap.appendChild(addForm);
        wrapper.appendChild(addWrap);

        return wrapper;
    }
}




















