import { loadComponentHTML, renderFeatherIcons } from "./functions/api.js";
import { State } from "./functions/state.js";
import { Chat } from "./functions/types.js";

const enum StateEvent {
    Chat,
    Report,
    Monitor,
    document
}

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM ELEMNET SELECTORS ---
    const sidebarEl = document.querySelector('.instructor-sidebar');
    const logoBox = document.querySelector('.logo-box');
    const sidebarMenuListEl =document.querySelector('.sidebar-menu-list');
    const sidebarCollapseButton = document.querySelector('.sidebar-collapse-icon');
    const mainContentAreaEl = document.getElementById('main-content-area');
    const welcomeAddChatBtn = document.getElementById('welcome-add-chat-btn');
    let currentState : StateEvent = StateEvent.Chat;

    // --- STATE MANAGEMENT ----
    let chats: Chat[] = []
    let activeChatId: number | null = null;


    //Ensure sidebar collpase toggle
    const sidebarCollapseToggle = () => {
        if (!sidebarCollapseButton) return;
        sidebarCollapseButton.addEventListener('click', () => {
            if (!sidebarEl) return;
            sidebarEl.classList.toggle('collapsed');
            console.log('About to toggle log yuhuuu');
            if(!logoBox) return;
            logoBox.classList.toggle('collapsed');
            console.log('Logo box classes:', logoBox.className);
            if(!sidebarMenuListEl) return;
            if (!sidebarMenuListEl.classList.contains('collapsed')){
                sidebarMenuListEl.classList.toggle('collapsed');
            }
        } );
    }
    sidebarCollapseToggle();

    const loadComponent = async (componentName :'welcome-screen' | 'chat-window' | 'report-instructor' | 'monitor-instructor' | 'document-instructor') => {
        if (!mainContentAreaEl) return;
        try {
            const html = await loadComponentHTML(componentName);
            mainContentAreaEl.innerHTML = html;

            if (componentName === 'welcome-screen') {
                if (!welcomeAddChatBtn) return;
                welcomeAddChatBtn.addEventListener('click', () => {
                    attachWelcomeScreenListeners();
                })
            }

            renderFeatherIcons();

        }
        catch (error) {
            console.log(`Error loading component ${componentName}:`, error);
            mainContentAreaEl.innerHTML = `<p style="color: red; text-align: center;"> Error loading content. </p>`
        }
    };

    const updateUI = () => {
        if ( currentState === StateEvent.Chat ) {
            if (!sidebarMenuListEl) return;
            if (!sidebarMenuListEl.classList.contains('collapsed')) {
                sidebarMenuListEl.classList.toggle('collapsed');
            }
            if (chats.length === 0) loadComponent('welcome-screen');
        }
    }

    // // --- EVENT LISTENER ATTACHMENT ---
    const attachWelcomeScreenListeners = () => {
        const welcomeBtn = document.getElementById('welcome-add-chat-btn');
        if (!welcomeBtn) return;
        welcomeBtn.addEventListener('click', () => {
            createNewChat();
        });
    };

    // // --- EVENT HANDLERS --- 
    const createNewChat = () => {
        const newChat : Chat = {id: Date.now(),
                                title: 'no title',
                                messages: [],
                                isPinned: false};
        chats.push(newChat);

        // Delay the message to ensure the chat window is rendered
        // setTimeout(() => {
        //     newChat.messages.push({ id: Date.now(), sender: 'bot', text: 
        //             'Hello! I am EngE-AI, your AI companion for chemical, environmental, and materials engineering.' + 
        //             ' As this is week 2, in lectures this week we have learned about PID control and Fluid Dynamics. ' + 
        //             'What would you like to discuss? ' + 
        //             ' Remember: I am designed to enhance your learning, not replace it, always verify important information.', 
        //             timestamp: Date.now() });
        //     // Re-render the active chat so the new message appears immediately
        //     // renderActiveChat();
        //     // renderChatList();
        //     // scrollToBottom();
        // }, 400);
        activeChatId = newChat.id;
        updateUI();
    }


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

    const renderActiveChat = () => {
        const activeChat = chats.find(c => c.id === activeChatId);
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');

        //setting message area inner html to empty
        if (!messageAreaEl) return;
        messageAreaEl.innerHTML = '';
        
        //itterating over the message area
        // if (!activeChat) return;
        // activeChat.messages.forEach( msg => {
        //     const isPinnedChat = activeChat.pinnedMessageId === msg.id;
        //     const messageEl = createMessageElement(

        //     )
        // } )

    };

    // const createMessageElement = (
    //     messageId: number,
    //     sender: 'user' | 'bot',
    //     text: string,
    //     timestamp: number | undefined,
    //     isPinned: boolean,
    //     onTogglePin: () => void
    // ) : HTMLElement => {
        
    //     const messageWrapper = document.createElement('div');
    //     messageWrapper.classList.add('message', `${sender}-message`);
    // };


    updateUI();

});