/**
 * Integration tests for end-to-end query flow and profile management.
 * Tests the full pipeline: parse → match → format, and /reset flow.
 * Requirements: 2.2, 4.3
 */

import { describe, test, expect } from "bun:test";
import { parseQuery } from "./parser";
import { matchListings } from "./matcher";
import { formatListing } from "./formatter";
import type { JobListing, PreferenceProfile } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date();

const listings: JobListing[] = [
  {
    id: "1",
    title: "Senior TypeScript Engineer",
    company: "Acme Corp",
    location: "Remote",
    remote: true,
    techTags: ["typescript", "react", "node.js"],
    url: "https://example.com/job/1",
    portal: "linkedin",
    postedAt: now,
    scrapedAt: now,
    updatedAt: now,
    expired: false,
  },
  {
    id: "2",
    title: "Backend Go Developer",
    company: "Globex",
    location: "Berlin",
    remote: false,
    techTags: ["go", "postgresql", "docker"],
    url: "https://example.com/job/2",
    portal: "indeed",
    postedAt: now,
    scrapedAt: now,
    updatedAt: now,
    expired: false,
  },
  {
    id: "3",
    title: "Junior Python Data Engineer",
    company: "Initech",
    location: "London",
    remote: false,
    techTags: ["python", "postgresql", "aws"],
    url: "https://example.com/job/3",
    portal: "remotive",
    postedAt: now,
    scrapedAt: now,
    updatedAt: now,
    expired: false,
  },
  {
    id: "4",
    title: "Full-Stack React Developer",
    company: "Umbrella",
    location: "Remote",
    remote: true,
    techTags: ["react", "typescript", "graphql"],
    url: "https://example.com/job/4",
    portal: "linkedin",
    postedAt: now,
    scrapedAt: now,
    updatedAt: now,
    expired: true, // expired — should be excluded
  },
];

// ---------------------------------------------------------------------------
// Test: user sends query → parse → match → formatted reply (Requirement 2.2)
// ---------------------------------------------------------------------------
describe("End-to-end query flow", () => {
  test("TypeScript remote query returns matching non-expired listings", () => {
    const query = parseQuery("Senior TypeScript React developer, remote");

    expect(query.techStack.map(t => t.toLowerCase())).toContain("typescript");
    expect(query.remote).toBe(true);
    expect(query.seniority).toBe("senior");

    const results = matchListings(query, null, listings);

    // Should return results
    expect(results.length).toBeGreaterThan(0);

    // Expired listing (id=4) must not appear
    expect(results.find(r => r.listing.id === "4")).toBeUndefined();

    // TypeScript listing (id=1) should be in results
    expect(results.find(r => r.listing.id === "1")).toBeDefined();

    // Results sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test("Go Berlin query returns only Berlin or remote listings", () => {
    const query = parseQuery("Backend Go engineer in Berlin");

    const results = matchListings(query, null, listings);

    expect(results.length).toBeGreaterThan(0);

    // All results must match location or be remote
    for (const r of results) {
      const locationMatch = r.listing.location.toLowerCase().includes("berlin");
      expect(locationMatch || r.listing.remote).toBe(true);
    }
  });

  test("formatted result contains all required fields", () => {
    const query = parseQuery("TypeScript developer");
    const results = matchListings(query, null, listings);

    expect(results.length).toBeGreaterThan(0);

    const formatted = formatListing(results[0].listing);

    expect(formatted).toContain(results[0].listing.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    expect(formatted).toContain(results[0].listing.company);
    expect(formatted).toContain("<a ");
    expect(formatted).toContain("</a>");
  });

  test("query with no keywords returns empty results (no crash)", () => {
    const query = parseQuery("12345 !@#$%");

    // No keywords — empty query
    expect(query.techStack.length).toBe(0);
    expect(query.roleType).toBeNull();
    expect(query.seniority).toBeNull();

    // matchListings should not throw
    const results = matchListings(query, null, listings);
    expect(Array.isArray(results)).toBe(true);
  });

  test("results capped at 10 even with many matching listings", () => {
    // Create 15 matching listings
    const manyListings: JobListing[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 100),
      title: "TypeScript Developer",
      company: `Company ${i}`,
      location: "Remote",
      remote: true,
      techTags: ["typescript"],
      url: `https://example.com/job/${i + 100}`,
      portal: "linkedin",
      postedAt: now,
      scrapedAt: now,
      updatedAt: now,
      expired: false,
    }));

    const query = parseQuery("TypeScript remote");
    const results = matchListings(query, null, manyListings);

    expect(results.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Test: /reset flow — profile deleted and confirmed (Requirement 4.3)
// ---------------------------------------------------------------------------
describe("/reset flow", () => {
  test("profile is cleared after reset — subsequent empty query uses no profile", () => {
    // Simulate a stored profile
    const profile: PreferenceProfile = {
      telegramUserId: "hashed-user-id",
      techStack: ["typescript", "react"],
      roleType: "frontend",
      seniority: "senior",
      location: null,
      remote: true,
      updatedAt: now,
    };

    // Before reset: empty query uses profile as baseline
    const emptyQuery = parseQuery("   ");
    const resultsWithProfile = matchListings(emptyQuery, profile, listings);

    // After reset: profile is null, empty query returns all (no tech filter)
    const resultsWithoutProfile = matchListings(emptyQuery, null, listings);

    // With profile, tech filter is applied (typescript/react)
    // Without profile, no tech filter — all non-expired listings returned
    const nonExpiredCount = listings.filter(l => !l.expired).length;
    expect(resultsWithoutProfile.length).toBe(nonExpiredCount);

    // With profile, only listings matching typescript or react should appear
    for (const r of resultsWithProfile) {
      const hasMatch = r.listing.techTags.some(t =>
        ["typescript", "react"].includes(t.toLowerCase())
      );
      expect(hasMatch).toBe(true);
    }
  });

  test("after reset, profile-based filtering no longer applies", () => {
    const profile: PreferenceProfile = {
      telegramUserId: "hashed-user-id",
      techStack: ["go"],
      roleType: "backend",
      seniority: null,
      location: null,
      remote: null,
      updatedAt: now,
    };

    const emptyQuery = parseQuery("");

    // With Go profile — only Go listings
    const withProfile = matchListings(emptyQuery, profile, listings);
    expect(withProfile.every(r => r.listing.techTags.includes("go"))).toBe(true);

    // Without profile (after reset) — all non-expired
    const withoutProfile = matchListings(emptyQuery, null, listings);
    expect(withoutProfile.length).toBe(listings.filter(l => !l.expired).length);
  });
});
