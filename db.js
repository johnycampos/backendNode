const { Pool } = require('pg');
require('dotenv').config();

const isRemoteDb = process.env.DATABASE_URL && (
  process.env.DATABASE_URL.includes('sslmode=require') ||
  process.env.DATABASE_URL.includes('render.com') ||
  process.env.DB_SSL === 'true'
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false
});

module.exports = {
  pool
};
