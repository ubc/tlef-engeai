import { conversationModePrompts } from '../../chat/compose-system-prompt';
import { systemPromptConfigApi } from '../system-prompt-config-api';

describe('SystemPromptConfigApi', () => {
    it('validateModules rejects reserved ids', () => {
        expect(
            systemPromptConfigApi.validateModules([
                { id: '_system_foo', body: 'x', sortOrder: 0 },
            ])
        ).toMatch(/Reserved/);
    });

    it('validatePlainXml returns ok false for invalid xml', () => {
        const result = systemPromptConfigApi.validatePlainXml('<not-closed');
        expect(result.ok).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});

describe('ConversationModePrompts.isValidConversationMode', () => {
    it('accepts catalog slugs only', () => {
        expect(conversationModePrompts.isValidConversationMode('socratic')).toBe(true);
        expect(conversationModePrompts.isValidConversationMode('explanatory')).toBe(true);
        expect(conversationModePrompts.isValidConversationMode('undeclared')).toBe(false);
        expect(conversationModePrompts.isValidConversationMode('typo')).toBe(false);
    });

    it('rejects the retired scenario-generation slug for new chats', () => {
        expect(conversationModePrompts.isValidConversationMode('scenario-generation')).toBe(false);
    });
});
