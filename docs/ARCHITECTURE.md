# StackHire — Architecture

<!--
Companion to PRD.md.
PRD says WHAT the system does. This says HOW.
Audience: an engineer who needs to understand the system well
enough to build it, debug it, or extend it.
-->

---

## 1. Stack

| Layer | Tech |
|---|---|
| Framework | Telegraf 4 (Telegram bot) + Next.js 16 (landing page) |
| Runtime | Bun 1.x (bot) · Node.js 20+ (web) |
| Language | TypeScript 5 throughout |
| Database | PostgreSQL 16 — managed via `postgres` npm package (tagged-template SQL) |
| Job data API | Adzuna REST API v1 |
| Web scraping | Playwright 1.x + Chromium (LinkedIn, Indeed, Remotive scrapers — built, not active in v1) |
| Styling | Tailwind CSS 4 (landing page only) |
| Hosting | Render (Docker service for bot · Node service for web) |
| Local dev | Docker Compose (bot + PostgreSQL) |

---

## 2. Components

```
src/
  index.ts          Entry point — wires all components, starts bot + scheduler + HTTP health server
  bot.ts            Telegraf bot — command handlers, free-text pipeline, session/pagination
  parser.ts         NLP query parser — extracts tech stack, role, seniority, location from text
  matcher.ts        Weighted scoring engine — ranks listings against a parsed query
  formatter.ts      Telegram HTML message builder — formats a JobListing for display
  liveSearch.ts     Adzuna live search — fires on cache miss, returns JobListing[]
  rateLimit.ts      In-memory per-user rate limiter — 20 req/60 s fixed window
  scheduler.ts      Periodic scraper runner — setInterval at configurable hours (default 6)
  types.ts          Shared TypeScript interfaces (JobListing, ParsedQuery, PreferenceProfile, …)
  db/
    client.ts       DbClient factory — upsert, query, expire job listings and preference profiles
    schema.sql      PostgreSQL DDL — job_listings and preference_profiles tables
  scraper/
    base.ts         runScraper() — runs portal scrapers concurrently, isolates per-portal failures
    portals/
      adzuna.ts     Adzuna REST scraper — fetches across 5 countries × 10 keywords (active in v1)
      linkedin.ts   LinkedIn Playwright scraper (built, not wired in v1)
      indeed.ts     Indeed Playwright scraper (built, not wired in v1)
      remotive.ts   Remotive Playwright scraper (built, not wired in v1)
web/
  app/page.tsx      Next.js landing page — hero, features, CTA linking to Telegram bot
```

### Bot (`src/bot.ts`)

Handles all Telegram interaction via Telegraf. Responds to `/start`, `/help`, `/profile`, `/reset`, `/stack` commands and a free-text pipeline for job search queries. Maintains an in-memory session map (keyed by hashed user ID) for pagination state, cleared every 10 minutes. Profile edits use a separate in-memory `editingSessions` map to track which field the user is currently updating via inline keyboard callback. Does not perform any scraping or DB writes beyond preference upserts.

### Parser (`src/parser.ts`)

Pure function `parseQuery(text: string): ParsedQuery`. Extracts five dimensions from free text using word-boundary regex matching against curated keyword lists: tech stack (40+ technologies, canonicalized), role type (fullstack/frontend/backend/devops/…), seniority (junior/mid/senior/lead/…), remote flag, and location (known cities list + pattern matching for "in <city>", "based in <city>"). No LLM — fully deterministic.

### Matcher (`src/matcher.ts`)

`matchListings(query, profile, listings): MatchResult[]`. Applies a weighted scoring function across five dimensions: +2 per matching tech tag, +3 for role type in title, +2 for seniority in title, +3 for location match, +2 for remote. Filters out expired listings and those with zero tech-tag overlap (when tech is specified). Falls back to the user's saved profile when the query has no explicit attributes. Returns results sorted by score descending (no hard cap — caller paginates).

### Live Search (`src/liveSearch.ts`)

Called from the bot when the DB cache has fewer than 15 results for a given query/location. Builds a keyword from the parsed query's tech stack and role type, maps the location to an Adzuna country code, fires parallel requests across the relevant countries, extracts tech tags from job descriptions, and returns deduplicated `JobListing[]`. New results are saved to the DB after the live call.

### Scheduler (`src/scheduler.ts`)

`startScheduler(config, scraperFn)` wraps `setInterval` at the configured hour interval (default 6 h). On failure it sends a critical alert to the operator's Telegram chat ID. The scheduler does not manage retries — those happen inside `runScraper`.

### DB Client (`src/db/client.ts`)

Factory function returning a `DbClient` interface backed by `postgres` (tagged-template SQL, no ORM). All operations wrap with a 3-attempt retry (2 s delay). `markExpiredListings(days)` bulk-updates listings not refreshed within the window. User IDs are SHA-256 hashed in both the bot (before passing to DB) and the DB client (as a double-hash safety net).

---

## 3. Data Flow

