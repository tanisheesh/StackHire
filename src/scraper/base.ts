import type { RawJobListing, ScraperResult } from "../types.js";

/** Interface that every portal scraper must implement. */
export interface PortalScraper {
  name: string;
  scrape(): Promise<RawJobListing[]>;
}

/**
 * Runs all portal scrapers concurrently, isolating failures per portal.
 * Logs structured JSON for each portal outcome (Requirements 5.4, 9.2).
 */
export async function runScraper(portals: PortalScraper[]): Promise<ScraperResult[]> {
  const results = await Promise.all(
    portals.map(async (portal): Promise<ScraperResult> => {
      const start = Date.now();
      try {
        const listings = await portal.scrape();
        const durationMs = Date.now() - start;
        const result: ScraperResult = {
          portal: portal.name,
          collected: listings.length,
          durationMs,
        };
        console.log(JSON.stringify(result));
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const result: ScraperResult = {
          portal: portal.name,
          collected: 0,
          durationMs,
          error: errorMessage,
        };
        console.log(JSON.stringify(result));
        return result;
      }
    })
  );
  return results;
}
