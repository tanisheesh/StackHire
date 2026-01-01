// Feature: telegram-job-bot, Property 3: Matcher returns results for valid queries
// Feature: telegram-job-bot, Property 4: Ranking by attribute match count
// Feature: telegram-job-bot, Property 5: Location filter correctness
// Feature: telegram-job-bot, Property 6: Result cardinality cap
// Feature: telegram-job-bot, Property 9: Profile used as baseline
// Feature: telegram-job-bot, Property 12: Expired listings excluded from results
// Feature: telegram-job-bot, Property 16: Tech stack filter correctness

import { describe, test } from "bun:test";
import fc from "fast-check";
import { matchListings } from "./matcher";
import type { JobListing, ParsedQuery, PreferenceProfile } from "./types";

fc.configureGlobal({ numRuns: 100 });

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const TECH_POOL = ["typescript", "react", "python", "go", "docker", "postgresql", "rust", "vue"];
const LOCATION_POOL = ["Berlin", "London", "New York", "Toronto", "Amsterdam"];
const ROLE_POOL = ["frontend", "backend", "fullstack", "devops"];
const SENIORITY_POOL = ["junior", "senior", "mid", "lead"];

const arbTech = fc.constantFrom(...TECH_POOL);
const arbLocation = fc.constantFrom(...LOCATION_POOL);

/** Arbitrary for a valid, non-expired JobListing */
const arbJobListing = (overrides: Partial<JobListing> = {}): fc.Arbitrary<JobListing> =>
  fc.record<JobListing>({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    company: fc.string({ minLength: 1, maxLength: 30 }),
    location: arbLocation,
    remote: fc.boolean(),
    techTags: fc.uniqueArray(arbTech, { minLength: 1, maxLength: 4 }),
    url: fc.webUrl(),
    portal: fc.constantFrom("linkedin", "indeed", "remotive"),
    postedAt: fc.option(fc.date(), { nil: null }),
    scrapedAt: fc.date(),
    updatedAt: fc.date(),
    expired: fc.constant(false),
    ...overrides,
  });

/** Arbitrary for a ParsedQuery with at least one tech tag */
const arbQueryWithTech = fc.record<ParsedQuery>({
  techStack: fc.uniqueArray(arbTech, { minLength: 1, maxLength: 3 }),
  roleType: fc.option(fc.constantFrom(...ROLE_POOL), { nil: null }),
  seniority: fc.option(fc.constantFrom(...SENIORITY_POOL), { nil: null }),
  location: fc.constant(null),
  remote: fc.constant(null),
  raw: fc.string(),
});

/** Arbitrary for an empty ParsedQuery (no attributes) */
const arbEmptyQuery: fc.Arbitrary<ParsedQuery> = fc.record({
  techStack: fc.constant([]),
  roleType: fc.constant(null),
  seniority: fc.constant(null),
  location: fc.constant(null),
  remote: fc.constant(null),
  raw: fc.string(),
});

/** Arbitrary for a PreferenceProfile with at least one tech tag */
const arbProfile = fc.record<PreferenceProfile>({
  telegramUserId: fc.stringMatching(/^[0-9a-f]{64}$/),
  techStack: fc.uniqueArray(arbTech, { minLength: 1, maxLength: 3 }),
  roleType: fc.option(fc.constantFrom(...ROLE_POOL), { nil: null }),
  seniority: fc.option(fc.constantFrom(...SENIORITY_POOL), { nil: null }),
  location: fc.constant(null),
  remote: fc.constant(null),
  updatedAt: fc.date(),
});

