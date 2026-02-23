// public/scripts/feature/render-chat.ts

/**
 * Custom Unified Renderer for Chat Messages
 * Handles markdown, LaTeX, and artifacts in one unified system
 * Uses ArtefactHandler as a wrapper for artifact processing
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { ArtefactHandler, getArtefactHandler } from './artefact.js';

export class RenderChat {
    private artefactHandler: ArtefactHandler;
    
    constructor() {
        this.artefactHandler = getArtefactHandler();
    }
    
    /**
     * Main rendering method - processes text in order:
     * 1. Code blocks (preserve everything inside)
     * 2. Artifacts (<Artefact>...</Artefact> → delegated to ArtefactHandler)
     * 3. LaTeX ($...$ and $$...$$ → wrapped for KaTeX)
     * 4. Markdown formatting
     */
    public render(text: string, messageId?: string): string {
        let html = text;

        //Step 1: Extract and preserve code blocks
        const codeResult = this.processCodeBlocks(html);
        html = codeResult.html;
        
        // Step 2: Process artifacts using ArtefactHandler wrapper
        html = this.processArtifactsWithWrapper(html, messageId);
        
        // Step 2.5: Process questionUnstruggle tags
        html = this.processQuestionUnstruggle(html, messageId);
        
        // Step 3: Process markdown formatting
        html = this.processMarkdown(html);
        
        // Step 4: Add CSS classes to HTML lists
        html = this.addListClasses(html);
        
        // Step 5: Wrap plain text in response-text paragraphs
        html = this.wrapPlainText(html);
        
        //Step 6: Restore code blocks
        html = this.restoreCodeBlocks(html, codeResult.blocks);
        
        return html;
    }
    
    /**
     * Step 1: Extract and preserve code blocks
     */
    private processCodeBlocks(text: string): { html: string, blocks: string[] } {
        const blocks: string[] = [];
        let html = text;
        
        // Process code blocks (```...```)
        html = html.replace(/```([\s\S]*?)```/g, (match, content) => {
            const placeholder = `__CODE_BLOCK_${blocks.length}__`;
            blocks.push(`<pre><code class="response-code-block">${this.escapeHtml(content.trim())}</code></pre>`);
            return placeholder;
        });
        
        // Process inline code (`...`)
        html = html.replace(/`([^`\n]+?)`/g, (match, content) => {
            const placeholder = `__CODE_INLINE_${blocks.length}__`;
            blocks.push(`<code class="response-code-inline">${this.escapeHtml(content)}</code>`);
            return placeholder;
        });
        
        return { html, blocks };
    }
    
    /**
     * Step 2: Process artifacts using ArtefactHandler wrapper
     * Converts <Artefact>...</Artefact> to ArtefactHandler button HTML
     */
    private processArtifactsWithWrapper(text: string, messageId?: string): string {
        // Generate a unique message ID if not provided
        const msgId = messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Use ArtefactHandler to parse artifacts
        const result = this.artefactHandler.parseArtefacts(text, msgId);
        
        if (!result.hasArtefacts) {
            return text; // No artifacts found, return original text
        }
        
        // Convert ArtefactHandler elements to HTML string
        let processedText = text;
        let offset = 0;
        
        // Replace each artifact with its button HTML
        result.artefacts.forEach((artefact, index) => {
            // Find the artifact in the text
            const artifactStart = processedText.indexOf('<Artefact>', offset);
            const artifactEnd = processedText.indexOf('</Artefact>', artifactStart) + '</Artefact>'.length;
            
            if (artifactStart !== -1 && artifactEnd !== -1) {
                // Create the button element using ArtefactHandler
                const buttonElement = this.artefactHandler.createArtefactButton(artefact);
                const buttonHTML = buttonElement.outerHTML;
                
                // Replace the artifact tags with the button HTML
                processedText = processedText.substring(0, artifactStart) + 
                              buttonHTML + 
                              processedText.substring(artifactEnd);
                
                offset = artifactStart + buttonHTML.length;
            }
        });
        
        return processedText;
    }
    
    
    /**
     * Process questionUnstruggle tags
     * Converts <questionUnstruggle Topic="topic"> to HTML with question and buttons
     */
    private processQuestionUnstruggle(text: string, messageId?: string): string {
        // Pattern: <questionUnstruggle Topic="topic">
        const unstruggleRegex = /<questionUnstruggle\s+Topic=["']([^"']+)["']\s*>/gi;
        
        return text.replace(unstruggleRegex, (match, topic) => {
            // Generate unique IDs for buttons
            const msgId = messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const yesButtonId = `unstruggle-yes-${msgId}-${topic.replace(/\s+/g, '-')}`;
            const noButtonId = `unstruggle-no-${msgId}-${topic.replace(/\s+/g, '-')}`;
            
            // Create HTML for the question and buttons
            const questionHtml = `
                <div class="question-unstruggle-container" data-topic="${this.escapeHtml(topic)}" data-message-id="${msgId}">
                    <p class="question-unstruggle-question">Do you think you're confident with the topic of <strong>${this.escapeHtml(topic)}</strong>?</p>
                    <div class="question-unstruggle-buttons">
                        <button class="question-unstruggle-btn question-unstruggle-yes" data-topic="${this.escapeHtml(topic)}" data-response="True" data-message-id="${msgId}">
                            <span class="question-unstruggle-btn-text">Yes</span>
                        </button>
                        <button class="question-unstruggle-btn question-unstruggle-no" data-topic="${this.escapeHtml(topic)}" data-response="False" data-action="dismiss" data-message-id="${msgId}">
                            <span class="question-unstruggle-btn-text">No, maybe later</span>
                        </button>
                    </div>
                </div>
            `;
            
            return questionHtml;
        });
    }
    
    /**
     * Step 4: Process markdown formatting
     */
    private processMarkdown(text: string): string {
        // Process in order of precedence (most specific first)
        text = this.processHeaders(text);
        text = this.processBold(text);
        text = this.processItalic(text);
        text = this.processHorizontalRules(text);
        text = this.processLinks(text);
        // text = this.processLineBreaks(text);
        
        return text;
    }
    
    /**
     * Add CSS classes to HTML lists
     */
    private addListClasses(text: string): string {
        // Replace <ul> with <ul class="response-list">
        text = text.replace(/<ul>/g, '<ul class="response-list">');
        // Replace <ol> with <ol class="response-list-ordered">
        text = text.replace(/<ol>/g, '<ol class="response-list-ordered">');
        return text;
    }
    
    /**
     * Process headers (# ## ###)
     */
    private processHeaders(text: string): string {
        // H3 (###)
        text = text.replace(/^### (.+)$/gm, '<h3 class="response-header-3">$1</h3>');
        
        // H2 (##)
        text = text.replace(/^## (.+)$/gm, '<h2 class="response-header-2">$1</h2>');
        
        // H1 (#)
        text = text.replace(/^# (.+)$/gm, '<h1 class="response-header-1">$1</h1>');
        
        return text;
    }
    
    /**
     * Process bold text (**text**)
     */
    private processBold(text: string): string {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong class="response-bold">$1</strong>');
    }
    
    /**
     * Process italic text (*text*)
     */
    private processItalic(text: string): string {
        return text.replace(/\*([^*]+?)\*/g, '<em class="response-italic">$1</em>');
    }
    
    /**
     * Process horizontal rules (---)
     */
    private processHorizontalRules(text: string): string {
        return text.replace(/^---$/gm, '<hr class="response-hr">');
    }
    
    
    /**
     * Process links ([text](url))
     */
    private processLinks(text: string): string {
        return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="response-link" target="_blank" rel="noopener noreferrer">$1</a>');
    }
    
    /**
     * Process line breaks (double newline = paragraph)
     */
    private processLineBreaks(text: string): string {
        // Split into paragraphs (double newline)
        const paragraphs = text.split(/\n\s*\n/);
        
        return paragraphs.map(paragraph => {
            paragraph = paragraph.trim();
            if (!paragraph) return '';
            
            // Don't wrap if it's already HTML
            if (paragraph.startsWith('<')) {
                return paragraph;
            }
            
            // Convert single newlines to <br>
            paragraph = paragraph.replace(/\n/g, '<br>');
            
            return `<p>${paragraph}</p>`;
        }).join('\n');
    }
    
    /**
     * Restore code blocks from placeholders
     */
    private restoreCodeBlocks(text: string, blocks: string[]): string {
        let html = text;
        
        blocks.forEach((block, index) => {
            if (block.includes('response-code-block')) {
                html = html.replace(`__CODE_BLOCK_${index}__`, block);
            } else {
                html = html.replace(`__CODE_INLINE_${index}__`, block);
            }
        });
        
        return html;
    }
    
    
    /**
     * Step 4: Wrap plain text in response-text paragraphs
     * Identifies text that isn't already wrapped in HTML tags and wraps it in <p class="response-text">
     */
    private wrapPlainText(text: string): string {
        // Split by double newlines to identify paragraphs
        const paragraphs = text.split(/\n\s*\n/);
        
        return paragraphs.map(paragraph => {
            paragraph = paragraph.trim();
            if (!paragraph) return '';
            
            // Skip if it's already wrapped in HTML tags
            if (paragraph.startsWith('<') && paragraph.includes('>')) {
                return paragraph;
            }
            
            // Check if this paragraph contains LaTeX display math ($$...$$)
            // If it does, DON'T convert newlines to <br> - preserve them for KaTeX
            if (paragraph.includes('$$')) {
                // Wrap in response-text paragraph with whitespace preservation for LaTeX
                return `<p class="response-text response-latex-preserve">${paragraph}</p>`;
            }
            
            // Convert single newlines to <br> within the paragraph (non-LaTeX content)
            paragraph = paragraph.replace(/\n/g, '<br>');
            
            // Wrap in response-text paragraph
            return `<p class="response-text">${paragraph}</p>`;
        }).join('\n');
    }
    
    /**
     * Escape HTML characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * Note: Artifact toggle functionality is now handled by ArtefactHandler's event delegation
 * No need for global toggleArtifact function since ArtefactHandler handles all artifact interactions
 */
