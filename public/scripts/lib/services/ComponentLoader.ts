// File: public/scripts/lib/services/ComponentLoader.ts

/**
 * ComponentLoader - Service for loading and managing HTML components
 * 
 * Purpose: Handles dynamic loading of HTML content from component files,
 * manages component lifecycle, provides caching, and integrates with
 * Canvas iframe constraints. Supports lazy loading, error handling,
 * and component-specific initialization.
 * 
 * Use Cases:
 * - Loading main application views (welcome-screen, chat-window, settings)
 * - Loading modal content (disclaimer, flag-message, artefact viewer)
 * - Managing component transitions and lifecycle
 * - Handling component-specific scripts and styles
 * - Caching frequently used components
 * 
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 * 
 */

// ===== TYPE DEFINITIONS =====

type ComponentName = 
    | 'welcome-screen' 
    | 'chat-window' 
    | 'report-history'
    | 'disclaimer'
    | 'flag-message'
    | 'artefact'
    | 'message-menu'
    | 'settings';

interface ComponentConfig {
    url?: string;
    cache?: boolean;
    timeout?: number;
    dependencies?: ComponentName[];
    initScript?: string;
    cssFile?: string;
    placeholder?: string;
    errorFallback?: string;
}

interface LoadedComponent {
    name: ComponentName;
    html: string;
    loadedAt: number;
    config: ComponentConfig;
    dependencies: ComponentName[];
}

interface ComponentLoadResult {
    success: boolean;
    html?: string;
    error?: string;
    fromCache?: boolean;
    loadTime?: number;
}

// ===== DEFAULT CONFIGURATIONS =====

const DEFAULT_COMPONENT_CONFIGS: Record<ComponentName, ComponentConfig> = {
    'welcome-screen': {
        cache: true,
        placeholder: '<div class="loading">Loading welcome screen...</div>',
        errorFallback: '<div class="error">Welcome screen unavailable</div>'
    },
    'chat-window': {
        cache: true,
        dependencies: ['message-menu'],
        placeholder: '<div class="loading">Loading chat interface...</div>',
        errorFallback: '<div class="error">Chat interface unavailable</div>'
    },
    'report-history': {
        cache: false, // Reports may change frequently
        placeholder: '<div class="loading">Loading reports...</div>',
        errorFallback: '<div class="error">Reports unavailable</div>'
    },
    'disclaimer': {
        cache: true,
        placeholder: '<div class="modal"><div class="modal-content">Loading...</div></div>',
        errorFallback: '<div class="modal"><div class="modal-content">Disclaimer unavailable</div></div>'
    },
    'flag-message': {
        cache: true,
        placeholder: '<div class="loading">Loading flag form...</div>',
        errorFallback: '<div class="error">Flag form unavailable</div>'
    },
    'artefact': {
        cache: true,
        placeholder: '<div class="loading">Loading artefact viewer...</div>',
        errorFallback: '<div class="error">Artefact viewer unavailable</div>'
    },
    'message-menu': {
        cache: true,
        placeholder: '<div class="context-menu">Loading menu...</div>',
        errorFallback: '<div class="context-menu">Menu unavailable</div>'
    },
    'settings': {
        cache: false, // Settings may change based on user state
        placeholder: '<div class="loading">Loading settings...</div>',
        errorFallback: '<div class="error">Settings unavailable</div>'
    }
};

export class ComponentLoader {
    // ===== PRIVATE STATE =====
    
    private static componentCache = new Map<ComponentName, LoadedComponent>();
    private static loadingPromises = new Map<ComponentName, Promise<ComponentLoadResult>>();
    private static config = {
        baseUrl: '/components',
        defaultTimeout: 10000,
        enableCache: true,
        maxCacheAge: 300000, // 5 minutes
        retryAttempts: 2
    };

    // ===== CONFIGURATION =====

