// File: public/scripts/lib/utils/DOMUtils.ts

/**
 * DOMUtils - Utility class for common DOM operations
 * 
 * Purpose: Provides a centralized, safe way to manipulate DOM elements
 * without repetitive code. Includes error handling, type safety, and
 * common patterns used throughout the application.
 * 
 * Use Cases:
 * - Creating DOM elements with consistent patterns
 * - Safe element selection with error handling
 * - Common DOM manipulations (classes, attributes, styles)
 * - Event handling utilities
 * - Canvas iframe compatibility helpers
 * 
 * @author: @Charisma
 * @version: 1.0.0
 * @since: 2025-08-15
 */

export class DOMUtils {

    // ===== Element Creation =====`

    /**
     * createElement
     * 
     * Create a DOM element with optional className and content
     * @param tag - HTML tag name (e.g., 'div', 'button', 'span')
     * @param className - CSS class name(s) to add
     * @param content - Text content to set
     * @returns Created HTML element
     */
    static createElement<T extends keyof HTMLElementTagNameMap>(
        tag: T, 
        className?: string, 
        content?: string
    ): HTMLElementTagNameMap[T]{

        //create the element
        const element = document.createElement(tag);

        //add class name if provided
        if (className) {
            element.className = className;
        }

        //content if provided
        if ( content !== undefined ) {
            element.textContent = content;
        }

        return element;
    }

