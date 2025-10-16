

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
import { showConfirmModal, openUploadModal, showSimpleErrorModal, showDeleteConfirmationModal } from '../modal-overlay.js';

// In-memory store for the course data
let courseData: ContentDivision[] = [];

// Function to initialize the documents page
export async function initializeDocumentsPage( currentClass : activeCourse) {

        // Build initial in-memory data from onboarding selections
        loadClassroomData(currentClass);
        
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
                            //print the divisionId, contentId, and materialId
                            console.log('DEBUG #13: divisionId : ', divisionId, ' ; contentId : ', contentId, ' ; materialId : ', button.dataset.materialId);
                            deleteAdditionalMaterial(divisionId, contentId, button.dataset.materialId || '');
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
                console.log('Upload area clicked!', divisionId, contentId);
                openUploadModal(divisionId, contentId, handleUploadMaterial);
                    return;
            }
        });
    }

    // --- Event Handler Functions ---

    /**
     * Handles the upload of additional materials using DocumentUploadModule
     * 
     * @param material - The material object from the upload modal
     * @returns Promise<void>
     */
    async function handleUploadMaterial(material: any): Promise<void> {
        try {
            // Get the division and the content item
            const division = courseData.find(d => d.id === material.divisionId);
            const contentItem = division?.items.find(c => c.id === material.contentId);
            if (!contentItem) return;
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
            };

            // Use DocumentUploadModule for upload
            const uploadModule = new DocumentUploadModule((progress, stage) => {
                console.log(`Upload progress: ${progress}% - ${stage}`);
                // You could update a progress bar here if needed
            });

            const uploadResult: UploadResult = await uploadModule.uploadDocument(additionalMaterial);
            
            if (!uploadResult.success) {
                console.error('Upload failed:', uploadResult.error);
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
            refreshContentItem(material.divisionId, material.contentId);

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

        const contentDiv = document.getElementById(`objective-content-${divisionId}-${contentId}-${index}`);
        if (!contentDiv) {
            //START DEBUG LOG : DEBUG-CODE(039)
            console.error('❌ Content div not found for edit - ID:', `objective-content-${divisionId}-${contentId}-${index}`);
            //END DEBUG LOG : DEBUG-CODE(039)
            return;
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
        const title = document.createElement('div');
        title.className = 'content-title';
        title.textContent = content.title;
        const statusRow = document.createElement('div');
        statusRow.className = 'content-status-row';
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

        // Generate a new unique content id within this division
        const existingIds = division.items.map(c => c.id);
        const base = parseInt(division.id) * 100 + 1; // e.g., week 3 -> 301 base
        let next = base;
        while (existingIds.includes(String(next))) next++;

        const newContent: courseItem = {
            id: String(next),
            title: `New Section ${division.items.length + 1}`,
            date: new Date(),
            courseName: currentClass.courseName,
            divisionTitle: division.title,
            itemTitle: `New Section ${division.items.length + 1}`,
            completed: false,
            learningObjectives: [],
            additionalMaterials: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        try {
            //START DEBUG LOG : DEBUG-CODE(056)
            console.log('📡 Making API call to add section...');
            console.log('🌐 API URL:', `/api/courses/${currentClass.id}/divisions/${division.id}/items`);
            console.log('📦 Request body:', { contentItem: newContent });
            //END DEBUG LOG : DEBUG-CODE(056)
            
            // Call backend API to add the section
            const response = await fetch(`/api/courses/${currentClass.id}/divisions/${division.id}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contentItem: newContent
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
                
                // Add to local data only after successful database save
                division.items.push(newContent);
                
                // Append to DOM
                const container = document.getElementById(`content-division-${division.id}`);
                if (!container) return;
                const built = buildContentItemDOM(division.id, newContent);
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
}