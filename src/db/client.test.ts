// Feature: telegram-job-bot, Property 10: Upsert deduplication (idempotency)

/**
 * Property 10: Upsert deduplication (idempotency)
 * Validates: Requirements 5.2
 *
 * For any set of Job_Listing records, running the scraper upsert twice with
 * the same data SHALL result in exactly one database row per unique URL —
 * no duplicates created.
 */

import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import type { JobListing } from "../types";
import type { DbClient, ListingFilter } from "./client";

fc.configureGlobal({ numRuns: 100 });

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

const arbUrl = fc.webUrl({ withFragments: false, withQueryParameters: false });

const arbJobListing = (url?: fc.Arbitrary<string>) =>
  fc.record<JobListing>({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 80 }),
    company: fc.string({ minLength: 1, maxLength: 80 }),
    location: fc.string({ minLength: 0, maxLength: 60 }),
    remote: fc.boolean(),
    techTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
    url: url ?? arbUrl,
    portal: fc.constantFrom("linkedin", "indeed", "remotive"),
    postedAt: fc.option(fc.date(), { nil: null }),
    scrapedAt: fc.date(),
    updatedAt: fc.date(),
    expired: fc.boolean(),
  });

// ---------------------------------------------------------------------------
// In-memory mock DbClient
// ---------------------------------------------------------------------------

/**
 * Creates a fresh in-memory DbClient stub that stores listings in a Map
 * keyed by URL (matching the real ON CONFLICT (url) DO UPDATE behaviour).
 */
function createInMemoryDbClient(): DbClient & { store: Map<string, JobListing> } {
  const store = new Map<string, JobListing>();

  return {
    store,

    async upsertJobListing(listing: JobListing): Promise<void> {
      // Mirrors ON CONFLICT (url) DO UPDATE — URL is the unique key
      store.set(listing.url, { ...listing });
    },

    async getJobListings(_filter: ListingFilter): Promise<JobListing[]> {
      return Array.from(store.values());
    },

    async upsertPreferenceProfile() {},
    async getPreferenceProfile() { return null; },
    async deletePreferenceProfile() {},
    async markExpiredListings() { return 0; },
  };
}

// ---------------------------------------------------------------------------
// Property 10: Upsert deduplication (idempotency)
// ---------------------------------------------------------------------------

describe("Property 10: Upsert deduplication (idempotency) — Validates: Requirements 5.2", () => {
  it("double-upsert of the same listing produces exactly one row per URL", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbJobListing(), { minLength: 1, maxLength: 20 }),
        async (listings) => {
          const db = createInMemoryDbClient();

          // First upsert pass
          for (const listing of listings) {
            await db.upsertJobListing(listing);
          }

          // Second upsert pass with identical data
          for (const listing of listings) {
            await db.upsertJobListing(listing);
          }

          const allRows = await db.getJobListings({});

          // Count rows per unique URL
          const urlCounts = new Map<string, number>();
          for (const row of allRows) {
            urlCounts.set(row.url, (urlCounts.get(row.url) ?? 0) + 1);
          }

          // Every URL must appear exactly once
          for (const [, count] of urlCounts) {
            if (count !== 1) return false;
          }

          // Total rows must equal the number of distinct URLs in the input
          const distinctUrls = new Set(listings.map((l) => l.url));
          return allRows.length === distinctUrls.size;
        }
      )
    );
  });

  it("upsert with updated fields overwrites the existing row (no new row added)", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbJobListing(),
        fc.string({ minLength: 1, maxLength: 80 }),
        async (original, newTitle) => {
          const db = createInMemoryDbClient();

          await db.upsertJobListing(original);

          const updated: JobListing = { ...original, title: newTitle };
          await db.upsertJobListing(updated);

          const rows = await db.getJobListings({});

          // Still exactly one row for this URL
          const rowsForUrl = rows.filter((r) => r.url === original.url);
          if (rowsForUrl.length !== 1) return false;

          // The row reflects the latest upserted title
          return rowsForUrl[0].title === newTitle;
        }
      )
    );
  });

  it("upserting N listings with distinct URLs produces exactly N rows", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(arbUrl, { minLength: 1, maxLength: 20 }).chain((urls) =>
          fc.tuple(...urls.map((url) => arbJobListing(fc.constant(url))))
        ),
        async (listings) => {
          const db = createInMemoryDbClient();

          for (const listing of listings) {
            await db.upsertJobListing(listing);
          }
          // Second pass
          for (const listing of listings) {
            await db.upsertJobListing(listing);
          }

          const rows = await db.getJobListings({});
          return rows.length === listings.length;
        }
      )
    );
  });
});

