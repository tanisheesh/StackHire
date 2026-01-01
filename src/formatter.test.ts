// Feature: telegram-job-bot, Property 7: Result formatting contains required fields

import { describe, test } from "bun:test";
import fc from "fast-check";
import { formatListing } from "./formatter";
import type { JobListing } from "./types";

fc.configureGlobal({ numRuns: 100 });

const arbJobListing = fc.record<JobListing>({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  company: fc.string({ minLength: 1, maxLength: 60 }),
  location: fc.string({ minLength: 1, maxLength: 60 }),
  remote: fc.boolean(),
  techTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  url: fc.webUrl(),
  portal: fc.constantFrom("linkedin", "indeed", "remotive"),
  postedAt: fc.option(fc.date(), { nil: null }),
  scrapedAt: fc.date(),
  updatedAt: fc.date(),
  expired: fc.boolean(),
});

describe("Property 7: Result formatting contains required fields", () => {
  test("formatted message contains the job title", () => {
    fc.assert(
      fc.property(arbJobListing, (listing) => {
        const output = formatListing(listing);
        // Title may be HTML-escaped; check the raw title chars that survive escaping
        const escapedTitle = listing.title
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        return output.includes(escapedTitle);
      })
    );
  });

  test("formatted message contains the company name", () => {
    fc.assert(
      fc.property(arbJobListing, (listing) => {
        const output = formatListing(listing);
        const escapedCompany = listing.company
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        return output.includes(escapedCompany);
      })
    );
  });

  test("formatted message contains the location", () => {
    fc.assert(
      fc.property(arbJobListing, (listing) => {
        const output = formatListing(listing);
        const escapedLocation = listing.location
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        return output.includes(escapedLocation);
      })
    );
  });

  test("formatted message contains the application URL as a clickable hyperlink", () => {
    fc.assert(
      fc.property(arbJobListing, (listing) => {
        const output = formatListing(listing);
        // URL may be HTML-escaped in the href attribute
        const escapedUrl = listing.url
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        // Must appear inside an <a href="..."> tag
        return output.includes(`href="${escapedUrl}"`) && output.includes("<a ") && output.includes("</a>");
      })
    );
  });

  test("formatted message is a non-empty string for any valid listing", () => {
    fc.assert(
      fc.property(arbJobListing, (listing) => {
        const output = formatListing(listing);
        return typeof output === "string" && output.length > 0;
      })
    );
  });
});
