# StackHire — Product Requirements Document

**Status:** Final
**Owner:** Tanish Poddar
**One-liner:** A Telegram bot that searches job portals live and returns ranked developer job listings from a plain-text description of what you want.

---

## 1. Problem

Finding developer jobs is a filter-form problem: every job board makes you pick dropdowns, tick checkboxes, and keyword-match against inconsistent tags. Developers know what they want ("senior TypeScript backend, remote, not JavaScript only") but expressing that in a UI takes minutes per site and produces inconsistent results across portals. There is no single place to describe a role in plain English and get a ranked, deduplicated list from multiple sources instantly.

---

## 2. Goals (v1 / MVP)

1. Accept a free-text query in Telegram and extract structured search attributes (tech stack, role type, seniority, location, remote) without an LLM.
2. Return ranked job listings from the Adzuna API — live on cache miss, from a local DB on cache hit — within a few seconds of the user's message.
3. Paginate results cleanly with a "Show more" inline button; never dump a wall of text.
4. Persist user preferences (SHA-256 hashed Telegram ID) so repeat or follow-up queries improve over time.
5. Run a background scraper every 6 hours to keep the DB warm with fresh listings; auto-expire listings older than 30 days.
6. Deploy to Render with a working live demo at @StackHireBot.
7. Ship a Next.js landing page that explains the product and links to the bot.

---

## 3. Non-Goals (explicit scope cuts)

- **LLM-based query understanding** — deterministic keyword parsing is auditable and has no API cost or rate limit. Synonym resolution (e.g. "JS" → "JavaScript") is handled by the canonical keyword map.
- **LinkedIn / Indeed / Remotive live scraping in v1** — scrapers are built and tested but not wired up; Adzuna's REST API provides structured data without DOM fragility.
- **Webhook mode** — long-polling is simpler; webhooks require a public HTTPS endpoint with proper validation.
- **Job alerts / push notifications** — significant scheduling complexity; out of scope for MVP.
- **Multi-language support** — English-only query parsing for v1.
- **Analytics dashboard** — no usage metrics surface in v1 beyond structured JSON logs.

---

## 4. Users

**Primary:** Developer job seekers who already use Telegram and want to search across multiple job portals without visiting each one.

**Secondary:** Technical recruiters and engineers evaluating this as a portfolio project — they need the bot to respond live on their own queries so they can verify it works end-to-end.

---

## 5. User Stories

1. *As a developer,* I send "Senior TypeScript React, remote" to the bot so that I get a ranked list of matching remote jobs without opening any job board.
2. *As a developer,* I click "Show more" so that I can see additional results beyond the first five without re-sending my query.
3. *As a developer,* I send `/profile` so that I can see and edit the preferences the bot has inferred from my past queries.
4. *As a developer,* I send `/reset` so that I can start fresh with a new stack or location without my old preferences biasing results.
5. *As a developer,* I send `/stack TypeScript Node.js PostgreSQL` so that I can update my tech stack directly without running a full search query.
6. *As an operator,* I receive a Telegram alert when all scrapers fail so that I can investigate without watching logs.

---

## 6. Functional Requirements

### 6.1 Query Parsing

- The bot must extract tech stack keywords, role type, seniority level, location, and remote flag from a free-text message.
- Parsing must be deterministic — no external API call involved.
- If no recognisable keywords are found, the bot must respond with a clarification message listing what kinds of terms it understands.

### 6.2 Job Search

- On a valid query, the bot must first query the local DB for non-expired listings matching the query.
- If fewer than 15 matching DB results exist, the bot must perform a live Adzuna API search and save new listings to the DB.
- Results must be scored across tech tags, role type, seniority, location, and remote; returned sorted by score descending.
- The bot must deduplicate results by URL.

### 6.3 Pagination

- The bot must show 5 results per page.
- A "Show more" inline keyboard button must appear after each page (unless fewer than 5 results were returned, indicating no more exist).
- Sessions must expire after 10 minutes of inactivity to prevent unbounded memory growth.

### 6.4 Preference Profiles

- After a successful search, the bot must upsert the parsed query as the user's preference profile.
- The `/profile` command must display all stored preference fields and offer inline buttons to edit each field individually.
- The `/reset` command must delete the profile and clear any active session.
- Telegram user IDs must be SHA-256 hashed before storage.

### 6.5 Background Scraping

- The scraper must run on a configurable interval (default 6 hours) and upsert all collected listings into the DB.
- Listings not updated for more than 30 days must be marked expired and excluded from search results.
- If all portal scrapers fail in a single run, the scheduler must send a critical alert to the operator's Telegram chat ID.

### 6.6 Rate Limiting

- Each user must be limited to 20 requests per 60-second window.
- Requests exceeding the limit must receive an error message; no DB or API call is made.

---

## 7. Non-Functional Requirements

- **Latency:** Initial search response (DB hit path) under 2 s; live-search path under 10 s.
- **Security:** Telegram user IDs never stored in plain text. All API keys in env vars only — never logged or committed.
- **Cost:** Live Adzuna calls only on cache miss (not on every message). Background scraper uses at most 50 API calls per run (5 countries × 10 keywords).
- **Reliability:** DB operations wrapped with 3-attempt retry. Scraper failures isolated per portal — one failing portal cannot prevent others from running.
- **Privacy:** No message content is persisted — only the extracted preference attributes and their timestamp.

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Bot responsiveness | First response to a valid query in < 10 s including live search path |
| Scraper uptime | Successful scraper run on at least 80% of scheduled intervals |
| Live demo reliability | Bot responds correctly to a cold query from a new user on first try |

---

## 9. Risks & Open Questions

- **Adzuna free tier limits** — mitigated by DB-first caching; live calls only fire on cache miss.
- **Playwright scraper reliability** — LinkedIn/Indeed block headless browsers and change DOM frequently; this is why Playwright scrapers are built but not active in v1.
- **SHA-256 double-hash** — user IDs are hashed in `bot.ts` before being passed to `db.upsertPreferenceProfile`, which hashes again. This means the stored hash is `sha256(sha256(telegramId))`. Intentional as defence in depth, but should be standardised in v2.

---

## 10. v2 Candidates

- **Job alerts** — push a Telegram message when new listings matching a saved profile appear; requires a notification scheduler and seen-listing tracking.
- **LLM synonym resolution** — use a small model to expand "JS" → "JavaScript", understand "Spring Boot" as a Java framework, etc. without maintaining keyword lists manually.
- **GIN index on tech_tags** — needed once listing count exceeds ~50k rows for acceptable query latency.
- **Active LinkedIn / Indeed / Remotive scrapers** — requires solving anti-bot detection (rotating proxies, realistic browser fingerprints) or using their official APIs.
- **Webhook mode** — replace long-polling with Telegram webhook for lower latency and better Render compatibility.
