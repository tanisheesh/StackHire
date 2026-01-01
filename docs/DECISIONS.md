# Engineering Decisions — StackHire

<!--
This is for technical interviewers and senior engineers who want to understand
WHY the system is built the way it is. Every entry answers a question an
interviewer might actually ask.
-->

---

## Decision 1 — Bun over Node.js as the bot runtime

**Context:** The bot is a TypeScript project running a single long-lived process. The options were Node.js (with ts-node or tsx for execution) or Bun (native TS runner, built-in test runner, faster cold starts).

**Decision:** Bun 1.x as the sole runtime for the bot service.

**Reason:** Bun runs TypeScript directly with no transpile step, ships a built-in test runner (`bun test`) that supports property-based tests via `fast-check`, and is faster at I/O-heavy workloads like parallel HTTP fetches (the Adzuna scraper fires up to 50 concurrent requests). No additional build tooling was needed — the Dockerfile is a single `bun run src/index.ts`.

**Tradeoff:** The Bun ecosystem is younger than Node's. Some npm packages behave differently under Bun (particularly those relying on Node-specific internals). `postgres` (the SQL client) required verifying compatibility. Playwright is installed via `bunx playwright install`, which adds Docker image size.

---

## Decision 2 — Deterministic keyword parsing over an LLM

**Context:** The bot needs to extract tech stack, role type, seniority, location, and remote intent from free text. Two options: a curated keyword-matching parser, or an LLM call (e.g. Claude) to extract structured JSON.

**Decision:** A pure TypeScript keyword parser with curated lists and word-boundary regex matching.

**Reason:** Every parse result is auditable — a score of 7 traces exactly to "2 tech tags matched + 3 for role type". No external API call means no latency, no cost, no rate limits, and no model failure modes on the hot path. The query parser runs in microseconds. The tradeoff was acceptable: the parser can't understand synonyms ("JS" vs "JavaScript") or context ("not looking for Java"), but this is mitigated by maintaining a canonical keyword map and providing clear clarification messages when no keywords match.

**Tradeoff:** Manual maintenance of keyword lists as the tech landscape evolves. Cannot understand negative intent ("no Java please") or contextual nuance.

---

## Decision 3 — DB-first, live-fallback fetch strategy

**Context:** The Adzuna API has rate limits on the free tier and each request takes 1–3 s. Querying live on every user message would be slow and could exhaust the daily quota. But serving only pre-scraped data means queries for unusual stacks or cities return no results until the next scheduled scraper run.

**Decision:** Check the local DB cache first; fire a live Adzuna API call only when fewer than 15 matching results exist for the specific query/location combination.

**Reason:** Common queries ("senior TypeScript React remote") are served from cache in < 500 ms. Unusual queries ("Go engineer in Warsaw") automatically escalate to live search without the user knowing. New live results are saved to the DB immediately, so the second user asking the same thing gets the cached version.

**Tradeoff:** The threshold of 15 is a heuristic. A query that happens to have exactly 14 DB matches will fire a live call on every request until a background scraper run brings it above threshold. A more sophisticated approach would track per-query miss rates.

---

## Decision 4 — SHA-256 hash Telegram user IDs before storage

**Context:** Preference profiles must be linked to individual users. Telegram provides a stable numeric user ID. Storing it raw would create a persistent identifier that maps directly to a real Telegram account.

**Decision:** SHA-256 hash the Telegram user ID in `bot.ts` before passing it to any DB operation. The `DbClient` also hashes any ID it receives as a defence-in-depth measure.

**Reason:** The stored hash cannot be reverse-mapped to a Telegram user ID. If the DB is compromised, preference data (tech stacks, locations) is not linkable to real identities. The double-hash (bot hashes → DB client hashes again) is intentional: the DB client is a reusable module that should not trust its callers to pre-hash IDs.

**Tradeoff:** The double-hash means a plain Telegram ID cannot be used to look up a profile directly — callers must use the pre-hashed value that `bot.ts` produces. This is currently consistent but should be standardised (pick one layer to hash) in v2 to avoid confusion.

---

## Decision 5 — Adzuna REST API as the sole active scraper (v1)

**Context:** Four scrapers were built: Adzuna (REST API), LinkedIn (Playwright), Indeed (Playwright), Remotive (Playwright). The question was which to activate in production.

**Decision:** Only `AdzunaScraper` is wired into `src/index.ts`; the other three are built and tested but not active.

**Reason:** LinkedIn aggressively blocks headless browsers and changes its DOM frequently. Indeed has similar bot-detection measures. Remotive has a smaller job volume. Adzuna provides a structured REST API with coverage across 5 countries, consistent JSON responses, and no anti-bot measures — zero maintenance overhead compared to DOM scrapers. The Playwright scrapers are kept in the codebase so they can be activated when proper proxy rotation or official API access is available.

**Tradeoff:** All active job data flows through a single source. If Adzuna changes its API or the key expires, the bot has no fallback live data source (it can still serve cached DB results).

---

## What I'd do differently in v2

- **Standardise the ID hashing layer** — hash once in `bot.ts`, pass the hash everywhere; remove the redundant hash in `DbClient.upsertPreferenceProfile` to eliminate the `sha256(sha256(id))` double-hash.
- **GIN index on `job_listings.tech_tags`** — the `&&` array overlap operator performs a sequential scan; a GIN index would cut query time significantly as the listing table grows.
- **Replace `setInterval` scheduler with a proper job queue** — BullMQ or a cron-compatible library would give retries, job history, and deduplication that `setInterval` cannot.
- **Configurable live-search threshold** — the hard-coded `15` in `fetchResults` should be an env var or profile-specific setting.

---

## Explicit non-decisions (deferred to v2)

| Feature | Why deferred |
|---|---|
| LLM query understanding | Free-tier rate limits and added latency on the hot path; deterministic parsing ships faster and is more debuggable |
| Job push alerts | Requires per-user seen-listing state and a scheduling layer beyond `setInterval` |
| Webhook mode | Long-polling works fine on Render; webhooks require HTTPS + public URL, adding deployment complexity |
| Active LinkedIn / Indeed scrapers | Bot detection makes them unreliable without proxy infrastructure; Adzuna REST API is a better v1 trade |
| Multi-portal result deduplication across sources | Only Adzuna is active; cross-portal URL normalization becomes necessary when more portals go live |