    /**
     * Configure component loader settings
     * @param newConfig - Configuration overrides
     */
    static configure(newConfig: Partial<typeof ComponentLoader.config>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Register or update component configuration
     * @param name - Component name
     * @param config - Component configuration
     */
    static registerComponent(name: ComponentName, config: ComponentConfig): void {
        DEFAULT_COMPONENT_CONFIGS[name] = { ...DEFAULT_COMPONENT_CONFIGS[name], ...config };
    }

    // ===== MAIN LOADING METHODS =====

    /**
     * Load component into a container element
     * @param componentName - Name of component to load
     * @param container - Target container element
     * @param data - Optional data to inject into component
     * @returns Promise resolving to load result
     */
    static async loadComponent(
        componentName: ComponentName,
        container: HTMLElement,
        data?: Record<string, any>
    ): Promise<ComponentLoadResult> {
        const startTime = Date.now();

        try {
            // Show placeholder immediately
            this.showPlaceholder(container, componentName);

            // Load component HTML
            const result = await this.getComponentHTML(componentName);
            
            if (!result.success || !result.html) {
                throw new Error(result.error || 'Failed to load component');
            }

            // Process the HTML with data injection
            let processedHTML = result.html;
            if (data) {
                processedHTML = this.injectData(processedHTML, data);
            }

            // Load dependencies first
            await this.loadDependencies(componentName);

            // Insert into container
            container.innerHTML = processedHTML;

            // Run component initialization
            await this.initializeComponent(componentName, container);

            // Replace Feather icons
            this.replaceFeatherIcons(container);

            const loadTime = Date.now() - startTime;

            return {
                success: true,
                html: processedHTML,
                fromCache: result.fromCache,
                loadTime
            };

        } catch (error) {
            console.error(`Failed to load component ${componentName}:`, error);
            
            // Show error fallback
            this.showErrorFallback(container, componentName);

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                loadTime: Date.now() - startTime
            };
        }
    }

    /**
     * Preload component for faster future access
     * @param componentName - Component to preload
     * @returns Promise resolving when preload completes
     */
    static async preloadComponent(componentName: ComponentName): Promise<void> {
        try {
            await this.getComponentHTML(componentName);
        } catch (error) {
            console.warn(`Failed to preload component ${componentName}:`, error);
        }
    }

    /**
     * Preload multiple components
     * @param componentNames - Array of components to preload
     * @returns Promise resolving when all preloads complete
     */
    static async preloadComponents(componentNames: ComponentName[]): Promise<void> {
        const preloadPromises = componentNames.map(name => this.preloadComponent(name));
        await Promise.allSettled(preloadPromises);
    }

    // ===== HTML FETCHING AND CACHING =====

    /**
     * Get component HTML with caching support
     * @param componentName - Component to fetch
     * @returns Promise resolving to load result
     */
    private static async getComponentHTML(componentName: ComponentName): Promise<ComponentLoadResult> {
        // Check if already loading
        const existingPromise = this.loadingPromises.get(componentName);
        if (existingPromise) {
            return existingPromise;
        }

        // Check cache first
        if (this.config.enableCache) {
            const cached = this.getCachedComponent(componentName);
            if (cached) {
                return {
                    success: true,
                    html: cached.html,
                    fromCache: true
                };
            }
        }

        // Create loading promise
        const loadingPromise = this.fetchComponentHTML(componentName);
        this.loadingPromises.set(componentName, loadingPromise);

        try {
            const result = await loadingPromise;
            
            // Cache successful result
            if (result.success && result.html && this.shouldCache(componentName)) {
                this.cacheComponent(componentName, result.html);
            }

            return result;
        } finally {
            // Clean up loading promise
            this.loadingPromises.delete(componentName);
        }
    }

