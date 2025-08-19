import { WeeklySection, CourseContent, LearningObjective, AdditionalMaterial } from '../functions/types';

// In-memory store for the course data
let courseData: WeeklySection[] = [];

// Function to initialize the documents page
export function initializeDocumentsPage() {
    //
    console.log('Documents page initialized');
    generateInitialData();
    renderDocumentsPage();
    setupEventListeners();
}

// Generate initial empty data structure for 12 weeks
function generateInitialData() {
    if (courseData.length > 0) return; // Don't regenerate if data exists
    for (let i = 1; i <= 12; i++) {
        const week: WeeklySection = {
            weekNumber: i,
            title: `WEEK ${i}`,
            content: [
                { id: 1, title: `Lecture ${ (i - 1) * 3 + 1}`, status: 'Draft', learningObjectives: [], files: [] },
                { id: 2, title: `Lecture ${ (i - 1) * 3 + 2}`, status: 'Draft', learningObjectives: [], files: [] },
                { id: 3, title: `Lecture ${ (i - 1) * 3 + 3}`, status: 'Draft', learningObjectives: [], files: [] },
                { id: 4, title: `Tutorial ${i}`, status: 'Draft', learningObjectives: [], files: [] },
            ]
        };
        courseData.push(week);
    }
}

// Render the entire documents page from the courseData
function renderDocumentsPage() {
    const container = document.getElementById('documents-container');
    if (!container) return;

    container.innerHTML = courseData.map(week => renderWeek(week)).join('');
}

// Render a single week section
function renderWeek(week: WeeklySection): string {
    const sectionsCompleted = week.content.filter(c => c.status === 'Published').length;
    const totalSections = week.content.length;

    return `
        <div class="week-section">
            <div class="week-header" data-week="${week.weekNumber}">
                <div>
                    <div class="week-title">${week.title}</div>
                    <div class="completion-status">${sectionsCompleted} / ${totalSections} Sections completed</div>
                </div>
                <div class="week-status">
                    <div class="expand-icon" id="icon-${week.weekNumber}">▼</div>
                </div>
            </div>
            <div class="week-content" id="content-${week.weekNumber}">
                ${week.content.map(content => renderContentItem(week.weekNumber, content)).join('')}
            </div>
        </div>
    `;
}

// Render a single content item (lecture/tutorial)
function renderContentItem(weekNumber: number, content: CourseContent): string {
    return `
        <div class="content-item" id="content-item-${weekNumber}-${content.id}">
            <div class="content-header">
                <div class="content-title">${content.title}</div>
                <div class="content-status ${content.status === 'Published' ? 'status-published' : 'status-draft'}">${content.status}</div>
            </div>
            <div class="learning-objectives">
                <div class="objectives-accordion">
                    <div class="objectives-header" data-week="${weekNumber}" data-content="${content.id}">
                        <div class="objectives-title">Learning Objectives</div>
                        <div class="objectives-count">
                            <span id="count-${weekNumber}-${content.id}">${content.learningObjectives.length}</span> objectives
                            <span class="expand-icon" id="obj-icon-${weekNumber}-${content.id}">▼</span>
                        </div>
                    </div>
                    <div class="objectives-content" id="objectives-${weekNumber}-${content.id}">
                        ${renderObjectives(weekNumber, content.id)}
                    </div>
                </div>
            </div>
            <div class="document-upload">
                <div class="upload-area">
                    <div class="upload-icon">📁</div>
                    <div class="upload-text">Upload your document here</div>
                </div>
            </div>
            ${renderAdditionalMaterials(content)}
        </div>
    `;
}

// Render the learning objectives section for a content item
function renderObjectives(weekNumber: number, contentId: number): string {
    const week = courseData.find(w => w.weekNumber === weekNumber);
    const content = week?.content.find(c => c.id === contentId);
    if (!content) return '';

    let html = content.learningObjectives.map((obj, index) => `
        <div class="objective-item">
            <div class="objective-header" data-week="${weekNumber}" data-content="${contentId}" data-objective="${index}">
                <div class="objective-title">${obj.title}</div>
                <div class="objective-actions">
                    <button class="action-btn edit-btn" data-action="edit">Edit</button>
                    <button class="action-btn delete-btn" data-action="delete">Delete</button>
                    <span class="expand-icon" id="item-icon-${weekNumber}-${contentId}-${index}">▼</span>
                </div>
            </div>
            <div class="objective-content" id="objective-content-${weekNumber}-${contentId}-${index}">
                <div class="objective-description">${obj.description}</div>
            </div>
        </div>
    `).join('');

    html += `
        <div class="add-objective">
            <div class="add-objective-form">
                <div class="input-label">Objective Title:</div>
                <input type="text" class="objective-title-input" id="new-title-${weekNumber}-${contentId}" placeholder="Enter the learning objective title...">
                <div class="input-label">Objective Description:</div>
                <textarea class="objective-description-input" id="new-description-${weekNumber}-${contentId}" placeholder="Enter a detailed description of what students will learn..."></textarea>
                <button class="add-btn" data-action="add" data-week="${weekNumber}" data-content="${contentId}">Add Objective</button>
            </div>
        </div>
    `;

    return html;
}

