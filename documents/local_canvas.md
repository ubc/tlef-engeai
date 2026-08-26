# Local LMS development environment — Canvas + Moodle

How to get a working local Canvas and a working local Moodle on your machine, and connect a
Node/Express app to both through the UBC LMS integration package.

Everything here is **development only**. None of these stacks are hardened, and none of them
should ever be deployed or exposed beyond localhost.

> **Revision note.** This is the corrected second edition. Everything marked **[VERIFIED]** was
> actually executed end to end on an Apple Silicon Mac (Docker Desktop 28.3.2, macOS 26.6) on
> 2026-08-12, and every trap marked **[TRAP]** is a failure that really happened during that run.
> Where this edition contradicts the first, the first edition was wrong.

## What you end up with

| Piece | Source | Runs at |
|---|---|---|
| Canvas LMS | `lthub/canvas-dev-only` (Docker Hub, public) | http://localhost:9100 |
| Moodle 4.5.12 | `github.com/ubc/moodle-docker` (public) | http://localhost:9200 |
| LMS integration package | `github.com/ubc/ubc-genai-toolkit-lms-integration` (**request access from Kelvin**) | npm dependency |
| Your app | your own repo | e.g. http://localhost:8050 |

Rough time: 30–60 minutes, most of it waiting on the Canvas image to pull and the Moodle image
to build.

## Prerequisites

- **Docker Desktop**, running, with a generous disk allocation. The Canvas image is large.
- **Node ≥ 18** (22 recommended) and npm.
- A **GitHub personal access token (classic)** with the `read:packages` scope.
- On Apple Silicon: use the `.arm` image tags for Canvas. On Intel/AMD64: drop the `.arm` suffix.

The examples assume your app runs at `http://localhost:8050`. **Check your app's actual port** —
if it differs, replace `8050` everywhere, including the Canvas Developer Key and
`CANVAS_REDIRECT_URI`.

### Where to put all of this

**Not inside your application's repository.** This is local infrastructure, not application
source. Put it in a sibling directory:

```
projects/
  your-app/          <- untouched; you edit only its gitignored .env, by hand
  local-lms-dev/     <- everything from this guide
```

Nothing here writes into your app. The setup produces a handful of values — a client ID, a secret,
a domain — and **you** put them into your app's `.env` yourself. That file is already gitignored,
and your app's `git status` should stay clean throughout.

---

## Part 0 — Read before you start

### 0.1 Docker Desktop's credential helper may not be on `PATH` **[TRAP]**

```
error getting credentials - err: exec: "docker-credential-desktop":
executable file not found in $PATH, out: ``
```

`~/.docker/config.json` sets `credsStore: desktop`, but Docker Desktop's `/usr/local/bin`
symlinks are sometimes missing. `docker pull` degrades gracefully and succeeds; **`docker compose`
fails hard** — including read-only commands like `docker compose ps`, which then print an empty
table and look like "no containers running".

Fix, in your profile or at the top of any script:

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

### 0.2 `uname -m` lies under Rosetta **[TRAP]**

If your `node` is an x86_64 binary running under Rosetta (`node -p process.arch` prints `x64` on
an Apple Silicon Mac), every process npm spawns inherits the translated personality and
`uname -m` reports `x86_64`. A script run directly says `arm64`; the same script run through
`npm run` says `x86_64`, and picks the wrong Canvas image tag.

Ask Docker instead — it is what actually runs the image:

```bash
docker info --format '{{.Architecture}}'   # aarch64 or x86_64
```

### 0.3 Who handles the secrets

This setup produces five things you must treat like passwords: your **GitHub PAT**, the **Canvas
admin API key**, the **Canvas Developer Key secret**, the **Moodle web service token**, and your
app's **`SESSION_SECRET`**.

The rule that keeps them safe is the same whether you are working alone or with an AI assistant:
**secrets go into files you edit by hand, and never into anything that gets printed, logged, or
transcribed.**

| Secret | Where it lives | Who puts it there |
|---|---|---|
| GitHub PAT | `~/.npmrc` | you, via `npm config set` |
| Canvas admin API key | infrastructure `.env` | you, copied from Docker Hub |
| Canvas client ID + secret | your app's `.env` | you, from §1.6's output |
| Moodle `wstoken` | gitignored file, then your app's connect form | the provisioning script writes the file; you read it |
| `SESSION_SECRET` | your app's `.env` | you, from `openssl rand -hex 32` |

**If an AI assistant is doing the work for you**, every value it prints is stored in the
conversation transcript — and transcripts are synced, retained, and sometimes shared. So:

- Do not paste a token into the chat. Run the credential commands yourself. If you already pasted
  one, treat it as compromised and rotate it.
