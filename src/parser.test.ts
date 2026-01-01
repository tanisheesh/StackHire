// Feature: telegram-job-bot, Property 2: Query parsing extracts known keywords
import { describe, test } from "bun:test";
import fc from "fast-check";
import { parseQuery } from "./parser";

// Curated lists mirrored from parser.ts for use in arbitraries
const TECH_SAMPLES = [
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "React", "Vue",
  "PostgreSQL", "Docker", "Kubernetes", "AWS", "GraphQL", "Node.js",
];

const ROLE_SAMPLES: [string, string][] = [
  ["frontend", "frontend"],
  ["backend", "backend"],
  ["fullstack", "fullstack"],
  ["devops", "devops"],
  ["mobile", "mobile"],
];

const SENIORITY_SAMPLES = ["junior", "mid", "senior", "lead", "principal"];

const REMOTE_SAMPLES = ["remote", "distributed", "work from home", "wfh"];

const CITY_SAMPLES = ["Berlin", "London", "San Francisco", "Toronto", "Amsterdam"];

fc.configureGlobal({ numRuns: 100 });

describe("Property 2: Query parsing extracts known keywords", () => {
  test("tech stack keywords are extracted when present in input", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TECH_SAMPLES),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        (tech, prefix, suffix) => {
          const text = `${prefix} ${tech} ${suffix}`;
          const result = parseQuery(text);
          return result.techStack
            .map((t) => t.toLowerCase())
            .includes(tech.toLowerCase());
        }
      )
    );
  });

  test("role type keywords are extracted when present in input", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLE_SAMPLES),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        ([pattern, canonical], prefix, suffix) => {
          const text = `${prefix} ${pattern} ${suffix}`;
          const result = parseQuery(text);
          return result.roleType === canonical;
        }
      )
    );
  });

  test("seniority level is extracted when present in input", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENIORITY_SAMPLES),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        (level, prefix, suffix) => {
          // Ensure prefix/suffix don't accidentally contain word chars adjacent to the level
          const text = `${prefix} ${level} ${suffix}`;
          const result = parseQuery(text);
          return result.seniority === level;
        }
      )
    );
  });

  test("remote flag is set when remote keyword is present", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOTE_SAMPLES),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        (keyword, prefix, suffix) => {
          const text = `${prefix} ${keyword} ${suffix}`;
          const result = parseQuery(text);
          return result.remote === true;
        }
      )
    );
  });

  test("known city is extracted as location when present in input", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CITY_SAMPLES),
        fc.string({ maxLength: 20 }),
        fc.string({ maxLength: 20 }),
        (city, prefix, suffix) => {
          const text = `${prefix} ${city} ${suffix}`;
          const result = parseQuery(text);
          return (
            result.location !== null &&
            result.location.toLowerCase() === city.toLowerCase()
          );
        }
      )
    );
  });

  test("raw field always equals the original input text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const result = parseQuery(text);
        return result.raw === text;
      })
    );
  });

  test("input with no known keywords produces empty/null fields", () => {
    // Use strings that are purely numeric or special chars — no known keywords
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9!@#$%^&*()\-_=+[\]{};:'",.<>?/\\| ]{1,50}$/),
        (text) => {
          const result = parseQuery(text);
          return (
            result.techStack.length === 0 &&
            result.roleType === null &&
            result.seniority === null &&
            result.remote === null
          );
        }
      )
    );
  });
});
