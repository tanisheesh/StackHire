import type { JobListing, MatchResult, ParsedQuery, PreferenceProfile } from "./types";

// Scoring weights
const SCORE_TECH_TAG = 2;
const SCORE_ROLE_TYPE = 3;
const SCORE_SENIORITY = 2;
const SCORE_LOCATION = 3;
const SCORE_REMOTE = 2;

const MAX_RESULTS = 10;

/**
 * Returns true when the query has no explicit attributes set.
 */
function isEmptyQuery(query: ParsedQuery): boolean {
  return (
    query.techStack.length === 0 &&
    query.roleType === null &&
    query.seniority === null &&
    query.location === null &&
    query.remote === null
  );
}

/**
 * Merges a preference profile into a query, returning an effective query.
 */
function applyProfileFallback(
  query: ParsedQuery,
  profile: PreferenceProfile
): ParsedQuery {
  return {
    ...query,
    techStack: profile.techStack,
    roleType: profile.roleType,
    seniority: profile.seniority,
    location: profile.location,
    remote: profile.remote,
  };
}

/**
 * Scores a single listing against the effective query.
 */
function scoreListing(listing: JobListing, query: ParsedQuery): number {
  let score = 0;
  const titleLower = listing.title.toLowerCase();

  // Tech tags: +2 per matching tag
  if (query.techStack.length > 0) {
    const queryTech = query.techStack.map((t) => t.toLowerCase());
    for (const tag of listing.techTags) {
      if (queryTech.includes(tag)) {
        score += SCORE_TECH_TAG;
      }
    }
  }

  // Role type: +3 if listing title contains the role type string
  if (query.roleType !== null) {
    if (titleLower.includes(query.roleType.toLowerCase())) {
      score += SCORE_ROLE_TYPE;
    }
  }

  // Seniority: +2 if listing title contains the seniority string
  if (query.seniority !== null) {
    if (titleLower.includes(query.seniority.toLowerCase())) {
      score += SCORE_SENIORITY;
    }
  }

  // Location: +3 if listing location contains query location (case-insensitive)
  if (query.location !== null) {
    if (listing.location.toLowerCase().includes(query.location.toLowerCase())) {
      score += SCORE_LOCATION;
    }
  }

  // Remote: +2 if query wants remote and listing is remote
  if (query.remote === true && listing.remote === true) {
    score += SCORE_REMOTE;
  }

  return score;
}

/**
 * Matches and ranks job listings against a parsed query and optional profile.
 *
 * - Filters out expired listings.
 * - Applies location filter (listing location matches OR listing.remote === true).
 * - Applies tech stack filter (at least one matching tag when tech is specified).
 * - Falls back to profile attributes when query has no explicit attributes.
 * - Returns top 10 results sorted by score descending.
 */
export function matchListings(
  query: ParsedQuery,
  profile: PreferenceProfile | null,
  listings: JobListing[]
): MatchResult[] {
  // Apply profile fallback when query has no explicit attributes
  const effectiveQuery =
    isEmptyQuery(query) && profile !== null
      ? applyProfileFallback(query, profile)
      : query;

  const queryTech = effectiveQuery.techStack.map((t) => t.toLowerCase());

  const filtered = listings.filter((listing) => {
    // 1. Exclude expired listings
    if (listing.expired) return false;

    // 2. Tech stack filter: exclude listings with zero matching tags when tech is specified
    if (queryTech.length > 0) {
      const hasMatch = listing.techTags.some((tag) => queryTech.includes(tag));
      if (!hasMatch) return false;
    }

    // 3. Location filter: only include listings matching location
    // Remote listings bypass location filter only if query also requests remote
    if (effectiveQuery.location !== null) {
      const locationMatches = listing.location
        .toLowerCase()
        .includes(effectiveQuery.location.toLowerCase());
      const remoteOk = effectiveQuery.remote === true && listing.remote === true;
      if (!locationMatches && !remoteOk) return false;
    }

    return true;
  });

  const results: MatchResult[] = filtered.map((listing) => ({
    listing,
    score: scoreListing(listing, effectiveQuery),
  }));

  results.sort((a, b) => b.score - a.score);

  // Don't cap here — let the caller decide how many to use
  return results;
}
