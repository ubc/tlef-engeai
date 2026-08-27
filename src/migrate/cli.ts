/**
 * migrate CLI — Mongo / Qdrant data sync
 *
 * Default and `--check` are dry-run. `--apply` writes.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.1.0
 * @description: npm run migrate entrypoint.
 */

import type { Db } from 'mongodb';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { loadConfig } from '../utils/config';
import { buildCourseCatalogMap, type CourseCatalogMap } from './catalog-map';
import { opsToRun, parseArgs, type MigrateOp } from './migrate-args';
import { runMongoAttributeCheck } from './mongo-attribute-check';
import { runMigratePipeline } from './pipeline';
import {
    loadCourseDocs,
    runQdrantAttributeCheck,
    runQdrantResolveToMongo,
    runQdrantValidateFromMongo,
} from './qdrant-ops';

/**
 * buildHandlers - one function per pipeline op. Catalog is reused after A so C/D do not rescan blindly.
 */
function buildHandlers(input: {
    db: Db;
    apply: boolean;
    qdrantCfg: { url: string; apiKey?: string; collectionName: string };
    log: (line: string) => void;
}): Record<MigrateOp, () => Promise<void>> {
    let catalog: CourseCatalogMap | undefined;
    const catalogReady = async (): Promise<CourseCatalogMap> => {
        if (catalog) {
            return catalog;
        }
        catalog = buildCourseCatalogMap(await loadCourseDocs(input.db)).map;
        return catalog;
    };
    return {
        'mongo-attribute-check': async () => {
            const result = await runMongoAttributeCheck(input.db, input.apply, input.log);
            catalog = result.catalog;
        },
        'qdrant-attribute-check': async () => {
            await runQdrantAttributeCheck(input.qdrantCfg, input.apply, input.log);
        },
        'qdrant-resolve': async () => {
            await runQdrantResolveToMongo(input.db, await catalogReady(), input.qdrantCfg, input.apply, input.log);
        },
        'qdrant-validate': async () => {
            await runQdrantValidateFromMongo(input.db, await catalogReady(), input.qdrantCfg, input.apply, input.log);
        },
    };
}

/**
 * main - parse flags, run A→B→C→D (or `--op`), then close Mongo so the process exits.
 */
async function main(): Promise<void> {
    const parsed = parseArgs(process.argv);
    const config = loadConfig();
    const mongoDbName = process.env.MONGO_DB_NAME || '';
    const qdrant = config.ragConfig.qdrantConfig;
    const qdrantCollectionName = qdrant.collectionName;

    const ops = opsToRun(parsed.op);
    const mode = parsed.apply ? 'apply' : 'check';
    const log = (line: string) => process.stdout.write(`${line}\n`);
    log(`[migrate] ops=${ops.join(',')}  mode=${mode}  db=${mongoDbName}  qdrant=${qdrantCollectionName}`);
    log('Order: A → B → C → D. --check (default) does not write. --apply writes. Stop the app server before --apply.');

    const mongo = await EngEAI_MongoDB.getInstance();
    try {
        await runMigratePipeline(
            ops,
            buildHandlers({
                db: mongo.db,
                apply: parsed.apply,
                qdrantCfg: {
                    url: qdrant.url,
                    apiKey: qdrant.apiKey,
                    collectionName: qdrantCollectionName,
                },
                log,
            }),
            log
        );
    } finally {
        await mongo.close();
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exit(1);
        });
}