```
[User message in Telegram]
       |
       v
[bot.ts] -- rate limit check (rateLimit.ts) --|
       |                                       |-- 429 if exceeded
       v
[parseQuery(text)] -- parser.ts
       |
       v
[fetchResults(query, profile, db)]
       |
       +-- db.getJobListings({ expired: false })
       |       |
       |       +-- apply location filter
       |       +-- matchListings(query, profile, filtered) -> scored
       |
       +-- if results < 15: liveSearch(query, adzunaId, adzunaKey)
       |       |
       |       +-- Adzuna REST API (parallel per country)
       |       +-- save new listings to db.upsertJobListing()
       |       +-- merge + re-score + deduplicate
       |
       v
[sendPage(ctx, session)] -- 5 results + "Show more" inline button
       |
       v
[db.upsertPreferenceProfile()] -- saves query as user profile

[Background — every 6 hours]
[scheduler.ts] --> [runScraper([AdzunaScraper])]
       |
       +-- Adzuna API: 5 countries × 10 keywords = up to 500 listings
       +-- db.upsertJobListing() for each (idempotent, ON CONFLICT DO UPDATE)
       +-- db.markExpiredListings(30) -- mark stale listings expired
```

1. User sends a free-text message to @StackHireBot.
2. Rate limiter checks the hashed user ID — rejects if over 20 req/min.
3. `parseQuery` extracts tech stack, role, seniority, location, remote from the text.
4. DB is queried for non-expired listings; matched and scored by `matchListings`.
5. If fewer than 15 DB matches, `liveSearch` fires against the Adzuna API and augments results.
6. First page (5 listings) is sent as HTML; subsequent pages are served via "Show more" callback.
7. The parsed query is upserted as the user's preference profile for future fallback.

---

## 4. Database Schema

- `job_listings` — `id` (UUID PK), `title`, `company`, `location`, `remote` (bool), `tech_tags` (TEXT[]), `url` (UNIQUE — upsert key), `portal`, `posted_at`, `scraped_at`, `updated_at`, `expired` (bool). Updated in-place on re-scrape via `ON CONFLICT (url) DO UPDATE`.
- `preference_profiles` — `telegram_user_id` (TEXT PK, SHA-256 hash), `tech_stack` (TEXT[]), `role_type`, `seniority`, `location`, `remote` (bool|null), `updated_at`. One row per user, updated on every search.

**Indexes:** PostgreSQL array overlap operator `&&` is used for tech tag queries — adding a GIN index on `job_listings(tech_tags)` would be the first performance optimization in v2.

---

## 5. API Routes

The bot exposes no REST API. The HTTP server in `src/index.ts` is a minimal health-check endpoint for Render:

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"status":"ok","timestamp":"…"}` — used by Render for uptime checks |
| `GET` | `*` | Returns `"Bot is running"` plain text |

All Telegram interaction happens via Telegraf's long-polling (not webhooks).

---

## 6. Security

- **Secrets:** All API keys (`BOT_TOKEN`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `DATABASE_URL`) are in env vars only — never committed; `.env` and `.env.local` are gitignored.
- **User ID privacy:** Telegram user IDs are SHA-256 hashed via Web Crypto API before any DB write. The stored hash cannot be reversed to a Telegram ID.
- **Input validation:** User message length is capped at 4096 characters before parsing. Rate limiter rejects excessive requests before any DB query is made.
- **SQL injection:** Prevented by the `postgres` package's tagged-template literal interface — all values are passed as parameters, never string-interpolated into queries.
- **No webhooks:** Long-polling avoids the need for public HTTPS endpoint validation.

---

## 7. Error Handling & Reliability

| Failure | Behaviour |
|---|---|
| Adzuna API down or slow | Per-country/keyword fetch failures are caught silently; the scraper continues with remaining combinations. If all portals fail, scheduler logs `critical` and alerts the operator via Telegram. |
| DB write fails | `withRetry` attempts 3 times with 2 s delay before throwing. Upserts are idempotent — retries are safe. |
| Live search fails | Error is caught; the bot returns only DB results (potentially zero) and shows a "try broadening your query" message. |
| Malformed Telegram message | `bot.catch` handler logs the stack trace as structured JSON and replies with a generic error message — the bot stays alive. |
| Session expired | If a user clicks "Show more" after 10 minutes, the session is gone; the bot prompts them to re-send their query. |

---

## 8. Deployment

1. Render Docker service (`stackhire-bot`) — built from `Dockerfile` using `oven/bun:1`, includes Playwright Chromium installation. Env vars set in Render dashboard.
2. Render Node service (`stackhire-web`) — `cd web && npm install && npm run build && npm start`. Deploys the Next.js landing page.
3. PostgreSQL — Supabase managed instance in production (connection string passed as `DATABASE_URL`). Docker Compose runs a local Postgres 16 for dev.
4. Schema applied automatically: Docker Compose mounts `schema.sql` at `/docker-entrypoint-initdb.d/`; for Render/Supabase, run `psql $DATABASE_URL < src/db/schema.sql` once on first deploy.

---

## 9. Explicit Scope Cuts

- **LinkedIn / Indeed / Remotive scrapers** — Playwright scrapers are built and tested but not wired into `src/index.ts` in v1. LinkedIn blocks headless browsers aggressively; Indeed's DOM changes frequently. Adzuna's REST API provides clean structured data without the fragility of DOM scraping.
- **Webhook mode** — Long-polling is simpler to deploy (no public HTTPS URL required); webhook mode deferred to when self-hosting behind a proper reverse proxy.
- **GIN index on tech_tags** — Acceptable query times at current data volume; deferred to when listing count grows beyond ~50k rows.
- **Real-time job alerts** — Scheduled push notifications when new jobs match a saved profile. Deferred to v2 — adds significant state and scheduling complexity.