    /**
     * Fetch component HTML from server
     * @param componentName - Component to fetch
     * @returns Promise resolving to load result
     */
    private static async fetchComponentHTML(componentName: ComponentName): Promise<ComponentLoadResult> {
        const config = this.getComponentConfig(componentName);
        const url = config.url || `${this.config.baseUrl}/${componentName}.html`;
        const timeout = config.timeout || this.config.defaultTimeout;

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const html = await response.text();

                if (!html.trim()) {
                    throw new Error('Empty component response');
                }

                return {
                    success: true,
                    html: html.trim()
                };

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                // Wait before retry (with exponential backoff)
                if (attempt < this.config.retryAttempts) {
                    await this.sleep(1000 * Math.pow(2, attempt - 1));
                }
            }
        }

        return {
            success: false,
            error: lastError?.message || 'Unknown error'
        };
    }

    // ===== CACHING MANAGEMENT =====

    /**
     * Get cached component if available and not expired
     * @param componentName - Component name
     * @returns Cached component or null
     */
    private static getCachedComponent(componentName: ComponentName): LoadedComponent | null {
        const cached = this.componentCache.get(componentName);
        
        if (!cached) {
            return null;
        }

        // Check if cache is expired
        const age = Date.now() - cached.loadedAt;
        if (age > this.config.maxCacheAge) {
            this.componentCache.delete(componentName);
            return null;
        }

        return cached;
    }

    /**
     * Cache component HTML
     * @param componentName - Component name
     * @param html - Component HTML
     */
    private static cacheComponent(componentName: ComponentName, html: string): void {
        const config = this.getComponentConfig(componentName);
        
        const cached: LoadedComponent = {
            name: componentName,
            html,
            loadedAt: Date.now(),
            config,
            dependencies: config.dependencies || []
        };

        this.componentCache.set(componentName, cached);
    }

    /**
     * Check if component should be cached
     * @param componentName - Component name
     * @returns True if component should be cached
     */
    private static shouldCache(componentName: ComponentName): boolean {
        const config = this.getComponentConfig(componentName);
        return config.cache !== false;
    }

    /**
     * Clear cache for specific component or all components
     * @param componentName - Component to clear, or undefined for all
     */
    static clearCache(componentName?: ComponentName): void {
        if (componentName) {
            this.componentCache.delete(componentName);
        } else {
            this.componentCache.clear();
        }
    }

    // ===== DEPENDENCY MANAGEMENT =====

    /**
     * Load component dependencies
     * @param componentName - Component whose dependencies to load
     */
    private static async loadDependencies(componentName: ComponentName): Promise<void> {
        const config = this.getComponentConfig(componentName);
        const dependencies = config.dependencies || [];

        if (dependencies.length === 0) {
            return;
        }

        // Load dependencies in parallel
        const dependencyPromises = dependencies.map(dep => this.getComponentHTML(dep));
        await Promise.allSettled(dependencyPromises);
    }

    // ===== DATA INJECTION =====

    /**
     * Inject data into component HTML using template replacement
     * @param html - Component HTML
     * @param data - Data to inject
     * @returns Processed HTML
     */
    private static injectData(html: string, data: Record<string, any>): string {
        let result = html;

        // Replace placeholders like {{key}} with data values
        Object.entries(data).forEach(([key, value]) => {
            const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            result = result.replace(placeholder, stringValue);
        });

        // Handle conditional blocks {{#if key}}...{{/if}}
        result = result.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (match, key, content) => {
            return data[key] ? content : '';
        });

        // Handle loops {{#each items}}...{{/each}}
        result = result.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (match, key, template) => {
            const items = data[key];
            if (!Array.isArray(items)) {
                return '';
            }
            return items.map(item => {
                let itemHtml = template;
                if (typeof item === 'object') {
                    Object.entries(item).forEach(([itemKey, itemValue]) => {
                        const itemPlaceholder = new RegExp(`{{\\s*${itemKey}\\s*}}`, 'g');
                        itemHtml = itemHtml.replace(itemPlaceholder, String(itemValue));
                    });
                }
                return itemHtml;
            }).join('');
        });

        return result;
    }

    // ===== COMPONENT INITIALIZATION =====

    /**
     * Initialize component after loading
     * @param componentName - Component name
     * @param container - Container element
     */
    private static async initializeComponent(componentName: ComponentName, container: HTMLElement): Promise<void> {
        const config = this.getComponentConfig(componentName);

        // Run component-specific initialization
        try {
            switch (componentName) {
                case 'welcome-screen':
                    this.initWelcomeScreen(container);
                    break;
                case 'chat-window':
                    this.initChatWindow(container);
                    break;
                case 'report-history':
                    this.initReportHistory(container);
                    break;
                case 'flag-message':
                    this.initFlagMessage(container);
                    break;
                case 'artefact':
                    this.initArtefact(container);
                    break;
                case 'message-menu':
                    this.initMessageMenu(container);
                    break;
                case 'settings':
                    this.initSettings(container);
                    break;
                case 'disclaimer':
                    this.initDisclaimer(container);
                    break;
            }

            // Run custom init script if provided
            if (config.initScript) {
                await this.runInitScript(config.initScript, container);
            }

        } catch (error) {
            console.error(`Failed to initialize component ${componentName}:`, error);
        }
    }

    // ===== COMPONENT-SPECIFIC INITIALIZATION =====

    private static initWelcomeScreen(container: HTMLElement): void {
        const addChatBtn = container.querySelector('#welcome-add-chat-btn');
        addChatBtn?.addEventListener('click', () => {
            // Emit event for main app to handle
            window.dispatchEvent(new CustomEvent('create-new-chat'));
        });
    }

    private static initChatWindow(container: HTMLElement): void {
        // Auto-grow textarea
        const textarea = container.querySelector('#chat-input') as HTMLTextAreaElement;
        if (textarea) {
            const autoGrow = () => {
                textarea.style.height = 'auto';
                const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight || '20');
                const maxHeight = lineHeight * 4;
                textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
            };
            textarea.addEventListener('input', autoGrow);
            autoGrow();
        }

        // Emit ready event
        window.dispatchEvent(new CustomEvent('chat-window-ready'));
    }

    private static initReportHistory(container: HTMLElement): void {
        const reportList = container.querySelector('.report-list');
        reportList?.addEventListener('click', (e) => {
            const header = (e.target as HTMLElement).closest('.report-item-header');
            if (header) {
                const item = header.closest('.report-item');
                item?.classList.toggle('open');
            }
        });
    }

    private static initFlagMessage(container: HTMLElement): void {
        const form = container.querySelector('#flag-form') as HTMLFormElement;
        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('flag-submitted', { 
                detail: new FormData(form) 
            }));
        });
    }

    private static initArtefact(container: HTMLElement): void {
        // Initialize Mermaid diagrams
        try {
            const mermaid = (window as any).mermaid;
            if (mermaid && typeof mermaid.init === 'function') {
                mermaid.init(undefined, container.querySelectorAll('.mermaid'));
            }
        } catch (error) {
            console.warn('Mermaid not available:', error);
        }
    }

    private static initMessageMenu(container: HTMLElement): void {
        // Event delegation for menu items
        container.addEventListener('click', (e) => {
            const menuItem = (e.target as HTMLElement).closest('.menu-item') as HTMLElement;
            if (menuItem) {
                const action = menuItem.dataset.action;
                if (action) {
                    window.dispatchEvent(new CustomEvent('menu-action', { 
                        detail: { action, element: menuItem } 
                    }));
                }
            }
        });
    }

    private static initSettings(container: HTMLElement): void {
        // Form handling and validation would go here
        const forms = container.querySelectorAll('form');
        forms.forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('settings-updated', { 
                    detail: new FormData(form) 
                }));
            });
        });
    }

    private static initDisclaimer(container: HTMLElement): void {
        // No special initialization needed for disclaimer
        // Close handlers are managed by modal system
    }

    // ===== UTILITY METHODS =====

    /**
     * Show placeholder content while loading
     * @param container - Container element
     * @param componentName - Component being loaded
     */
    private static showPlaceholder(container: HTMLElement, componentName: ComponentName): void {
        const config = this.getComponentConfig(componentName);
        if (config.placeholder) {
            container.innerHTML = config.placeholder;
        }
    }

    /**
     * Show error fallback content
     * @param container - Container element
     * @param componentName - Component that failed to load
     */
    private static showErrorFallback(container: HTMLElement, componentName: ComponentName): void {
        const config = this.getComponentConfig(componentName);
        if (config.errorFallback) {
            container.innerHTML = config.errorFallback;
        } else {
            container.innerHTML = '<div class="error">Component unavailable</div>';
        }
    }

    /**
     * Replace Feather icons within container
     * @param container - Container to process
     */
    private static replaceFeatherIcons(container: HTMLElement): void {
        try {
            const feather = (window as any).feather;
            if (feather && typeof feather.replace === 'function') {
                // Only replace icons within this container
                feather.replace(container.querySelectorAll('[data-feather]'));
            }
        } catch (error) {
            console.warn('Feather icons not available:', error);
        }
    }

    /**
     * Run custom initialization script
     * @param script - Script code to run
     * @param container - Container element
     */
    private static async runInitScript(script: string, container: HTMLElement): Promise<void> {
        try {
            // Create function with container as parameter
            const initFunction = new Function('container', script);
            await initFunction(container);
        } catch (error) {
            console.error('Init script failed:', error);
        }
    }

    /**
     * Get configuration for component
     * @param componentName - Component name
     * @returns Component configuration
     */
    private static getComponentConfig(componentName: ComponentName): ComponentConfig {
        return DEFAULT_COMPONENT_CONFIGS[componentName] || {};
    }

    /**
     * Sleep for specified milliseconds
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== PUBLIC UTILITY METHODS =====

    /**
     * Get cache statistics
     * @returns Cache information
     */
    static getCacheStats(): {
        size: number;
        components: string[];
        totalSize: number;
    } {
        const components = Array.from(this.componentCache.keys());
        const totalSize = Array.from(this.componentCache.values())
            .reduce((total, component) => total + component.html.length, 0);

        return {
            size: this.componentCache.size,
            components,
            totalSize
        };
    }

    /**
     * Check if component is cached
     * @param componentName - Component to check
     * @returns True if component is cached
     */
    static isCached(componentName: ComponentName): boolean {
        return this.getCachedComponent(componentName) !== null;
    }

    /**
     * Get list of currently loading components
     * @returns Array of component names being loaded
     */
    static getLoadingComponents(): ComponentName[] {
        return Array.from(this.loadingPromises.keys());
    }
}

