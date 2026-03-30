import type { RawJobListing } from "../../types.js";
import type { PortalScraper } from "../base.js";

const PORTAL_NAME = "adzuna";
const BASE_URL = "https://api.adzuna.com/v1/api/jobs";

// Fetch jobs from multiple countries and keywords for broader coverage
const COUNTRIES = ["gb", "us", "in", "au", "ca"];
const KEYWORDS = ["developer", "python", "javascript", "typescript", "react", "go", "node", "java", "devops", "fullstack"];
const RESULTS_PER_PAGE = 10;

interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  redirect_url: string;
  description: string;
  created: string;
  category: { label: string };
  contract_type?: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
}

export class AdzunaScraper implements PortalScraper {
  readonly name = PORTAL_NAME;

  private readonly appId: string;
  private readonly appKey: string;

  constructor(appId: string, appKey: string) {
    this.appId = appId;
    this.appKey = appKey;
  }

  async scrape(): Promise<RawJobListing[]> {
    const listings: RawJobListing[] = [];
    const seenUrls = new Set<string>();

    for (const country of COUNTRIES) {
      for (const keyword of KEYWORDS) {
        try {
          const url = `${BASE_URL}/${country}/search/1?app_id=${this.appId}&app_key=${this.appKey}&results_per_page=${RESULTS_PER_PAGE}&what=${encodeURIComponent(keyword)}&content-type=application/json`;

          const res = await fetch(url);
          if (!res.ok) continue;

          const data = (await res.json()) as AdzunaResponse;

          for (const job of data.results ?? []) {
            if (!job.title || !job.company?.display_name || !job.redirect_url) continue;
            if (seenUrls.has(job.redirect_url)) continue;
            seenUrls.add(job.redirect_url);

            const locationStr = job.location?.display_name ?? "";
            const isRemote = locationStr.toLowerCase().includes("remote") ||
              job.description?.toLowerCase().includes("remote");

            listings.push({
              portal: PORTAL_NAME,
              title: job.title,
              company: job.company.display_name,
              location: locationStr,
              remote: isRemote,
              url: job.redirect_url,
              techTags: extractTechTags(job.description ?? ""),
              postedAt: job.created,
            });
          }
        } catch {
          // skip failed keyword/country combo silently
        }
      }
    }

    console.log(JSON.stringify({ portal: PORTAL_NAME, collected: listings.length, timestamp: new Date().toISOString() }));
    return listings;
  }
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
