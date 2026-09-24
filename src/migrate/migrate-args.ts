/**
 * migrate-args — argv parser for npm run migrate
 *
 * Default with no --op runs the full A → B → C → D pipeline.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.1.0
 * @description: CLI flags and canonical op order.
 */

export type MigrateOp =
    | 'mongo-attribute-check'
    | 'qdrant-attribute-check'
    | 'qdrant-validate'
    | 'qdrant-resolve';

/** A → B → C → D. Resolve (register chunk ids) before validate (orphan delete). */
export const MIGRATE_PIPELINE_OPS: MigrateOp[] = [
    'mongo-attribute-check',
    'qdrant-attribute-check',
    'qdrant-resolve',
    'qdrant-validate',
];

/**
 * parseArgs - read --check, --apply, and optional --op.
 *
 * Default and `--check` are dry-run (`apply: false`). `--apply` writes.
 * `--op` limits the run to one step. `--check` and `--apply` together throw.
 */
export function parseArgs(argv: string[]): {
    op?: MigrateOp;
    apply: boolean;
} {
    const args = argv.slice(2);
    let op: MigrateOp | undefined;
    let apply = false;
    let check = false;
    for (let i = 0; i < args.length; i += 1) {
        const token = args[i];
        if (token === '--apply') apply = true;
        else if (token === '--check') check = true;
        else if (token === '--op') {
            op = args[i + 1] as MigrateOp;
            i += 1;
        }
    }
    if (check && apply) {
        throw new Error('Use --check or --apply, not both');
    }
    return { op, apply };
}

/**
 * opsToRun - full A→B→C→D pipeline unless --op names a single step.
 *
 * @param parsedOp - Optional `--op` value
 */
export function opsToRun(parsedOp: MigrateOp | undefined): MigrateOp[] {
    return parsedOp ? [parsedOp] : [...MIGRATE_PIPELINE_OPS];
}
