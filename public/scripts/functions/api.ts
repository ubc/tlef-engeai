// public/scripts/api.ts

/**
 * API for the student mode
 * 
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 */

// Artefact functionality disabled for now

declare const feather: { replace: () => void };

export interface ChatResponse {
    reply: string;
    timestamp: number;
}

/**
 * Send a message to the server and return the response
 * @param text - The message to send to the server
 * @returns The response from the server
 */
export async function sendMessageToServer(text: string): Promise<ChatResponse> {
    const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    const serverTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
    return { reply: data.reply as string, timestamp: serverTimestamp };
}

/**
 * Load the HTML for a component
 * @param componentName - The name of the component to load
 * @returns The HTML for the component
 */
export async function loadComponentHTML(
    componentName:  | 'welcome-screen' 
                    | 'chat-window' 
                    | 'report-history'
                    | 'disclaimer'
                    | 'report-instructor'
                    | 'monitor-instructor'
                    | 'documents-instructor'
                    | 'onboarding'
): Promise<string> {

    let response: Response;

    //Using swtich logic for page request
    switch (componentName) {
        case 'welcome-screen':
        case 'chat-window' :
        case 'report-history':
        case 'disclaimer':
            response = await fetch(`/components/chat/${componentName}.html`);
            break;
        case 'report-instructor':
            response = await fetch(`/components/report/${componentName}.html`);
            break;
        case 'monitor-instructor':
            response = await fetch(`/components/monitor/${componentName}.html`);
            break;
        case 'documents-instructor':
        case 'onboarding':
            response = await fetch(`/components/documents/${componentName}.html`);
            break;
        default:
            throw new Error("Invalid component name: " + componentName);
    }

    if (!response.ok){ 
        throw new Error('Network response was not ok');
    }
    
    return await response.text();
}


/**
 * Render Feather icons
 */
export function renderFeatherIcons(): void {
    try { feather.replace(); } catch {}
}


