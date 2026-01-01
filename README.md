<p align="center">
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"
       fill="none" stroke="#3B82F6" stroke-width="1.5"
       stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="12.01"/>
    <path d="M8 12h.01M16 12h.01"/>
  </svg>
</p>

<h1 align="center">StackHire</h1>

<p align="center">
  <strong>A Telegram bot that finds developer jobs from your plain-text description of what you want.</strong>
</p>

<p align="center">
  <a href="https://stackhire.tanisheesh.in">
    <img src="https://img.shields.io/badge/live_demo-3B82F6-3B82F6?style=flat-square" alt="Live Demo">
  </a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Next.js-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/license-GPL--3.0-3B82F6?style=flat-square" alt="License">
</p>

---

## What is StackHire?

Job boards expect developers to navigate filters, checkboxes, and keyword fields. StackHire removes that friction — you describe your ideal role in plain English inside Telegram, and it queries the Adzuna job API live, scores every result against your tech stack, role type, seniority, and location, and returns ranked listings with direct apply links. Your preferences are persisted (with hashed IDs for privacy) so repeat queries get smarter over time.

> **Live demo →** [stackhire.tanisheesh.in](https://stackhire.tanisheesh.in) — landing page and docs.
> **Telegram bot →** [t.me/StackHireBot](https://t.me/StackHireBot) — no login, no signup, start typing.

---

## What you get

- **Natural language query parsing** — extracts tech stack, role type, seniority, location, and remote preference from free-text without an LLM; fully deterministic and auditable.
- **DB-first, live-fallback search** — serves cached Adzuna results for speed; falls back to a live API call when fewer than 15 matches exist for your specific query.
- **Weighted relevance ranking** — scores each listing across five dimensions (tech tags, role type, seniority, location, remote) and returns the top matches sorted by score.
- **Per-user preference profiles** — saves your last query as a profile (SHA-256 hashed Telegram ID) so future empty queries fall back to your saved stack and preferences.
- **Paginated results with "Show more"** — delivers 5 results per page via Telegram inline keyboard; background scraper refreshes the DB every 6 hours and marks stale listings expired.

---

## Stack

| Layer | Tech |
|---|---|
| Bot runtime | Bun 1.x · TypeScript 5 · Telegraf 4 |
| Web (landing) | Next.js 16 · React 19 · Tailwind CSS 4 |
| Database | PostgreSQL 16 · `postgres` (npm) |
| Job data | Adzuna REST API |
| Scraping | Playwright (Chromium) — LinkedIn, Indeed, Remotive scrapers (built, not wired in v1) |
| Infra | Docker · Docker Compose · Render |

---

## Engineering Decisions

**Why Bun over Node.js?**
Bun's built-in TypeScript runner removes the transpile step, ships a native test runner, and is faster for I/O-heavy workloads — no extra tooling required.

**Why deterministic scoring over an LLM for matching?**
Every score is traceable to its inputs: +2 per matching tech tag, +3 for role type, +3 for location, etc. No prompt tuning, no rate limits, no hallucinated relevance. The tradeoff is that it can't understand synonyms ("JS" vs "JavaScript") — mitigated by the parser's canonical keyword map.

**Why DB-first with live fallback, rather than always querying the API?**
The Adzuna free tier has rate limits. Serving the background-scraped cache for common queries is instant and free; the live call only fires when the cache is thin for an unusual query/location combination.

**Why SHA-256 hash Telegram user IDs before storage?**
Telegram user IDs are stable identifiers. Hashing before writes means the DB never contains a value that can be reverse-mapped to a real identity — preference profiles are linked only to the hash.

---

## Docs

| Document | Description |
|---|---|
| [PRD](docs/PRD.md) | Product requirements — goals, user stories, non-goals |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, component breakdown |
| [Decisions](docs/DECISIONS.md) | Every major technical decision and why |
| [Setup](docs/SETUP.md) | Local dev setup, env vars, deployment |

---

## Author

**Tanish Poddar** — [tanisheesh.in](https://tanisheesh.in) · [LinkedIn](https://linkedin.com/in/tanisheesh) · [GitHub](https://github.com/tanisheesh)
