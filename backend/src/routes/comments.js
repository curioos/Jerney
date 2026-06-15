const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { verifyToken } = require('../middleware/auth');
const { validateComment } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// Stricter rate limiting for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many comment requests, please try again later'
});

/**
 * GET /api/comments/post/:postId
 * Get comments for a post - Public endpoint
 */
router.get('/post/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const result = await pool.query(
      'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC',
      [postId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comments
 * Create comment - Protected endpoint
 */
router.post('/', writeLimiter, verifyToken, validateComment, async (req, res, next) => {
  const { post_id, author, content } = req.body;

  try {
    // Verify post exists
    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [post_id]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const result = await pool.query(
      'INSERT INTO comments (post_id, author, content, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [post_id, author || 'Anonymous', content, req.user.username]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/comments/:id
 * Delete comment - Protected endpoint
 */
router.delete('/:id', writeLimiter, verifyToken, async (req, res, next) => {
  const { id } = req.params;

  try {
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }

    // Check if comment exists and user is the creator
    const commentCheck = await pool.query(
      'SELECT created_by FROM comments WHERE id = $1',
      [id]
    );

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (commentCheck.rows[0].created_by !== req.user.username) {
      return res.status(403).json({ error: 'Unauthorized: You can only delete your own comments' });
    }

    const result = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING *', [id]);
    res.json({ message: 'Comment deleted 🗑️' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
