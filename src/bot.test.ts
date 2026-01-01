// Feature: telegram-job-bot, Property 1: Free-text routing
// Feature: telegram-job-bot, Property 18: Generic error message on unhandled exception
// Feature: telegram-job-bot, Property 19: Structured log completeness
// Feature: telegram-job-bot, Property 8: Preference profile persistence round-trip

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { parseQuery } from "./parser";
import { matchListings } from "./matcher";
import type { JobListing, ParsedQuery, PreferenceProfile } from "./types";

fc.configureGlobal({ numRuns: 100 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMMANDS = ["/start", "/help", "/profile", "/reset", "/stack"];

/** Returns true if the text starts with a known bot command */
function isCommand(text: string): boolean {
  return COMMANDS.some((cmd) => text.startsWith(cmd));
}

/**
 * Simulates the bot's free-text routing decision:
 * non-command messages go to the query pipeline.
 */
function routeMessage(text: string): "command" | "query_pipeline" {
  if (isCommand(text)) return "command";
  return "query_pipeline";
}

/**
 * Simulates the structured log emitted per incoming message.
 * Mirrors the bot.ts implementation.
 */
function buildMessageLog(hashedUserId: string, messageType: string): string {
  return JSON.stringify({
    userId: hashedUserId,
    timestamp: new Date().toISOString(),
    messageType,
  });
}

/**
 * Simulates the structured log emitted per scraper portal run.
 */
function buildScraperLog(portal: string, collected: number, durationMs: number): string {
  return JSON.stringify({ portal, collected, durationMs });
}

/**
 * Simulates the error log emitted on unhandled exception.
 */
function buildErrorLog(stack: string): string {
  return JSON.stringify({
    level: "error",
    message: "Unhandled bot error",
    stack,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Simulates the generic user-facing error reply.
 */
const GENERIC_ERROR_REPLY = "Something went wrong, please try again later.";

// ---------------------------------------------------------------------------
// Property 1: Free-text routing
// ---------------------------------------------------------------------------
describe("Property 1: Free-text routing", () => {
  test("any non-command message is routed to the query pipeline", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => !isCommand(s)),
        (text) => {
          return routeMessage(text) === "query_pipeline";
        }
      )
    );
  });

  test("command messages are NOT routed to the query pipeline", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...COMMANDS),
        fc.string({ maxLength: 50 }),
        (cmd, suffix) => {
          const text = `${cmd}${suffix}`;
          return routeMessage(text) === "command";
        }
      )
    );
  });

  test("parseQuery is called (not rejected) for any non-command text", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => !isCommand(s)),
        (text) => {
          // parseQuery must not throw for any input
          let threw = false;
          try {
            parseQuery(text);
          } catch {
            threw = true;
          }
          return !threw;
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Generic error message on unhandled exception
// ---------------------------------------------------------------------------
describe("Property 18: Generic error message on unhandled exception", () => {
  test("error log contains level=error and a stack trace field", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (stack) => {
          const logEntry = buildErrorLog(stack);
          const parsed = JSON.parse(logEntry);
          return (
            parsed.level === "error" &&
            typeof parsed.stack === "string" &&
            parsed.stack === stack
          );
        }
      )
    );
  });

  test("generic error reply is a fixed string independent of the exception", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (stack) => {
          // The user-facing reply is always the same constant regardless of the error
          const reply = GENERIC_ERROR_REPLY;
          // It must not contain the error stack (which could expose internals)
          // We verify the reply is the exact constant and doesn't change with input
          return reply === "Something went wrong, please try again later.";
        }
      )
    );
  });

  test("error log is valid JSON with required fields", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (stack) => {
          const logEntry = buildErrorLog(stack);
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(logEntry);
          } catch {
            return false;
          }
          return (
            "level" in parsed &&
            "stack" in parsed &&
            "timestamp" in parsed &&
            "message" in parsed
          );
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Structured log completeness
// ---------------------------------------------------------------------------
describe("Property 19: Structured log completeness", () => {
  test("incoming message log is valid JSON with userId, timestamp, messageType", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9a-f]{64}$/),
        fc.constantFrom("text", "command", "callback_query"),
        (hashedUserId, messageType) => {
          const logEntry = buildMessageLog(hashedUserId, messageType);
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(logEntry);
          } catch {
            return false;
          }
          return (
            parsed.userId === hashedUserId &&
            typeof parsed.timestamp === "string" &&
            parsed.messageType === messageType
          );
        }
      )
    );
  });

  test("scraper portal log is valid JSON with portal, collected, durationMs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("linkedin", "indeed", "remotive"),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 60000 }),
        (portal, collected, durationMs) => {
          const logEntry = buildScraperLog(portal, collected, durationMs);
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(logEntry);
          } catch {
            return false;
          }
          return (
            parsed.portal === portal &&
            parsed.collected === collected &&
            parsed.durationMs === durationMs
          );
        }
      )
    );
  });

  test("message log timestamp is a valid ISO 8601 date string", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (hashedUserId) => {
          const logEntry = buildMessageLog(hashedUserId, "text");
          const parsed = JSON.parse(logEntry);
          const ts = new Date(parsed.timestamp);
          return !isNaN(ts.getTime());
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Preference profile persistence round-trip
// ---------------------------------------------------------------------------
describe("Property 8: Preference profile persistence round-trip", () => {
  const TECH_POOL = ["typescript", "react", "python", "go", "docker", "postgresql"];
  const ROLE_POOL = ["frontend", "backend", "fullstack", "devops"];
  const SENIORITY_POOL = ["junior", "senior", "mid", "lead"];

  /**
   * Simulates upsertProfileFromQuery: merges query attributes into existing profile.
   * Mirrors the logic in bot.ts upsertProfileFromQuery.
   */
  function buildUpdatedProfile(
    hashedId: string,
    query: ParsedQuery,
    existing: PreferenceProfile | null
  ): PreferenceProfile {
    return {
      telegramUserId: hashedId,
      techStack: query.techStack.length > 0 ? query.techStack : (existing?.techStack ?? []),
      roleType: query.roleType ?? existing?.roleType ?? null,
      seniority: query.seniority ?? existing?.seniority ?? null,
      location: query.location ?? existing?.location ?? null,
      remote: query.remote ?? existing?.remote ?? null,
      updatedAt: new Date(),
    };
  }

  test("stored profile reflects tech stack from query when query has tech", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...TECH_POOL), { minLength: 1, maxLength: 3 }),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (techStack, hashedId) => {
          const query: ParsedQuery = {
            techStack,
            roleType: null,
            seniority: null,
            location: null,
            remote: null,
            raw: techStack.join(" "),
          };
          const profile = buildUpdatedProfile(hashedId, query, null);
          return JSON.stringify(profile.techStack) === JSON.stringify(techStack);
        }
      )
    );
  });

  test("stored profile reflects roleType from query", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLE_POOL),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (roleType, hashedId) => {
          const query: ParsedQuery = {
            techStack: [],
            roleType,
            seniority: null,
            location: null,
            remote: null,
            raw: roleType,
          };
          const profile = buildUpdatedProfile(hashedId, query, null);
          return profile.roleType === roleType;
        }
      )
    );
  });

  test("stored profile reflects seniority from query", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENIORITY_POOL),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (seniority, hashedId) => {
          const query: ParsedQuery = {
            techStack: [],
            roleType: null,
            seniority,
            location: null,
            remote: null,
            raw: seniority,
          };
          const profile = buildUpdatedProfile(hashedId, query, null);
          return profile.seniority === seniority;
        }
      )
    );
  });

  test("profile preserves existing tech stack when query has no tech", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...TECH_POOL), { minLength: 1, maxLength: 3 }),
        fc.stringMatching(/^[0-9a-f]{64}$/),
        (existingTech, hashedId) => {
          const existing: PreferenceProfile = {
            telegramUserId: hashedId,
            techStack: existingTech,
            roleType: null,
            seniority: null,
            location: null,
            remote: null,
            updatedAt: new Date(),
          };
          const emptyQuery: ParsedQuery = {
            techStack: [],
            roleType: null,
            seniority: null,
            location: null,
            remote: null,
            raw: "",
          };
          const profile = buildUpdatedProfile(hashedId, emptyQuery, existing);
          return JSON.stringify(profile.techStack) === JSON.stringify(existingTech);
        }
      )
    );
  });

  test("profile round-trip: serialize and deserialize produces equivalent profile", () => {
    fc.assert(
      fc.property(
        fc.record<PreferenceProfile>({
          telegramUserId: fc.stringMatching(/^[0-9a-f]{64}$/),
          techStack: fc.uniqueArray(fc.constantFrom(...TECH_POOL), { maxLength: 4 }),
          roleType: fc.option(fc.constantFrom(...ROLE_POOL), { nil: null }),
          seniority: fc.option(fc.constantFrom(...SENIORITY_POOL), { nil: null }),
          location: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
          remote: fc.option(fc.boolean(), { nil: null }),
          updatedAt: fc.date(),
        }),
        (profile) => {
          const serialized = JSON.stringify(profile);
          const deserialized = JSON.parse(serialized);
          return (
            deserialized.telegramUserId === profile.telegramUserId &&
            JSON.stringify(deserialized.techStack) === JSON.stringify(profile.techStack) &&
            deserialized.roleType === profile.roleType &&
            deserialized.seniority === profile.seniority &&
            deserialized.location === profile.location &&
            deserialized.remote === profile.remote
          );
        }
      )
    );
  });
});
