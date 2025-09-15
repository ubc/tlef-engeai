import { loadComponentHTML, renderFeatherIcons, sendMessageToServer, createNewChat, CreateChatRequest } from "./functions/api.js";
import { activeCourse, Chat, ChatMessage } from "../../src/functions/types.js";
import { initializeDocumentsPage } from "./feature/documents.js";
import { renderOnCourseSetup } from "./onboarding/course-setup.js";
import { renderDocumentSetup } from "./onboarding/document-setup.js";
import { initializeFlagReports } from "./feature/reports.js";
import { showChatCreationErrorModal } from "./modal-overlay.js";

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
    let chats: Chat[] = []
    let activeChatId: string | null = null;
    let isSidebarCollapsed: boolean = false;
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
                const chatMenu = getChatMenu();
                if(!chatMenu) return;
                if (isSidebarCollapsed) {
                    chatMenu.style.display = 'none';
                }
                else {
                    chatMenu.style.display = 'block';
                }2
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
                sideBarAddChatListeners();
                attachWelcomeScreenListeners();
            }
            else if (componentName === 'chat-window'){
                attachChatWindowListeners();
                sideBarAddChatListeners();
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

                renderActiveChat();
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

    const scrollToBottom = () => {
        const scrollContainer = document.getElementById('message-area') as HTMLElement | null;
        if (!scrollContainer) return;
        requestAnimationFrame(() => {
            try {
                scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
            } catch {
                // Fallback for older browsers
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        });
    };

    // // --- EVENT LISTENER ATTACHMENT ---

    //set custom windows listener on onboarding
    window.addEventListener('onboardingComplete', () => {
        console.log('current class is : ', JSON.stringify(currentClass));
        updateUI();
    })

    const attachWelcomeScreenListeners = () => {
        const welcomeBtn = document.getElementById('welcome-add-chat-btn');
        if (!welcomeBtn) return;
        welcomeBtn.addEventListener('click', () => {
            handleCreateNewChat();
        });
    };

    const attachChatWindowListeners = () => {
        const sendBtn = document.getElementById('send-btn');
        const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        const pinBtn = document.getElementById('pin-chat-btn');
        const deleteBtn = document.getElementById('delete-chat-btn');
        const artefactToggleBtn = document.getElementById('toggle-artefact-btn');
        const disclaimerLink = document.querySelector('#disclaimer a') as HTMLAnchorElement | null;
        // const reportHistoryBtns = document.querySelectorAll('.report-history-btn');
        
        // auto-grow textarea up to 4 lines, wrap long strings
        const autoGrow = () => {
            if (!inputEl) return;
            inputEl.style.height = 'auto';
            const lineHeight = parseFloat(getComputedStyle(inputEl).lineHeight || '20');
            const maxH = lineHeight * 4;
            inputEl.style.height = Math.min(inputEl.scrollHeight, maxH) + 'px';
            inputEl.style.overflowY = inputEl.scrollHeight > maxH ? 'auto' : 'hidden';
        };
        inputEl?.addEventListener('input', autoGrow);
        autoGrow();

        sendBtn?.addEventListener('click', sendMessage);
        inputEl?.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        pinBtn?.addEventListener('click', togglePin);
        deleteBtn?.addEventListener('click', deleteActiveChat);

        // artefact toggle
        artefactToggleBtn?.addEventListener('click', toggleArtefactPanel);

        // open disclaimer modal
        disclaimerLink?.addEventListener('click', (e) => {
            e.preventDefault();
            openDisclaimerModal();
        });

        // // open report history
        // reportHistoryBtns.forEach(btn => btn.addEventListener('click', () => loadComponent('report-history')));
    };


    const sideBarAddChatListeners = () => {
        if (!sideBarAddChatBtn) return;
        sideBarAddChatBtn.addEventListener('click', handleCreateNewChat);
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

    // // --- EVENT HANDLERS --- 
    const handleCreateNewChat = async () => {
        try {
            // Close artifact panel when creating new chat
            const panel = document.getElementById('artefact-panel');
            const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
            if (panel && panel.classList.contains('open')) {
                panel.classList.add('closing');
                setTimeout(() => {
                    panel.classList.remove('open');
                    panel.setAttribute('aria-hidden', 'true');
                    panel.classList.remove('closing');
                    if (dashboard) dashboard.classList.remove('artefact-open');
                    removeArtefactEscListener();
                }, 180);
            }

            // Prepare chat creation request
            const chatRequest: CreateChatRequest = {
                userID: 'instructor', // You might want to get this from user context (True)
                courseName: currentClass.courseName,
                date: new Date().toISOString().split('T')[0] // YYYY-MM-DD format
            };

            // Call the API to create a new chat
            const response = await createNewChat(chatRequest);

            if (!response.success) {
                // Show error modal if chat creation failed
                await showChatCreationErrorModal(response.error || 'Unknown error occurred');
                return;
            }

            // Create the new chat object with the server-generated chatId
            const newChat: Chat = {
                id: response.chatId || Date.now().toString(),
                courseName: currentClass.courseName,
                divisionTitle: 'General',
                itemTitle: 'Chat',
                messages: [],
                isPinned: false
            };

            // Add the default assistant message to the chat
            if (response.initAssistantMessage) {
                const defaultMessage: ChatMessage = {
                    id: response.initAssistantMessage.id,
                    sender: response.initAssistantMessage.sender as 'bot',
                    userId: response.initAssistantMessage.userId,
                    courseName: response.initAssistantMessage.courseName,
                    text: response.initAssistantMessage.text,
                    timestamp: response.initAssistantMessage.timestamp,
                } as ChatMessage & { artefact?: any };
                newChat.messages.push(defaultMessage);
            }

            chats.push(newChat);
            renderActiveChat();
            renderChatList();
            scrollToBottom();
            activeChatId = newChat.id;
            updateUI();
        } catch (error) {
            console.error('Error creating new chat:', error);
            await showChatCreationErrorModal('Network error occurred while creating chat');
        }
    }

    const sendMessage = () => {
        const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        const text = inputEl.value.trim();
        if (text === '') return;
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;
        activeChat.messages.push({ id: Date.now().toString(), sender: 'user', userId: 0, courseName: currentClass.courseName, text, timestamp: Date.now() });
        renderActiveChat();
        inputEl.value = '';
        inputEl.style.height = 'auto';

        // Create a placeholder for the bot's message
        const botMessageId = (Date.now() + 1).toString();
        const botMessage: ChatMessage = {
            id: botMessageId,
            sender: 'bot',
            userId: 0,
            courseName: currentClass.courseName,
            text: '...',
            timestamp: Date.now(),
        } as ChatMessage & { artefact?: any };
        activeChat.messages.push(botMessage);
        renderActiveChat(); // Render the placeholder

        const botMessageElement = document.getElementById(`msg-${botMessageId}`);
        const botContentElement = botMessageElement?.querySelector('.message-content');
        if (botContentElement) {
            botContentElement.textContent = ''; // Clear placeholder text
        }

        // Call the new streaming chat endpoint with RAG
        fetch(`/api/chat/${activeChatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: text,
                userId: 'instructor',
                courseName: currentClass.courseName
            }),
        })
        .then(response => {
            if (!response.ok || !response.body) {
                throw new Error('Network response was not ok.');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';

            function push() {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        console.log('Stream complete');
                        botMessage.text = accumulatedContent; // Final update to state
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    // Process Server-Sent Events format
                    chunk.split('\n').forEach(line => {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                
                                if (data.type === 'chunk' && data.content) {
                                    accumulatedContent += data.content;
                                    if (botContentElement) {
                                        botContentElement.textContent = accumulatedContent;
                                        scrollToBottom();
                                    }
                                } else if (data.type === 'complete' && data.message) {
                                    // Update with the complete message
                                    botMessage.text = data.message.text;
                                    if (botContentElement) {
                                        botContentElement.textContent = data.message.text;
                                        scrollToBottom();
                                    }
                                } else if (data.type === 'error') {
                                    throw new Error(data.error || 'Unknown error occurred');
                                }
                            } catch (error) {
                                console.error('Error parsing stream chunk:', error, 'Chunk:', line);
                            }
                        }
                    });
                    push(); // Continue reading
                });
            }
            push();
        })
        .catch(error => {
            console.error('Error sending message:', error);
            if (botContentElement) {
                botContentElement.textContent = 'Sorry, I encountered an error. Please try again.';
            }
            botMessage.text = 'Sorry, I encountered an error. Please try again.';
        });
    };

    const togglePin = () => {
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;
        activeChat.isPinned = !activeChat.isPinned;
        renderActiveChat();
        renderChatList();
    };

    const handleDeleteClickForChat = (targetChatId: string): void => {
        
        if (activeChatId === targetChatId) {
            deleteActiveChat();
        } else {
            deleteChatById(targetChatId);
        }

        renderChatList();
        renderActiveChat();
    };

    const handlePinClickForChat = (targetChatId: string): void => {
        const targetChat = chats.find(c => c.id === targetChatId);
        if (!targetChat) return;
        targetChat.isPinned = !targetChat.isPinned;
        renderChatList();
        if (activeChatId === targetChatId) {
            renderActiveChat();
        }
    };

    const deleteActiveChat = () => {

        // Close artifact panel when deleting active chat
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (panel && panel.classList.contains('open')) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
                removeArtefactEscListener();
            }, 180);
        }

        chats = chats.filter(c => c.id !== activeChatId);
        if (chats.length > 0) {
            const lastPinned = chats.filter(c => c.isPinned).pop();
            activeChatId = lastPinned ? lastPinned.id : chats[0].id;
        } else {
            activeChatId = null;
        }
        updateUI();
    };


    const deleteChatById = (targetChatId: string): void => {
        chats = chats.filter(c => c.id !== targetChatId);
        // Do not change activeChatId here unless we deleted the active one
        renderChatList();
    };

    // --- DISCLAIMER MODAL ---
    const openDisclaimerModal = async () => {
        // Prevent multiple overlays
        if (document.querySelector('.modal-overlay')) {
            document.body.classList.add('modal-open');
            (document.querySelector('.modal-overlay') as HTMLElement)?.classList.add('show');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);

        try {
            overlay.innerHTML = await loadComponentHTML('disclaimer');
        } catch (err) {
            overlay.innerHTML = '<div class="modal"><div class="modal-header"><h2>Disclaimer</h2></div><div class="modal-content"><p>Unable to load content.</p></div></div>';
        }

        // Show overlay and lock background
        overlay.classList.add('show');
        document.body.classList.add('modal-open');
        renderFeatherIcons();

        const closeBtn = overlay.querySelector('.close-modal') as HTMLButtonElement | null;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeDisclaimerModal();
            }
        };

        const closeDisclaimerModal = () => {
            document.body.classList.remove('modal-open');
            overlay.classList.remove('show');
            overlay.remove();
            window.removeEventListener('keydown', onKeyDown);
        };

        closeBtn?.addEventListener('click', closeDisclaimerModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDisclaimerModal();
        });
        window.addEventListener('keydown', onKeyDown);
    };

    const renderPinnedBanner = (chat: Chat) => {
        const header = document.getElementById('chat-header');
        const pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!header || !pinnedLine) return;

        if (!chat.pinnedMessageId) {
            pinnedLine.style.display = 'none';
            return;
        }

        const pinned = chat.messages.find(m => (m as any).id === chat.pinnedMessageId);
        if (!pinned) {
            pinnedLine.style.display = 'none';
            return;
        }

        pinnedLine.style.display = 'flex';
        pinnedLine.innerHTML = '';
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'map-pin');
        icon.classList.add('pinned');
        const text = document.createElement('span');
        text.className = 'pinned-text';
        text.textContent = pinned.text;
        pinnedLine.appendChild(icon);
        pinnedLine.appendChild(text);

        // Timestamp right beside the pinned text
        const timeEl = document.createElement('span');
        timeEl.className = 'pinned-time';
        timeEl.textContent = `• ${formatFullTimestamp((pinned as any).timestamp)}`;
        pinnedLine.appendChild(timeEl);
        pinnedLine.onclick = () => {
            const msgEl = document.getElementById(`msg-${(pinned as any).id}`);
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        };

        // Add remove button with text "remove"
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-pin-btn icon-btn';
        removeBtn.title = 'Remove pin';
        removeBtn.classList.add('remove-pin-btn');
        removeBtn.textContent = 'remove';
        removeBtn.style.color = 'var(--text-secondary)';
        // Push to the right edge
        removeBtn.style.marginLeft = 'auto';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            deletePinnedMessage(chat);
        });
        pinnedLine.appendChild(removeBtn);
    };



    // ---- RENDER & UPDATE FUNCTIONS -----
    const formatFullTimestamp = (timestampMs: number | undefined): string => {
        const d = new Date(typeof timestampMs === 'number' ? timestampMs : Date.now());
        const now = new Date();

        const sameYMD = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');

        let dateLabel: string;
        if (sameYMD(d, now)) {
            dateLabel = 'Today';
        } else if (sameYMD(d, yesterday)) {
            dateLabel = 'Yesterday';
        } else {
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const month = monthNames[d.getMonth()];
            const day = d.getDate();
            const year = d.getFullYear();
            dateLabel = `${month} ${day}, ${year}`;
        }

        return `${hours}:${minutes} ${dateLabel}`;
    };



    const renderChatList = () => {
        if (!chatListEl) return;
        chatListEl.innerHTML = '';
        const sortedChats = [...chats].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

        sortedChats.forEach(chat => {
            const li = createChatListItem(chat);
            chatListEl.appendChild(li);
        });

        // Render Feather icons for newly injected buttons
        renderFeatherIcons();
    };

    const createChatListItem = (chat: Chat): HTMLLIElement => {
        const li = document.createElement('li');
        li.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
        li.dataset.chatId = chat.id.toString();

        // Layout: title on the left, right-side holds actions and optional always-visible pin
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${chat.divisionTitle} - ${chat.itemTitle}`;
        titleSpan.style.flex = '1';
        titleSpan.style.minWidth = '0';

        // Actions shown on hover (trash first, then star if unpinned)
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '4px';
        actions.style.alignItems = 'center';
        actions.style.visibility = 'hidden';
        actions.style.opacity = '0';
        actions.style.transition = 'opacity 0.15s ease-in-out';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn';
        deleteBtn.style.padding = '0';
        deleteBtn.title = 'Delete chat';
        const trashIcon = document.createElement('i');
        trashIcon.setAttribute('data-feather', 'trash-2');
        deleteBtn.appendChild(trashIcon);
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            handleDeleteClickForChat(chat.id);
        });

        actions.appendChild(deleteBtn);

        // Right side container combines always-visible pin (if pinned) and hover actions
        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.style.gap = '6px';

        if (chat.isPinned) {
            // Always visible, lit star; still clickable to unpin
            const alwaysPinBtn = document.createElement('button');
            alwaysPinBtn.className = 'icon-btn';
            alwaysPinBtn.style.padding = '0';
            alwaysPinBtn.title = 'Unpin chat';
            const alwaysPinIcon = document.createElement('i');
            alwaysPinIcon.setAttribute('data-feather', 'star');
            alwaysPinIcon.classList.add('pinned');
            alwaysPinBtn.appendChild(alwaysPinIcon);
            alwaysPinBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                handlePinClickForChat(chat.id);
            });
            rightSide.appendChild(actions); // trash on hover
            rightSide.appendChild(alwaysPinBtn); // star always visible
        } else {
            // Unpinned: star appears only on hover within actions (after trash)
            const pinBtn = document.createElement('button');
            pinBtn.className = 'icon-btn';
            pinBtn.style.padding = '0';
            pinBtn.title = 'Pin chat';
            const pinIcon = document.createElement('i');
            pinIcon.setAttribute('data-feather', 'star');
            pinBtn.appendChild(pinIcon);
            pinBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                handlePinClickForChat(chat.id);
            });
            actions.appendChild(pinBtn);
            rightSide.appendChild(actions);
        }

        // Hover behavior: reveal/hide actions
        li.addEventListener('mouseenter', () => {
            actions.style.visibility = 'visible';
            actions.style.opacity = '1';
        });
        li.addEventListener('mouseleave', () => {
            actions.style.opacity = '0';
            actions.style.visibility = 'hidden';
        });

        // Selecting a chat when clicking anywhere except buttons
        li.addEventListener('click', () => {

            // Close artifact panel when switching chats
            const panel = document.getElementById('artefact-panel');
            const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
            if (panel && panel.classList.contains('open')) {
                panel.classList.add('closing');
                setTimeout(() => {
                    panel.classList.remove('open');
                    panel.setAttribute('aria-hidden', 'true');
                    panel.classList.remove('closing');
                    if (dashboard) dashboard.classList.remove('artefact-open');
                    removeArtefactEscListener();
                }, 180);
            }

            activeChatId = chat.id;
            renderChatList();
            renderActiveChat();
        });

        li.appendChild(titleSpan);
        li.appendChild(rightSide);
        return li;
    };

    const renderActiveChat = () => {
        const activeChat = chats.find(c => c.id === activeChatId);
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');
        
        if (!activeChat || !chatTitleEl || !messageAreaEl || !pinBtn) return;

        ensureChatHeaderStructure();

        chatTitleEl.textContent = `${activeChat.divisionTitle} - ${activeChat.itemTitle}`;
        pinBtn.classList.toggle('pinned', activeChat.isPinned);

        messageAreaEl.innerHTML = '';
        activeChat.messages.forEach(msg => {
            const isPinnedMessage = activeChat.pinnedMessageId === msg.id;
            const messageEl = createMessageElement(
                msg.id,
                msg.sender,
                msg.text,
                msg.timestamp,
                isPinnedMessage,
                () => {
                    if (activeChat.pinnedMessageId === msg.id) {
                        activeChat.pinnedMessageId = null;
                    } else {
                        activeChat.pinnedMessageId = msg.id;
                    }
                    renderActiveChat();
                }
            );
            messageAreaEl.appendChild(messageEl);
        });
        // Always scroll to newest message on the scroll container (chat-window)
        scrollToBottom();
        renderPinnedBanner(activeChat);
        renderFeatherIcons();
        // In case icon rendering changes layout, scroll again next frame
        scrollToBottom();
    };

    const ensureChatHeaderStructure = () => {
        const header = document.getElementById('chat-header');
        if (!header) return;
        // Ensure a main row container exists to hold title + actions
        let mainRow = header.querySelector('.chat-header-main') as HTMLDivElement | null;
        const title = document.getElementById('chat-title');
        const actions = header.querySelector('.chat-actions') as HTMLElement | null;
        if (!mainRow && title && actions) {
            mainRow = document.createElement('div');
            mainRow.className = 'chat-header-main';
            header.insertBefore(mainRow, actions);
            // Move title and actions into main row
            mainRow.appendChild(title);
            mainRow.appendChild(actions);
        }

        // Ensure pinned line container exists under the main row
        let pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!pinnedLine) {
            pinnedLine = document.createElement('div');
            pinnedLine.id = 'pinned-inline';
            pinnedLine.className = 'pinned-inline';
            header.appendChild(pinnedLine);
        }
    };

    const deletePinnedMessage = (chat: Chat) => {
        const pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!pinnedLine) return;
        pinnedLine.style.display = 'none';
        chat.pinnedMessageId = null;
        renderActiveChat();
        renderChatList();
        renderFeatherIcons();
    };


    const createMessageElement = (
        messageId: string,
        sender: 'user' | 'bot',
        text: string,
        timestamp: number | undefined,
        isPinned: boolean,
        onTogglePin: () => void
    ): HTMLElement => {

        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message', `${sender}-message`);
        messageWrapper.id = `msg-${messageId}`;
        
        // Content container
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.textContent = text;
        messageWrapper.appendChild(contentEl);

        // Append artefact chip for bot messages that carry artefacts
        const chat = chats.find(c => c.id === activeChatId);
        const thisMsg = chat?.messages.find(m => (m as any).id === messageId) as ChatMessage | undefined;
        if (sender === 'bot' && thisMsg && (thisMsg as any).artefact) {
            const chip = document.createElement('button');
            chip.className = 'open-artefact-chip';
            chip.title = 'Open artefact';
            chip.innerHTML = `<i data-feather="monitor"></i><span>Open artefact</span>`;
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                openArtefactFromMessage(thisMsg);
            });
            messageWrapper.appendChild(chip);
        }

        // Timestamp footer with inline icon actions (Pin, Flag)
        const timeEl = document.createElement('div');
        timeEl.className = 'message-timestamp';
        // Clock icon + timestamp text
        const clockIcon = document.createElement('i');
        clockIcon.setAttribute('data-feather', 'clock');
        clockIcon.classList.add('timestamp-clock');
        const timeTextEl = document.createElement('span');
        timeTextEl.className = 'timestamp-text';
        timeTextEl.textContent = formatFullTimestamp(timestamp);
        timeEl.appendChild(clockIcon);
        timeEl.appendChild(timeTextEl);

        // Inline text actions aligned with timestamp
        const actionsInline = document.createElement('span');
        actionsInline.className = 'timestamp-actions';

        // Pin / Unpin action
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'timestamp-action-btn pin-action-btn';
        pinBtn.title = isPinned ? 'Unpin this message' : 'Pin this message';
        pinBtn.setAttribute('aria-label', pinBtn.title);
        const pinIconEl = document.createElement('i');
        pinIconEl.setAttribute('data-feather', 'map-pin');
        if (isPinned) {
            pinIconEl.classList.add('pinned');
        }
        const pinLabelEl = document.createElement('span');
        pinLabelEl.textContent = isPinned ? 'Unpin' : 'Pin';
        pinLabelEl.className = 'timestamp-action-label';
        pinLabelEl.style.marginLeft = '4px';
        pinBtn.appendChild(pinIconEl);
        pinBtn.appendChild(pinLabelEl);
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onTogglePin();
        });
        pinBtn.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTogglePin();
            }
        });
        actionsInline.appendChild(pinBtn);

        // Flag action (only for bot messages)
        if (sender === 'bot') {
            const flagBtn = document.createElement('button');
            flagBtn.type = 'button';
            flagBtn.className = 'timestamp-action-btn flag-action-btn';
            flagBtn.title = 'Flag this message';
            flagBtn.setAttribute('aria-label', 'Flag this message');
            flagBtn.style.marginLeft = '6px';
            const flagIconEl = document.createElement('i');
            flagIconEl.setAttribute('data-feather', 'flag');
            const flagLabelEl = document.createElement('span');
            flagLabelEl.textContent = 'Flag';
            flagLabelEl.className = 'timestamp-action-label';
            flagLabelEl.style.marginLeft = '4px';
            flagBtn.appendChild(flagIconEl);
            flagBtn.appendChild(flagLabelEl);
            flagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openFlagDialog(messageId);
            });
            flagBtn.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openFlagDialog(messageId);
                }
            });
            actionsInline.appendChild(flagBtn);
        }

        timeEl.appendChild(actionsInline);
        messageWrapper.appendChild(timeEl);

        // Context menu (right-click) handler
        messageWrapper.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault();
            openMessageContextMenu(e.clientX, e.clientY, isPinned, onTogglePin, sender, messageId);
        });

        // Hover affordance: down-facing arrow to indicate options
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        const moreBtn = document.createElement('button');
        moreBtn.className = 'icon-btn';
        moreBtn.title = 'More options';
        const moreIcon = document.createElement('i');
        moreIcon.setAttribute('data-feather', 'chevron-down');
        moreBtn.appendChild(moreIcon);
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openMessageContextMenu(rect.left, rect.bottom, isPinned, onTogglePin, sender, messageId);
        });
        actions.appendChild(moreBtn);
        messageWrapper.appendChild(actions);
        return messageWrapper;
    };


    // Open artefact from a specific message
    const openArtefactFromMessage = (msg: ChatMessage) => {
        if (!(msg as any).artefact) return;
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel) return;

        // Close then open for the requested behaviour
        const wasOpen = panel.classList.contains('open');
        if (wasOpen) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
                // Remove ESC listener when closing
                removeArtefactEscListener();
                // after closed, proceed to open with new content
                setTimeout(() => showMermaidInPanel(msg), 10);
            }, 180);
        } else {
            showMermaidInPanel(msg);
        }
    };

    const showMermaidInPanel = (msg: ChatMessage) => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel || !(msg as any).artefact) return;
        const container = panel.querySelector('.artefact-content') as HTMLElement | null;
        if (!container) return;

        // Replace body content but keep outer template
        const body = document.createElement('div');
        body.className = 'artefact-body';
        body.innerHTML = `<pre class="mermaid">${(msg as any).artefact.source}</pre>`;
        container.innerHTML = '';
        container.appendChild(body);

        // open panel
        panel.classList.remove('closing');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        if (dashboard) dashboard.classList.add('artefact-open');
        
        // Add ESC listener when opening
        addArtefactEscListener();

        setupCloseArtefactBtn();

        // init mermaid on new content
        try {
            // @ts-ignore
            if (window.mermaid && typeof window.mermaid.init === 'function') {
                // @ts-ignore
                window.mermaid.init(undefined, container.querySelectorAll('.mermaid'));
            }
        } catch {}
    };


    // --- FLAGGING SUPPORT ---
    const openFlagDialog = (messageId: string) => {
        const chat = chats.find(c => c.id === activeChatId);
        if (!chat) return;
        const msg = chat.messages.find(m => m.id === messageId);
        if (!msg || msg.sender !== 'bot') return; // Only bot messages can be flagged

        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel) return;

        const proceed = () => {
            const container = panel.querySelector('.artefact-content') as HTMLElement | null;
            if (!container) return;

            fetch('/components/flag-message.html')
                .then(res => res.text())
                .then(html => {
                    container.innerHTML = html;
                    // Populate flagged message text only (exclude artefact chips)
                    const msgBox = container.querySelector('#flag-message-content') as HTMLElement | null;
                    if (msgBox) {
                        msgBox.textContent = msg.text;
                    }

                    // Wire up actions
                    const submitBtn = container.querySelector('#flag-submit-btn') as HTMLButtonElement | null;
                    const cancelBtn = container.querySelector('#flag-cancel-btn') as HTMLButtonElement | null;
                    submitBtn?.addEventListener('click', () => handleFlagSubmit());
                    cancelBtn?.addEventListener('click', () => closeArtefactPanel());
                })
                .catch(() => {
                    const container = panel.querySelector('.artefact-content') as HTMLElement | null;
                    if (container) {
                        container.innerHTML = '<p style="padding:8px;color:var(--text-secondary)">Failed to load flag form.</p>';
                    }
                });

            // Open panel
            panel.classList.remove('closing');
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            if (dashboard) dashboard.classList.add('artefact-open');
            
            // Add ESC listener when opening
            addArtefactEscListener();
        };

        // If already open, close first for consistent animation, then open
        const wasOpen = panel.classList.contains('open');
        if (wasOpen) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
                // Remove ESC listener when closing
                removeArtefactEscListener();
                setTimeout(proceed, 10);
            }, 180);
        } else {
            proceed();
        }
    };

    const handleFlagSubmit = () => {
        const form = document.getElementById('flag-form') as HTMLFormElement | null;
        if (!form) return;
        const reasons: string[] = [];
        form.querySelectorAll('input[name="reasons"]:checked').forEach((el) => {
            reasons.push((el as HTMLInputElement).value);
        });
        const other = (document.getElementById('flag-other-text') as HTMLInputElement | null)?.value?.trim();
        if (other) reasons.push(`other:${other}`);

        // Confirmation message (no backend integration yet)
        alert('Thanks for your report. Your feedback helps improve EngE-AI.');
        closeArtefactPanel();
    };

    const closeArtefactPanel = () => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel) return;
        if (panel.classList.contains('open')) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
                // Remove ESC listener when closing
                removeArtefactEscListener();
            }, 180);
        }
    };

    // Load and control message context menu
    let messageMenuLoaded = false;
    const ensureMessageMenu = async () => {
        if (messageMenuLoaded) return;
        const containerId = 'message-context-menu-container';
        if (!document.getElementById(containerId)) {
            const holder = document.createElement('div');
            holder.id = containerId;
            document.body.appendChild(holder);
        }
        try {
            const res = await fetch('/components/message-menu.html');
            if (!res.ok) throw new Error('Failed to load message menu');
            const html = await res.text();
            (document.getElementById('message-context-menu-container') as HTMLElement).innerHTML = html;
            messageMenuLoaded = true;
        } catch (err) {
            console.error(err);
        }
    };

    const closeMessageContextMenu = () => {
        const menu = document.getElementById('message-context-menu') as HTMLElement | null;
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeMessageContextMenu);
        document.removeEventListener('keydown', escListener);
    };

    const escListener = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeMessageContextMenu();
    };


    const openMessageContextMenu = async (
        x: number,
        y: number,
        isPinned: boolean,
        onTogglePin: () => void,
        sender: 'user' | 'bot',
        messageId: string
    ) => {
        await ensureMessageMenu();
        const menu = document.getElementById('message-context-menu') as HTMLElement | null;
        if (!menu) return;
        // Toggle pin/unpin visibility
        const pinItem = menu.querySelector('[data-action="pin"]') as HTMLElement | null;
        const unpinItem = menu.querySelector('[data-action="unpin"]') as HTMLElement | null;
        const flagItem = menu.querySelector('[data-action="flag"]') as HTMLElement | null;
        if (pinItem && unpinItem) {
            pinItem.style.display = isPinned ? 'none' : 'block';
            unpinItem.style.display = isPinned ? 'block' : 'none';
        }
        // Only show flag option for bot messages
        if (flagItem) {
            flagItem.style.display = sender === 'bot' ? 'block' : 'none';
        }
        // Set position
        const menuRect = menu.getBoundingClientRect();
        const maxX = window.innerWidth - menuRect.width - 8;
        const maxY = window.innerHeight - menuRect.height - 8;
        menu.style.left = Math.min(x, maxX) + 'px';
        menu.style.top = Math.min(y, maxY) + 'px';
        menu.style.display = 'block';

        // Bind click handlers
        const onAction = (e: Event) => {
            const target = e.target as HTMLElement;
            const li = target.closest('.menu-item') as HTMLElement | null;
            if (!li) return;
            const action = li.dataset.action;
            if (action === 'pin' || action === 'unpin') {
                onTogglePin();
                closeMessageContextMenu();
            }
            if (action === 'flag' && sender === 'bot') {
                openFlagDialog(messageId);
                closeMessageContextMenu();
            }
        };
        menu.onclick = onAction;

        // Close on outside click or ESC
        setTimeout(() => {
            document.addEventListener('click', closeMessageContextMenu);
            document.addEventListener('keydown', escListener);
        }, 0);
    };

    // initial UI update is triggered after attempting JSON load above

    updateUI();

});