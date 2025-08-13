
export interface ChatMessage {
    id : number;
    sender : 'user' | 'bot';
    text : string;
    timestamp : number;
    artefact? : {
        type : 'mermaid';
        source : string;
        title? : string;
    }
}

export interface Chat {
    id : number;
    title : string;
    messages : ChatMessage[];
    isPinned : boolean;
    pinnedMessageId? : number | null;
}

export type StateEvent = 
    | 'chat-added' 
    | 'chat-updated' 
    | 'chat-removed' 
    | 'message-added' 
    | 'message-pinned' 
    | 'message-unpinned'
    | 'state:changed';

export interface StateEventData {
    'chat-added' : { chatId : number };
    'chat-updated' : { chatId : number };
    'chat-removed' : { chatId : number };
    'message-added' : { chatId : number, messageId : number };
    'message-pinned' : { chatId : number, messageId : number };
    'message-unpinned' : { chatId : number, messageId : number };
    'state:changed' : { chatId : number };
}



