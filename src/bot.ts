import { Telegraf } from "telegraf";
import type { BotConfig, JobListing, ParsedQuery, PreferenceProfile } from "./types";
import type { DbClient } from "./db/client";
import { parseQuery } from "./parser";
import { matchListings } from "./matcher";
import { formatListing } from "./formatter";
import { checkRateLimit } from "./rateLimit";
import { liveSearch } from "./liveSearch";

const MAX_MESSAGE_LENGTH = 4096;
const PAGE_SIZE = 5; // results per page

const WELCOME_MESSAGE = `👋 Welcome to <b>StackHire</b>!

I help developers find relevant job openings. Just describe what you're looking for in plain text.

<b>Commands:</b>
/start — Show this welcome message
/help — Show commands and examples
/profile — View your saved preferences
/reset — Delete your saved preferences
/stack &lt;technologies&gt; — Update your tech stack

<b>Example queries:</b>
• "Senior TypeScript React developer, remote"
• "Backend Go engineer in Berlin"
• "Junior Python data engineer"
• "Full-stack Node.js PostgreSQL, any location"

Developed with ❤️ by <a href="https://tanisheesh.is-a.dev/">Tanish Poddar</a>`;

const HELP_MESSAGE = `<b>Available Commands:</b>
/start — Welcome message
/help — This help message
/profile — View your saved preference profile
/reset — Delete your preference profile
/stack &lt;technologies&gt; — Update your tech stack (e.g. <code>/stack TypeScript React Node.js</code>)

<b>How to search:</b>
Just send a free-text message describing your ideal role. The more detail you give, the better the results.

<b>Example Queries:</b>
• "Senior TypeScript React developer, remote"
• "Backend Go engineer in Berlin"
• "Junior Python data engineer"
• "Full-stack Node.js PostgreSQL, any location"
• "DevOps Kubernetes AWS, senior level"

<b>Tips:</b>
• Use "Show more" to get additional results
• Use /stack to save your tech preferences
• Use /profile to see your saved preferences`;

const CLARIFICATION_MESSAGE = `I couldn't find any recognizable keywords in your message. Try including:

• <b>Technologies:</b> TypeScript, React, Python, Go, Docker, etc.
• <b>Role type:</b> frontend, backend, fullstack, devops, mobile, etc.
• <b>Seniority:</b> junior, mid, senior, lead, principal, etc.
• <b>Location:</b> Berlin, London, New York, etc.
• <b>Remote:</b> "remote", "work from home", "distributed"

<b>Example queries:</b>
• "Senior TypeScript React developer, remote"
• "Backend Go engineer in Berlin"
• "Junior Python data engineer"`;

// ---------------------------------------------------------------------------
// In-memory session: stores paginated results per user
// ---------------------------------------------------------------------------
interface UserSession {
  results: JobListing[];
  page: number;        // next page to show (0-indexed)
  query: ParsedQuery;
}

const sessions = new Map<string, UserSession>();

// Clean up sessions older than 10 minutes
setInterval(() => sessions.clear(), 10 * 60_000).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hashUserId(userId: number): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(userId));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Smart result fetcher:
 * 1. Get DB matches
 * 2. If DB has enough, return DB results
 * 3. Otherwise, live search to fill the gap, save new results to DB
 * Returns ALL matched results (unpaged) — pagination handled by sendPage
 */
