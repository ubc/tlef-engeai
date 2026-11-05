/**
 * encryption.config.cjs
 *
 * Field-level encryption at rest for EngE-AI, enforced by `@ubc/genai-toolkit-encryption`.
 *
 * Loaded by the server (`src/db/encrypted-db.ts`) and by the toolkit's operator CLI
 * (`npx ubc-genai-encryption … --config ./encryption.config.cjs`). It must stay CommonJS and
 * at the repository root: the CLI loads it with `require`, and both `src/db/` and `dist/db/`
 * reach it at `../../encryption.config.cjs`.
 *
 * Field choices and the query audit behind them: `documents/ENCRYPTION_FIELD_INVENTORY.md`.
 * Every field listed here can no longer be sorted, range-queried, or regex-searched in MongoDB.
 */

'use strict';

require('dotenv').config({ quiet: true });

const { MongoClient } = require('mongodb');
const { defineEncryptionConfig, EnvironmentKeyProvider } = require('@ubc/genai-toolkit-encryption');

// Same fallbacks as `src/lms/canvas-config.ts` and `src/routes/route-lms.ts`; the server checks
// at startup that these names are protected, so a mismatch fails loudly rather than silently.
const canvasTokenCollection = process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens';
const moodleTokenCollection = process.env.MOODLE_TOKEN_COLLECTION_NAME || 'moodle_tokens';

/** PUID lookups are exact-match: CWL PUIDs are opaque, case-sensitive identifiers. */
const puidBlindIndex = (unique) => ({
  field: 'puid__bidx',
  keyId: 'lookup-2026-10',
  normalize: 'exact',
  unique,
});

module.exports = defineEncryptionConfig({
  // Permanent. Authenticated into every ciphertext; changing it makes existing data
  // undecryptable. Identical in every environment — environments differ by their keys.
  namespace: 'ubc.engeai',

  keyProvider: new EnvironmentKeyProvider({
    activeEncryptionKey: { id: 'data-2026-10', env: 'ENGEAI_DATA_ENCRYPTION_KEY' },
    decryptionKeys: [],
    blindIndexKeys: [{ id: 'lookup-2026-10', env: 'ENGEAI_BLIND_INDEX_KEY' }],
  }),

  // Rollout start: existing plaintext stays readable and findable until the operator has
  // migrated and verified every collection. Then move to 'strict' / 'encrypted'.
  readPolicy: 'mixed',
  queryPolicy: 'mixed',
  writePolicy: 'encrypted',

  collections: {
    'writing-submissions': {
      fields: {
        originalText: { encrypt: true },
        verifiedText: { encrypt: true },
        studentLabel: { encrypt: true },
        'reviews.$[].studentFeedback': { encrypt: true },
        'reviews.$[].internalNote': { encrypt: true },
        'reviews.$[].comments': { encrypt: true },
        'reviews.$[].summaryEdits': { encrypt: true },
        // Staff grades. Never queried, sorted, or indexed in MongoDB.
        'reviews.$[].finalAssessment': { encrypt: true },
        'reviews.$[].assessmentDraft': { encrypt: true },
      },
    },

    // The staff-final total sent to Canvas, copied from the review. `payloadFingerprint` (the
    // unique idempotency key) is a separate hash and stays plaintext.
    'writing-releases': {
      fields: {
        grade: { encrypt: true },
      },
    },

    'writing-feedback-runs': {
      fields: {
        result: { encrypt: true },
        sflAnalysis: { encrypt: true },
        textDiagnosis: { encrypt: true },
        sourceComments: { encrypt: true },
      },
    },

    // Staff find PUIDs through the admin user directory (`/admin/users`), not Mongo Express.
    'active-users': {
      fields: {
        puid: { encrypt: true, blindIndex: puidBlindIndex(true) },
      },
    },

    // One allow-list row per instructor per academic period, so the PUID repeats here.
    'instructor-period-allowances': {
      fields: {
        puid: { encrypt: true, blindIndex: puidBlindIndex(false) },
      },
    },

    // Written by `@ubc/ubc-genai-toolkit-lms-integration`'s Mongo token store as `{ userKey, tokens }`.
    [canvasTokenCollection]: {
      fields: {
        'tokens.accessToken': { encrypt: true },
        'tokens.refreshToken': { encrypt: true },
      },
    },
    [moodleTokenCollection]: {
      fields: {
        'tokens.token': { encrypt: true },
      },
    },
  },

  // Operator CLI only (the server wraps its own connection). Mirrors how
  // `src/db/enge-ai-mongodb.ts` connects, so no separate URI variable is needed.
  database: {
    connect: async () => {
      const user = encodeURIComponent(process.env.MONGO_USERNAME || '');
      const password = encodeURIComponent(process.env.MONGO_PASSWORD || '');
      const uri = `mongodb://${user}:${password}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
      const client = new MongoClient(uri, { authSource: process.env.MONGO_AUTH_SOURCE });
      await client.connect();
      return { client, db: client.db(process.env.MONGO_DB_NAME) };
    },
  },
});
