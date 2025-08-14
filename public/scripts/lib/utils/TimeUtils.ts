/**
 * TimeUtils is a class that provides utility functions for time.
 * 
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-14
 */

export class TimeUtils {

    /**
     * Format timestamp for message display (e.g., "14:30 Today", "09:15 Yesterday")
     * This matches your existing formatFullTimestamp function
     * 
     * @param timestampMs - the timestamp to format
     * @returns the formatted timestamp
     */
    static formatFullTimestamp(timestampMs: number): string {
        const d = new Date(timestampMs);
        const now = new Date();

        const sameYMD = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() && 
            a.getMonth() === b.getMonth() && 
            a.getDate() === b.getDate();

        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');

        let dateLabel: string;
        if (sameYMD(d, now)) {
            dateLabel = 'Today';
        } else if (sameYMD(d, yesterday)) {
            dateLabel = 'Yesterday';
        } else {
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const month = monthNames[d.getMonth()];
            const day = d.getDate();
            const year = d.getFullYear();
            dateLabel = `${month} ${day}, ${year}`;
        }

        return `${hours}:${minutes} ${dateLabel}`;
    }
}