// ---------------------------------------------------------------------------
// Property 3: Matcher returns results for valid queries
// ---------------------------------------------------------------------------
describe("Property 3: Matcher returns results for valid queries", () => {
  test("returns non-empty list when query has keywords and matching listings exist", () => {
    fc.assert(
      fc.property(
        arbQueryWithTech,
        fc.array(arbJobListing(), { minLength: 1, maxLength: 20 }),
        (query, listings) => {
          // Ensure at least one listing shares a tech tag with the query
          const queryTech = query.techStack.map((t) => t.toLowerCase());
          const matchingListings = listings.map((l) => ({
            ...l,
            techTags: [...l.techTags, queryTech[0]],
            expired: false,
          }));

          const results = matchListings(query, null, matchingListings);
          return results.length > 0;
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Ranking by attribute match count
// ---------------------------------------------------------------------------
describe("Property 4: Ranking by attribute match count", () => {
  test("listing matching more query attributes ranks higher than one matching fewer", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom(...TECH_POOL),
        fc.constantFrom(...TECH_POOL),
        (baseTitle, tech1, tech2) => {
          fc.pre(tech1 !== tech2);

          const query: ParsedQuery = {
            techStack: [tech1, tech2],
            roleType: null,
            seniority: null,
            location: null,
            remote: null,
            raw: "",
          };

          const now = new Date();

          // listingA matches both tech tags
          const listingA: JobListing = {
            id: "a",
            title: baseTitle,
            company: "Acme",
            location: "Berlin",
            remote: false,
            techTags: [tech1, tech2],
            url: "https://example.com/a",
            portal: "linkedin",
            postedAt: null,
            scrapedAt: now,
            updatedAt: now,
            expired: false,
          };

          // listingB matches only one tech tag
          const listingB: JobListing = {
            ...listingA,
            id: "b",
            url: "https://example.com/b",
            techTags: [tech1],
          };

          const results = matchListings(query, null, [listingB, listingA]);
          if (results.length < 2) return true; // can't compare

          const scoreA = results.find((r) => r.listing.id === "a")?.score ?? 0;
          const scoreB = results.find((r) => r.listing.id === "b")?.score ?? 0;
          return scoreA > scoreB;
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Location filter correctness
// ---------------------------------------------------------------------------
describe("Property 5: Location filter correctness", () => {
  test("all results either match the queried location or are remote", () => {
    fc.assert(
      fc.property(
        arbLocation,
        fc.array(arbJobListing(), { minLength: 1, maxLength: 20 }),
        (location, listings) => {
          const query: ParsedQuery = {
            techStack: [],
            roleType: null,
            seniority: null,
            location,
            remote: null,
            raw: "",
          };

          const results = matchListings(query, null, listings);
          return results.every(
            (r) =>
              r.listing.remote === true ||
              r.listing.location.toLowerCase().includes(location.toLowerCase())
          );
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Result cardinality cap
// ---------------------------------------------------------------------------
describe("Property 6: Result cardinality cap", () => {
  test("response contains at most 10 listings regardless of how many match", () => {
    fc.assert(
      fc.property(
        arbQueryWithTech,
        fc.array(arbJobListing(), { minLength: 11, maxLength: 50 }),
        (query, listings) => {
          const queryTech = query.techStack.map((t) => t.toLowerCase());
          // Force all listings to match the query tech so we get >10 candidates
          const matchingListings = listings.map((l) => ({
            ...l,
            techTags: [queryTech[0]],
            expired: false,
          }));

          const results = matchListings(query, null, matchingListings);
          return results.length <= 10;
        }
      )
    );
  });

  test("returns exactly 10 when more than 10 listings match", () => {
    fc.assert(
      fc.property(
        arbQueryWithTech,
        fc.array(arbJobListing(), { minLength: 15, maxLength: 50 }),
        (query, listings) => {
          const queryTech = query.techStack.map((t) => t.toLowerCase());
          const matchingListings = listings.map((l) => ({
            ...l,
            techTags: [queryTech[0]],
            expired: false,
          }));

          const results = matchListings(query, null, matchingListings);
          return results.length === 10;
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Expired listings excluded from results
// ---------------------------------------------------------------------------
describe("Property 12: Expired listings excluded from results", () => {
  test("no expired listing appears in matcher output", () => {
    fc.assert(
      fc.property(
        arbQueryWithTech,
        fc.array(
          arbJobListing({ expired: fc.constant(true) } as Partial<JobListing>),
          { minLength: 1, maxLength: 20 }
        ),
        fc.array(arbJobListing(), { minLength: 0, maxLength: 10 }),
        (query, expiredListings, activeListings) => {
          const queryTech = query.techStack.map((t) => t.toLowerCase());
          const allListings = [
            ...expiredListings.map((l) => ({ ...l, expired: true, techTags: [queryTech[0]] })),
            ...activeListings.map((l) => ({ ...l, expired: false, techTags: [queryTech[0]] })),
          ];

          const results = matchListings(query, null, allListings);
          return results.every((r) => r.listing.expired === false);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Tech stack filter correctness
// ---------------------------------------------------------------------------
describe("Property 16: Tech stack filter correctness", () => {
  test("all results contain at least one tech tag matching the query", () => {
    fc.assert(
      fc.property(
        arbQueryWithTech,
        fc.array(arbJobListing(), { minLength: 1, maxLength: 20 }),
        (query, listings) => {
          const results = matchListings(query, null, listings);
          const queryTech = query.techStack.map((t) => t.toLowerCase());
          return results.every((r) =>
            r.listing.techTags.some((tag) => queryTech.includes(tag.toLowerCase()))
          );
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Profile used as baseline
// ---------------------------------------------------------------------------
describe("Property 9: Profile used as baseline", () => {
  test("empty query with profile produces same results as running profile attributes as query", () => {
    fc.assert(
      fc.property(
        arbProfile,
        fc.array(arbJobListing(), { minLength: 1, maxLength: 20 }),
        (profile, listings) => {
          // Ensure some listings match the profile's tech stack
          const profileTech = profile.techStack.map((t) => t.toLowerCase());
          const seededListings = listings.map((l, i) => ({
            ...l,
            techTags: i % 2 === 0 ? [profileTech[0]] : l.techTags,
            expired: false,
          }));

          // Run with empty query + profile
          const resultsWithProfile = matchListings(
            { techStack: [], roleType: null, seniority: null, location: null, remote: null, raw: "" },
            profile,
            seededListings
          );

          // Run with profile attributes as explicit query (no profile)
          const profileAsQuery: ParsedQuery = {
            techStack: profile.techStack,
            roleType: profile.roleType,
            seniority: profile.seniority,
            location: profile.location,
            remote: profile.remote,
            raw: "",
          };
          const resultsWithExplicitQuery = matchListings(profileAsQuery, null, seededListings);

          // Both should return the same listing IDs in the same order
          const idsA = resultsWithProfile.map((r) => r.listing.id);
          const idsB = resultsWithExplicitQuery.map((r) => r.listing.id);
          return JSON.stringify(idsA) === JSON.stringify(idsB);
        }
      )
    );
  });
});