- Tell it not to read, print, or write `.env` or `~/.npmrc`. To check whether something is
  configured, key names are enough:
  `grep -q '^CANVAS_CLIENT_ID=.' .env && echo set || echo missing`
- Run the two credential-producing steps yourself — the Developer Key script (§1.6) and reading the
  Moodle token file (§2.3).
- Let it create `.env.example` files with placeholders; those are safe.

The automation in Part 4 is written around this: nothing it runs needs to see a secret, and nothing
it prints contains one.

---

## Part 1 — Local Canvas

The image's own documentation is at https://hub.docker.com/r/lthub/canvas-dev-only and covers the
credentials, the database bootstrap, and a baseline compose file. This section repeats the parts
you need in order plus everything the image docs don't cover.

### 1.1 Bootstrap the database dump

Canvas ships its seed database *inside* the image. Postgres executes those SQL files only when its
data volume is empty, so this has to happen **before** the first `up`:

```bash
mkdir -p canvas/dbinit
docker create --name tmpCanvas lthub/canvas-dev-only:release.2026-01-28.618.arm
docker cp tmpCanvas:/usr/src/app/dbinit/. canvas/dbinit/
docker rm -f tmpCanvas
```

The `docker create` pulls the image if you don't have it. First pull takes several minutes.
You should end up with three files: `01_globals.sql`, `02_canvas_development.sql`,
`03_canvas_test.sql`. **[VERIFIED]**

Tags available as of this revision: `release.2026-01-28.626(.arm)` (newest),
`release.2026-01-28.618(.arm)` (used here), `release.2025-10-08.arm`, and older amd64-only tags.

### 1.2 Compose file

Save as `canvas/compose.yml`, with the `dbinit/` directory beside it:

```yaml
# Canvas LMS for local development only. Do not deploy this stack.
name: local-canvas

services:
  canvas.postgres:
    image: pgvector/pgvector:pg14
    environment:
      POSTGRES_PASSWORD: ${CANVAS_POSTGRES_PASSWORD:?Set CANVAS_POSTGRES_PASSWORD in .env}
    volumes:
      - canvas-postgres-data:/var/lib/postgresql/data
      - ./dbinit:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -h localhost -p 5432"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 2m

  canvas.redis:
    image: redis:alpine

  canvas: &canvas
    image: ${CANVAS_IMAGE:?Set CANVAS_IMAGE in .env}
    ports:
      - "${CANVAS_PORT:-9100}:80"
    depends_on:
      canvas.postgres:
        condition: service_healthy
      canvas.redis:
        condition: service_started
    environment:
      VIRTUAL_HOST: .canvas.docker
      CANVAS_DATABASE_HOST: canvas.postgres
      CANVAS_REDIS_HOST: canvas.redis
      HTTPS_METHOD: noredirect
      POSTGRES_PASSWORD: ${CANVAS_POSTGRES_PASSWORD}
      ENCRYPTION_KEY: facdd3a131ddd8988b14f6e4e01039c93cfa0160
      RAILS_ENV: development
    volumes:
      - api-docs:/usr/src/app/public/doc/api
      - brandable-css-brands:/usr/src/app/app/stylesheets/brandable_css_brands
      - bundler:/home/docker/.bundle/
      - canvas-docker-gems:/home/docker/.gem/
      - js-utils-es:/usr/src/app/packages/js-utils/es
      - js-utils-lib:/usr/src/app/packages/js-utils/lib
      - js-utils-node-modules:/usr/src/app/packages/js-utils/node_modules
      - locales:/usr/src/app/config/locales/generated
      - canvas-log:/usr/src/app/log
      - node-modules:/usr/src/app/node_modules
      - pacts:/usr/src/app/pacts
      - public-dist:/usr/src/app/public/dist
      - reports:/usr/src/app/reports
      - styleguide:/usr/src/app/app/views/info
      - canvas-tmp:/usr/src/app/tmp
      - translations:/usr/src/app/public/javascripts/translations
      - yardoc:/usr/src/app/.yardoc
      - yarn-cache:/home/docker/.cache/yarn

  # Background jobs. Same image, different command — without this, anything
  # asynchronous (course copies, notifications, exports) silently never runs.
  canvas.job:
    <<: *canvas
    command: bundle exec script/delayed_job run
    attach: false
    ports: []

volumes:
  canvas-postgres-data: {}
  api-docs: {}
  brandable-css-brands: {}
  bundler: {}
  canvas-docker-gems: {}
  js-utils-es: {}
  js-utils-lib: {}
  js-utils-node-modules: {}
  locales: {}
  canvas-log: {}
  node-modules: {}
  pacts: {}
  public-dist: {}
  reports: {}
  styleguide: {}
  canvas-tmp: {}
  translations: {}
  yardoc: {}
  yarn-cache: {}
```

