import { loadComponentHTML, renderFeatherIcons } from "./functions/api.js";
import { activeCourse, Student } from "../../src/functions/types.js";
import { initializeDocumentsPage } from "./feature/documents.js";
import { renderOnCourseSetup } from "./onboarding/course-setup.js";
import { renderDocumentSetup } from "./onboarding/document-setup.js";
import { initializeFlagReports } from "./feature/reports.js";
import { ChatManager, createDefaultStudent } from "./feature/chat.js";

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
    courseName:'APSC 077',
    instructors: [
    ],
    teachingAssistants: [
    ],
    frameType: 'byTopic',
    tilesNumber: 12,
    divisions: [
    ]
}

// ChatManager instance for instructor mode
let chatManager: ChatManager | null = null;

// Make chatManager and loadChatWindow globally accessible for fallback scenarios
declare global {
    interface Window {
        chatManager: ChatManager | null;
        loadChatWindow: () => Promise<void>;
    }
}

/**
 * Create a virtual student entity for instructor mode using active course context
 * This ensures consistency with the existing ChatManager structure
 */
function createInstructorVirtualStudent(): Student {
    return {
        id: 'instructor-virtual',
        name: 'Instructor User',
        courseAttended: currentClass.courseName || 'APSC 080', // Fallback to default course
        userId: 0 // Instructor ID
    };
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
    const chatListEl = document.getElementById('chat-list');

    // Current State
    let currentState : StateEvent = StateEvent.Documents;

    // --- STATE MANAGEMENT ----
    let isSidebarCollapsed: boolean = false;
    
    const reportStateEl = document.getElementById('report-state');
    const monitorStateEl = document.getElementById('monitor-state');
    const documentsStateEl = document.getElementById('documents-state');
    const chatStateEl = document.getElementById('chat-state');

    chatStateEl?.addEventListener('click', async () => {
        if (currentState !== StateEvent.Chat) {
            currentState = StateEvent.Chat;
            await showChatContent(); // Use async showChatContent instead of updateUI
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
            // Disable hamburger button when in chat mode
            if (currentState === StateEvent.Chat) {
                return; // Hamburger button is non-functional in chat mode
            }
            
            // Toggle the instructor-feature-sidebar (not the entire instructor-sidebar)
            if (!instructorFeatureSidebarEl) return;
            instructorFeatureSidebarEl.classList.toggle('collapsed');
            
            if(!logoBox) return;
            logoBox.classList.toggle('collapsed');
            
            // Update the collapse state tracking
            isSidebarCollapsed = instructorFeatureSidebarEl.classList.contains('collapsed');
            
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
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Monitor){
            loadComponent('monitor-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Documents){
            loadComponent('documents-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Chat){
            collapseFeatureSidebar();
            // showChatContent is now handled by the click event listener
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

    // Helper functions for chat behavior
    const hideChatList = () => {
        if (chatListEl) {
            chatListEl.classList.remove('active');
            //START DEBUG LOG : DEBUG-CODE(013)
            console.log('🚫 Chat list hidden (not in chat mode)');
            //END DEBUG LOG : DEBUG-CODE(013)
        }
    }

    const collapseFeatureSidebar = () => {
        if (!instructorFeatureSidebarEl) return;
        instructorFeatureSidebarEl.classList.add('collapsed');
        
        if(!logoBox) return;
        logoBox.classList.add('collapsed');
        
        if(!sidebarMenuListEl) return;
        sidebarMenuListEl.classList.add('collapsed');
        
        // Update the collapse state tracking
        isSidebarCollapsed = true;
    }

    const expandFeatureSidebar = () => {
        if (!instructorFeatureSidebarEl) return;
        instructorFeatureSidebarEl.classList.remove('collapsed');
        
        if(!logoBox) return;
        logoBox.classList.remove('collapsed');
        
        if(!sidebarMenuListEl) return;
        sidebarMenuListEl.classList.remove('collapsed');
        
        // Hide chat list when expanding feature sidebar
        hideChatList();
        
        // Update the collapse state tracking
        isSidebarCollapsed = false;
    }


    /**
     * Initialize ChatManager for instructor mode
     */
    const initializeChatManager = async (): Promise<void> => {
        try {
            //START DEBUG LOG : DEBUG-CODE(001)
            console.log('🚀 Initializing ChatManager for instructor mode...');
            console.log('📋 Current class:', currentClass.courseName);
            //END DEBUG LOG : DEBUG-CODE(001)
            
            // Create virtual student entity for instructor
            const virtualStudent = createInstructorVirtualStudent();
            
            //START DEBUG LOG : DEBUG-CODE(002)
            console.log('👤 Virtual student created:', virtualStudent);
            //END DEBUG LOG : DEBUG-CODE(002)
            
            // Initialize ChatManager with instructor context
            chatManager = ChatManager.getInstance({
                isInstructor: true,
                userContext: currentClass, // Use activeCourse for instructor mode
                onModeSpecificCallback: (action: string, data?: any) => {
                    //START DEBUG LOG : DEBUG-CODE(003)
                    console.log('📞 ChatManager callback:', action, data);
                    //END DEBUG LOG : DEBUG-CODE(003)
                    
                    // Handle instructor-specific chat callbacks
                    if (action === 'new-chat-created') {
                        // Load chat window when a new chat is created from sidebar
                        loadChatWindow();
                        
                        //START DEBUG LOG : DEBUG-CODE(015)
                        console.log('🆕 New chat created from sidebar, loading chat window');
                        //END DEBUG LOG : DEBUG-CODE(015)
                    } else if (action === 'chat-deleted') {
                        // Handle chat deletion - update main content area
                        console.log('🗑️ Chat deleted, updating main content area');
                        loadChatWindow();
                    }
                }
            });
            
            // Initialize the chat manager
            await chatManager.initialize();
            
            // Make chatManager globally accessible
            window.chatManager = chatManager;
            
            // Make loadChatWindow globally accessible
            window.loadChatWindow = loadChatWindow;
            
            //START DEBUG LOG : DEBUG-CODE(004)
            console.log('✅ ChatManager initialized successfully for instructor mode');
            //END DEBUG LOG : DEBUG-CODE(004)
            
            // Update UI after initialization
            updateChatUI();
            
        } catch (error) {
            console.error('❌ Error initializing ChatManager for instructor mode:', error);
        }
    };

    /**
     * Load chat window component in main content area
     */
    const loadChatWindow = async (): Promise<void> => {
        if (!mainContentAreaEl) return;
        
        // Check if there are actually chats to display
        if (chatManager && chatManager.getChats().length === 0) {
            console.log('🚫 No chats available, showing welcome screen instead of chat window');
            showWelcomeScreen();
            return;
        }
        
        try {
            // Load the chat-window component
            const chatWindowHTML = await loadComponentHTML('chat-window');
            mainContentAreaEl.innerHTML = chatWindowHTML;
            
            // Render the active chat in the loaded chat window
            if (chatManager) {
                chatManager.renderActiveChat();
                
                // Re-bind message events after chat window is loaded
                chatManager.rebindMessageEvents();
                
                //START DEBUG LOG : DEBUG-CODE(014)
                console.log('🔗 Message events re-bound after chat window load');
                //END DEBUG LOG : DEBUG-CODE(014)
            }
            
            renderFeatherIcons();
            
            //START DEBUG LOG : DEBUG-CODE(010)
            console.log('💬 Chat window loaded in main content area');
            //END DEBUG LOG : DEBUG-CODE(010)
            
        } catch (error) {
            console.error('Error loading chat window:', error);
            mainContentAreaEl.innerHTML = `
                <div class="error-message">
                    <h2>Chat Interface</h2>
                    <p>Failed to load chat interface. Please try again.</p>
                </div>
            `;
        }
    };

    /**
     * Update chat UI after ChatManager initialization
     */
    const updateChatUI = (): void => {
        if (!chatManager) return;
        
        //START DEBUG LOG : DEBUG-CODE(005)
        console.log('🔄 Updating chat UI for instructor mode...');
        //END DEBUG LOG : DEBUG-CODE(005)
        
        // Render chat list in the instructor's chat menu
        chatManager.renderChatList();
        
        // Show welcome screen if no chats exist, otherwise load chat window
        const chats = chatManager.getChats();
        
        //START DEBUG LOG : DEBUG-CODE(006)
        console.log('📊 Chat count:', chats.length);
        //END DEBUG LOG : DEBUG-CODE(006)
        
        if (chats.length === 0) {
            //START DEBUG LOG : DEBUG-CODE(007)
            console.log('📺 Showing welcome screen (no chats exist)');
            //END DEBUG LOG : DEBUG-CODE(007)
            showWelcomeScreen();
        } else {
            //START DEBUG LOG : DEBUG-CODE(008)
            console.log('💬 Loading chat window with active chat');
            //END DEBUG LOG : DEBUG-CODE(008)
            loadChatWindow();
        }
    };

    /**
     * Show welcome screen when no chats exist
     */
    const showWelcomeScreen = async (): Promise<void> => {
        if (!mainContentAreaEl) return;
        
        try {
            // Load welcome screen component
            const welcomeHTML = await loadComponentHTML('welcome-screen');
            mainContentAreaEl.innerHTML = welcomeHTML;
            
            // Bind welcome screen events
            const addChatBtn = mainContentAreaEl.querySelector('.welcome-add-btn');
            addChatBtn?.addEventListener('click', async () => {
                if (chatManager) {
                    //START DEBUG LOG : DEBUG-CODE(011)
                    console.log('🆕 Creating new chat from welcome screen...');
                    //END DEBUG LOG : DEBUG-CODE(011)
                    
                    const result = await chatManager.createNewChat();
                    if (result.success) {
                        //START DEBUG LOG : DEBUG-CODE(012)
                        console.log('✅ New chat created successfully, loading chat window');
                        //END DEBUG LOG : DEBUG-CODE(012)
                        
                        // Load chat window in main content area after creating new chat
                        await loadChatWindow();
                        
                        // Update chat list in sidebar
                        chatManager.renderChatList();
                        
                        // Re-bind message events after creating new chat
                        chatManager.rebindMessageEvents();
                    }
                }
            });
            
            renderFeatherIcons();
        } catch (error) {
            console.error('Error loading welcome screen:', error);
            mainContentAreaEl.innerHTML = `
                <div class="error-message">
                    <h2>Welcome to Instructor Chat</h2>
                    <p>Click the button below to start a new chat session.</p>
                    <button class="welcome-add-btn" onclick="if(window.chatManager) { window.chatManager.createNewChat().then(async result => { if(result.success) { await window.loadChatWindow(); window.chatManager.renderChatList(); } }); }">
                        Start New Chat
                    </button>
                </div>
            `;
        }
    };

    const showChatContent = async () => {
        // Ensure feature sidebar is collapsed when in chat mode
        collapseFeatureSidebar();
        
        //START DEBUG LOG : DEBUG-CODE(009)
        console.log('📱 Chat mode: Feature sidebar collapsed, chat list activated');
        //END DEBUG LOG : DEBUG-CODE(009)
        
        // Show chat list (slides in from left to right)
        if (chatListEl) {
            chatListEl.classList.add('active');
        }
        
        // Initialize ChatManager if not already done
        if (!chatManager) {
            await initializeChatManager();
        } else {
            // Update UI if ChatManager already exists
            updateChatUI();
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