    /**
     * createElementWithAttributes
     * 
     * Create element with multiple attributes at once
     * @param tag - HTML tag name
     * @param attributes - Object with attribute key-value pairs
     * @returns Created HTML element
     */
    static createElementWithAttributes<T extends keyof HTMLElementTagNameMap>(
        tag: T,
        attributes: Partial<HTMLElementTagNameMap[T]> & Record<string, any> = {}
    ): HTMLElementTagNameMap[T] {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value as string;
            } else if (key === 'textContent') {
                element.textContent = value as string;
            } else if (key === 'innerHTML') {
                element.innerHTML = value as string;
            } else if (key.startsWith('data-')) {
                element.setAttribute(key, String(value));
            } else if (key.startsWith('aria-')) {
                element.setAttribute(key, String(value));
            } else if (typeof value === 'function') {
                // Handle event listeners
                (element as any)[key] = value;
            } else {
                // Handle other properties
                (element as any)[key] = value;
            }
        });
        
        return element;
    }

    /**
     * Create a button element with icon and text
     * @param className - CSS classes for the button
     * @param iconName - Feather icon name (without 'data-feather')
     * @param text - Button text (optional)
     * @param title - Tooltip text
     * @returns Button element with icon
     */
    static createIconButton(
        className: string = 'icon-btn',
        iconName: string,
        text?: string,
        title?: string
    ): HTMLButtonElement {
        const button = this.createElement('button', className);
        
        if (title) {
            button.title = title;
            button.setAttribute('aria-label', title);
        }
        
        // Create icon
        const icon = this.createElement('i');
        icon.setAttribute('data-feather', iconName);
        button.appendChild(icon);
        
        // Add text if provided
        if (text) {
            const textSpan = this.createElement('span', 'btn-text', text);
            button.appendChild(textSpan);
        }
        
        return button;
    }

    // ===== ELEMENT SELECTION =====
    
    /**
     * findElement
     * 
     * Find element by selector with optional error handling
     * @param selector - CSS selector
     * @param required - Whether to throw error if element not found
     * @param context - Parent element to search within (default: document)
     * @returns Found element or null
     */
    static findElement<T extends HTMLElement>(
        selector: string, 
        required: boolean = false,
        context: Document | Element = document
    ): T | null {
        const element = context.querySelector(selector) as T | null;
        
        if (required && !element) {
            throw new Error(`Required element not found: ${selector}`);
        }
        
        return element;
    }

    /**
     * findElements
     * 
     * Find multiple elements by selector
     * @param selector - CSS selector
     * @param context - Parent element to search within (default: document)
     * @returns Array of found elements
     */
    static findElements<T extends HTMLElement>(
        selector: string,
        context: Document | Element = document
    ): T[] {
        return Array.from(context.querySelectorAll(selector)) as T[];
    }

    /**
     * getElementById
     * 
     * Find element by ID with type safety
     * @param id - Element ID (without #)
     * @param required - Whether to throw error if not found
     * @returns Found element or null
     */
    static getElementById<T extends HTMLElement>(
        id: string, 
        required: boolean = false
    ): T | null {
        const element = document.getElementById(id) as T | null;
        
        if (required && !element) {
            throw new Error(`Required element with ID '${id}' not found`);
        }
        
        return element;
    }

    // ===== CLASS MANIPULATION =====
    
    /**
     * addClass
     * 
     * Add CSS class to element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param className - Class name to add
     */
    static addClass(elementOrSelector: HTMLElement | string, className: string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.classList.add(className));
    }

    /**
     * removeClass
     * 
     * Remove CSS class from element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param className - Class name to remove
     */
    static removeClass(elementOrSelector: HTMLElement | string, className: string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.classList.remove(className));
    }
    
    /**
     * Toggle CSS class on element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param className - Class name to toggle
     * @param force - Force add (true) or remove (false)
     */
    static toggleClass(
        elementOrSelector: HTMLElement | string, 
        className: string, 
        force?: boolean
    ): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.classList.toggle(className, force));
    }

    /**
     * Check if element has CSS class
     * @param elementOrSelector - Element or CSS selector
     * @param className - Class name to check
     * @returns True if element has the class
     */
    static hasClass(elementOrSelector: HTMLElement | string, className: string): boolean {
        const elements = this.getElements(elementOrSelector);
        return elements.length > 0 && elements[0].classList.contains(className);
    }

    // ===== ATTRIBUTE MANIPULATION =====

    /**
     * setAttribute
     * 
     * Set attribute on element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param name - Attribute name
     * @param value - Attribute value
     */
    static setAttribute(
        elementOrSelector: HTMLElement | string, 
        name: string, 
        value: string
    ): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.setAttribute(name, value));
    }

    /**
     * Remove attribute from element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param name - Attribute name
     */
    static removeAttribute(elementOrSelector: HTMLElement | string, name: string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.removeAttribute(name));
    }

    /**
     * Get attribute value from element
     * @param elementOrSelector - Element or CSS selector
     * @param name - Attribute name
     * @returns Attribute value or null
     */
    static getAttribute(elementOrSelector: HTMLElement | string, name: string): string | null {
        const elements = this.getElements(elementOrSelector);
        return elements.length > 0 ? elements[0].getAttribute(name) : null;
    }

    // ===== CONTENT MANIPULATION =====

    /**
     * setText
     * 
     * Set text content of element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param text - Text content to set
     */
    static setText(elementOrSelector: HTMLElement | string, text: string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.textContent = text);
    }

    /**
     * setHTML
     * 
     * Set HTML content of element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param html - HTML content to set
     */
    static setHTML(elementOrSelector: HTMLElement | string, html: string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.innerHTML = html);
    }

    /**
     * clearContent
     * 
     * Clear content of element(s)
     * @param elementOrSelector - Element or CSS selector
     */
    static clearContent(elementOrSelector: HTMLElement | string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.innerHTML = '');
    }

    // ===== EVENT HANDLING =====

    /**
     * addEventListener
     * 
     * Add event listener with optional delegation
     * @param elementOrSelector - Element or CSS selector
     * @param eventType - Event type (e.g., 'click', 'keydown')
     * @param handler - Event handler function
     * @param delegateSelector - Optional selector for event delegation
     */
    static addEventListener<K extends keyof HTMLElementEventMap>(
        elementOrSelector: HTMLElement | string,
        eventType: K,
        handler: (event: HTMLElementEventMap[K]) => void,
        delegateSelector?: string
    ): void {
        const elements = this.getElements(elementOrSelector);
        
        elements.forEach(element => {
            if (delegateSelector) {
                // Event delegation
                element.addEventListener(eventType, (event) => {
                    const target = event.target as HTMLElement;
                    if (target && target.matches(delegateSelector)) {
                        handler(event);
                    }
                });
            } else {
                // Direct event binding
                element.addEventListener(eventType, handler);
            }
        });
    }

    /**
     * removeEventListener
     * 
     * Remove event listener
     * @param elementOrSelector - Element or CSS selector
     * @param eventType - Event type
     * @param handler - Event handler function to remove
     */
    static removeEventListener<K extends keyof HTMLElementEventMap>(
        elementOrSelector: HTMLElement | string,
        eventType: K,
        handler: (event: HTMLElementEventMap[K]) => void
    ): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.removeEventListener(eventType, handler));
    }


    // ===== VISIBILITY AND DISPLAY =====
    
    /**
     * Show element(s) by removing 'hidden' class or setting display
     * @param elementOrSelector - Element or CSS selector
     * @param displayType - CSS display value (default: 'block')
     */
    static show(
        elementOrSelector: HTMLElement | string, 
        displayType: string = 'block'
    ): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => {
            el.classList.remove('hidden');
            if (el.style.display === 'none') {
                el.style.display = displayType;
            }
        });
    }

    /**
     * hide
     * 
     * Hide element(s) by adding 'hidden' class
     * @param elementOrSelector - Element or CSS selector
     */
    static hide(elementOrSelector: HTMLElement | string): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => el.classList.add('hidden'));
    }

    /** 
     * Toggle visibility of element(s)
     * @param elementOrSelector - Element or CSS selector
     * @param force - Force show (true) or hide (false)
     */
    static toggleVisibility(
        elementOrSelector: HTMLElement | string, 
        force?: boolean
    ): void {
        const elements = this.getElements(elementOrSelector);
        elements.forEach(el => {
            if (force === true) {
                this.show(el);
            } else if (force === false) {
                this.hide(el);
            } else {
                // Toggle based on current state
                if (el.classList.contains('hidden')) {
                    this.show(el);
                } else {
                    this.hide(el);
                }
            }
        });
    }

    // ===== CANVAS-SPECIFIC UTILITIES =====
    
    /**
     * Replace Feather icons (Canvas iframe compatible)
     * Safe wrapper around feather.replace() with error handling
     */
    static replaceFeatherIcons(): void {
        try {
            const feather = (window as any).feather;
            if (feather && typeof feather.replace === 'function') {
                feather.replace();
            }
        } catch (error) {
            console.warn('Feather icons not available:', error);
        }
    }

    /**
     * Check if running in canvas iframe
     */
    static isCanvasIframe(): boolean {
        try {
            return window.self !== window.top;
        }
        catch (error) {
            console.warn('Error checking canvas iframe:', error);
            return true;
        }
        
    }

    /**
     * Safe localStorage check (Canvas iframe compatible)
     * @returns True if localStorage is available
     */
    static hasLocalStorage(): boolean {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }


    // ===== SCROLL UTILITIES =====

    /**
     * Scroll element to bottom smoothly
     * @param elementOrSelector - Element or CSS selector
     * @param behavior = Scroll behariour ('smooth' or 'auto')
     */
    static scrollToBottom(
        elementOrSelector: HTMLElement | string, 
        behavior: ScrollBehavior = 'smooth'
    ): void {
        const element = this.getElements(elementOrSelector);
        element.forEach(el => {
            try {
                el.scrollTo({
                    top: el.scrollHeight,
                    behavior
                });
            }
            catch (error) {
                //fallback to the older browser
                el.scrollTop = el.scrollHeight;
            }
        });
    }


    /**
     * scroll element into view
     * @param elementOrSelector - Eleemnt of CSS Selector
     * @param oprions - Scoll options
     */
    static scrollIntoView(
        elementOrSelector: HTMLElement | string,
        options: ScrollIntoViewOptions = {behavior: 'smooth', block: 'center'}
    ): void {
        const element = this.getElements(elementOrSelector);
        element.forEach(el => {
            try {
                el.scrollIntoView(options);
            }
            catch( error ){
                el.scrollIntoView();
            }
        });
    }


    // ===== HELPER METHODS =====
    /**
     * getElements
     * 
     * Convert selector or element to array of elements
     * @param elementOrSelector - Element or CSS selector
     * @returns Array of HTML elements
     */
    private static getElements(elementOrSelector: HTMLElement | string): HTMLElement[] {
        if (typeof elementOrSelector === 'string') {
            return this.findElements(elementOrSelector);
        } else {
            return [elementOrSelector];
        }
    }

    /**
     * debounce function calls
     * @param func - function to debounce
     * @param wait - waittime in millisecond
     * @retunr s Throttled function
     */

    static debounce<T extends (...args: any[]) => any>(
        func: T,
        wait: number
    ): (...args: Parameters<T>) => void {
        let timeout: NodeJS.Timeout;
        return (...args: Parameters<T>) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    /**
     * Throttle function calls
     * @param func - Function to throttle
     * @param limit - Time limit in milliseconds
     * @returns Throttled function
     */
    static throttle<T extends (...args: any[]) => any>(
        func: T, 
        limit: number
    ): (...args: Parameters<T>) => void {
        let inThrottle: boolean;
        return (...args: Parameters<T>) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}


// ===== USAGE EXAMPLES =====

/*

// Creating elements:
const button = DOMUtils.createElement('button', 'btn btn-primary', 'Click me');
const iconBtn = DOMUtils.createIconButton('icon-btn', 'star', 'Favorite', 'Add to favorites');

// Element selection:
const chatArea = DOMUtils.findElement<HTMLDivElement>('#chat-area', true);
const messages = DOMUtils.findElements<HTMLDivElement>('.message');

// Class manipulation:
DOMUtils.addClass('#sidebar', 'collapsed');
DOMUtils.toggleClass('.modal', 'show');

// Content manipulation:
DOMUtils.setText('#chat-title', 'My Chat');
DOMUtils.setHTML('#message-area', '<p>No messages yet</p>');

// Event handling:
DOMUtils.addEventListener('#send-btn', 'click', () => sendMessage());
DOMUtils.addEventListener('#chat-list', 'click', handleChatClick, '.chat-item');

// Visibility:
DOMUtils.show('#loading');
DOMUtils.hide('.error-message');

// Canvas-specific:
DOMUtils.replaceFeatherIcons();
if (DOMUtils.isInCanvas()) {
    console.log('Running in Canvas iframe');
}

// Scroll utilities:
DOMUtils.scrollToBottom('#message-area');
DOMUtils.scrollIntoView('#pinned-message');

// Utility functions:
const debouncedSearch = DOMUtils.debounce(performSearch, 300);
const throttledScroll = DOMUtils.throttle(handleScroll, 100);

*/


