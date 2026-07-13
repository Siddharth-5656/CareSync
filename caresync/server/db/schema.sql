-- ============================================================
-- CareSync Database Initialization Script
-- Run with: psql -U <user> -d <database> -f db/schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ============================================================
-- TABLE: users
-- Stores both "child" (account holder) and "parent" (tablet) rows.
-- Parents authenticate via a long-lived device_token issued at
-- pairing time instead of a password, since their UI is textless.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role                VARCHAR(10) NOT NULL CHECK (role IN ('parent', 'child')),
    name                VARCHAR(100) NOT NULL,
    email               VARCHAR(255) UNIQUE,
    password_hash       TEXT,
    join_code           CHAR(6) UNIQUE,
    join_code_expires_at TIMESTAMPTZ,
    paired_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    device_token        TEXT UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT child_requires_credentials CHECK (
        role <> 'child' OR (email IS NOT NULL AND password_hash IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_users_join_code ON users(join_code) WHERE join_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_device_token ON users(device_token) WHERE device_token IS NOT NULL;

-- ============================================================
-- TABLE: daily_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               VARCHAR(120) NOT NULL,
    category            VARCHAR(20) NOT NULL DEFAULT 'chore'
                        CHECK (category IN ('medicine', 'hydration', 'meal', 'exercise', 'chore', 'custom')),
    recurrence_type     VARCHAR(10) NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'once')),
    day_of_week         SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    specific_date       DATE,
    last_completed_date DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT weekly_requires_day CHECK (
        recurrence_type <> 'weekly' OR day_of_week IS NOT NULL
    ),
    CONSTRAINT once_requires_date CHECK (
        recurrence_type <> 'once' OR specific_date IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_parent_id ON daily_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_specific_date ON daily_tasks(specific_date) WHERE specific_date IS NOT NULL;

-- ============================================================
-- TABLE: system_state
-- ============================================================
CREATE TABLE IF NOT EXISTS system_state (
    parent_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_heartbeat_at   TIMESTAMPTZ,
    is_unlocked         BOOLEAN NOT NULL DEFAULT FALSE,
    last_unlock_date    DATE,
    unlocked_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
