import { chromium } from "playwright";
import type { RawJobListing } from "../../types.js";
import type { PortalScraper } from "../base.js";

const PORTAL_NAME = "linkedin";

/**
 * Scrapes remote developer job listings from LinkedIn.
 * Implements PortalScraper (Requirements 5.1, 6.1, 6.2).
 */
export class LinkedInScraper implements PortalScraper {
  readonly name = PORTAL_NAME;

  async scrape(): Promise<RawJobListing[]> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(
        "https://www.linkedin.com/jobs/search/?keywords=developer&f_WT=2&f_TPR=r86400",
        { waitUntil: "domcontentloaded", timeout: 30_000 }
      );

      // Wait for job cards to appear
      await page.waitForSelector(".job-search-card", { timeout: 15_000 }).catch(() => null);

      const rawListings = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".job-search-card"));
        return cards.map((card) => ({
          title: card.querySelector(".base-search-card__title")?.textContent?.trim(),
          company: card.querySelector(".base-search-card__subtitle")?.textContent?.trim(),
          location: card.querySelector(".job-search-card__location")?.textContent?.trim(),
          url: (card.querySelector("a.base-card__full-link") as HTMLAnchorElement | null)?.href,
        }));
      });

      const listings: RawJobListing[] = [];
      for (const raw of rawListings) {
        if (!raw.title || !raw.company || !raw.url) {
          console.warn(
            JSON.stringify({
              level: "warn",
              portal: PORTAL_NAME,
              message: "Discarding record missing required fields",
              title: raw.title,
              company: raw.company,
              url: raw.url,
            })
          );
          continue;
        }
        listings.push({
          portal: PORTAL_NAME,
          title: raw.title,
          company: raw.company,
          location: raw.location,
          url: raw.url,
          remote: raw.location?.toLowerCase().includes("remote") ?? false,
        });
      }

      return listings;
    } finally {
      await browser.close();
    }
  }
}
