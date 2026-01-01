import { chromium } from "playwright";
import type { RawJobListing } from "../../types.js";
import type { PortalScraper } from "../base.js";

const PORTAL_NAME = "remotive";

/**
 * Scrapes remote developer job listings from Remotive.
 * Implements PortalScraper (Requirements 5.1, 6.1, 6.2).
 */
export class RemotiveScraper implements PortalScraper {
  readonly name = PORTAL_NAME;

  async scrape(): Promise<RawJobListing[]> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(
        "https://remotive.com/remote-jobs/software-dev",
        { waitUntil: "domcontentloaded", timeout: 30_000 }
      );

      // Wait for job list items
      await page.waitForSelector("li.job-list-item", { timeout: 15_000 }).catch(() => null);

      const rawListings = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("li.job-list-item"));
        return items.map((item) => {
          const titleEl = item.querySelector("h2 a, .position a");
          const companyEl = item.querySelector(".company_name, .company");
          const tagsEls = Array.from(item.querySelectorAll(".tag, .job-tag"));
          const href = (titleEl as HTMLAnchorElement | null)?.href;
          return {
            title: titleEl?.textContent?.trim(),
            company: companyEl?.textContent?.trim(),
            url: href,
            techTags: tagsEls.map((t) => t.textContent?.trim() ?? "").filter(Boolean),
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
          location: "Remote",
          remote: true,
          url: raw.url,
          techTags: raw.techTags?.map((t) => t.toLowerCase()),
        });
      }

      return listings;
    } finally {
      await browser.close();
    }
  }
}
