import { chromium } from "playwright";
import type { RawJobListing } from "../../types.js";
import type { PortalScraper } from "../base.js";

const PORTAL_NAME = "indeed";

/**
 * Scrapes remote developer job listings from Indeed.
 * Implements PortalScraper (Requirements 5.1, 6.1, 6.2).
 */
export class IndeedScraper implements PortalScraper {
  readonly name = PORTAL_NAME;

  async scrape(): Promise<RawJobListing[]> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(
        "https://www.indeed.com/jobs?q=developer&l=remote&fromage=1",
        { waitUntil: "domcontentloaded", timeout: 30_000 }
      );

      // Wait for job cards
      await page.waitForSelector('[data-testid="slider_item"]', { timeout: 15_000 }).catch(() => null);

      const rawListings = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="slider_item"]'));
        return cards.map((card) => {
          const titleEl = card.querySelector('[data-testid="jobTitle"] a, h2.jobTitle a');
          const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
          const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
          const href = (titleEl as HTMLAnchorElement | null)?.href;
          return {
            title: titleEl?.textContent?.trim(),
            company: companyEl?.textContent?.trim(),
            location: locationEl?.textContent?.trim(),
            url: href,
          };
        });
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
