// public/scripts/api.ts

import type { Artefact } from './types';

declare const feather: { replace: () => void };

export interface ChatResponse {
    reply: string;
    timestamp: number;
    artefact?: Artefact;
}

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

export async function loadComponentHTML(componentName: 'welcome-screen' | 'chat-window' | 'report-history'): Promise<string> {
    const response = await fetch(`/components/${componentName}.html`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.text();
}

export function renderFeatherIcons(): void {
    try { feather.replace(); } catch {}
}


