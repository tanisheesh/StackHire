-- Telegram Job Bot — PostgreSQL schema

CREATE TABLE IF NOT EXISTS job_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  company     TEXT NOT NULL,
  location    TEXT,
  remote      BOOLEAN NOT NULL DEFAULT false,
  tech_tags   TEXT[] NOT NULL DEFAULT '{}',
  url         TEXT NOT NULL UNIQUE,
  portal      TEXT NOT NULL,
  posted_at   TIMESTAMPTZ,
  scraped_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expired     BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS preference_profiles (
  telegram_user_id  TEXT PRIMARY KEY,  -- SHA-256 hashed
  tech_stack        TEXT[] NOT NULL DEFAULT '{}',
  role_type         TEXT,
  seniority         TEXT,
  location          TEXT,
  remote            BOOLEAN,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