And a `.env` in the parent directory (**not** your app's `.env` — this is stack config the app
never reads):

```
CANVAS_IMAGE=lthub/canvas-dev-only:release.2026-01-28.618.arm
CANVAS_POSTGRES_PASSWORD=change-me-for-local-development
CANVAS_PORT=9100
CANVAS_ADMIN_API_KEY=          # see 1.5
```

Because the compose file sits in `canvas/` while its `.env` sits one level up, invoke it as:

```bash
docker compose -f canvas/compose.yml --env-file .env --project-directory canvas up -d
```

`--project-directory` is what makes `./dbinit` resolve correctly.

### 1.3 Start it

First boot is slow — Postgres has to ingest the dump before Canvas will answer. Watch for readiness
rather than guessing:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9100/login
```

`302` or `200` means it's up. While it's still booting you'll get connection refused or `502`.
Follow the logs with `docker compose ... logs -f canvas canvas.job`.

On a warm image, Canvas answered `302` **7 seconds** after `up`. **[VERIFIED]**

If the very first boot fails partway through, a plain restart will **not** fix it — Postgres won't
re-run the init SQL against a non-empty volume. The following command **permanently deletes this
local Canvas database** and rebuilds it from the seed dump:

```bash
docker compose -f canvas/compose.yml --env-file .env --project-directory canvas \
  down --volumes --remove-orphans
```

Diagnose from the logs before reaching for it.

### 1.4 Repair the seed database's id sequences — required **[TRAP]**

Do this once, immediately after the first successful boot. Without it, the **first** OAuth token
exchange fails and nothing else explains why:

```
POST /login/oauth2/token -> 500
PG::UniqueViolation: duplicate key value violates unique constraint "access_tokens_pkey"
```

The seed dump inserts rows with explicit primary keys but leaves the backing sequences at
`last_value = 1, is_called = false`, so the first row Canvas inserts tries to reuse an id that
already exists. It is especially nasty because **retrying appears to fix it** — the failed insert
consumes the duplicate value — so it looks like a flaky app bug rather than a bad fixture.

Save as `canvas/realign-sequences.sql` and run it against the database:

```sql
DO $$
DECLARE r RECORD; fixed INT := 0;
BEGIN
    FOR r IN
        SELECT c.oid::regclass::text AS tbl, a.attname AS col,
               pg_get_serial_sequence(c.oid::regclass::text, a.attname) AS seq
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND pg_get_serial_sequence(c.oid::regclass::text, a.attname) IS NOT NULL
    LOOP
        EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %s), 0) + 1, false)',
                       r.seq, r.col, r.tbl);
        fixed := fixed + 1;
    END LOOP;
    RAISE NOTICE 'realigned % sequences', fixed;
END $$;
```

```bash
docker compose ... exec -T canvas.postgres \
  psql -U postgres -d canvas_development -f - < canvas/realign-sequences.sql
```

Realigns 292 sequences. Safe and idempotent. **[VERIFIED]**

### 1.5 Log in, and the admin API key

Credentials ship with the image: `admin@example.com` / `password`. The Docker Hub page also
publishes an **admin API key per image tag** — a fixed development credential baked into a public
throwaway image. Read the current value off that page and put it in your stack `.env` as
`CANVAS_ADMIN_API_KEY`; don't hardcode it in a script, since it changes with the tag.

Database user/name are `postgres` / `canvas_development`; the password is your
`CANVAS_POSTGRES_PASSWORD`.

### 1.6 Create a Developer Key — scriptable, contrary to the first edition **[VERIFIED]**

Running Canvas is not the same as being able to talk to it. Your app authenticates with OAuth,
which needs a Developer Key. **This does not have to be done by hand.** On this Canvas version the
admin API key can create it and switch it on, in **two** calls.

> **Run these two calls yourself.** The response to the first contains a live client secret; if an
> assistant runs it, that secret is in the transcript. Script them by all means — then run the
> script and paste its output into your app's `.env` on your own.

**Call 1 — create the key.** Account `2` is Site Admin:

```bash
curl -X POST -H "Authorization: Bearer $CANVAS_ADMIN_API_KEY" \
  --data-urlencode "developer_key[name]=My App Local Dev" \
  --data-urlencode "developer_key[redirect_uri]=http://localhost:8050/api/lms/canvas/auth/callback" \
  --data-urlencode "developer_key[redirect_uris]=http://localhost:8050/api/lms/canvas/auth/callback" \
  --data-urlencode "developer_key[require_scopes]=false" \
  --data-urlencode "developer_key[workflow_state]=active" \
  http://localhost:9100/api/v1/accounts/2/developer_keys
