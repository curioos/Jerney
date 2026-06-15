const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { verifyToken } = require('../middleware/auth');
const { validatePost } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// Stricter rate limiting for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many write requests, please try again later'
});

/**
 * GET /api/posts
 * Get all posts (newest first) - Public endpoint
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
       FROM posts p 
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/posts/:id
 * Get single post with comments - Public endpoint
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ID is a number
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const commentsResult = await pool.query(
      'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json({
      ...postResult.rows[0],
      comments: commentsResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/posts
 * Create post - Protected endpoint
 */
router.post('/', writeLimiter, verifyToken, validatePost, async (req, res, next) => {
  const { title, content, author, emoji } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO posts (title, content, author, emoji, created_by) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [title, content, author || 'Anonymous', emoji || '✨', req.user.username]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/posts/:id
 * Update post - Protected endpoint
 */
router.put('/:id', writeLimiter, verifyToken, validatePost, async (req, res, next) => {
  const { id } = req.params;
  const { title, content, author, emoji } = req.body;

  try {
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    // Check if post exists and user is the creator
    const postCheck = await pool.query(
      'SELECT created_by FROM posts WHERE id = $1',
      [id]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (postCheck.rows[0].created_by !== req.user.username) {
      return res.status(403).json({ error: 'Unauthorized: You can only edit your own posts' });
    }

    const result = await pool.query(
      `UPDATE posts 
       SET title = $1, content = $2, author = $3, emoji = $4, updated_at = NOW() 
       WHERE id = $5 
       RETURNING *`,
      [title, content, author || 'Anonymous', emoji || '✨', id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/posts/:id
 * Delete post - Protected endpoint
 */
router.delete('/:id', writeLimiter, verifyToken, async (req, res, next) => {
  const { id } = req.params;

  try {
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    // Check if post exists and user is the creator
    const postCheck = await pool.query(
      'SELECT created_by FROM posts WHERE id = $1',
      [id]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (postCheck.rows[0].created_by !== req.user.username) {
      return res.status(403).json({ error: 'Unauthorized: You can only delete your own posts' });
    }

    const result = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING *', [id]);
    res.json({ message: 'Post deleted successfully 🗑️' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
