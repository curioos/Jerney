const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        author VARCHAR(100) NOT NULL DEFAULT 'Anonymous',
        emoji VARCHAR(10) DEFAULT '✨',
        created_by VARCHAR(100) NOT NULL DEFAULT 'anonymous',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        author VARCHAR(100) NOT NULL DEFAULT 'Anonymous',
        content TEXT NOT NULL,
        created_by VARCHAR(100) NOT NULL DEFAULT 'anonymous',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    `);

    console.log('✅ Database tables initialized');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
