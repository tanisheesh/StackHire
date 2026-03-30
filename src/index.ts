import { createDbClient } from "./db/client";
import { createBot } from "./bot";
import { startScheduler } from "./scheduler";
import { runScraper } from "./scraper/base";
import { AdzunaScraper } from "./scraper/portals/adzuna";

// ---------------------------------------------------------------------------
// Load config from environment variables (Requirements 11.3)
// ---------------------------------------------------------------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const OPERATOR_CHAT_ID = process.env.OPERATOR_CHAT_ID;
const SCRAPER_INTERVAL_HOURS = Number(process.env.SCRAPER_INTERVAL_HOURS ?? "6");
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

if (!BOT_TOKEN) throw new Error("Missing required env var: BOT_TOKEN");
if (!DATABASE_URL) throw new Error("Missing required env var: DATABASE_URL");
if (!OPERATOR_CHAT_ID) throw new Error("Missing required env var: OPERATOR_CHAT_ID");
if (!ADZUNA_APP_ID) throw new Error("Missing required env var: ADZUNA_APP_ID");
if (!ADZUNA_APP_KEY) throw new Error("Missing required env var: ADZUNA_APP_KEY");

// ---------------------------------------------------------------------------
// Instantiate components
// ---------------------------------------------------------------------------
const db = createDbClient(DATABASE_URL);

const bot = createBot({ token: BOT_TOKEN, operatorChatId: OPERATOR_CHAT_ID, adzunaAppId: ADZUNA_APP_ID, adzunaAppKey: ADZUNA_APP_KEY }, db);

// ---------------------------------------------------------------------------
// Scraper runner — upserts all collected listings into the DB
// ---------------------------------------------------------------------------
const portals = [new AdzunaScraper(ADZUNA_APP_ID, ADZUNA_APP_KEY)];

async function scraperRun(): Promise<void> {
  const results = await runScraper(portals);

  const allFailed = results.every((r) => r.error !== undefined);
  if (allFailed) {
    throw new Error("All portals failed: " + results.map((r) => r.error).join(", "));
  }

  // Upsert all collected listings into DB
  for (const portal of portals) {
    try {
      const listings = await portal.scrape();
      for (const raw of listings) {
        if (!raw.title || !raw.company || !raw.url) continue;
        await db.upsertJobListing({
          id: crypto.randomUUID(),
          title: raw.title,
          company: raw.company,
          location: raw.location ?? "",
          remote: raw.remote ?? false,
          techTags: raw.techTags ?? [],
          url: raw.url,
          portal: raw.portal,
          postedAt: raw.postedAt ? new Date(raw.postedAt) : null,
          scrapedAt: new Date(),
          updatedAt: new Date(),
          expired: false,
        });
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        message: "Failed to upsert listings",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }));
    }
  }

  // Mark listings older than 30 days as expired (Requirements 5.5)
  await db.markExpiredListings(30);
}

// ---------------------------------------------------------------------------
// Start scheduler (Requirements 5.3, 8.2)
// ---------------------------------------------------------------------------
startScheduler(
  {
    intervalHours: SCRAPER_INTERVAL_HOURS,
    operatorChatId: OPERATOR_CHAT_ID,
    bot: {
      telegram: {
        sendMessage: (chatId: string, text: string) =>
          bot.telegram.sendMessage(chatId, text).then(() => undefined),
      },
    },
  },
  scraperRun
);

// ---------------------------------------------------------------------------
// Launch bot (Requirements 1.1)
// ---------------------------------------------------------------------------
bot.launch();

console.log(
  JSON.stringify({
    level: "info",
    message: "Bot started",
    timestamp: new Date().toISOString(),
  })
);

// Run scraper once on startup so DB has listings immediately
scraperRun().catch((err) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Initial scraper run failed",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
  );
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
