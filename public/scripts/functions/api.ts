// public/scripts/api.ts

/**
 * API for the student mode
 * 
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 */

import type { Artefact } from './types';

declare const feather: { replace: () => void };

export interface ChatResponse {
    reply: string;
    timestamp: number;
    artefact?: Artefact;
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
    const artefact: Artefact | undefined =
        data.artefact && data.artefact.type === 'mermaid' && typeof data.artefact.source === 'string'
            ? { type: 'mermaid', source: data.artefact.source as string, title: (data.artefact.title as string | undefined) }
            : undefined;
    return { reply: data.reply as string, timestamp: serverTimestamp, artefact };
}

/**
 * Load the HTML for a component
 * @param componentName - The name of the component to load
 * @returns The HTML for the component
 */
export async function loadComponentHTML(componentName: 'welcome-screen' | 'chat-window' | 'report-history'): Promise<string> {
    const response = await fetch(`/components/${componentName}.html`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.text();
}

/**
 * Render Feather icons
 */
export function renderFeatherIcons(): void {
    try { feather.replace(); } catch {}
}


