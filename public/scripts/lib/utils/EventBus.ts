// File: public/scripts/lib/utils/EventBus.ts

/**
 * EventBus - Global system for loose coupling between components
 * 
 * Purpose: 
 * Allow different part of the application to communicate each other
 * without directly referencing each other. Components can emits events
 * to other components that listens for those components.
 * 
 * use Cases:
 *  - Components A need to notify components B about something
 *  - Decoupling components should not be able to know each other
 *  - multiple component can react to the same event
 * 
 * @author: @Charisma
 * @version: 1.0.0
 * @since: 2025-08-15
 * 
 */

type EventHandler = (...args: any[]) => void;

export class EventBus {

    // ===== PRIVATE PROPERTIES =====
    private events: Map<string, EventHandler[]> = new Map();
    private static instance : EventBus | null = null

    /**
     * Get the global EventBus instance (Singleton pattern)
     * Ensures there's only one event bus across the entire application
     */
    static getInstance() : EventBus {
        if (this.instance === null) {
            this.instance = new EventBus();
        }
        return this.instance;
    }

    // ===== PUBLIC METHODS =====

    /**
     * Register a new event listener
     * @param eventName - The name of the event to listen for
     * @param handler - The function to call when the event is triggered
     */
    on(eventName: string, handler: EventHandler) : void {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName)?.push(handler);
    }

    /**
     * Register a one-time event handler that automatically removes itself after first trigger
     * @param event - Name of the event to listen for
     * @param handler - Function to call when event is emitted (only once)
     */
    once(eventName: string, handler: EventHandler) : void {
        const onceWrapper = (...args : any[]) => {
            handler(...args);
            this.off(eventName, onceWrapper)
        }
        this.on(eventName, onceWrapper);
    }

    /**
     * Remove an event listener
     * @param eventName - The name of the event to remove the listener for
     * @param handler - The function to remove from the event listener list
     */
    off(eventName: string, handler: EventHandler) : void {

        //find the handlers
        const handlers = this.events.get(eventName);
        if (!handlers) return;

        //remove the handler
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }

        //remove event if no more listeners
        if (this.events.get(eventName)?.length === 0) {
            this.events.delete(eventName);
        }
    }

    /**
     * Emit an event to all registered handlers
     * @param event - Name of the event to emit
     * @param args - Arguments to pass to the event handlers, it needs to be serializable
     */

    emit(eventName: string, ...args: any[]) {

        //get the handlers for the event
        const handlers = this.events.get(eventName);
        if (!handlers || handlers.length === 0) return;

        //call each handlers using serializable arguments
        //slice() is used to create a copy incase the handler modifies the original array
        handlers.slice().forEach( handler => {
            try {
                handler(...args);
            }
            catch (error) {
                console.error(`Error in event handler for ${eventName}:`, error);
                //continue excetuing eventhough it fails.
            }

        });
    }

    /**
     * listenerCount
     * 
     * Get the number of handlers for a specific event
     * @param event - Name of the event
     * @returns Number of handlers registered for this event
     */
    listenerCount(eventName: string) : number {
        return this.events.get(eventName)?.length ?? 0;
    }

    /**
     * eventNames
     * 
     * Get all event names that have handlers
     * @returns Array of event names
     */
    eventNames(): string[] {
        return Array.from(this.events.keys());
    }

    /**
     * hasListeners
     * 
     * Check if there are any handlers for a specific event
     * @param event - Name of the event
     * @returns True if there are handlers, false otherwise
     */
    hasListeners(event: string): boolean {
        return this.listenerCount(event) > 0;
    }


    /**
     * Debug method to see current event registrations
     * Useful for debugging event flow issues
     */
    debug(): void {
        console.group('EventBus Debug');
        console.log('Total events:', this.events.size);
        
        this.events.forEach((handlers, eventName) => {
            console.log(`Event '${eventName}': ${handlers.length} handlers`);
        });
        
        console.groupEnd();
    }

}

// Export both the class and a default global instance
export const globalEventBus = EventBus.getInstance();