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
        
        // Step 1: Extract and preserve code blocks
        const codeResult = this.processCodeBlocks(html);
        html = codeResult.html;
        
        // Step 2: Process artifacts using ArtefactHandler wrapper
        html = this.processArtifactsWithWrapper(html, messageId);
        
        // Step 3: Extract and wrap LaTeX for KaTeX
        html = this.processLatex(html);
        
        // Step 4: Process markdown formatting
        html = this.processMarkdown(html);
        
        // Step 5: Restore code blocks
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
     * Step 3: Extract and wrap LaTeX for KaTeX
     */
    private processLatex(text: string): string {
        // Process display math ($$...$$)
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
            return `<div class="response-latex-display">${content}</div>`;
        });
        
        // Process inline math ($...$)
        text = text.replace(/\$([^$\n]+?)\$/g, (match, content) => {
            return `<span class="response-latex-inline">${content}</span>`;
        });
        
        return text;
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
        text = this.processLists(text);
        text = this.processLinks(text);
        text = this.processLineBreaks(text);
        
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
     * Process lists (- item or 1. item)
     */
    private processLists(text: string): string {
        // Process unordered lists (- item)
        text = text.replace(/^[\s]*-\s(.+)$/gm, (match, content, offset, string) => {
            // Check if this is the start of a list or continuation
            const lines = string.split('\n');
            const currentLineIndex = string.substring(0, offset).split('\n').length - 1;
            
            // Simple approach: wrap each item individually
            return `<li class="response-list-item">${content}</li>`;
        });
        
        // Wrap consecutive list items in <ul>
        text = this.wrapConsecutiveListItems(text, 'li', 'ul', 'response-list');
        
        // Process ordered lists (1. item)
        text = text.replace(/^[\s]*\d+\.\s(.+)$/gm, (match, content, offset, string) => {
            return `<li class="response-list-item">${content}</li>`;
        });
        
        // Wrap consecutive ordered list items in <ol>
        text = this.wrapConsecutiveListItems(text, 'li', 'ol', 'response-list-ordered');
        
        return text;
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
     * Wrap consecutive list items in appropriate container
     */
    private wrapConsecutiveListItems(text: string, itemTag: string, containerTag: string, containerClass: string): string {
        const lines = text.split('\n');
        let result: string[] = [];
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i];
            
            if (line.includes(`<${itemTag}`)) {
                // Found a list item, collect consecutive ones
                const listItems: string[] = [];
                let j = i;
                
                while (j < lines.length && lines[j].includes(`<${itemTag}`)) {
                    listItems.push(lines[j]);
                    j++;
                }
                
                // Wrap in container
                result.push(`<${containerTag} class="${containerClass}">`);
                result.push(...listItems);
                result.push(`</${containerTag}>`);
                
                i = j; // Skip processed lines
            } else {
                result.push(line);
                i++;
            }
        }
        
        return result.join('\n');
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
