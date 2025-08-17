// public/scripts/types.ts

export interface Artefact {
    type: 'mermaid';
    source: string;
    title?: string;
}

export interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
    artefact?: Artefact;
}

export interface Chat {
    id: number;
    title: string;
    messages: ChatMessage[];
    isPinned: boolean;
    pinnedMessageId?: number | null;
}


