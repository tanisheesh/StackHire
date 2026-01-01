import type { JobListing } from "./types.js";
import type { ParsedQuery } from "./types.js";

const BASE_URL = "https://api.adzuna.com/v1/api/jobs";
const DEFAULT_COUNTRIES = ["gb", "us", "in", "au", "ca"];

const LOCATION_TO_COUNTRY: Record<string, string> = {
  "brazil": "br", "brasil": "br",
  "india": "in", "bangalore": "in", "mumbai": "in", "delhi": "in", "hyderabad": "in", "chennai": "in", "pune": "in",
  "australia": "au", "sydney": "au", "melbourne": "au", "brisbane": "au",
  "canada": "ca", "toronto": "ca", "vancouver": "ca", "montreal": "ca",
  "uk": "gb", "london": "gb", "england": "gb", "manchester": "gb", "edinburgh": "gb",
  "usa": "us", "us": "us", "new york": "us", "san francisco": "us", "seattle": "us", "austin": "us",
  "germany": "de", "berlin": "de", "munich": "de", "hamburg": "de",
  "france": "fr", "paris": "fr",
  "singapore": "sg",
  "netherlands": "nl", "amsterdam": "nl",
  "spain": "es", "madrid": "es", "barcelona": "es",
  "italy": "it", "rome": "it", "milan": "it",
  "poland": "pl", "warsaw": "pl",
  "south africa": "za", "cape town": "za", "johannesburg": "za",
  "new zealand": "nz", "auckland": "nz",
  "russia": "ru", "moscow": "ru",
  "mexico": "mx",
  "argentina": "ar",
};

function detectCountry(location: string): string[] {
  const lower = location.toLowerCase();
  for (const [key, code] of Object.entries(LOCATION_TO_COUNTRY)) {
    if (lower.includes(key)) return [code];
  }
  // Unknown location — search all default countries
  return DEFAULT_COUNTRIES;
}

const TECH_KEYWORDS = [
  "typescript", "javascript", "python", "go", "rust", "java", "kotlin",
  "swift", "c#", "c++", "ruby", "php", "scala", "elixir", "dart",
  "react", "vue", "angular", "svelte", "next.js", "nuxt", "node.js",
  "express", "nestjs", "fastapi", "django", "flask", "spring", "rails",
  "laravel", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
  "docker", "kubernetes", "aws", "gcp", "azure", "graphql", "rest",
  "grpc", "terraform", "ansible",
];

function extractTechTags(text: string): string[] {
  const lower = text.toLowerCase();
  return TECH_KEYWORDS.filter((tech) => {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, "i").test(lower);
  });
}

/**
 * Builds a search keyword from the parsed query for Adzuna API.
 */
function buildSearchKeyword(query: ParsedQuery): string {
  const parts: string[] = [];
  if (query.techStack.length > 0) parts.push(query.techStack[0]);
  if (query.roleType) parts.push(query.roleType);
  if (parts.length === 0) parts.push("developer");
  return parts.join(" ");
}

/**
 * Live search Adzuna API with the user's query and return JobListing results.
 */
export async function liveSearch(
  query: ParsedQuery,
  appId: string,
  appKey: string
): Promise<JobListing[]> {
  const keyword = buildSearchKeyword(query);
  const listings: JobListing[] = [];
  const now = new Date();

  // Use location-specific country if provided, else search all default countries
  const countries = query.location ? detectCountry(query.location) : DEFAULT_COUNTRIES;

  const results = await Promise.all(
    countries.map(async (country) => {
      const countryListings: JobListing[] = [];
      try {
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          results_per_page: "20",
          what: keyword,
          "content-type": "application/json",
        });

        // Pass location to Adzuna for server-side filtering
        if (query.location) {
          params.set("where", query.location);
        }
        if (query.remote === true) {
          params.set("where", "remote");
        }

        const res = await fetch(`${BASE_URL}/${country}/search/1?${params}`);
        if (!res.ok) return countryListings;

        const data = await res.json() as { results?: Array<{
          title?: string;
          company?: { display_name?: string };
          location?: { display_name?: string };
          redirect_url?: string;
          description?: string;
          created?: string;
        }> };

        for (const job of data.results ?? []) {
          if (!job.title || !job.company?.display_name || !job.redirect_url) continue;

          const locationStr = job.location?.display_name ?? "";
          const isRemote = locationStr.toLowerCase().includes("remote") ||
            (job.description?.toLowerCase().includes("remote") ?? false);

          countryListings.push({
            id: crypto.randomUUID(),
            title: job.title,
            company: job.company.display_name,
            location: locationStr,
            remote: isRemote,
            techTags: extractTechTags(job.description ?? ""),
            url: job.redirect_url,
            portal: "adzuna",
            postedAt: job.created ? new Date(job.created) : null,
            scrapedAt: now,
            updatedAt: now,
            expired: false,
          });
        }
      } catch {
        // ignore per-country failures
      }
      return countryListings;
    })
  );

  // Flatten and deduplicate by URL
  const seenUrls = new Set<string>();
  for (const batch of results) {
    for (const listing of batch) {
      if (!seenUrls.has(listing.url)) {
        seenUrls.add(listing.url);
        listings.push(listing);
      }
    }
  }

  return listings;
}
