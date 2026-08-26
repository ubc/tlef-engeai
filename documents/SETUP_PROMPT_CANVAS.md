# Local LMS setup — Claude Code prompt

**How to use this:** open Claude Code (Opus 5) in your app's repo root, drag in **both**
`local_canvas.md` and this file, and send. Everything below the line is the prompt.

**Before you start:**

- Docker Desktop installed and running, with a generous disk allocation.
- Node ≥ 18.
- A GitHub personal access token (classic) with `read:packages`, SSO-authorized if your org
  requires it. Request repo **and package** access to `ubc-genai-toolkit-lms-integration` from
  Kelvin first, and follow that repo's README for anything version-specific.
- Know your app's port. The guide's examples use 8050; yours probably differs.

**You handle every secret. Claude handles none of them.** Claude will tell you exactly which
values to set and where each one comes from; you put them in your own files, in your own terminal:

1. Your PAT into `~/.npmrc` — one command, you run it.
2. The Canvas admin API key (published on the image's Docker Hub page) into the stack `.env`.
   Skip it if you would rather click the Developer Key together in the Canvas UI.
3. The app's own `.env` variables, including the Canvas client ID and secret that the Developer Key
   step produces.

Everything else — the stacks, provisioning, seeding — is automated.

> **Do not paste tokens, keys or passwords into the chat.** Anything you type there is in the
> transcript. If you have already pasted one, treat it as compromised and rotate it. The commands
> below are all designed so you never have to.

---

Read `local_canvas.md` in full first. It is the specification for this task, it is a corrected
second edition, and where it and your training data disagree, **the document wins**. Items marked
`[TRAP]` in it are failures that actually happened on a real run — treat them as certainties to
design around, not risks to consider.

Set up a complete local Canvas + Moodle development environment and wire this repo to both via
`@ubc/ubc-genai-toolkit-lms-integration`.

## Where this goes — read this before creating a single file

**Nothing you create goes in this repo, and you modify nothing in it — including `.env`.** This
is local infrastructure, not application source. Create a sibling directory next to the repo root —
`../local-lms-dev/` — and put the compose files, bootstrap script, provisioning scripts, seed data,
the `moodle-docker` clone and your setup notes there.

When you are done, `git status` in this repo must be **clean**, and I must have made every edit to
my own `.env` myself. If you think something genuinely belongs in the repo, ask me first; do not
just add it.

There are two env files, and **I fill in both** — you never write to either:

- `../local-lms-dev/.env` — stack config: `CANVAS_IMAGE`, `CANVAS_PORT`,
  `CANVAS_POSTGRES_PASSWORD`, `CANVAS_ADMIN_API_KEY`. The app never reads these. Generate a
  `.env.example` here with placeholders and tell me what to put in it.
- the repo's `.env` — only what the app reads: `CANVAS_DOMAIN`, `CANVAS_CLIENT_ID`,
  `CANVAS_CLIENT_SECRET`, `CANVAS_REDIRECT_URI`, `MOODLE_DOMAIN`, `SESSION_SECRET`, and the two
  token collection names. Give me this as a block I can paste, with placeholders where the value is
  a secret you must not print.

Automate everything that can be automated. Part 4 of the document is the target: one command,
re-runnable, not a fourteen-step clickthrough.

## Phase 0 — Survey, then stop and report

Do not write code yet. Check and report back:

- **Architecture, via `docker info --format '{{.Architecture}}'` — not `uname -m`.** §0.2 explains
  why. `aarch64` means keep the `.arm` Canvas tags; `x86_64` means strip the suffix everywhere.
- **Is Docker Desktop's credential helper on `PATH`?** §0.1. If not, plan for it — `docker compose`
  will fail in ways that look like something else entirely.
- Ports 9100, 9200 and this app's port — free? Report collisions rather than silently reassigning.
- Docker daemon reachable, and the disk available to it. The Canvas image is large.
- How this app starts, its Express major version, its **actual port**, and where middleware is
  registered.
- Whether `express-session` (or anything else populating `req.session`) is already mounted, and
  where `express.json()` is applied — and confirm **both come before** any LMS auth router.
- The stable per-user identifier this app's auth middleware attaches to the request, and its exact
  path (e.g. `req.user.id`). This becomes `getUserKey`. Never an email or display name — if the
  value can change, stored tokens orphan.
- Whether MongoDB is available and how a `Db` handle is obtained. `createMongoTokenStore` needs
  one. If this app does not use Mongo, stop and tell me — writing a custom `TokenStore` is my
  decision, not yours.
- **Any existing Canvas/Moodle/LMS code.** Search properly (`src/routes`, `src/services`, tests).
  If this app already has the integration wired, say so plainly and **do not rewrite it** — Phase 3
  collapses to filling in env values. This is common and it is the good case.
- **Which package version this repo asks for**, from `package.json`. Install that, not a version
  from the guide. Note whether it is an `optionalDependency` — if so, a failed install exits 0 and
  the integration silently never mounts, so a green `npm install` proves nothing.
- Whether the Canvas image tag in the document still exists on Docker Hub. If superseded, tell me
  the current tag and ask before switching.

## Phase 1 — Canvas

Build the compose file and a re-runnable `bootstrap.sh` per §1.1–§1.3, then:

- Extract the seed DB **before** the first `up` (Postgres only runs init SQL against an empty
  volume), skipping if already extracted.
- Poll `/login` until 200/302 with a visible timeout. Never sleep a fixed interval and assume
  success. On timeout, print the log command and explain that a plain restart will not fix a
  half-failed first boot — only `down --volumes` will, and that destroys the local Canvas database.
- **Run the sequence realignment from §1.4.** This is not optional. Without it the first OAuth
  token exchange 500s with a duplicate-key error, and a retry masks it.
- Confirm `canvas.job` is running. Without it, everything asynchronous silently never happens.
- Seed a course and enrol the admin (§1.7), so an empty course list means something.

Mind the `set -e` footgun in Part 4: a function invoked under `||` does not abort on failure.
Check critical commands explicitly, or you will watch a bootstrap poll happily at a stack that
never started.

## Phase 2 — Moodle

Clone `github.com/ubc/moodle-docker` **into the infrastructure directory**, then apply **all seven**
corrections from §2.1 — including `pull_policy: build`, without which you get a 2021 Moodle 3.9.8
image that installs cleanly and then serves nothing. Bring it up, poll `/login/index.php`, and
verify the running version is **4.5.x on PHP 8.3** before going further. If it is not, stop and
fix that first.

Then provision by script, not by clicking: write a PHP script, `docker cp` it into the `web`
container, and run it there against Moodle's own APIs, doing everything in §2.3 — web services,
REST, the external service with file downloads, exactly those five functions, **both**
capabilities, and a minted token. Support both token-generation APIs (§2.3). Seed a course and
enrol the admin (§2.4). Make it idempotent. Note in comments that the permission model is
deliberately broad because the site is localhost-only and must not be copied to a shared Moodle.

The minted token is a live credential: have the script write it to a **gitignored file** in the
infrastructure directory and print only the path, never the token itself. Tell me where it is; I
will read it and use it when I connect.

## Phase 3 — Package and wiring

Add `@ubc:registry=https://npm.pkg.github.com` to the project `.npmrc` — that line is a registry
URL, not a credential, so it is safe for you to write. (If the repo gitignores `.npmrc`, say so;
teammates will need to recreate it.) Then install the version from `package.json`.

**The PAT lives in `~/.npmrc`. Never read, print, copy, or write that file.** Do not ask me to
paste the token to you either. If authentication is missing, hand me this command to run myself and
wait for me to confirm:

```bash
npm config set //npm.pkg.github.com/:_authToken=YOUR_TOKEN --location=user
```

A 401/404 means a missing token, a missing `read:packages` scope, an unauthorized SSO token, or no
package access — the error text distinguishes them. Report which and stop.

**If Phase 0 found the wiring already present, skip to verification** and just fill in the env
values. Otherwise write one module per §3.3, with `express.json()` and session middleware mounted
before both auth routers, separate Mongo collections per provider, `getUserKey` mapped to the
identifier from Phase 0, and `ensureAuth` rather than `requireAuth` on browser-facing page routes.

Do not edit the repo's env example — list the app-facing variables for me instead, as a block I
can paste into my own `.env`, with placeholders wherever the value is a secret. Confirm `.env` is
gitignored, and set up the infrastructure directory's own `.gitignore` (`.env`, `canvas/dbinit/`,
`moodle/moodle-docker/`, `.data/`) before anything is created there.