async function fetchResults(
  query: ParsedQuery,
  profile: PreferenceProfile | null,
  db: DbClient,
  adzunaAppId?: string,
  adzunaAppKey?: string,
): Promise<JobListing[]> {
  const dbListings = await db.getJobListings({ expired: false });

  // Apply location strict filter on DB listings
  const dbFiltered = query.location
    ? dbListings.filter((l) => {
        const locationMatch = l.location.toLowerCase().includes(query.location!.toLowerCase());
        const remoteOk = query.remote === true && l.remote === true;
        return locationMatch || remoteOk;
      })
    : dbListings;

  const dbMatches = matchListings(query, profile, dbFiltered).map((r) => r.listing);

  // Skip live search only if DB has enough results for this specific query+location
  const ENOUGH = PAGE_SIZE * 3;
  if (dbMatches.length >= ENOUGH) {
    const seen = new Set<string>();
    return dbMatches.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }

  // Not enough in DB — do live search
  if (!adzunaAppId || !adzunaAppKey) return dbMatches;

  const liveResults = await liveSearch(query, adzunaAppId, adzunaAppKey);

  // Save new listings to DB
  const existingUrls = new Set(dbListings.map((l) => l.url));
  for (const listing of liveResults) {
    if (!existingUrls.has(listing.url)) {
      await db.upsertJobListing(listing).catch(() => {});
      existingUrls.add(listing.url);
    }
  }

  // Merge DB + live, apply strict location filter, deduplicate
  const allListings = [...dbFiltered, ...liveResults];
  const allMatched = matchListings(query, profile, allListings).map((r) => r.listing);

  const strictFiltered = query.location
    ? allMatched.filter((l) => {
        const locationMatch = l.location.toLowerCase().includes(query.location!.toLowerCase());
        const remoteOk = query.remote === true && l.remote === true;
        return locationMatch || remoteOk;
      })
    : allMatched;

  const seen = new Set<string>();
  return strictFiltered.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

async function upsertProfileFromQuery(
  db: DbClient,
  hashedId: string,
  query: ParsedQuery,
  existing: PreferenceProfile | null
): Promise<void> {
  await db.upsertPreferenceProfile({
    telegramUserId: hashedId,
    techStack: query.techStack.length > 0 ? query.techStack : (existing?.techStack ?? []),
    roleType: query.roleType ?? existing?.roleType ?? null,
    seniority: query.seniority ?? existing?.seniority ?? null,
    location: query.location ?? existing?.location ?? null,
    remote: query.remote ?? existing?.remote ?? null,
    updatedAt: new Date(),
  });
}

function sendPage(
  ctx: { reply: (text: string, options?: Record<string, unknown>) => Promise<unknown> },
  session: UserSession
): Promise<unknown> {
  const start = session.page * PAGE_SIZE;
  const page = session.results.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    return ctx.reply("No more results found.", { parse_mode: "HTML" });
  }

  const formatted = page.map((l) => formatListing(l)).join("\n\n");

  // Increment page BEFORE checking hasMore
  session.page += 1;

  // Always show "Show more" unless we got fewer results than PAGE_SIZE
  // (fewer = definitely no more available)
  const hasMore = page.length === PAGE_SIZE;

  const replyOptions: Record<string, unknown> = { parse_mode: "HTML" };
  if (hasMore) {
    replyOptions.reply_markup = {
      inline_keyboard: [[{ text: "Show more", callback_data: "show_more" }]],
    };
  }

  return ctx.reply(formatted, replyOptions);
}

