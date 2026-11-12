const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'sprint',
  password: process.env.PG_PASSWORD || 'sprint',
  database: process.env.PG_DATABASE || 'sprintboard',
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sprints (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  goal       TEXT,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'planned'
             CHECK (status IN ('planned','active','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);`;

const initSchema = () => pool.query(SCHEMA);

module.exports = { pool, initSchema };