```

The response contains the numeric `id` (your `CANVAS_CLIENT_ID`) and `api_key` (your
`CANVAS_CLIENT_SECRET`), already with `require_scopes: false` and `allow_includes: false`.

**Call 2 — turn it ON.** This is the step that is easy to miss and impossible to diagnose:

```bash
curl -X POST -H "Authorization: Bearer $CANVAS_ADMIN_API_KEY" \
  --data-urlencode "developer_key_account_binding[workflow_state]=on" \
  http://localhost:9100/api/v1/accounts/2/developer_keys/<ID>/developer_key_account_bindings
```

A newly created key gets a `DeveloperKeyAccountBinding` in state **`off`** — that binding *is* the
ON/OFF toggle in the UI. Canvas refuses to authorize against an `off` key, so without this call you
get a key that looks correct in every single field and still fails at `/login/oauth2/auth`.

**Idempotency:** `GET /api/v1/accounts/2/developer_keys` returns `api_key` for existing keys, so a
re-run can recover the secret instead of creating duplicates.

**If you prefer the UI**, it is still four minutes of clicking:

1. Admin → Site Admin → Developer Keys → **+ Developer Key → API Key**
2. Redirect URI, byte-for-byte: `http://localhost:8050/api/lms/canvas/auth/callback`
3. **Enforce Scopes OFF.** The package requests no scopes; enforcement makes Canvas reject the
   authorization request outright.
4. **Allow Include Parameters OFF** unless your app actually sends `include[]`.
5. Save, toggle the key **ON**, copy the numeric client ID and the secret.

For a production integration, use a least-privilege scoped Developer Key, and verify how your
installed package version encodes the OAuth `scope` parameter. Do not copy a scope list from an
older release.

### 1.7 Seed a course, or you cannot tell success from failure **[TRAP]**

**The Canvas seed database contains zero courses.** `getCourses` returns only courses the
authenticated user is *enrolled* in, and an admin who merely administers the account is enrolled in
nothing. So a perfectly working integration returns `[]` — identical to a broken one.

Create a course and enrol the admin into it before you start testing:

```bash
# create (account 1 is the root account)
curl -X POST -H "Authorization: Bearer $CANVAS_ADMIN_API_KEY" \
  --data-urlencode "course[name]=Demo Course" \
  --data-urlencode "course[course_code]=DEMO" \
  --data-urlencode "course[sis_course_id]=DEMO" \
  --data-urlencode "offer=true" \
  http://localhost:9100/api/v1/accounts/1/courses

# enrol yourself as a teacher
curl -X POST -H "Authorization: Bearer $CANVAS_ADMIN_API_KEY" \
  --data-urlencode "enrollment[user_id]=1" \
  --data-urlencode "enrollment[type]=TeacherEnrollment" \
  --data-urlencode "enrollment[enrollment_state]=active" \
  http://localhost:9100/api/v1/courses/<COURSE_ID>/enrollments
```

### 1.8 Pick one hostname and never switch

The image advertises itself as `canvas.docker` (`VIRTUAL_HOST: .canvas.docker`), so some generated
links come back with that host. To use it, add `127.0.0.1 canvas.docker` to `/etc/hosts` and use
`http://canvas.docker:9100` for `CANVAS_DOMAIN` and in the browser. The Developer Key redirect URI
does **not** use the Canvas hostname — it points at your app.

Most people should simply use `http://localhost:9100` and skip `/etc/hosts`. If your app itself
runs in Docker, its `localhost` is its own container; pick a hostname both the app container and
the host browser can resolve.

---

## Part 2 — Local Moodle

Repo: https://github.com/ubc/moodle-docker (public). It builds Moodle 4.5.x on PHP 8.3/Apache with
MariaDB and Redis.

### 2.1 Clone and adjust the compose file — **seven** corrections

The committed `docker-compose.yml` needs six fixes, plus a seventh that the first edition of this
guide missed entirely and which is the difference between a working Moodle and a dead one.

