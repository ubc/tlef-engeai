// public/scripts/api.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Send a message to the server and return the response
 * @param text - The message to send to the server
 * @returns The response from the server
 */
export function sendMessageToServer(text) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = yield fetch('/api/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = yield res.json();
        const serverTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
        return { reply: data.reply, timestamp: serverTimestamp };
    });
}
/**
 * Load the HTML for a component
 * @param componentName - The name of the component to load
 * @returns The HTML for the component
 */
export function loadComponentHTML(componentName) {
    return __awaiter(this, void 0, void 0, function* () {
        let response;
        //Using swtich logic for page request
        switch (componentName) {
            case 'welcome-screen':
            case 'chat-window':
            case 'flag-history':
            case 'disclaimer':
                response = yield fetch(`/components/chat/${componentName}.html`);
                break;
            case 'profile':
                response = yield fetch(`/components/profile/${componentName}.html`);
                break;
            case 'flag-instructor':
                response = yield fetch(`/components/report/${componentName}.html`);
                break;
            case 'monitor-instructor':
                response = yield fetch(`/components/monitor/${componentName}.html`);
                break;
            case 'documents-instructor':
                response = yield fetch(`/components/documents/${componentName}.html`);
                break;
            case 'course-setup':
            case 'document-setup':
            case 'flag-setup':
            case 'monitor-setup':
            case 'student-onboarding':
                response = yield fetch(`/components/onboarding/${componentName}.html`);
                break;
            case 'about':
                response = yield fetch(`/components/about/${componentName}.html`);
                break;
            case 'course-information':
                response = yield fetch(`/components/course-information/${componentName}.html`);
                break;
            case 'assistant-prompts-instructor':
                response = yield fetch(`/components/assistant-prompts/${componentName}.html`);
                break;
            case 'system-prompts-instructor':
                response = yield fetch(`/components/system-prompts/${componentName}.html`);
                break;
            default:
                throw new Error("Invalid component name: " + componentName);
        }
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return yield response.text();
    });
}
/**
 * Render Feather icons
 */
export function renderFeatherIcons() {
    try {
        feather.replace();
    }
    catch (_a) { }
}