// Setup all event listeners for the page
function setupEventListeners() {
    const container = document.getElementById('documents-container');
    if (!container) return;

    container.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;

        // Week header toggles
        const weekHeader = target.closest('.week-header');
        if (weekHeader) {
            const weekNumber = parseInt(weekHeader.getAttribute('data-week')!, 10);
            toggleWeek(weekNumber);
            return;
        }

        // Objectives accordion toggles
        const objectivesHeader = target.closest('.objectives-header');
        if (objectivesHeader) {
            const weekNumber = parseInt(objectivesHeader.getAttribute('data-week')!, 10);
            const contentId = parseInt(objectivesHeader.getAttribute('data-content')!, 10);
            toggleObjectives(weekNumber, contentId);
            return;
        }

        // Individual objective item toggles
        const objectiveHeader = target.closest('.objective-header');
        if (objectiveHeader) {
            const weekNumber = parseInt(objectiveHeader.getAttribute('data-week')!, 10);
            const contentId = parseInt(objectiveHeader.getAttribute('data-content')!, 10);
            const objectiveIndex = parseInt(objectiveHeader.getAttribute('data-objective')!, 10);
            toggleObjectiveItem(weekNumber, contentId, objectiveIndex);
            return;
        }
        
        // Upload area -> open modal
        const uploadArea = target.closest('.upload-area');
        if (uploadArea) {
            const contentItem = uploadArea.closest('.content-item');
            if (contentItem) {
                const ids = contentItem.id.split('-'); // content-item-WEEK-CONTENTID
                const weekNumber = parseInt(ids[2], 10);
                const contentId = parseInt(ids[3], 10);
                openUploadModal(weekNumber, contentId);
                return;
            }
        }
        
        // Handle actions on buttons
        const button = target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        if (!action) return;
        
        const objectiveItem = button.closest('.objective-item');
        const headerElement = objectiveItem?.querySelector('.objective-header') as HTMLElement | null;
        const weekNumber = parseInt(button.dataset.week || headerElement?.dataset.week || '0', 10);
        const contentId = parseInt(button.dataset.content || headerElement?.dataset.content || '0', 10);
        const objectiveIndex = parseInt(headerElement?.dataset.objective || '-1', 10);


        switch (action) {
            case 'add':
                addObjective(weekNumber, contentId);
                break;
            case 'edit':
                event.stopPropagation();
                editObjective(weekNumber, contentId, objectiveIndex);
                break;
            case 'delete':
                event.stopPropagation();
                deleteObjective(weekNumber, contentId, objectiveIndex);
                break;
            case 'save':
                 event.stopPropagation();
                saveObjective(weekNumber, contentId, objectiveIndex);
                break;
            case 'cancel':
                 event.stopPropagation();
                cancelEdit(weekNumber, contentId);
                break;
            case 'delete-material':
                event.stopPropagation();
                deleteAdditionalMaterial(weekNumber, contentId, button.dataset.materialId || '');
                break;
        }
    });
}

// --- Event Handler Functions ---

