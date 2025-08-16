## Student Mode Refactor — Phase 1 Test Plan (State)

### Scope
Validate `ChatStateManager` covers all required chat/message flows with correct events and query behavior. No UI dependencies.

### Preconditions
- Project builds and serves (`npm run dev` or server running)
- This phase focuses on state only; testing can be done via temporary harness or console once state is importable in the entry.

### Test Cases

1) Create chat
- Action: call `createChat('no title')`
- Expect: returns `Chat { id, title: 'no title', messages: [], isPinned: false, pinnedMessageId: null }`
- Expect: `getAllChats()` includes the new chat
- Expect: event `chat-added` emitted then `state:changed`

2) Set active chat
- Action: `setActiveChat(chat.id)` then `getActiveChat()`
- Expect: returns the same chat; event `chat-activated` then `state:changed`

3) Toggle chat pin
- Action: `toggleChatPin(chat.id)`
- Expect: `chat.isPinned` toggles; event `chat-updated` then `state:changed`

4) Add user message
- Action: `addMessage(chat.id, { sender: 'user', text: 'hello', timestamp: Date.now() })`
- Expect: returns `ChatMessage { id, sender:'user', text:'hello' }`
- Expect: chat.messages length increments; event `message-added` then `state:changed`

5) Add bot message with artefact
- Action: `addMessage(chat.id, { sender: 'bot', text: 'hi', timestamp: now, artefact:{ type:'mermaid', source:'graph TD; A-->B;' } })`
- Expect: message stored with artefact intact

6) Pin message
- Action: `pinMessage(chat.id, message.id)`
- Expect: `chat.pinnedMessageId === message.id`; event `message-pinned` then `state:changed`

7) Unpin message
- Action: `unpinMessage(chat.id)`
- Expect: `chat.pinnedMessageId === null`; event `message-unpinned` then `state:changed`

8) Toggle message pin
- Action: `toggleMessagePin(chat.id, msgId)` over two calls
- Expect: first sets pinned; second unpins

9) Sorted chats
- Setup: create multiple chats, toggle pin on one
- Action: `getSortedChats()`
- Expect: pinned chats come first (desc by `timestamp`), then others (desc)

10) Delete chat and fallback selection
- Setup: create 2+ chats, set one as active
- Action: `deleteChat(activeId)` then helper `setActiveChatOrFirst()`
- Expect: active chat becomes previous pinned or first remaining; appropriate events emitted

### Notes
- Ensure every mutation emits its specific event and subsequently `state:changed`.
- ID generation can be `Date.now()` in this phase; collision risk is acceptable.


