/**
 * pipeline — run migrate ops in order with blank lines between steps
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.0.0
 * @description: Sequential runner used by npm run migrate.
 */

import type { MigrateOp } from './migrate-args';

/**
 * runMigratePipeline - invoke each op handler in the given order.
 *
 * @param ops - Steps to run (default A → B → C → D)
 * @param handlers - One async function per op
 * @param log - Progress printer
 * @returns Ops that completed
 */
export async function runMigratePipeline(
    ops: MigrateOp[],
    handlers: Record<MigrateOp, () => Promise<void>>,
    log: (line: string) => void
): Promise<MigrateOp[]> {
    const ran: MigrateOp[] = [];
    for (const op of ops) {
        // Blank lines between steps so A/B/C/D blocks are easy to scan in the terminal.
        log('');
        log(`== ${op} ==`);
        log('');
        await handlers[op]();
        ran.push(op);
    }
    return ran;
}
