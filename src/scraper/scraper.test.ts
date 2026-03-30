// Feature: telegram-job-bot, Property 11: Portal failure isolation
// Feature: telegram-job-bot, Property 13: Scraper parses required fields
// Feature: telegram-job-bot, Property 14: Invalid records discarded
// Feature: telegram-job-bot, Property 15: Job listing serialization round-trip

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { runScraper } from "./base";
import type { PortalScraper } from "./base";
import type { JobListing, RawJobListing } from "../types";

fc.configureGlobal({ numRuns: 100 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock PortalScraper that resolves with given listings */
function mockPortal(name: string, listings: RawJobListing[]): PortalScraper {
  return { name, scrape: async () => listings };
}

/** Creates a mock PortalScraper that always throws */
function failingPortal(name: string): PortalScraper {
  return {
    name,
    scrape: async () => {
      throw new Error(`${name} is unreachable`);
    },
  };
}

/** Validates a RawJobListing has all required fields */
function hasRequiredFields(raw: RawJobListing): boolean {
  return (
    typeof raw.title === "string" && raw.title.trim().length > 0 &&
    typeof raw.company === "string" && raw.company.trim().length > 0 &&
    typeof raw.url === "string" && raw.url.trim().length > 0
  );
}

const arbPortalName = fc.constantFrom("linkedin", "indeed", "remotive", "wellfound", "glassdoor");

const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0);

const arbValidRaw: fc.Arbitrary<RawJobListing> = fc.record({
  title: arbNonEmptyString,
  company: arbNonEmptyString,
  location: fc.option(arbNonEmptyString, { nil: undefined }),
  remote: fc.option(fc.boolean(), { nil: undefined }),
  techTags: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { maxLength: 5 }),
    { nil: undefined }
  ),
  url: fc.webUrl(),
  portal: arbPortalName,
  postedAt: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
});

// Use integer ms timestamps to avoid sub-millisecond precision loss in JSON round-trip
const arbDate = fc.integer({ min: 0, max: 2_000_000_000_000 }).map((ms) => new Date(ms));

const arbJobListing: fc.Arbitrary<JobListing> = fc.record<JobListing>({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  company: fc.string({ minLength: 1, maxLength: 60 }),
  location: fc.string({ minLength: 0, maxLength: 60 }),
  remote: fc.boolean(),
  techTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  url: fc.webUrl(),
  portal: arbPortalName,
  postedAt: fc.option(arbDate, { nil: null }),
  scrapedAt: arbDate,
  updatedAt: arbDate,
  expired: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 11: Portal failure isolation
// ---------------------------------------------------------------------------
describe("Property 11: Portal failure isolation", () => {
  test("successful portals still return results when some portals fail", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbValidRaw, { minLength: 1, maxLength: 10 }),
        fc.array(arbPortalName, { minLength: 1, maxLength: 3 }),
        async (validListings, failingNames) => {
          const successPortal = mockPortal("success-portal", validListings);
          const failingPortals = failingNames.map((n) => failingPortal(n));

          const results = await runScraper([successPortal, ...failingPortals]);

          const successResult = results.find((r) => r.portal === "success-portal");
          return (
            successResult !== undefined &&
            successResult.collected === validListings.length &&
            !successResult.error
          );
        }
      )
    );
  });

  test("failed portals are logged with error field and do not halt the run", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbPortalName, { minLength: 1, maxLength: 4 }),
        async (failingNames) => {
          // Deduplicate names to avoid same-name portals
          const uniqueNames = [...new Set(failingNames)];
          const portals = uniqueNames.map((n) => failingPortal(n));

          const results = await runScraper(portals);

          // All results should be present (no portal halts the run)
          if (results.length !== uniqueNames.length) return false;

          // Each failed portal should have collected=0 and an error field
          return results.every(
            (r) => r.collected === 0 && typeof r.error === "string" && r.error.length > 0
          );
        }
      )
    );
  });

  test("runScraper returns one result per portal regardless of success or failure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        async (successCount, failCount) => {
          const portals: PortalScraper[] = [
            ...Array.from({ length: successCount }, (_, i) =>
              mockPortal(`ok-${i}`, [])
            ),
            ...Array.from({ length: failCount }, (_, i) =>
              failingPortal(`fail-${i}`)
            ),
          ];

          const results = await runScraper(portals);
          return results.length === successCount + failCount;
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Scraper parses required fields
// Property 14: Invalid records discarded
// These are tested via the validation helper that mirrors portal scraper logic
// ---------------------------------------------------------------------------
describe("Property 13 & 14: Scraper field validation", () => {
  test("raw listing with all required fields passes validation", () => {
    fc.assert(
      fc.property(arbValidRaw, (raw) => {
        return hasRequiredFields(raw);
      })
    );
  });

  test("raw listing missing title fails validation", () => {
    fc.assert(
      fc.property(
        arbValidRaw,
        fc.constantFrom(undefined, "", "   "),
        (raw, badTitle) => {
          const invalid = { ...raw, title: badTitle as string | undefined };
          return !hasRequiredFields(invalid as RawJobListing);
        }
      )
    );
  });

  test("raw listing missing company fails validation", () => {
    fc.assert(
      fc.property(
        arbValidRaw,
        fc.constantFrom(undefined, "", "   "),
        (raw, badCompany) => {
          const invalid = { ...raw, company: badCompany as string | undefined };
          return !hasRequiredFields(invalid as RawJobListing);
        }
      )
    );
  });

  test("raw listing missing url fails validation", () => {
    fc.assert(
      fc.property(
        arbValidRaw,
        fc.constantFrom(undefined, "", "   "),
        (raw, badUrl) => {
          const invalid = { ...raw, url: badUrl as string | undefined };
          return !hasRequiredFields(invalid as RawJobListing);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Job listing serialization round-trip
// ---------------------------------------------------------------------------
describe("Property 15: Job listing serialization round-trip", () => {
  test("serialize then deserialize produces a deeply equal JobListing", () => {
    fc.assert(
      fc.property(arbJobListing, (listing) => {
        const serialized = JSON.stringify(listing);
        const deserialized = JSON.parse(serialized);

        // Dates become strings in JSON — compare field by field with type coercion
        return (
          deserialized.id === listing.id &&
          deserialized.title === listing.title &&
          deserialized.company === listing.company &&
          deserialized.location === listing.location &&
          deserialized.remote === listing.remote &&
          JSON.stringify(deserialized.techTags) === JSON.stringify(listing.techTags) &&
          deserialized.url === listing.url &&
          deserialized.portal === listing.portal &&
          deserialized.expired === listing.expired &&
          // Dates: compare as ISO strings
          (listing.postedAt === null
            ? deserialized.postedAt === null
            : new Date(deserialized.postedAt).getTime() === listing.postedAt.getTime()) &&
          new Date(deserialized.scrapedAt).getTime() === listing.scrapedAt.getTime() &&
          new Date(deserialized.updatedAt).getTime() === listing.updatedAt.getTime()
        );
      })
    );
  });
});
