import type { ParsedQuery } from "./types";

// Curated keyword lists
const TECH_STACK: string[] = [
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java", "Kotlin",
  "Swift", "C#", "C++", "Ruby", "PHP", "Scala", "Elixir", "Dart",
  "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt", "Node.js",
  "Express", "NestJS", "FastAPI", "Django", "Flask", "Spring", "Rails",
  "Laravel", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "GraphQL", "REST",
  "gRPC", "Terraform", "Ansible",
];

// Map lowercase -> canonical for fast lookup
const TECH_MAP = new Map<string, string>(
  TECH_STACK.map((t) => [t.toLowerCase(), t])
);

// Role types: [pattern, canonical]
const ROLE_TYPES: [string, string][] = [
  ["full-stack", "fullstack"],
  ["fullstack", "fullstack"],
  ["full stack", "fullstack"],
  ["frontend", "frontend"],
  ["front-end", "frontend"],
  ["front end", "frontend"],
  ["backend", "backend"],
  ["back-end", "backend"],
  ["back end", "backend"],
  ["devops", "devops"],
  ["dev ops", "devops"],
  ["mobile", "mobile"],
  ["machine learning", "machine learning"],
  ["data", "data"],
  ["ml", "ml"],
  ["ai", "ai"],
  ["platform", "platform"],
  ["infrastructure", "infrastructure"],
  ["infra", "infrastructure"],
  ["sre", "sre"],
  ["security", "security"],
];

const SENIORITY_LEVELS: string[] = [
  "junior", "mid", "senior", "lead", "principal", "staff", "intern", "entry",
];

const REMOTE_KEYWORDS: string[] = [
  "remote", "distributed", "anywhere", "work from home", "wfh", "fully remote",
];

const KNOWN_CITIES: string[] = [
  "Berlin", "London", "New York", "NYC", "San Francisco", "SF",
  "Austin", "Toronto", "Amsterdam", "Paris", "Bangalore", "Mumbai",
  "Singapore", "Sydney", "Dubai",
  // Countries
  "India", "Australia", "Canada", "Germany", "France", "Brazil",
  "Netherlands", "Spain", "Italy", "Poland", "Japan", "China",
  "Mexico", "Argentina", "Russia", "Sweden", "Norway", "Denmark",
  // More cities
  "Dublin", "Stockholm", "Oslo", "Copenhagen", "Zurich", "Vienna",
  "Warsaw", "Prague", "Budapest", "Lisbon", "Madrid", "Barcelona",
  "Milan", "Rome", "Helsinki", "Brussels", "Bangalore", "Hyderabad",
  "Chennai", "Pune", "Delhi", "Melbourne", "Brisbane", "Vancouver",
  "Montreal", "Seattle", "Boston", "Chicago", "Los Angeles", "LA",
  "New York City", "Miami", "Atlanta", "Denver", "Phoenix",
];

const KNOWN_CITIES_LOWER = new Map<string, string>(
  KNOWN_CITIES.map((c) => [c.toLowerCase(), c])
);

export function parseQuery(text: string): ParsedQuery {
  const lower = text.toLowerCase();

  // --- Tech stack ---
  const techStack: string[] = [];
  for (const [key, canonical] of TECH_MAP) {
    // Use word-boundary-like matching: surrounded by non-alphanumeric chars
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, "i");
    if (re.test(lower)) {
      techStack.push(canonical);
    }
  }

  // --- Role type ---
  let roleType: string | null = null;
  for (const [pattern, canonical] of ROLE_TYPES) {
    if (lower.includes(pattern)) {
      roleType = canonical;
      break;
    }
  }

  // --- Seniority ---
  let seniority: string | null = null;
  for (const level of SENIORITY_LEVELS) {
    const re = new RegExp(`\\b${level}\\b`, "i");
    if (re.test(lower)) {
      seniority = level;
      break;
    }
  }

  // --- Remote ---
  let remote: boolean | null = null;
  for (const kw of REMOTE_KEYWORDS) {
    if (lower.includes(kw)) {
      remote = true;
      break;
    }
  }

  // --- Location ---
  let location: string | null = null;

  // Check known city names first
  for (const [cityLower, cityCanonical] of KNOWN_CITIES_LOWER) {
    const escaped = cityLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) {
      // Preserve original casing from input
      const match = re.exec(text);
      location = match ? match[0] : cityCanonical;
      break;
    }
  }

  // If no known city found, try "in <place>", "at <place>", "based in <place>"
  if (!location) {
    const locationPatterns = [
      /\bbased in\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:\s*[,.]|$)/i,
      /\bin\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:\s*[,.]|$)/i,
      /\bat\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:\s*[,.]|$)/i,
    ];

    for (const pattern of locationPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const candidate = match[1].trim();
        // Skip if it's a remote keyword
        const isRemote = REMOTE_KEYWORDS.some((kw) =>
          candidate.toLowerCase().includes(kw)
        );
        if (!isRemote) {
          location = candidate;
          break;
        }
      }
    }
  }

  return {
    techStack,
    roleType,
    seniority,
    location,
    remote,
    raw: text,
  };
}
