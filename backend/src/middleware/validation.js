const Joi = require('joi');
const xss = require('xss');

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeInput(data) {
  if (typeof data === 'string') {
    return xss(data, {
      whiteList: {},
      stripIgnoredTag: true
    });
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const key in data) {
      sanitized[key] = sanitizeInput(data[key]);
    }
    return sanitized;
  }

  return data;
}

/**
 * Validate post creation/update
 */
function validatePost(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().trim().required().min(1).max(255),
    content: Joi.string().trim().required().min(1).max(10000),
    author: Joi.string().trim().max(100).default('Anonymous'),
    emoji: Joi.string().trim().max(10).default('✨')
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    error.details = error.details;
    return next(error);
  }

  // Sanitize the validated data
  req.body = sanitizeInput(value);
  next();
}

/**
 * Validate comment creation
 */
function validateComment(req, res, next) {
  const schema = Joi.object({
    post_id: Joi.number().integer().required(),
    author: Joi.string().trim().max(100).default('Anonymous'),
    content: Joi.string().trim().required().min(1).max(5000)
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    error.details = error.details;
    return next(error);
  }

  // Sanitize the validated data
  req.body = sanitizeInput(value);
  next();
}

/**
 * Validate auth login
 */
function validateLogin(req, res, next) {
  const schema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required()
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    error.details = error.details;
    return next(error);
  }

  req.body = value;
  next();
}

module.exports = {
  sanitizeInput,
  validatePost,
  validateComment,
  validateLogin
};