| Upstream | Change to | Why |
|---|---|---|
| `8080:80` | `9200:80` | avoids common local conflicts, including a local SAML IdP container |
| `MOODLE_URL=http://localhost:8080` | `http://localhost:9200` | must match the published port or Moodle generates broken links |
| `MOODLE_REDIS_HOST` / `_PORT` / `_DB` | `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | **the prefixed names are wrong** — the entrypoint and `config.php` read the unprefixed ones, so with the committed file Redis is silently never used |
| `db` publishes `3306:3306` | remove | collides with a local MySQL/MariaDB |
| `redis` publishes `6379:6379` | remove | collides with a local Redis |
| `version: '2'` | remove | obsolete and warned about in Compose v2 |
| *(nothing)* | **add `pull_policy: build` to `web`** | **[TRAP]** see below |

#### The seventh correction **[TRAP]**

The `web` service declares **both** `image: lthub/moodle` and `build: .`. Given both, a plain
`docker compose up` **pulls the published image rather than building the Dockerfile** — and the
published `lthub/moodle:latest` tag on Docker Hub is a **2021 image: Moodle 3.9.8 on PHP 7.2.34**.

The symptom is not an error. The stack comes up, the installer runs to completion, Apache reports
"resuming normal operations" — and then serves nothing at all, `000` even from inside the
container, while the log fills with `mod_shib:crit child_init` failures.

`pull_policy: build` forces the local build, which produces **Moodle 4.5.12 on PHP 8.3.33**.
**[VERIFIED]**

The working file in full:

```yaml
services:
  db:
    image: mariadb:10.6
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=moodle
      - MYSQL_USER=moodle
      - MYSQL_PASSWORD=password
    volumes:
      - ./.data/db:/var/lib/mysql
  web:
    image: lthub/moodle
    build: .
    pull_policy: build
    ports:
      - 9200:80
    volumes:
      - ./.data/web:/moodledata:rw
    environment:
      - MOODLE_DB_TYPE=mariadb
      - MOODLE_DB_HOST=db
      - MOODLE_DB_NAME=moodle
      - MOODLE_DB_USER=moodle
      - MOODLE_DB_PASSWORD=password
      - MOODLE_DB_PREFIX=
      - MOODLE_URL=http://localhost:9200
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_DB=0
      - MOODLE_DISABLE_UPDATE_AUTODEPLOY=true
  redis:
    image: redis:5.0-alpine
    volumes:
      - ./.data/redis:/data
