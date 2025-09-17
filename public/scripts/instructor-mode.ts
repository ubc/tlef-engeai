import { loadComponentHTML, renderFeatherIcons } from "./functions/api.js";
import { activeCourse } from "../../src/functions/types.js";
import { initializeDocumentsPage } from "./feature/documents.js";
import { renderOnCourseSetup } from "./onboarding/course-setup.js";
import { renderDocumentSetup } from "./onboarding/document-setup.js";
import { initializeFlagReports } from "./feature/reports.js";
import { showChatCreationErrorModal } from "./modal-overlay.js";
import { ChatManager } from "./feature/chat.js";

// LaTeX rendering functions are now handled by ChatManager

const enum StateEvent {
    Chat,
    Report,
    Monitor,
    Documents
}

let currentClass : activeCourse =
{
    id: '',
    date: new Date(),
    courseSetup : false,
    contentSetup : false,
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
    const sideBarAddChatBtn = document.getElementById('add-chat-btn');
    const chatMenuEl = document.getElementById('chat-menu');
    const chatListEl = document.getElementById('chat-list-ul');

    // Current State
    let currentState : StateEvent = StateEvent.Documents;

    // --- STATE MANAGEMENT ----
    let isSidebarCollapsed: boolean = false;
    
    // Initialize ChatManager
    const chatManager = ChatManager.getInstance({
        isInstructor: true,
        userContext: currentClass,
        onModeSpecificCallback: (action: string, data?: any) => {
            if (action === 'sidebar-collapse') {
                // Handle sidebar collapse logic for chat mode
                const chatMenu = getChatMenu();
                if (chatMenu) {
                    if (isSidebarCollapsed) {
                        chatMenu.style.display = 'none';
                    } else {
                        chatMenu.style.display = 'block';
                    }
                }
            }
        }
    });
    
    // Initialize the chat manager
    chatManager.initialize();
    const chatStateEl = document.getElementById('chat-state');
    const reportStateEl = document.getElementById('report-state');
    const monitorStateEl = document.getElementById('monitor-state');
    const documentsStateEl = document.getElementById('documents-state');

    chatStateEl?.addEventListener('click', () => {
        if(currentState !== StateEvent.Chat) {
            currentState = StateEvent.Chat;
            updateUI();
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
            
            if (currentState === StateEvent.Chat) {
                // Use ChatManager callback for sidebar collapse handling
                chatManager.callModeSpecificCallback('sidebar-collapse', { isCollapsed: isSidebarCollapsed });
            }
            else {
                if(!sidebarMenuListEl) return;
                sidebarMenuListEl.classList.toggle('collapsed');
            }
        } );
    }
    
    sidebarCollapseToggle();

    const loadComponent = async (
        componentName :'welcome-screen' 
                        | 'chat-window' 
                        | 'report-instructor' 
                        | 'monitor-instructor' 
                        | 'documents-instructor' 
                        | 'report-history' 
                        | 'disclaimer'
                        | 'course-setup'
                        | 'document-setup'
        ) => {
        if (!mainContentAreaEl) return;
        try {
            const html = await loadComponentHTML(componentName);
            mainContentAreaEl.innerHTML = html;
            if (componentName === 'welcome-screen') {
                attachWelcomeScreenListeners();
            }
            else if (componentName === 'chat-window'){
                // Rebind message events after chat window is loaded
                chatManager.bindMessageEvents();
            }
            else if (componentName === 'documents-instructor') {
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

    const getChatMenu = () => document.getElementById('chat-menu');

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

        if ( currentState === StateEvent.Chat ) {

            if (!sidebarMenuListEl) return;
            // Only collapse the menu list if sidebar is not manually collapsed
            if (!isSidebarCollapsed && !sidebarMenuListEl.classList.contains('collapsed')) {
                sidebarMenuListEl.classList.toggle('collapsed');
            } else if (isSidebarCollapsed) {
                // Ensure menu list is collapsed if sidebar is manually collapsed
                sidebarMenuListEl.classList.add('collapsed');
            }
            
            const chats = chatManager.getChats();
            if (chats.length === 0) {
                loadComponent('welcome-screen');

                // Ensure chat menu is attached and visible
                const cm = getChatMenu();
                if (sidebarContentEl && cm && !sidebarContentEl.contains(cm)) {
                    sidebarContentEl.appendChild(cm);
                }
                if (cm && !isSidebarCollapsed) cm.style.display = 'block';
            }
            else{
                loadComponent('chat-window');

                //activate chat menu when the state is at chat
                const cm = getChatMenu();
                if (sidebarContentEl && cm && !sidebarContentEl.contains(cm)) {
                    sidebarContentEl.appendChild(cm);
                }
                if (cm) cm.style.display = 'block';

                chatManager.renderActiveChat();
            }
        }
        else if ( currentState === StateEvent.Report){
            loadComponent('report-instructor');
            sidebarNoChat();
        }
        else if ( currentState === StateEvent.Monitor){
            loadComponent('monitor-instructor');
            sidebarNoChat();
        }
        else if ( currentState === StateEvent.Documents){
            loadComponent('documents-instructor');
            sidebarNoChat();
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


    
    
    
    const sidebarNoChat = () => {
        if (sidebarMenuListEl) {
            if (isSidebarCollapsed) {
                sidebarMenuListEl.classList.add('collapsed');
            } else {
                sidebarMenuListEl.classList.remove('collapsed');
            }
        }
        const cm = getChatMenu();
        if (cm) cm.style.display = 'none';
        // Do not remove the chat-menu from the DOM; keep it mounted for quick return to Chat
    }

    // Scroll to bottom is now handled by ChatManager

    // // --- EVENT LISTENER ATTACHMENT ---

    //set custom windows listener on onboarding
    window.addEventListener('onboardingComplete', () => {
        console.log('current class is : ', JSON.stringify(currentClass));
        updateUI();
    })

    const attachWelcomeScreenListeners = () => {
        const welcomeBtn = document.getElementById('welcome-add-chat-btn');
        if (!welcomeBtn) return;
        welcomeBtn.addEventListener('click', async () => {
            const result = await chatManager.createNewChat();
            if (result.success) {
                chatManager.renderActiveChat();
                chatManager.renderChatList();
                chatManager.scrollToBottom();
                updateUI();
            } else {
                await showChatCreationErrorModal(result.error || 'Unknown error occurred');
            }
        });
    };

    // Chat window listeners are now handled by ChatManager
    const attachChatWindowListeners = () => {
        // This function is kept for compatibility but ChatManager handles all chat events
    };


    const sideBarAddChatListeners = () => {
        if (!sideBarAddChatBtn) return;
        sideBarAddChatBtn.addEventListener('click', async () => {
            const result = await chatManager.createNewChat();
            if (result.success) {
                chatManager.renderActiveChat();
                chatManager.renderChatList();
                chatManager.scrollToBottom();
                updateUI();
            } else {
                await showChatCreationErrorModal(result.error || 'Unknown error occurred');
            }
        });
    }


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