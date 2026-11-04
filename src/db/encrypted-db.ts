// src/db/encrypted-db.ts

/**
 * encrypted-db.ts
 * @description Wraps the connected `Db` with `@ubc/genai-toolkit-encryption` so collections named in
 * `encryption.config.cjs` encrypt and decrypt transparently for every delegate in `src/db/mongo/`.
 */

import type { Collection, CreateCollectionOptions, Db, Document } from 'mongodb';
import { createEncryptedDb, type EncryptionConfigInput, type ProtectedDb } from '@ubc/genai-toolkit-encryption';

/**
 * Collections the code relies on being encrypted.
 *
 * Checked against the loaded configuration at startup, so renaming a collection in code (or a
 * token-collection env override) cannot leave it silently unprotected. Token-collection fallbacks
 * match `src/lms/canvas-config.ts` and `src/routes/route-lms.ts`.
 */
function requiredProtectedCollections(): string[] {
    return [
        'writing-submissions',
        'writing-feedback-runs',
        process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens',
        process.env.MOODLE_TOKEN_COLLECTION_NAME || 'moodle_tokens'
    ];
}

/**
 * routeCollectionsThroughEncryption — a `Db` whose collection handles come from the protected wrapper.
 *
 * The data layer is typed against the driver's `Db` and also needs administrative methods the
 * toolkit's `ProtectedDb` does not expose (`createCollection`, `dropCollection`, `admin`). This view
 * keeps those on the raw handle and sends every collection lookup through `protectedDb`, so no
 * delegate can reach a configured collection unencrypted. Configured collections come back as a
 * `ProtectedCollection` behind the `Collection` type; it implements the subset of methods listed in
 * the toolkit's supported-operations matrix, and anything else is a programming error.
 *
 * @param raw - Connected driver database
 * @param protectedDb - The same database wrapped by `createEncryptedDb`
 * @returns Driver-typed database view routing `collection()` and `createCollection()` through encryption
 */
export function routeCollectionsThroughEncryption(raw: Db, protectedDb: ProtectedDb): Db {
    const collection = (name: string) => protectedDb.collection(name) as unknown as Collection<Document>;
    const createCollection = async (name: string, options?: CreateCollectionOptions) => {
        await raw.createCollection(name, options);
        return collection(name);
    };

    return new Proxy(raw, {
        get(target, property) {
            if (property === 'collection') return collection;
            if (property === 'createCollection') return createCollection;
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

/**
 * wrapDbWithEncryption — validates the encryption config, resolves keys, and wraps the connected `Db`.
 *
 * Fails closed: a missing or malformed `ENGEAI_*` key, an invalid configuration, or a required
 * collection missing from the configuration throws here, before the server handles a request.
 *
 * @param raw - Connected driver database
 * @param config - Override for tests; defaults to the repository-root `encryption.config.cjs`
 * @returns Database view for `MongoDalContext.db`
 * @throws ConfigurationError from the toolkit, or Error naming an unprotected required collection
 */
export async function wrapDbWithEncryption(raw: Db, config?: EncryptionConfigInput): Promise<Db> {
    // Loaded lazily so importing the data layer (unit tests) never needs keys. Both `src/db/` and
    // `dist/db/` sit two levels below the repository root.
    const resolvedConfig: EncryptionConfigInput = config ?? require('../../encryption.config.cjs');
    const protectedDb = await createEncryptedDb(raw, resolvedConfig);

    const unprotected = requiredProtectedCollections().filter((name) => !protectedDb.isProtected(name));
    if (unprotected.length > 0) {
        throw new Error(`Encryption config does not protect required collection(s): ${unprotected.join(', ')}`);
    }

    return routeCollectionsThroughEncryption(raw, protectedDb);
}