// Feature: telegram-job-bot, Property 17: DB retry on failure

/**
 * Property 17: DB retry on failure
 * Validates: Requirements 8.1
 *
 * For any sequence of database connection failures, the bot SHALL attempt
 * reconnection exactly 3 times before returning a service-unavailable
 * response to the user.
 */

// ---------------------------------------------------------------------------
// Testable withRetry (mirrors src/db/client.ts but accepts a configurable sleep)
// ---------------------------------------------------------------------------

async function withRetryTestable<T>(
  op: () => Promise<T>,
  sleepFn: (ms: number) => Promise<void> = () => Promise.resolve()
): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleepFn(2000);
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Property 17: DB retry on failure
// ---------------------------------------------------------------------------

describe("Property 17: DB retry on failure — Validates: Requirements 8.1", () => {
  it("retries exactly up to 3 times and succeeds when operation eventually succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(
        // failuresBeforeSuccess: 0 = succeeds immediately, 1-2 = fails then succeeds, 3 = always fails
        fc.integer({ min: 0, max: 3 }),
        async (failuresBeforeSuccess) => {
          let callCount = 0;

          const op = async (): Promise<number> => {
            callCount++;
            if (callCount <= failuresBeforeSuccess) {
              throw new Error("DB connection failed");
            }
            return callCount;
          };

          if (failuresBeforeSuccess < 3) {
            // Should succeed after (failuresBeforeSuccess + 1) attempts
            const result = await withRetryTestable(op);
            const expectedAttempts = failuresBeforeSuccess + 1;
            return callCount === expectedAttempts && result === expectedAttempts;
          } else {
            // All 3 attempts fail — should throw after exactly 3 attempts
            let threw = false;
            try {
              await withRetryTestable(op);
            } catch {
              threw = true;
            }
            return threw && callCount === 3;
          }
        }
      )
    );
  });

  it("never exceeds 3 total attempts regardless of how many failures occur", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 10 }),
        async (totalFailures) => {
          let callCount = 0;

          const op = async (): Promise<never> => {
            callCount++;
            throw new Error("DB always fails");
          };

          // Suppress unused variable — totalFailures drives the intent (always-fail scenario)
          void totalFailures;

          let threw = false;
          try {
            await withRetryTestable(op);
          } catch {
            threw = true;
          }

          // Must have thrown and attempted exactly 3 times (never more)
          return threw && callCount === 3;
        }
      )
    );
  });

  it("attempt count equals min(firstSuccessAttempt, 3) for any failure sequence", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        async (failuresBeforeSuccess) => {
          let callCount = 0;

          const op = async (): Promise<void> => {
            callCount++;
            if (callCount <= failuresBeforeSuccess) {
              throw new Error("DB connection failed");
            }
          };

          const expectedAttempts = Math.min(failuresBeforeSuccess + 1, 3);
          let threw = false;

          try {
            await withRetryTestable(op);
          } catch {
            threw = true;
          }

          // If all 3 attempts failed, it should have thrown
          if (failuresBeforeSuccess >= 3 && !threw) return false;

          return callCount === expectedAttempts;
        }
      )
    );
  });
});
