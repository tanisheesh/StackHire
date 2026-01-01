# Local Setup — StackHire

> **Just want to try it?** Use the live demo at [@StackHireBot](https://t.me/StackHireBot) — no setup needed.
> This guide is for running StackHire locally or self-hosting it.

---

## Prerequisites

- Bun 1.x — [bun.sh](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- Node.js 20+ (for the Next.js landing page only)
- Docker + Docker Compose (for the local PostgreSQL instance)
- A Telegram Bot token — create one via [@BotFather](https://t.me/BotFather)
- An Adzuna API key — [developer.adzuna.com](https://developer.adzuna.com) (free tier available)
- Your own Telegram chat ID (for operator alerts) — send a message to [@userinfobot](https://t.me/userinfobot)

---

## 1. Clone and install

```bash
git clone https://github.com/tanisheesh/stackhire
cd stackhire

# Install bot dependencies
bun install

# Install web dependencies (optional — landing page only)
cd web && npm install && cd ..
```

---

## 2. Environment variables

Create a `.env` file in the project root:

```bash
cp /dev/null .env   # or create it manually
```

| Variable | Where to get it |
|---|---|
| `BOT_TOKEN` | Telegram → [@BotFather](https://t.me/BotFather) → `/newbot` |
| `DATABASE_URL` | Local: `postgres://jobbot:jobbot@localhost:5432/jobbot` · Production: your Supabase connection string |
| `OPERATOR_CHAT_ID` | Your Telegram numeric user ID — get it from [@userinfobot](https://t.me/userinfobot) |
| `ADZUNA_APP_ID` | [developer.adzuna.com](https://developer.adzuna.com) → your application's App ID |
| `ADZUNA_APP_KEY` | Same Adzuna application → App Key |
| `SCRAPER_INTERVAL_HOURS` | Optional — default is `6` |

For the web landing page (optional), create `web/.env.local`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BOT_USERNAME` | Your bot's username without `@` (e.g. `StackHireBot`) |

---

## 3. Database setup

Start the local PostgreSQL container and apply the schema:

```bash
# Start Postgres
docker compose up db -d

# Apply schema (first-time only)
docker exec -i stackhire-db-1 psql -U jobbot -d jobbot < src/db/schema.sql
```

If using Supabase for local dev, set `DATABASE_URL` to your Supabase connection string and run:

```bash
psql $DATABASE_URL < src/db/schema.sql
```

---

## 4. Run locally

**Bot only (recommended for development):**

```bash
bun run src/index.ts
```

The bot starts long-polling and runs an initial scraper pass. Open Telegram and search for your bot by username.

**Full stack with Docker Compose (bot + Postgres together):**

```bash
docker compose up --build
```

**Landing page only:**

```bash
cd web && npm run dev
```

The landing page runs at `http://localhost:3000`.

---

## 5. Running tests

```bash
# Run all tests (Bun test runner)
bun test

# Run a specific test file
bun test src/parser.test.ts
```

Tests use `fast-check` for property-based testing. No external services required — DB and Telegram are mocked.

---

## 6. Deploy to production (Render)

The `render.yaml` file at the project root defines both services:

1. Push your repo to GitHub.
2. Create a new Render project and select "Blueprint" — it will read `render.yaml` automatically.
3. Set all env vars listed above in the Render dashboard (they are marked `sync: false` in the blueprint).
4. For `DATABASE_URL`, paste your Supabase (or any external Postgres) connection string.
5. Apply the schema to your production DB once: `psql $DATABASE_URL < src/db/schema.sql`.
6. Render will build the Docker image and deploy the bot service. The web service builds and starts the Next.js app automatically.

---

## Known local-only limitations

- The background scraper fires on startup and every 6 hours — your local DB will start empty and be populated after the first scraper run (up to ~30 s for the initial Adzuna fetch across all countries/keywords).
- LinkedIn, Indeed, and Remotive Playwright scrapers require Chromium installed (`bunx playwright install chromium`) and are not wired into the main entry point — they are available for manual testing via their respective module files.
- The Adzuna free tier has daily request limits; running the scraper frequently during development will consume quota.
