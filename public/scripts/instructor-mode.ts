import { loadComponentHTML, renderFeatherIcons } from "./functions/api.js";
import { activeCourse, User } from "../../src/functions/types.js";
import { initializeDocumentsPage } from "./feature/documents.js";
import { renderOnCourseSetup } from "./onboarding/course-setup.js";
import { renderDocumentSetup } from "./onboarding/document-setup.js";
import { renderFlagSetup } from "./onboarding/flag-setup.js";
import { renderMonitorSetup } from "./onboarding/monitor-setup.js";
import { initializeFlags } from "./feature/flags.js";
import { initializeMonitorDashboard } from "./feature/monitor.js";
import { ChatManager, createDefaultUser } from "./feature/chat.js";
import { authService } from './services/AuthService.js';
import { showConfirmModal } from './modal-overlay.js';
import { renderAbout } from './about/about.js';
import { initializeCourseInformation } from './feature/course-information.js';

// Authentication check function
async function checkAuthentication(): Promise<boolean> {
    return await authService.checkAuthenticationAndRedirect('/pages/instructor-mode.html', 'INSTRUCTOR-MODE');
}

const enum StateEvent {
    Flag,
    Monitor,
    Documents,
    Chat
}

let currentClass : activeCourse =
{
    id: '',
    date: new Date(),
    courseSetup : false,
    contentSetup : false,
    flagSetup : false,
    monitorSetup : false,
    courseName:'APSC 099: Engineering for Kindergarten',
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

// Instructor User data (loaded from database)
let instructorUser: User | null = null;

// Make chatManager, loadChatWindow, and currentClass globally accessible for fallback scenarios
declare global {
    interface Window {
        chatManager: ChatManager | null;
        loadChatWindow: () => Promise<void>;
        currentClass: activeCourse;
    }
}

/**
 * Create a virtual student entity for instructor mode using active course context
 * This ensures consistency with the existing ChatManager structure
 * @deprecated No longer needed - using real instructor User from authentication
 */
function createInstructorVirtualUser(): User {
    return {
        name: 'Instructor User',
        puid: 'instructor-virt',
        userId: 0, // Instructor ID
        courseId: currentClass.id || 'current-course',
        courseName: currentClass.courseName || 'APSC 099', // Fallback to default course
        userOnboarding: false, // Instructors don't need onboarding
        affiliation: 'faculty',
        status: 'active',
        chats: [],
        createdAt: new Date(),
        updatedAt: new Date()
    };
}


// Flag to prevent multiple initializations
let isInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOMContentLoaded is called");
    
    // Prevent multiple initializations
    if (isInitialized) {
        console.log("Already initialized, skipping...");
        return;
    }
    isInitialized = true;

    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        console.log('[INSTRUCTOR-MODE] ❌ User not authenticated, redirecting to login...');
        return; // Stop execution if not authenticated
    }
    
    console.log('[INSTRUCTOR-MODE] 🚀 Loading instructor mode...');

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
    } else {
        // Load APSC 099 course from database (no debug course in session)
        //START DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-001)
        console.log('[INSTRUCTOR-MODE] 📚 No debug course, loading APSC 099 from database...');
        //END DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-001)
        
        try {
            const response = await fetch('/api/courses?name=APSC 099: Engineering for Kindergarten', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load course: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                currentClass = result.data;
                
                //START DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-002)
                console.log('[INSTRUCTOR-MODE] ✅ APSC 099 course loaded from database');
                console.log('[INSTRUCTOR-MODE] 📊 Course Data:', {
                    id: currentClass.id,
                    courseName: currentClass.courseName,
                    courseSetup: currentClass.courseSetup,
                    contentSetup: currentClass.contentSetup,
                    flagSetup: currentClass.flagSetup,
                    monitorSetup: currentClass.monitorSetup
                });
                //END DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-002)
            } else {
                //START DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-003)
                console.error('[INSTRUCTOR-MODE] ❌ Failed to load APSC 099 course:', result.error);
                //END DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-003)
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-004)
            console.error('[INSTRUCTOR-MODE] 🚨 Error loading course from database:', error);
            //END DEBUG LOG : DEBUG-CODE(INSTRUCTOR-LOAD-004)
        }
    }

    // Make currentClass globally accessible for onboarding completion
    window.currentClass = currentClass;

    // Listen for document setup completion event
    window.addEventListener('documentSetupComplete', () => {
        console.log('📋 Document setup completed, redirecting to documents page...');
        
        // Redirect to documents page
        redirectToDocumentsPage();
    });

    // Listen for flag setup completion event
    window.addEventListener('flagSetupComplete', () => {
        console.log('🏁 Flag setup completed, proceeding to monitor setup...');
        
        // Proceed to monitor setup (keep onboarding-active class to hide sidebar)
        // The updateUI() function will check currentClass.monitorSetup and show monitor setup
        updateUI();
    });

    // Listen for monitor setup completion event
    window.addEventListener('monitorSetupComplete', () => {
        console.log('📊 Monitor setup completed, redirecting to main interface...');
        
        // Redirect to main instructor interface
        redirectToMainInterface();
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
            (sidebar as HTMLElement).style.display = 'flex';
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
     * Redirect to main interface after flag setup completion
     */
    function redirectToMainInterface(): void {
        console.log('🔄 Flag setup completed, redirecting to main interface...');
        
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
            (sidebar as HTMLElement).style.display = 'flex';
        }
        
        // Switch to documents view (or default view)
        currentState = StateEvent.Documents;
        
        // Update the UI
        updateUI();
        
        console.log('✅ Successfully redirected to main interface');
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
    
    const flagStateEl = document.getElementById('flag-state');
    const monitorStateEl = document.getElementById('monitor-state');
    const documentsStateEl = document.getElementById('documents-state');
    const chatStateEl = document.getElementById('chat-state');

    chatStateEl?.addEventListener('click', async () => {
        if (currentState !== StateEvent.Chat) {
            currentState = StateEvent.Chat;
            await showChatContent(); // Use async showChatContent instead of updateUI
        }
    });

    flagStateEl?.addEventListener('click', () => {
        console.log('🖱️ [INSTRUCTOR-DEBUG] Flag state clicked');
        console.log('🖱️ [INSTRUCTOR-DEBUG] Current state:', currentState);
        console.log('🖱️ [INSTRUCTOR-DEBUG] Flag state enum:', StateEvent.Flag);
        
        if (currentState !== StateEvent.Flag) {
            console.log('🔄 [INSTRUCTOR-DEBUG] Switching to flag state');
            currentState = StateEvent.Flag;
            console.log('🔄 [INSTRUCTOR-DEBUG] Calling updateUI()');
            updateUI();
        } else {
            console.log('ℹ️ [INSTRUCTOR-DEBUG] Already in flag state, no action needed');
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



    // Artefact functionality moved to chat.ts

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
        componentName :'flag-instructor' 
                        | 'monitor-instructor' 
                        | 'documents-instructor' 
                        | 'flag-history' 
                        | 'course-setup'
                        | 'document-setup'
                        | 'course-information'
        ) => {
        console.log(`🚀 [INSTRUCTOR-DEBUG] Loading component: ${componentName}`);
        
        if (!mainContentAreaEl) {
            console.error('❌ [INSTRUCTOR-DEBUG] Main content area element not found!');
            return;
        }
        
        try {
            console.log(`📡 [INSTRUCTOR-DEBUG] Fetching HTML for component: ${componentName}`);
            const html = await loadComponentHTML(componentName);
            console.log(`✅ [INSTRUCTOR-DEBUG] HTML fetched successfully for: ${componentName}`);
            
            console.log(`🎨 [INSTRUCTOR-DEBUG] Setting innerHTML for component: ${componentName}`);
            mainContentAreaEl.innerHTML = html;
            
            if (componentName === 'documents-instructor') {
                console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing documents page...`);
                initializeDocumentsPage(currentClass);
            }
            else if (componentName === 'flag-instructor') {
                console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing flags...`);
                console.log(`🔧 [INSTRUCTOR-DEBUG] Current class data:`, currentClass);
                console.log(`🔧 [INSTRUCTOR-DEBUG] Window.currentClass:`, (window as any).currentClass);
                await initializeFlags();
            }
            else if (componentName === 'monitor-instructor') {
                console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing monitor dashboard...`);
                initializeMonitorDashboard();
            }
            else if (componentName === 'course-setup') {
                console.log(`🔧 [INSTRUCTOR-DEBUG] Course setup component - handled by renderOnCourseSetup`);
                // Course setup component - handled by renderOnCourseSetup
            }
            else if (componentName === 'document-setup') {
                console.log(`🔧 [INSTRUCTOR-DEBUG] Document setup component - handled by renderDocumentSetup`);
                //course setup component - handled by renderDocumentSetup
            }
            else if (componentName === 'course-information') {
                console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing course information...`);
                await initializeCourseInformation(currentClass);
            }
            
            console.log(`🎨 [INSTRUCTOR-DEBUG] Rendering feather icons...`);
            renderFeatherIcons();
            
            console.log(`✅ [INSTRUCTOR-DEBUG] Component ${componentName} loaded successfully`);
        }
        catch (error) {
            console.error(`❌ [INSTRUCTOR-DEBUG] Error loading component ${componentName}:`, error);
            console.error(`❌ [INSTRUCTOR-DEBUG] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
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
        if (!currentClass.flagSetup) {
            renderFlagSetup(currentClass);
            return;
        }
        if (!currentClass.monitorSetup) {
            renderMonitorSetup(currentClass);
            return;
        }

        if ( currentState === StateEvent.Flag){
            console.log('🎯 [INSTRUCTOR-DEBUG] updateUI() handling flag state');
            console.log('🎯 [INSTRUCTOR-DEBUG] Calling loadComponent("flag-instructor")');
            loadComponent('flag-instructor');
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
            updateSidebarState(); // Update menu active state
            collapseFeatureSidebar();
            // showChatContent is now handled by the click event listener
        }
    }

    // Attempt to load CHBE220 class data from JSON and assign to state
    console.log("Attempting to load class data");



    // Load course data from database
    getCourse('APSC 099: Engineering for Kindergarten').then((data: activeCourse) => {
        console.log("✅ Loaded course data: ", JSON.stringify(data));
        currentClass = data;
        
        // Make currentClass globally accessible for flags.ts
        window.currentClass = currentClass;
        
        // Check if onboarding is needed
        if (currentClass.courseSetup && currentClass.contentSetup && currentClass.flagSetup && currentClass.monitorSetup) {
            // All setup complete, show main interface
            document.body.classList.remove('onboarding-active');
            updateUI();
        } else {
            // Show appropriate onboarding step
            updateUI();
        }
    }).catch((error) => {
        console.error("❌ Error loading course data:", error);
        // Fallback to hardcoded data if API fails
        console.log("🔄 Using fallback course data");
        updateUI();
    });


    // fetch('/api/courses/courses/CHBE241')
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
        const response = await fetch(`/api/courses?name=${courseName}`, {
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
        // Handle collapsed state
        if (sidebarMenuListEl) {
            if (isSidebarCollapsed) {
                sidebarMenuListEl.classList.add('collapsed');
            } else {
                sidebarMenuListEl.classList.remove('collapsed');
            }
        }
        
        // Handle active state for menu items
        // Remove active class from all menu items first
        documentsStateEl?.classList.remove('active');
        chatStateEl?.classList.remove('active');
        flagStateEl?.classList.remove('active');
        monitorStateEl?.classList.remove('active');
        
        // Add active class to the current state's menu item
        switch(currentState) {
            case StateEvent.Documents:
                documentsStateEl?.classList.add('active');
                break;
            case StateEvent.Chat:
                chatStateEl?.classList.add('active');
                break;
            case StateEvent.Flag:
                flagStateEl?.classList.add('active');
                break;
            case StateEvent.Monitor:
                monitorStateEl?.classList.add('active');
                break;
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
            
            // Get instructor's real User data from authentication
            const authState = authService.getAuthState();
            if (!authState.isAuthenticated || !authState.user) {
                console.error('[INSTRUCTOR-MODE] ❌ No authenticated user found');
                return;
            }
            
            // Create instructor User object from auth data
            instructorUser = {
                name: `${authState.user.firstName} ${authState.user.lastName}`,
                puid: authState.user.puid,
                userId: 0, // Will be fetched from database
                courseId: 'apsc-099',
                courseName: currentClass.courseName,
                userOnboarding: false,
                affiliation: 'faculty',
                status: 'active',
                chats: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            //START DEBUG LOG : DEBUG-CODE(002)
            console.log('👤 Instructor user data loaded:', {
                name: instructorUser!.name,
                puid: instructorUser!.puid,
                courseName: instructorUser!.courseName
            });
            //END DEBUG LOG : DEBUG-CODE(002)
            
            // Initialize ChatManager with instructor User context
            chatManager = ChatManager.getInstance({
                isInstructor: true,
                userContext: instructorUser!, // Use instructor User object instead of activeCourse
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
                    } else if (action === 'chat-clicked') {
                        // Chat is fully loaded from sidebar click, switch to chat window
                        console.log('[INSTRUCTOR-MODE] 💬 Chat loaded and ready, switching to chat window');
                        if (data?.loaded) {
                            loadChatWindow();
                        }
                    } else if (action === 'chat-load-failed') {
                        console.error('[INSTRUCTOR-MODE] ❌ Chat loading failed:', data?.error);
                        showWelcomeScreen();
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
        // Update menu active state
        updateSidebarState();
        
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

    // --- LOGOUT FUNCTIONALITY ---
    const handleInstructorLogout = async (): Promise<void> => {
        try {
            // Show confirmation modal
            const result = await showConfirmModal(
                'Confirm Logout',
                'Are you sure you want to log out? You will be redirected to the login page.',
                'Log Out',
                'Cancel'
            );
            if (result.action !== 'log-out') {
                console.log('[INSTRUCTOR-MODE] 🚫 Logout cancelled by user');
                return;
            }
            
            console.log('[INSTRUCTOR-MODE] 🚪 Initiating logout...');
            
            // Check current authentication status before logout
            const authCheck = await fetch('/auth/me', {
                method: 'GET',
                credentials: 'include'
            });
            const authData = await authCheck.json();
            console.log('[INSTRUCTOR-MODE] 📋 Current auth status before logout:', authData);
            
            // Call logout endpoint - let the browser follow the redirect naturally
            console.log('[INSTRUCTOR-MODE] 🔄 Redirecting to logout endpoint...');
            window.location.href = '/auth/logout';
            
        } catch (error) {
            console.error('[INSTRUCTOR-MODE] 🚨 Logout error:', error);
            // Fallback: redirect to login page
            window.location.href = '/auth/login';
        }
    };

    const attachInstructorLogoutListener = () => {
        const logoutBtn = document.getElementById('instructor-logout-btn');
        if (!logoutBtn) {
            console.warn('[INSTRUCTOR-MODE] ⚠️ Logout button not found');
            return;
        }
        
        logoutBtn.addEventListener('click', handleInstructorLogout);
        console.log('[INSTRUCTOR-MODE] ✅ Logout button listener attached');

        // About button listener
        const aboutBtn = document.getElementById('instructor-about-btn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', async () => {
                console.log('[INSTRUCTOR-MODE] ℹ️ About button clicked');
                await renderAbout({ state: currentState, mode: 'instructor' });
            });
            console.log('[INSTRUCTOR-MODE] ✅ About button listener attached');
        }

        // Course Information button listener
        const courseInfoBtn = document.getElementById('instructor-course-info-btn');
        if (courseInfoBtn) {
            courseInfoBtn.addEventListener('click', async () => {
                console.log('[INSTRUCTOR-MODE] ⚙️ Course Information button clicked');
                
                // Load the course-information component
                await loadComponent('course-information');
                
                // Ensure sidebar stays expanded
                expandFeatureSidebar();
                
                // Hide chat list
                hideChatList();
            });
            console.log('[INSTRUCTOR-MODE] ✅ Course Information button listener attached');
        }
    };

    // --- STATE RESTORATION ---
    const restorePreviousState = () => {
        console.log('[INSTRUCTOR-MODE] 🔄 Restoring previous state:', currentState);
        updateUI();
    };

    // Listen for about page close event
    window.addEventListener('about-page-closed', restorePreviousState);
    
    // Listen for course info page close event
    window.addEventListener('course-info-closed', restorePreviousState);

    // Artefact functionality moved to chat.ts

    // Attach logout button listener
    attachInstructorLogoutListener();
    
    updateUI();

});