```

(The upstream `links: - db` is also dropped; Compose v2 gives every service name DNS on the
default network, so it does nothing.)

If you already booted the stale 3.9.8 image, a rebuild alone is not enough — the old install is in
the database. Reset first: `docker compose down -v && rm -rf .data`.

### 2.2 Start it

```bash
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9200/login/index.php
```

First boot builds the image and runs the Moodle installer, which walks every plugin — several
minutes, and it prints a lot. Log in as **`admin` / `password`** (the entrypoint defaults, which
apply because `MOODLE_ADMIN_USER` / `MOODLE_ADMIN_PASS` are commented out; setting them later has
no effect).

`mod_shib:crit` lines in the log are unconfigured-Shibboleth noise from the image and are harmless
**on the 4.5 build** — they are only fatal on the stale 3.9.8 one.

Redis is used for sessions automatically. For application/request caches, go to
**Site administration → Plugins → Caching → Configuration**, confirm `redis_app` is ready,
**Edit mappings**, map Application (and optionally Request) to `redis_app`, save and purge caches.

To start over — this permanently deletes this local Moodle site's users, courses, settings and
files:

```bash
docker compose down -v && rm -rf .data
```

### 2.3 Enable web services — script it, don't click it

Moodle's REST API is off by default and needs four separate switches; missing any one fails at a
different step with an unhelpful message. Rather than clicking through
Site administration, `docker cp` a PHP script into the `web` container and run it there against
Moodle's own APIs. It must:

1. `set_config('enablewebservices', 1)`
2. add `rest` to `$CFG->webserviceprotocols`
3. create an external service (keyed on a shortname so re-runs update rather than duplicate), set
   `enabled = 1`, `restrictedusers = 0`, `downloadfiles = 1`
4. insert exactly these five functions into `external_services_functions`:

   | Function | Why |
   |---|---|
   | `core_webservice_get_site_info` | **required** — the connect flow validates tokens with it; without it, valid tokens are rejected |
   | `core_enrol_get_users_courses` | course list |
   | `core_group_get_course_groups` | sections (Moodle Groups) |
   | `core_course_get_contents` | files |
   | `gradereport_user_get_grade_items` | read-only grades |

5. grant the **authenticated user** role (`shortname = 'user'`) **both**
   `moodle/webservice:createtoken` **and** `webservice/rest:use` via `assign_capability(...)` at
   system context. These are two separate capabilities — granting only the first mints tokens that
   then fail on every call.
6. mint a permanent token, reusing any existing one for that user + service.

**Token API across versions** **[TRAP]**: `external_generate_token()` was deprecated in favour of
`\core_external\util::generate_token()` during the 4.x series. Support both:

```php
if (class_exists('\core_external\util') && method_exists('\core_external\util', 'generate_token')) {
    $token = \core_external\util::generate_token($tokentype, $service, $userid, $systemcontext, 0, '');
} else if (function_exists('external_generate_token')) {
    $token = external_generate_token($tokentype, $service, $userid, $systemcontext, 0, '');
}
```

Run it with `php /var/www/html/<script>.php` inside the `web` container (the Moodle root on this
image is `/var/www/html`, and `require(__DIR__.'/config.php')` is why the script must be copied
there).

**Write the token to a gitignored file and report only its path.** Do not print it to stdout: it
lands in terminal scrollback, in CI logs, and in any assistant transcript. You read the file when
you need the value.

> This permission model is deliberately broad: every authenticated user can create tokens, and the
> service is unrestricted. That is acceptable **only** because the site is localhost-only. Do not
> copy it to a shared or production Moodle — use a dedicated role and restrict the service to
> explicitly authorized users.

### 2.4 Seed a course here too **[TRAP]**

Same problem as Canvas: a fresh Moodle has no courses, and `core_enrol_get_users_courses` returns
only courses the token's user is **enrolled** in. Have the same PHP script `create_course()` a demo
course (keyed on shortname) and enrol the admin as `editingteacher` via the manual enrolment
plugin. Otherwise your first successful API call returns `[]` and tells you nothing.

Verify the whitelist is real by calling a function you did *not* whitelist — it should return
`accessexception`. **[VERIFIED]**

### 2.5 Getting a token by hand, if you must

- **Normal user with both capabilities:** Preferences → Security keys.
- **Administrator:** Moodle deliberately does not generate admin tokens on that page. Use
  Site administration → Server → Web services → Manage tokens → Add. *(This is why the token can
  appear to be missing even when everything is configured correctly.)*

Grade reads need `gradereport/user:view`; reading all users' grades additionally needs
`moodle/grade:viewall`.

---

## Part 3 — The LMS integration package

Repo: https://github.com/ubc/ubc-genai-toolkit-lms-integration — request repository **and package**
access from Kelvin, and follow the README there for anything version-specific.

### 3.1 Repo access is not enough — you also need a token

The package is published to **GitHub Packages**, which requires authentication on *every* install,
even for public repos.

Project `.npmrc` (in your app repo):

```
@ubc:registry=https://npm.pkg.github.com
```

User-level `~/.npmrc` (**never commit — personal credential**), using a
[classic PAT](https://github.com/settings/tokens) with at least `read:packages`, SSO-authorized if
your org enforces it. **Run this yourself, in your own terminal** — never paste the token into a
chat window or hand it to an assistant to run:

```bash
npm config set //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN --location=user
```

Then install the version your app's `package.json` asks for (1.0.4 is current; 1.0.3 also works).

A `401`/`404` means: no token, a token without `read:packages`, an SSO authorization problem, or no
package access. The error text distinguishes them — `authentication token not provided` is the
first case.

> **[TRAP] If the package is an `optionalDependency`, a failed install is silent.** `npm install`
> exits **0**, the package is simply absent, and the app boots with the integration disabled. Never
> treat a green `npm install` as proof; check that the module actually resolves.

### 3.2 Environment variables

| Variable | Provider | Local value |
|---|---|---|
| `CANVAS_DOMAIN` | Canvas | `http://localhost:9100` |
| `CANVAS_CLIENT_ID` | Canvas | numeric ID from the Developer Key |
| `CANVAS_CLIENT_SECRET` | Canvas | secret from the Developer Key |
| `CANVAS_REDIRECT_URI` | Canvas | `http://localhost:8050/api/lms/canvas/auth/callback` |
| `MOODLE_DOMAIN` | Moodle | `http://localhost:9200` |

All of a provider's variables are required if you mount that provider — `loadConfigFromEnv` throws
and lists what's missing. `CANVAS_REDIRECT_URI` must match the Developer Key's registered redirect
URI **exactly**, including scheme, host, port and path.

Your app also needs a non-empty `SESSION_SECRET`. Everything else (`tokenStore`, `getUserKey`,
`scopes`, `basePath`, `allowedDownloadHostSuffixes`) is passed as plain JS to `overrides`, not read
from the environment.

Keep these separate from the *stack* variables (`CANVAS_IMAGE`, `CANVAS_PORT`,
`CANVAS_POSTGRES_PASSWORD`, `CANVAS_ADMIN_API_KEY`), which belong in the infrastructure directory's
own `.env` and which the app never reads.

### 3.3 Minimal wiring

