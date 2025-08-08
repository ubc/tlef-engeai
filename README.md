# TLEF ENGE-AI

This is a template Node.js application.

## Local set up

1. Clone this repo locally

```
git clone https://github.com/ubc/tlef-engeai.git
```

2. Install dependencies.

Change into the directory created with the above install and then run

```
npm install
```

## Configuration

Before running the application, you need to create a `.env` file in the root of the project. This file is used for local configuration and is not committed to version control.

Create a file named `.env` at the root of this project and add the following content:

```
TLEF_ENGE_AI_PORT=8020
```

## Development

Option A — Build first, then run dev:

```bash
npm run build   # compile backend TS to dist/ and frontend TS to public/dist/
npm run dev     # start server + BrowserSync proxy
```

Option B — Use helper script (does both steps):

```bash
./dev.sh
```

Notes:
- BrowserSync will open a new tab; use its URL for development.
- Backend runs via ts-node (no auto-reload). If you change backend files under `src/`, restart dev or set up nodemon locally.
- Frontend under `public/` auto-reloads in the browser. If you edit TypeScript in `public/scripts/`, compile to `public/dist/` with `npm run build:frontend` (or watch via `npx tsc -p public/tsconfig.json -w`).

## Production

To run the application in production mode, use the following command:

```bash
npm start
```

We will have an environment file in staging and production. This will allow us to keep our local, staging, and production code bases consistent but have a place to put secrets, or URLs to different services. i.e. Locally, you will have a 'fake cwl' service running that runs on a localhost URL and there are Staging and Production CWL services that run on different URLs. So the URL for the authentication end points should be something we keep in our environment files such that each environment knows where to go.

## Continuous Integration

Pushing to the main branch in this repo will trigger a deploy automatically to the staging server.
