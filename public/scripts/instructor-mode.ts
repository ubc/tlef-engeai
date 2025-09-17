import { loadComponentHTML, renderFeatherIcons } from "./functions/api.js";
import { activeCourse } from "../../src/functions/types.js";
import { initializeDocumentsPage } from "./feature/documents.js";
import { renderOnCourseSetup } from "./onboarding/course-setup.js";
import { renderDocumentSetup } from "./onboarding/document-setup.js";
import { initializeFlagReports } from "./feature/reports.js";

const enum StateEvent {
    Report,
    Monitor,
    Documents,
    Chat
}

let currentClass : activeCourse =
{
    id: '',
    date: new Date(),
    courseSetup : true,
    contentSetup : true,
    courseName:'',
    instructors: [
    ],
    teachingAssistants: [
    ],
    frameType: 'byTopic',
    tilesNumber: 12,
    divisions: [
    ]
}


document.addEventListener('DOMContentLoaded', () => {

    console.log("DOMContentLoaded is called");

    // Check for debug course in sessionStorage
    const debugCourseData = sessionStorage.getItem('debugCourse');
    if (debugCourseData) {
        try {
            const debugCourse = JSON.parse(debugCourseData);
            currentClass = debugCourse;
            console.log('Loaded debug course:', debugCourse.courseName);
            
            // Clear the debug course from sessionStorage after loading
            sessionStorage.removeItem('debugCourse');
        } catch (error) {
            console.error('Error parsing debug course data:', error);
        }
    }

    // Listen for document setup completion event
    window.addEventListener('documentSetupComplete', () => {
        console.log('📋 Document setup completed, redirecting to documents page...');
        
        // Redirect to documents page
        redirectToDocumentsPage();
    });

    /**
     * Redirect to documents page after document setup completion
     */
    function redirectToDocumentsPage(): void {
        console.log('🔄 Document setup completed, redirecting to documents page...');
        
        // Remove onboarding-active class from body
        document.body.classList.remove('onboarding-active');
        
        // Show the main instructor interface
        const mainContentArea = document.getElementById('main-content-area');
        if (mainContentArea) {
            mainContentArea.style.display = 'block';
        }
        
        // Show the sidebar
        const sidebar = document.querySelector('.instructor-sidebar');
        if (sidebar) {
            (sidebar as HTMLElement).style.display = 'block';
        }
        
        // Switch to documents view
        currentState = StateEvent.Documents;
        
        // Update the UI to switch to documents page
        updateUI();
        
        // Update the UI to reflect the completed setup
        updateUIAfterDocumentSetup();
        
        console.log('✅ Successfully redirected to documents page');
    }

    /**
     * Update UI elements after document setup completion
     */
    function updateUIAfterDocumentSetup(): void {
        // Update course status indicators
        const courseStatusElements = document.querySelectorAll('.course-status');
        courseStatusElements.forEach(element => {
            element.textContent = 'Setup Complete';
            element.classList.add('status-complete');
        });
        
        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'setup-complete-message';
        successMessage.innerHTML = `
            <div class="success-banner">
                <h3>✅ Document Setup Complete!</h3>
                <p>Your course materials have been successfully configured. You can now manage your course content.</p>
            </div>
        `;
        
        // Insert the success message at the top of the main content
        const mainContent = document.getElementById('main-content-area');
        if (mainContent && mainContent.firstChild) {
            mainContent.insertBefore(successMessage, mainContent.firstChild);
            
            // Remove the success message after 5 seconds
            setTimeout(() => {
                if (successMessage.parentNode) {
                    successMessage.parentNode.removeChild(successMessage);
                }
            }, 5000);
        }
    }

    // --- DOM ELEMNET SELECTORS ---
    const sidebarEl = document.querySelector('.instructor-sidebar');
    const logoBox = document.querySelector('.logo-box');
    const sidebarMenuListEl =document.querySelector('.sidebar-menu-list');
    const sidebarCollapseButton = document.querySelector('.sidebar-collapse-icon');
    const sidebarContentEl = document.getElementById('sidebar-content');
    const mainContentAreaEl = document.getElementById('main-content-area');
    const instructorFeatureSidebarEl = document.querySelector('.instructor-feature-sidebar');

    // Current State
    let currentState : StateEvent = StateEvent.Documents;

    // --- STATE MANAGEMENT ----
    let isSidebarCollapsed: boolean = false;
    
    const reportStateEl = document.getElementById('report-state');
    const monitorStateEl = document.getElementById('monitor-state');
    const documentsStateEl = document.getElementById('documents-state');
    const chatStateEl = document.getElementById('chat-state');

    chatStateEl?.addEventListener('click', () => {
        // Show error message for chat feature
        if (mainContentAreaEl) {
            mainContentAreaEl.innerHTML = `
                <div class="error-message">
                    <h2>Feature Not Available</h2>
                    <p>Chat feature is not available in instructor mode.</p>
                </div>
            `;
        }
    });

    reportStateEl?.addEventListener('click', () => {
        if (currentState !== StateEvent.Report) {
            currentState = StateEvent.Report;
            updateUI();
        }
    });

    monitorStateEl?.addEventListener('click', () => {
        if (currentState !== StateEvent.Monitor) {
            currentState = StateEvent.Monitor;
            updateUI();
        }
    });

    documentsStateEl?.addEventListener('click', () => {
        if (currentState !== StateEvent.Documents) {
            currentState = StateEvent.Documents;
            updateUI();
        }
    });



    // --- ESC KEY LISTENER FOR ARTEFACT PANEL ---
    let artefactEscListener: ((e: KeyboardEvent) => void) | null = null;

    const addArtefactEscListener = () => {
        if (artefactEscListener) return; // Already added
        
        artefactEscListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const panel = document.getElementById('artefact-panel');
                if (panel && panel.classList.contains('open')) {
                    toggleArtefactPanel();
                }
            }
        };
        
        document.addEventListener('keydown', artefactEscListener);
    };


    const removeArtefactEscListener = () => {
        if (artefactEscListener) {
            document.removeEventListener('keydown', artefactEscListener);
            artefactEscListener = null;
        }
    };

    const setupCloseArtefactBtn = () => {
        const closeArtefactBtn = document.getElementById('close-artefact-btn');
        if (!closeArtefactBtn) return;
        closeArtefactBtn.addEventListener('click', ()=> {
            toggleArtefactPanel();
        })
    }

    //Ensure sidebar collpase toggle
    const sidebarCollapseToggle = () => {
        if (!sidebarCollapseButton) return;
        sidebarCollapseButton.addEventListener('click', () => {
            if (!sidebarEl) return;
            sidebarEl.classList.toggle('collapsed');
            if(!logoBox) return;
            logoBox.classList.toggle('collapsed');
            
            // Update the collapse state tracking
            isSidebarCollapsed = sidebarEl.classList.contains('collapsed');
            
            if(!sidebarMenuListEl) return;
            sidebarMenuListEl.classList.toggle('collapsed');
            
        } );
    }
    
    sidebarCollapseToggle();

    const loadComponent = async (
        componentName :'report-instructor' 
                        | 'monitor-instructor' 
                        | 'documents-instructor' 
                        | 'report-history' 
                        | 'course-setup'
                        | 'document-setup'
        ) => {
        if (!mainContentAreaEl) return;
        try {
            const html = await loadComponentHTML(componentName);
            mainContentAreaEl.innerHTML = html;
            if (componentName === 'documents-instructor') {
                initializeDocumentsPage(currentClass);
            }
            else if (componentName === 'report-instructor') {
                initializeFlagReports();
            }
            else if (componentName === 'course-setup') {
                // Course setup component - handled by renderOnCourseSetup
            }
            else if (componentName === 'document-setup') {
                //course setup component - handled by renderDocumentSetup
            }
            renderFeatherIcons();
        }
        catch (error) {
            console.log(`Error loading component ${componentName}:`, error);
            mainContentAreaEl.innerHTML = `<p style="color: red; text-align: center;"> Error loading content. </p>`
        }
    };

    const updateUI = () => {

        // console.log("updateUI is called");
        // console.log("current state is : " + currentState.toString());
        // console.log("currentClass is : ", JSON.stringify(currentClass));

        if (!currentClass.courseSetup) {
            renderOnCourseSetup(currentClass);
            return;
        }
        if (!currentClass.contentSetup) {
            renderDocumentSetup(currentClass); // change this to renderOnContentSetup later
            return;
        }

        if ( currentState === StateEvent.Report){
            loadComponent('report-instructor');
            updateSidebarState();
        }
        else if ( currentState === StateEvent.Monitor){
            loadComponent('monitor-instructor');
            updateSidebarState();
        }
        else if ( currentState === StateEvent.Documents){
            loadComponent('documents-instructor');
            updateSidebarState();
        }
    }

    // Attempt to load CHBE220 class data from JSON and assign to state
    console.log("Attempting to load class data");



    // //make a get request for course
    // getCourse('CHBE251').then((data: activeCourse) => {
    //     console.log("data: ", JSON.stringify(data));
    //     currentClass = data;
    //     document.body.classList.remove('onboarding-active');
    //     updateUI();
    // }).catch(() => {
    //     console.log("Error loading class data");
    //     updateUI();
    // });


    // fetch('/api/mongodb/courses/CHBE241')
    //     .then(r => r.json())
    //     .then((data: activeCourse) => {
    //         currentClass = data;
    //         updateUI();
    //     })
    //     .catch(() => {
    //         console.log("Error loading class data");
    //         updateUI();
    //     });

    // make fucntio that makes a get request given a coursename
    async function getCourse (courseName: string){
        const response = await fetch(`/api/mongodb/courses/name/${courseName}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch course');
        }
        
        return result.data; // Return only the course data, not the wrapper object
    }


    
    
    
    const updateSidebarState = () => {
        if (sidebarMenuListEl) {
            if (isSidebarCollapsed) {
                sidebarMenuListEl.classList.add('collapsed');
            } else {
                sidebarMenuListEl.classList.remove('collapsed');
            }
        }
    }


    //set custom windows listener on onboarding
    window.addEventListener('onboardingComplete', () => {
        console.log('current class is : ', JSON.stringify(currentClass));
        updateUI();
    })


    const toggleArtefactPanel = () => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel) return;
        const willOpen = !panel.classList.contains('open');
        if (willOpen) {
            panel.classList.remove('closing');
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            // Add ESC listener when panel opens
            addArtefactEscListener();
        } else {
            // add a brief closing class so content fades, then remove .open
            panel.classList.add('closing');
            // allow fade-out to play before collapsing
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                // Remove ESC listener when panel closes
                removeArtefactEscListener();
            }, 180);
        }
        // mark dashboard state so CSS can split widths evenly
        if (dashboard) {
            dashboard.classList.toggle('artefact-open', willOpen);
        }

        // Lazy-load artefact content on open
        if (willOpen) {

            const container = panel.querySelector('.artefact-content') as HTMLElement | null;
            if (container && container.childElementCount === 0) {
                fetch('/components/artefact.html')
                    .then(res => res.text())
                    .then(html => {
                        container.innerHTML = html;
                        setupCloseArtefactBtn();
                        // Re-initialize Mermaid after content injection
                        try {
                            // @ts-ignore
                            if (window.mermaid && typeof window.mermaid.init === 'function') {
                                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                // @ts-ignore
                                window.mermaid.init(undefined, container.querySelectorAll('.mermaid'));
                            }
                        } catch {}
                    })
                    .catch(() => {
                        container.innerHTML = '<p style="padding:8px;color:var(--text-secondary)">Failed to load artefact.</p>';
                    });
            }
        }
    };

    updateUI();

});