```js
const express = require('express');
const session = require('express-session');
const { canvas, moodle, createMongoTokenStore } = require('@ubc/ubc-genai-toolkit-lms-integration');

const app = express();
app.use(express.json());                    // required for Moodle's /connect route
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
                                            // required BEFORE the Canvas auth router

const canvasConfig = canvas.loadConfigFromEnv({
  tokenStore: createMongoTokenStore(() => myDb.connect(), {
    collectionName: process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens',
  }),
  getUserKey: (req) => req.user.id,
  basePath: '/api/lms/canvas/auth',
});

const moodleConfig = moodle.loadConfigFromEnv({
  tokenStore: createMongoTokenStore(() => myDb.connect(), {
    // A DIFFERENT collection per provider — sharing one overwrites the other's tokens.
    collectionName: process.env.MOODLE_TOKEN_COLLECTION_NAME || 'moodle_tokens',
  }),
  getUserKey: (req) => req.user.id,
  basePath: '/api/lms/moodle/auth',
});

app.use('/api/lms/canvas/auth', canvas.createAuthRouter(canvasConfig));
app.use('/api/lms/moodle/auth', moodle.createAuthRouter(moodleConfig));

app.get('/api/canvas/courses', canvas.requireAuth(canvasConfig), async (req, res) => {
  res.json(await canvas.getCourses(req.canvasApi));
});
app.get('/api/moodle/courses', moodle.requireAuth(moodleConfig), async (req, res) => {
  res.json(await moodle.getCourses(req.moodleApi));
});
```

`getUserKey` must be your app's **stable** user identifier — never an email or display name. If it
can change, stored tokens orphan.

Auth routes you get for free:

| Route | Method | Purpose |
|---|---|---|
| `{basePath}/login` | GET | Canvas — redirect to the authorize screen |
| `{basePath}/callback` | GET | Canvas — exchange the code, store tokens |
| `{basePath}/logout` | POST | Canvas — revoke and clear stored tokens |
| `{basePath}/connect` | POST | Moodle — body `{ token }`, validates and stores the pasted key |
| `{basePath}/disconnect` | POST | Moodle — deletes the local token (does not revoke it in Moodle) |

Use `canvas.ensureAuth` instead of `requireAuth` on page routes that should redirect rather than
return JSON 401. Moodle has only `requireAuth`.

> **Check before you write any of this.** Your app may already have it. Mounting a second copy, or
> "fixing" working code, is a bigger problem than the one you set out to solve.

### 3.4 Verify the connection

1. Start the app with the five provider variables and a non-empty `SESSION_SECRET`.
2. Signed in, open `{app}/api/lms/canvas/auth/login`, approve in Canvas. A successful flow returns
   with no OAuth-state and no redirect-URI error.
3. Call your protected Canvas course route — courses, not a JSON 401.
4. `POST {app}/api/lms/moodle/auth/connect` with `{"token":"..."}`. This **must carry the signed-in
   session cookie** — use your app's own form or a cookie-preserving client, not a bare `curl`.
5. Call your protected Moodle course route — courses, not a JSON 401.

A useful sixth check: confirm the two token collections are genuinely separate and both keyed by
your app's user id.

**Scripting step 2 end to end** is possible but fiddly: Canvas's `/login/oauth2/confirm` form
requires **both** `authenticity_token` and a second `custom_csrf_token` hidden field; posting only
the first returns `Invalid custom CSRF token`. **[VERIFIED]** A browser is easier.

---

## Part 4 — Automate all of it

Do not click test data into two LMSs by hand. A teammate with Docker and a PAT should reach a
working setup by running one command. A re-runnable `bootstrap.sh` that lives *outside* the app
repo should:

1. Put Docker Desktop's bin on `PATH` if the credential helper is missing (0.1).
2. Extract the Canvas seed DB, skipping if already present — **before** the first `up`.
3. Bring up Canvas and poll `/login` for 200/302 with a visible timeout.
4. Realign the id sequences (1.4).
5. Create the Developer Key and turn it ON, printing the client ID and secret for the developer to
   paste into the app's `.env` themselves (1.6).
6. Seed a Canvas course and enrol the admin (1.7).
7. Clone `moodle-docker`, apply the seven corrections, build, and poll for readiness (2.1–2.2).
8. `docker cp` and run the PHP provisioning script; write the token to a gitignored file — never to
   stdout or a log (2.3–2.4).

Keep credentials out of the automation's output. The script that creates the Developer Key should
print its two values only when a human runs it directly, and the Moodle token should land in a
gitignored file whose *path* is what gets reported. Anything printed to a terminal ends up in
scrollback, CI logs, and AI-assistant transcripts.

Two shell notes that cost real time:

- **`set -e` is suppressed inside a function invoked under `||`.** If you call
  `run_canvas || FAILED=1`, a failing `docker compose up` inside `run_canvas` does *not* abort —
  the script sails on and polls a stack that never started. Check critical commands explicitly.
  **[TRAP]**
- Poll for readiness in a loop with a timeout; never `sleep 60 && assume success`.

---

## Part 5 — Port map

| Port | Service |
|---|---|
| 9100 | Canvas web |
| 9200 | Moodle web |
| 8050 | your app (example — **check yours**) |
| 8080/8443 | commonly taken by a local SAML IdP — the reason Moodle moved off 8080 |