## Phase 4 — The Canvas Developer Key

§1.6 establishes this is scriptable: create the key, then **turn it on via the account binding** —
two calls, and the second is the one that is invisible when forgotten. Write a script that does
both and that a re-run reuses rather than duplicates.

**I run that script, not you**, because its output is a live client secret and I don't want it in
this transcript. Have it print the two values as a paste-ready block:

```
CANVAS_CLIENT_ID=...
CANVAS_CLIENT_SECRET=...
```

...and tell me to run it and copy the result into my app's `.env`. Then I will tell you it's done.
Verify it worked by checking that the key exists and its account binding is `on` — by name or id,
never by fetching the secret.

If `CANVAS_ADMIN_API_KEY` is not set, do not guess or hardcode it: tell me where to get it and give
me the UI click path from §1.6 as the fallback.

## Constraints

**Secrets — treat this as the hard rule of the task:**

- **Do not open, read, `cat`, or print `.env`, `~/.npmrc`, or any file holding a credential** — not
  the app's, not the infrastructure one. Anything you print lands in this transcript, and I do not
  want live keys sitting in it.
- When you need to know whether a variable is set, **check for the key name only, never the value**:
  `grep -q '^CANVAS_CLIENT_ID=.' .env && echo set || echo missing`. When you need to list what is
  configured, print key names only.
