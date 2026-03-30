/**
 * Shared type definitions for the Telegram Job Bot.
 */

/** A fully validated and stored job listing. */
export interface JobListing {
  id: string;          // UUID, generated on insert
  title: string;       // required
  company: string;     // required
  location: string;
  remote: boolean;
  techTags: string[];  // normalized lowercase tech keywords
  url: string;         // required, unique key for upsert
  portal: string;      // source portal name
  postedAt: Date | null;
  scrapedAt: Date;
  updatedAt: Date;
  expired: boolean;    // true when not updated for >30 days
}

/** A user's persisted job preference profile. */
export interface PreferenceProfile {
  telegramUserId: string; // SHA-256 hashed
  techStack: string[];
  roleType: string | null;
  seniority: string | null;
  location: string | null;
  remote: boolean | null;
  updatedAt: Date;
}

/** Raw, unvalidated job listing as returned by a portal scraper. */
export interface RawJobListing {
  title?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  techTags?: string[];
  url?: string;
  portal: string;
  postedAt?: string;
}

/** Structured attributes extracted from a free-text user query. */
export interface ParsedQuery {
  techStack: string[];
  roleType: string | null;
  seniority: string | null;
  location: string | null;
  remote: boolean | null;
  raw: string; // original message text
}

/** A job listing paired with its relevance score for a given query. */
export interface MatchResult {
  listing: JobListing;
  score: number;
}

/** Outcome of a single portal scraper run. */
export interface ScraperResult {
  portal: string;
  collected: number;
  durationMs: number;
  error?: string;
}

/** Configuration for the Telegraf bot. */
export interface BotConfig {
  token: string;
  operatorChatId: string;
}

/** Configuration for the scraper scheduler. */
export interface SchedulerConfig {
  intervalHours: number; // default: 6
  operatorChatId: string;
  bot: { telegram: { sendMessage(chatId: string, text: string): Promise<void> } };
}