// ===== USAGE EXAMPLES =====

/*

// Basic component loading:
const mainArea = document.getElementById('main-content-area')!;
await ComponentLoader.loadComponent('welcome-screen', mainArea);

// Loading with data injection:
await ComponentLoader.loadComponent('chat-window', mainArea, {
    chatTitle: 'My Chat',
    messageCount: 42,
    isActive: true
});

// Preload components for better performance:
ComponentLoader.preloadComponents(['disclaimer', 'flag-message', 'artefact']);

// Configure loader:
ComponentLoader.configure({
    baseUrl: '/components',
    enableCache: true,
    maxCacheAge: 600000 // 10 minutes
});

// Register custom component:
ComponentLoader.registerComponent('custom-modal', {
    url: '/components/custom/modal.html',
    cache: true,
    dependencies: ['message-menu'],
    initScript: `
        console.log('Custom modal initialized');
        container.querySelector('.custom-btn').addEventListener('click', () => {
            alert('Custom button clicked!');
        });
    `
});

// Clear cache when needed:
ComponentLoader.clearCache('report-history'); // Clear specific component
ComponentLoader.clearCache(); // Clear all cached components

// Check cache status:
const stats = ComponentLoader.getCacheStats();
console.log(`Cache contains ${stats.size} components, total size: ${stats.totalSize} bytes`);

// Listen for component events:
window.addEventListener('chat-window-ready', () => {
    console.log('Chat window is ready for interaction');
});

window.addEventListener('create-new-chat', () => {
    // Handle new chat creation
    chatStateManager.createNewChat();
});

*/