Canvas's Postgres and Redis, and Moodle's MariaDB and Redis, are deliberately **not** published to
the host. Reach them with `docker compose exec`.

---

## Part 6 — Gotchas that cost real time

- **The published `lthub/moodle:latest` is from 2021.** Without `pull_policy: build` you get Moodle
  3.9.8 on PHP 7.2 that serves nothing. §2.1.
- **The Canvas seed's id sequences are unaligned**, and the first OAuth token exchange 500s because
  of it. §1.4.
- **A created Developer Key is OFF.** The account binding is the toggle. §1.6.
- **Both LMSs ship with zero courses**, and `getCourses` only returns *enrolled* courses, so a
  working integration and a broken one both return `[]`. §1.7, §2.4.
- **`docker compose` dies where `docker pull` survives** when the credential helper is missing. §0.1.
- **`uname -m` reports x86_64 under Rosetta.** §0.2.
- **A failed optional-dependency install exits 0.** §3.1.
- **Canvas paginates to 10 items by default** and reports the rest only in the RFC 5988 `Link`
  header. The package follows it; raw `curl` exploration does not.
- **Logging out of the Canvas UI does not revoke OAuth.** Use the app's disconnect route.
- **Background jobs need the `canvas.job` container.** Without it, anything asynchronous just never
  happens, with no error.
- **An LTI launch is not a Canvas API token.** This integration is OAuth-only; LTI is not required.
- **Moodle "sections" aren't Canvas sections.** The package maps `getCourseSections` to Moodle
  **Groups**.
- **`.arm` vs non-`.arm`.** The wrong tag boots extremely slowly under emulation, or not at all.

---

## Part 7 — Never commit

- Secret-bearing `.env` files (a sanitized `.env.example` is safe)
- Canvas Developer Key IDs and secrets; Canvas OAuth access/refresh tokens
- The Canvas admin API key
- Moodle web service tokens (`wstoken`)
- Your GitHub PAT / `~/.npmrc`
- Canvas database dumps (`dbinit/*.sql`)
- The `moodle-docker` clone (it is a clone, not a vendored dependency)
- Real student data, grades, or screenshots containing either

Because all of this lives outside your app repo, the only rule that matters inside the app is that
`.env` stays ignored. In the infrastructure directory, ignore `.env`, `canvas/dbinit/`,
`moodle/moodle-docker/` and `.data/` **before** the first commit.

See **§0.3** for who handles each secret, and for the extra rules that apply when an AI assistant
is doing the work.

---

## Part 8 — Access checklist

| What | Who to ask |
|---|---|
| `lthub/canvas-dev-only` image | nobody — public on Docker Hub |
| `ubc/moodle-docker` repo | nobody — public on GitHub |
| `ubc-genai-toolkit-lms-integration` repo/package | Kelvin |
| GitHub PAT (classic) with `read:packages` | you create it at github.com/settings/tokens |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `docker compose` fails, `docker pull` works | credential helper not on `PATH` — §0.1 |
| Script picks the wrong arch tag under npm | Rosetta; `uname -m` lies — §0.2 |
| `npm install` 401/404 on the `@ubc` scope | missing `~/.npmrc` token, missing `read:packages`/SSO authorization, or no package access |
| `npm install` succeeds but the integration is disabled | optional dependency failed silently — §3.1 |
| Canvas OAuth reaches the callback, then "token exchange failed with status 500" | seed id sequences unaligned — §1.4 |
| Canvas rejects the authorization with `invalid_scope` | Enforce Scopes is on, but the app requests no scopes |
| Canvas OAuth fails at the callback | `CANVAS_REDIRECT_URI` doesn't byte-for-byte match the Developer Key |
| Canvas authorize screen refuses a key that looks perfect | the account binding is `off` — §1.6 |
| Canvas callback says OAuth state is invalid/expired | session middleware missing, mounted after the auth router, or the session cookie wasn't preserved |
| Canvas never finishes first boot | init SQL wasn't copied, or the volume wasn't empty — `down -v` and retry |
| Canvas up but nothing async happens | `canvas.job` container isn't running |
| Course list returns `[]` from a correct setup | no courses seeded, or the user isn't enrolled — §1.7, §2.4 |
| Moodle installs, Apache starts, nothing is served | you got the stale 3.9.8 image — §2.1 |
| Moodle token generates but every call fails | `webservice/rest:use` not granted (only `createtoken` was) |
| Moodle connect rejects a valid-looking token | `core_webservice_get_site_info` missing from the whitelist |
| Moodle file downloads 403 | service's "Can download files" not enabled |
| Moodle feels slow | Redis cache mapping never set, or upstream `MOODLE_REDIS_*` names |
| Moodle links point at port 8080 | `MOODLE_URL` still says 8080 |