export function createBot(
  config: BotConfig & { adzunaAppId?: string; adzunaAppKey?: string },
  db: DbClient
): Telegraf {
  const bot = new Telegraf(config.token);

  bot.command("start", async (ctx) => {
    await ctx.reply(WELCOME_MESSAGE, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_MESSAGE, { parse_mode: "HTML" });
  });

  bot.command("profile", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const hashedId = await hashUserId(userId);
    const profile = await db.getPreferenceProfile(hashedId);
    if (!profile) {
      await ctx.reply("You don't have a saved preference profile yet. Send a job query to create one!");
      return;
    }
    const d = profile.updatedAt;
    const dateStr = `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
    const lines = [
      "<b>Your Preference Profile:</b>",
      `• Tech Stack: ${profile.techStack.length > 0 ? profile.techStack.join(", ") : "not set"}`,
      `• Role Type: ${profile.roleType ?? "not set"}`,
      `• Seniority: ${profile.seniority ?? "not set"}`,
      `• Location: ${profile.location ?? "not set"}`,
      `• Remote: ${profile.remote === null ? "not set" : profile.remote ? "yes" : "no"}`,
      `• Last Updated: ${dateStr}`,
    ];
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✏️ Update Stack", callback_data: "edit_stack" },
            { text: "🌍 Update Location", callback_data: "edit_location" },
          ],
          [
            { text: "💼 Update Role", callback_data: "edit_role" },
            { text: "📊 Update Seniority", callback_data: "edit_seniority" },
          ],
          [{ text: "🗑️ Reset Profile", callback_data: "reset_profile" }],
        ],
      },
    });
  });

  bot.command("reset", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const hashedId = await hashUserId(userId);
    await db.deletePreferenceProfile(hashedId);
    sessions.delete(hashedId);
    await ctx.reply("Your preference profile has been deleted. You're starting fresh!");
  });

  bot.command("stack", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const argsText = ctx.message.text.replace(/^\/stack\s*/i, "").trim();
    if (!argsText) {
      await ctx.reply("Please provide technologies. Example: <code>/stack TypeScript React Node.js</code>", { parse_mode: "HTML" });
      return;
    }
    const techStack = argsText.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    const hashedId = await hashUserId(userId);
    const existing = await db.getPreferenceProfile(hashedId);
    await db.upsertPreferenceProfile({
      telegramUserId: hashedId,
      techStack,
      roleType: existing?.roleType ?? null,
      seniority: existing?.seniority ?? null,
      location: existing?.location ?? null,
      remote: existing?.remote ?? null,
      updatedAt: new Date(),
    });
    await ctx.reply(`Tech stack updated to: <b>${techStack.join(", ")}</b>`, { parse_mode: "HTML" });
  });

  // Profile edit callbacks
  const editPrompts: Record<string, string> = {
    edit_stack: "Send your new tech stack (space or comma separated).\nExample: <code>TypeScript React Node.js</code>",
    edit_location: "Send your preferred location.\nExample: <code>Berlin</code> or <code>remote</code>",
    edit_role: "Send your role type.\nExample: <code>frontend</code>, <code>backend</code>, <code>fullstack</code>, <code>devops</code>",
    edit_seniority: "Send your seniority level.\nExample: <code>junior</code>, <code>mid</code>, <code>senior</code>, <code>lead</code>",
  };

  // In-memory: track which field user is editing
  const editingSessions = new Map<string, string>();

  for (const [action, prompt] of Object.entries(editPrompts)) {
    bot.action(action, async (ctx) => {
      await ctx.answerCbQuery().catch(() => {});
      const userId = ctx.from?.id;
      if (!userId) return;
      const hashedId = await hashUserId(userId);
      editingSessions.set(hashedId, action);
      await ctx.reply(prompt, { parse_mode: "HTML" });
    });
  }

  bot.action("reset_profile", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from?.id;
    if (!userId) return;
    const hashedId = await hashUserId(userId);
    await db.deletePreferenceProfile(hashedId);
    sessions.delete(hashedId);
    await ctx.reply("✅ Your preference profile has been deleted. You're starting fresh!");
  });

  // "Show more" callback
  bot.action("show_more", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const userId = ctx.from?.id;
    if (!userId) return;
    const hashedId = await hashUserId(userId);
    const session = sessions.get(hashedId);
    if (!session) {
      await ctx.reply("Session expired. Please send your query again.");
      return;
    }
    await sendPage(ctx, session);
  });

  // Free-text query pipeline
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = ctx.message.text;
    const hashedId = await hashUserId(userId);

    console.log(JSON.stringify({ userId: hashedId, timestamp: new Date().toISOString(), messageType: "text" }));

    if (text.length > MAX_MESSAGE_LENGTH) {
      await ctx.reply(`Your message is too long (${text.length} chars). Please shorten it to ${MAX_MESSAGE_LENGTH} or fewer.`);
      return;
    }

    if (!checkRateLimit(hashedId)) {
      await ctx.reply("You're sending messages too quickly. Please wait a moment (limit: 20 requests/minute).");
      return;
    }

    // Check if user is in profile edit mode
    const editingField = editingSessions.get(hashedId);
    if (editingField) {
      editingSessions.delete(hashedId);
      const existing = await db.getPreferenceProfile(hashedId);
      const base = existing ?? { telegramUserId: hashedId, techStack: [], roleType: null, seniority: null, location: null, remote: null, updatedAt: new Date() };

      if (editingField === "edit_stack") {
        base.techStack = text.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
      } else if (editingField === "edit_location") {
        const lower = text.toLowerCase().trim();
        if (["remote", "wfh", "work from home", "distributed"].includes(lower)) {
          base.remote = true;
          base.location = null;
        } else {
          base.location = text.trim();
          base.remote = false;
        }
      } else if (editingField === "edit_role") {
        base.roleType = text.trim().toLowerCase();
      } else if (editingField === "edit_seniority") {
        base.seniority = text.trim().toLowerCase();
      }

      base.updatedAt = new Date();
      await db.upsertPreferenceProfile(base);
      await ctx.reply("✅ Profile updated! Send /profile to view your updated preferences.");
      return;
    }

    const query = parseQuery(text);
    const hasKeywords = query.techStack.length > 0 || query.roleType !== null ||
      query.seniority !== null || query.location !== null || query.remote !== null;

    if (!hasKeywords) {
      await ctx.reply(CLARIFICATION_MESSAGE, { parse_mode: "HTML" });
      return;
    }

    const profile = await db.getPreferenceProfile(hashedId);
    const results = await fetchResults(query, profile, db, config.adzunaAppId, config.adzunaAppKey);

    if (results.length === 0) {
      await ctx.reply("No matching job listings found. Try broadening your query — remove location constraints, add more technologies, or drop the seniority requirement.");
      await upsertProfileFromQuery(db, hashedId, query, profile);
      return;
    }

    // Store session for pagination
    const session: UserSession = { results, page: 0, query };
    sessions.set(hashedId, session);

    await sendPage(ctx, session);
    await upsertProfileFromQuery(db, hashedId, query, profile);
  });

  bot.catch((err, ctx) => {
    const stack = err instanceof Error ? err.stack : String(err);
    console.log(JSON.stringify({ level: "error", message: "Unhandled bot error", stack, timestamp: new Date().toISOString() }));
    ctx.reply("Something went wrong, please try again later.").catch(() => {});
  });

  return bot;
}
