import postgres from "postgres";
import type { JobListing, PreferenceProfile } from "../types";

/** Filter options for querying job listings. */
export interface ListingFilter {
  techTags?: string[];
  location?: string;
  remote?: boolean;
  expired?: boolean;
}

export interface DbClient {
  upsertJobListing(listing: JobListing): Promise<void>;
  getJobListings(filter: ListingFilter): Promise<JobListing[]>;
  upsertPreferenceProfile(profile: PreferenceProfile): Promise<void>;
  getPreferenceProfile(telegramUserId: string): Promise<PreferenceProfile | null>;
  deletePreferenceProfile(telegramUserId: string): Promise<void>;
  markExpiredListings(olderThanDays: number): Promise<number>;
}

/** SHA-256 hash a string using the Web Crypto API (available natively in Bun). */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a DB operation with 3-attempt retry logic (2-second delay between attempts).
 */
async function withRetry<T>(op: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(2000);
      }
    }
  }
  throw lastError;
}

export function createDbClient(connectionString: string): DbClient {
  const sql = postgres(connectionString);

  return {
    async upsertJobListing(listing: JobListing): Promise<void> {
      const result = await withRetry(() =>
        sql`
          INSERT INTO job_listings (
            id, title, company, location, remote, tech_tags,
            url, portal, posted_at, scraped_at, updated_at, expired
          ) VALUES (
            ${listing.id},
            ${listing.title},
            ${listing.company},
            ${listing.location ?? null},
            ${listing.remote},
            ${sql.array(listing.techTags)},
            ${listing.url},
            ${listing.portal},
            ${listing.postedAt ?? null},
            ${listing.scrapedAt},
            ${listing.updatedAt},
            ${listing.expired}
          )
          ON CONFLICT (url) DO UPDATE SET
            title      = EXCLUDED.title,
            company    = EXCLUDED.company,
            location   = EXCLUDED.location,
            remote     = EXCLUDED.remote,
            tech_tags  = EXCLUDED.tech_tags,
            portal     = EXCLUDED.portal,
            posted_at  = EXCLUDED.posted_at,
            scraped_at = EXCLUDED.scraped_at,
            updated_at = EXCLUDED.updated_at,
            expired    = EXCLUDED.expired
        `
      );
      console.log(
        JSON.stringify({
          op: "upsertJobListing",
          url: listing.url,
          affectedRows: result.count,
          timestamp: new Date().toISOString(),
        })
      );
    },

    async getJobListings(filter: ListingFilter): Promise<JobListing[]> {
      const rows = await withRetry(() => {
        // Build conditions dynamically but always use parameterized values via tagged template
        const expired = filter.expired ?? false;

        if (filter.techTags && filter.techTags.length > 0 && filter.location !== undefined && filter.remote !== undefined) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND tech_tags && ${sql.array(filter.techTags)}
              AND (location ILIKE ${"%" + filter.location + "%"} OR remote = ${filter.remote})
            ORDER BY updated_at DESC
          `;
        } else if (filter.techTags && filter.techTags.length > 0 && filter.location !== undefined) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND tech_tags && ${sql.array(filter.techTags)}
              AND location ILIKE ${"%" + filter.location + "%"}
            ORDER BY updated_at DESC
          `;
        } else if (filter.techTags && filter.techTags.length > 0 && filter.remote !== undefined) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND tech_tags && ${sql.array(filter.techTags)}
              AND remote = ${filter.remote}
            ORDER BY updated_at DESC
          `;
        } else if (filter.techTags && filter.techTags.length > 0) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND tech_tags && ${sql.array(filter.techTags)}
            ORDER BY updated_at DESC
          `;
        } else if (filter.location !== undefined && filter.remote !== undefined) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND (location ILIKE ${"%" + filter.location + "%"} OR remote = ${filter.remote})
            ORDER BY updated_at DESC
          `;
        } else if (filter.location !== undefined) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND location ILIKE ${"%" + filter.location + "%"}
            ORDER BY updated_at DESC
          `;
        } else if (filter.remote !== undefined) {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
              AND remote = ${filter.remote}
            ORDER BY updated_at DESC
          `;
        } else {
          return sql<DbJobListingRow[]>`
            SELECT * FROM job_listings
            WHERE expired = ${expired}
            ORDER BY updated_at DESC
          `;
        }
      });

      return rows.map(rowToJobListing);
    },

    async upsertPreferenceProfile(profile: PreferenceProfile): Promise<void> {
      const hashedId = await sha256(profile.telegramUserId);
      const result = await withRetry(() =>
        sql`
          INSERT INTO preference_profiles (
            telegram_user_id, tech_stack, role_type, seniority, location, remote, updated_at
          ) VALUES (
            ${hashedId},
            ${sql.array(profile.techStack)},
            ${profile.roleType ?? null},
            ${profile.seniority ?? null},
            ${profile.location ?? null},
            ${profile.remote ?? null},
            ${profile.updatedAt}
          )
          ON CONFLICT (telegram_user_id) DO UPDATE SET
            tech_stack = EXCLUDED.tech_stack,
            role_type  = EXCLUDED.role_type,
            seniority  = EXCLUDED.seniority,
            location   = EXCLUDED.location,
            remote     = EXCLUDED.remote,
            updated_at = EXCLUDED.updated_at
        `
      );
      console.log(
        JSON.stringify({
          op: "upsertPreferenceProfile",
          telegramUserIdHash: hashedId,
          affectedRows: result.count,
          timestamp: new Date().toISOString(),
        })
      );
    },

    async getPreferenceProfile(telegramUserId: string): Promise<PreferenceProfile | null> {
      const hashedId = await sha256(telegramUserId);
      const rows = await withRetry(() =>
        sql<DbPreferenceProfileRow[]>`
          SELECT * FROM preference_profiles
          WHERE telegram_user_id = ${hashedId}
        `
      );
      if (rows.length === 0) return null;
      return rowToPreferenceProfile(rows[0]);
    },

    async deletePreferenceProfile(telegramUserId: string): Promise<void> {
      const hashedId = await sha256(telegramUserId);
      const result = await withRetry(() =>
        sql`
          DELETE FROM preference_profiles
          WHERE telegram_user_id = ${hashedId}
        `
      );
      console.log(
        JSON.stringify({
          op: "deletePreferenceProfile",
          telegramUserIdHash: hashedId,
          affectedRows: result.count,
          timestamp: new Date().toISOString(),
        })
      );
    },

    async markExpiredListings(olderThanDays: number): Promise<number> {
      const result = await withRetry(() =>
        sql`
          UPDATE job_listings
          SET expired = true
          WHERE updated_at < now() - (${olderThanDays} || ' days')::interval
            AND expired = false
        `
      );
      console.log(
        JSON.stringify({
          op: "markExpiredListings",
          olderThanDays,
          affectedRows: result.count,
          timestamp: new Date().toISOString(),
        })
      );
      return result.count;
    },
  };
}

// ---------------------------------------------------------------------------
// Internal row types (snake_case from PostgreSQL)
// ---------------------------------------------------------------------------

interface DbJobListingRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  tech_tags: string[];
  url: string;
  portal: string;
  posted_at: Date | null;
  scraped_at: Date;
  updated_at: Date;
  expired: boolean;
}

interface DbPreferenceProfileRow {
  telegram_user_id: string;
  tech_stack: string[];
  role_type: string | null;
  seniority: string | null;
  location: string | null;
  remote: boolean | null;
  updated_at: Date;
}

function rowToJobListing(row: DbJobListingRow): JobListing {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location ?? "",
    remote: row.remote,
    techTags: row.tech_tags,
    url: row.url,
    portal: row.portal,
    postedAt: row.posted_at,
    scrapedAt: row.scraped_at,
    updatedAt: row.updated_at,
    expired: row.expired,
  };
}

function rowToPreferenceProfile(row: DbPreferenceProfileRow): PreferenceProfile {
  return {
    telegramUserId: row.telegram_user_id,
    techStack: row.tech_stack,
    roleType: row.role_type,
    seniority: row.seniority,
    location: row.location,
    remote: row.remote,
    updatedAt: row.updated_at,
  };
}