function toggleWeek(weekNumber: number) {
    const content = document.getElementById(`content-${weekNumber}`);
    const icon = document.getElementById(`icon-${weekNumber}`);
    if (content && icon) {
        content.classList.toggle('expanded');
        icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

function toggleObjectives(weekNumber: number, contentId: number) {
    const content = document.getElementById(`objectives-${weekNumber}-${contentId}`);
    const icon = document.getElementById(`obj-icon-${weekNumber}-${contentId}`);
    if (content && icon) {
        content.classList.toggle('expanded');
        icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

function toggleObjectiveItem(weekNumber: number, contentId: number, index: number) {
    const content = document.getElementById(`objective-content-${weekNumber}-${contentId}-${index}`);
    const icon = document.getElementById(`item-icon-${weekNumber}-${contentId}-${index}`);
    if (content && icon) {
        content.classList.toggle('expanded');
        icon.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

function addObjective(weekNumber: number, contentId: number) {
    const titleInput = document.getElementById(`new-title-${weekNumber}-${contentId}`) as HTMLInputElement;
    const descriptionInput = document.getElementById(`new-description-${weekNumber}-${contentId}`) as HTMLTextAreaElement;

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!title || !description) {
        alert('Please fill in both title and description.');
        return;
    }

    const week = courseData.find(w => w.weekNumber === weekNumber);
    const content = week?.content.find(c => c.id === contentId);
    if (content) {
        content.learningObjectives.push({ title, description, published: false });
        titleInput.value = '';
        descriptionInput.value = '';
        // Re-render only the affected content item for efficiency
        refreshContentItem(weekNumber, contentId);
    }
}

function editObjective(weekNumber: number, contentId: number, index: number) {
    const objective = courseData.find(w => w.weekNumber === weekNumber)
                                ?.content.find(c => c.id === contentId)
                                ?.learningObjectives[index];
    if (!objective) return;

    const contentDiv = document.getElementById(`objective-content-${weekNumber}-${contentId}-${index}`);
    if (!contentDiv) return;

    contentDiv.innerHTML = `
        <div class="edit-form">
            <input type="text" class="edit-input" id="edit-title-${weekNumber}-${contentId}-${index}" value="${objective.title}">
            <textarea class="edit-input" id="edit-desc-${weekNumber}-${contentId}-${index}">${objective.description}</textarea>
            <div class="edit-actions">
                <button class="save-btn" data-action="save" data-week="${weekNumber}" data-content="${contentId}" data-objective="${index}">Save</button>
                <button class="cancel-btn" data-action="cancel" data-week="${weekNumber}" data-content="${contentId}">Cancel</button>
            </div>
        </div>
    `;
    contentDiv.classList.add('expanded');
}

function saveObjective(weekNumber: number, contentId: number, index: number) {
    const title = (document.getElementById(`edit-title-${weekNumber}-${contentId}-${index}`) as HTMLInputElement).value.trim();
    const description = (document.getElementById(`edit-desc-${weekNumber}-${contentId}-${index}`) as HTMLTextAreaElement).value.trim();

    if (!title || !description) {
        alert('Title and description cannot be empty.');
        return;
    }
    const objective = courseData.find(w => w.weekNumber === weekNumber)
                                ?.content.find(c => c.id === contentId)
                                ?.learningObjectives[index];
    if (objective) {
        objective.title = title;
        objective.description = description;
        refreshContentItem(weekNumber, contentId);
    }
}

function cancelEdit(weekNumber: number, contentId: number) {
    refreshContentItem(weekNumber, contentId);
}

function deleteObjective(weekNumber: number, contentId: number, index: number) {
    if (confirm('Are you sure you want to delete this objective?')) {
        const content = courseData.find(w => w.weekNumber === weekNumber)
                                    ?.content.find(c => c.id === contentId);
        if (content) {
            content.learningObjectives.splice(index, 1);
            refreshContentItem(weekNumber, contentId);
        }
    }
}

// Helper to refresh a single content item instead of the whole page
function refreshContentItem(weekNumber: number, contentId: number) {
    const content = courseData.find(w => w.weekNumber === weekNumber)?.content.find(c => c.id === contentId);
    const itemContainer = document.getElementById(`content-item-${weekNumber}-${contentId}`);
    
    if (content && itemContainer) {
        itemContainer.outerHTML = renderContentItem(weekNumber, content);
    }
}

// Make functions globally available for inline event handlers if needed,
// but the delegated event listener is the primary method.
// Example: (window as any).toggleWeek = toggleWeek;

// ----- Additional Materials (front-end only) -----

function renderAdditionalMaterials(content: CourseContent): string {
    const items = content.additionalMaterials || [];
    if (items.length === 0) return '';
    const list = items.map(m => `
        <div class="additional-material" data-material-id="${m.id}">
            <div class="am-title">${m.name}</div>
            <div class="am-meta">${m.sourceType === 'file' ? 'File' : m.sourceType === 'url' ? 'URL' : 'Text'}</div>
            <div class="am-actions">
                <button class="action-btn delete-btn" data-action="delete-material" data-material-id="${m.id}">Delete</button>
            </div>
        </div>
    `).join('');
    return `<div class="additional-materials">${list}</div>`;
}

function openUploadModal(weekNumber: number, contentId: number) {
    const mount = document.getElementById('upload-modal-mount');
    if (!mount) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay upload-modal-overlay';
    overlay.innerHTML = getUploadModalHTML();
    mount.innerHTML = '';
    mount.appendChild(overlay);
    document.body.classList.add('modal-open');

    const close = () => {
        mount.innerHTML = '';
        document.body.classList.remove('modal-open');
    };

    const closeBtn = overlay.querySelector('.upload-close-btn') as HTMLButtonElement | null;
    const cancelBtn = overlay.querySelector('#upload-cancel-btn') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    window.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', esc); } });

    const fileBtn = overlay.querySelector('#upload-file-btn') as HTMLButtonElement | null;
    const fileInput = overlay.querySelector('#hidden-file-input') as HTMLInputElement | null;
    const fileName = overlay.querySelector('#selected-file-name') as HTMLSpanElement | null;
    let selectedFile: File | null = null;
    fileBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        selectedFile = f;
        if (fileName) fileName.textContent = f ? f.name : 'No file selected';
    });

    const uploadBtn = overlay.querySelector('#upload-submit-btn') as HTMLButtonElement | null;
    uploadBtn?.addEventListener('click', () => {
        const name = (overlay.querySelector('#mat-name') as HTMLInputElement).value.trim();
        const url = (overlay.querySelector('#mat-url') as HTMLInputElement).value.trim();
        const text = (overlay.querySelector('#mat-text') as HTMLTextAreaElement).value.trim();

        if (!name) {
            alert('Please enter a material name.');
            return;
        }
        if (!selectedFile && !url && !text) {
            alert('Provide a file, URL, or text content.');
            return;
        }

        const week = courseData.find(w => w.weekNumber === weekNumber);
        const content = week?.content.find(c => c.id === contentId);
        if (!content) return;
        if (!content.additionalMaterials) content.additionalMaterials = [];

        const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const material: AdditionalMaterial = { id, name, sourceType: 'text', status: 'added' };
        if (selectedFile) {
            material.sourceType = 'file';
            material.file = selectedFile;
            material.previewUrl = URL.createObjectURL(selectedFile);
        } else if (url) {
            material.sourceType = 'url';
            material.url = url;
        } else if (text) {
            material.sourceType = 'text';
            material.text = text;
        }
        content.additionalMaterials.push(material);
        refreshContentItem(weekNumber, contentId);
        close();
    });
}

function deleteAdditionalMaterial(weekNumber: number, contentId: number, materialId: string) {
    const week = courseData.find(w => w.weekNumber === weekNumber);
    const content = week?.content.find(c => c.id === contentId);
    if (!content || !content.additionalMaterials) return;
    content.additionalMaterials = content.additionalMaterials.filter(m => m.id !== materialId);
    refreshContentItem(weekNumber, contentId);
}

function getUploadModalHTML(): string {
    return `
    <div class="modal">
        <div class="modal-header">
            <h2>Upload Additional Material</h2>
            <button class="upload-close-btn" aria-label="Close">×</button>
        </div>
        <div class="modal-content">
            <div class="upload-card">
                <button id="upload-file-btn" class="upload-file-btn">📁 Upload Content</button>
                <input id="hidden-file-input" type="file" style="display:none" />
                <div class="file-selected"><span id="selected-file-name">No file selected</span></div>
            </div>
            <div class="form-section">
                <label class="section-label" for="mat-name">Material Name</label>
                <input id="mat-name" type="text" class="text-input" placeholder="Enter a name for this additional material..." />
            </div>
            <div class="form-section">
                <label class="section-label" for="mat-url">URL Input</label>
                <input id="mat-url" type="url" class="text-input" placeholder="Enter URL to import content from web..." />
            </div>
            <div class="form-section">
                <label class="section-label" for="mat-text">Text Area</label>
                <textarea id="mat-text" class="text-area" placeholder="Enter or paste your content directly here..."></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button id="upload-cancel-btn" class="cancel-btn">Cancel</button>
            <button id="upload-submit-btn" class="save-btn">Upload</button>
        </div>
    </div>`;
}