- **Do not write to any `.env`.** Give me a paste-ready block with placeholders for the secrets, and
  I will fill it in. `.env.example` files with placeholder values are fine for you to create.
- Anything whose output is a live credential — the Developer Key script, the token file — is **mine
  to run and read**, not yours. Ask me to run it and wait for me to confirm.
- Never put a real secret in a tracked file, a doc, a commit message, or your setup notes.
- If I paste a secret into this chat by mistake, say so and tell me to rotate it.
- Don't invent OAuth scopes. Enforce Scopes is off and the package requests none — you can confirm
  this by checking that the authorize URL carries no `scope` parameter.
- Don't paginate by hand. Canvas defaults to 10 items and reports the rest in the RFC 5988 `Link`
  header; the package already follows it.
- Don't add LTI. This integration is OAuth-only — an LTI launch is not an API token.
- If the document contradicts what you find in the repo, **stop and ask** rather than choosing.
- Report failures as failures. A phase that didn't work is more useful to me than one reported
  green. If you hit something not in the guide, say so explicitly — that is new information worth
  writing down.

## Deliverable

A `README.md` **in the infrastructure directory** covering: the one command that rebuilds this from
scratch, every value a person must supply themselves and where to get it, the exact verification
sequence below with the actual results you got, and each failure you hit with its fix.

Then walk me through the verification and report real results. Before step 1, give me the full
list of variables to put in my `.env` and wait for me to say they are in and the app is restarted.

1. App running with the five provider vars and a non-empty `SESSION_SECRET` (I set these; you
   confirm the app sees them). If the app exposes an LMS diagnostics endpoint, use it to confirm the
   package actually loaded and both providers are enabled — do not infer this from a successful
   `npm install`, and do not read `.env` to check.
2. Signed in, open `{app}/api/lms/canvas/auth/login` → approve → returns with no state or
   redirect-URI error.
3. `GET` the protected Canvas courses route — courses, not 401. It should return the seeded course,
   not `[]`.
4. `POST {app}/api/lms/moodle/auth/connect` with `{"token":"..."}` — must carry the signed-in
   session cookie, so use the app's own form or a cookie-preserving client, not a bare curl. Read
   the token from its gitignored file at the moment you send it; do not echo it.
5. `GET` the protected Moodle courses route — courses, not 401.
6. Confirm the two token collections are separate and both keyed by this app's user id.

Finish by confirming that `git status` in the app repo is clean, and that no secret appears
anywhere in this conversation or in any file you created.
