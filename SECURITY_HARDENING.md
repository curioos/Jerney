# Security Hardening Implementation Guide

## Overview
This document outlines the security improvements implemented in the Jerney application to address critical vulnerabilities identified in the security audit.

## Vulnerabilities Addressed

### 1. ✅ Authentication & Authorization
**Problem:** No authentication/authorization on API endpoints

**Solution:**
- Implemented JWT (JSON Web Token) authentication
- Added `/api/auth/login` endpoint for user authentication
- Protected all write operations (POST, PUT, DELETE) with `verifyToken` middleware
- Read operations (GET) remain public
- Added ownership checks: users can only modify/delete their own content

**Files:**
- `backend/src/routes/auth.js` - Authentication routes
- `backend/src/middleware/auth.js` - JWT verification middleware

**Usage:**
```bash
# Login to get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Use token in protected endpoints
curl -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Post", "content": "Content here"}'
```

### 2. ✅ Input Validation & XSS Prevention
**Problem:** No input validation; user content displayed without sanitization

**Solution:**
- Added Joi schema validation for all inputs
- Implemented XSS sanitization using the `xss` library
- Enforced field length limits (title: 255 chars, content: 10,000 chars)
- Validated emoji field
- All user input is sanitized before database storage

**Files:**
- `backend/src/middleware/validation.js` - Input validation and sanitization

**Validated Fields:**
- Posts: title (required), content (required), author (optional), emoji (optional)
- Comments: post_id (required), content (required), author (optional)
- Auth: username (alphanum, 3-30 chars), password (min 8 chars)

### 3. ✅ CORS Configuration
**Problem:** Unrestricted CORS allowing requests from any origin

**Solution:**
- Configured CORS to only accept requests from `FRONTEND_URL` environment variable
- Restricted HTTP methods to GET, POST, PUT, DELETE, OPTIONS
- Required Authorization header for protected routes
- Set credentials: true for cookie support

**Configuration:**
```javascript
app.use(cors({
  origin: FRONTEND_URL.split(',').map(url => url.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 4. ✅ Rate Limiting
**Problem:** No rate limiting; vulnerable to brute force and DoS attacks

**Solution:**
- Implemented general rate limit: 100 requests per IP per 15 minutes
- Implemented strict rate limit for write operations: 30 requests per IP per 15 minutes
- Comments have their own limit: 50 requests per IP per 15 minutes

**Files:**
- `backend/src/index.js` - General and strict limiters configured
- Applied in route files

### 5. ✅ Security Headers
**Problem:** Missing security headers (CSP, X-Frame-Options, etc.)

**Solution:**
- Added Helmet.js middleware for automatic security headers:
  - Content-Security-Policy
  - X-Frame-Options
  - X-Content-Type-Options
  - Strict-Transport-Security
  - X-XSS-Protection

**Configuration:**
```javascript
app.use(helmet());
```

### 6. ✅ Environment Validation
**Problem:** Missing environment configuration could cause runtime errors

**Solution:**
- Added environment variable validation on startup
- Validates required environment variables: DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME, JWT_SECRET
- Enforces JWT_SECRET minimum length (32 characters)
- Application exits with error message if configuration is invalid

**Files:**
- `backend/src/middleware/validateEnv.js` - Environment validation

### 7. ✅ Database Security
**Problem:** No audit trail or ownership tracking

**Solution:**
- Added `created_by` field to posts and comments tables
- Tracks which user created each post/comment
- Enforces ownership: users can only modify/delete their own content
- Returns 403 Forbidden for unauthorized modification attempts

### 8. ✅ Error Handling
**Problem:** Generic error handling without proper structure

**Solution:**
- Implemented centralized error handling middleware
- Validates input errors with detailed field information
- JWT errors return clear authentication failure messages
- Database constraint errors return appropriate HTTP status codes
- Production mode hides detailed error messages; development shows full error

**Files:**
- `backend/src/middleware/errorHandler.js` - Centralized error handling

### 9. ✅ Server Configuration
**Problem:** Server listening on 0.0.0.0 exposing all network interfaces

**Solution:**
- Changed server to listen on `localhost` only
- Should be fronted by reverse proxy (nginx, load balancer) for production
- Proper network isolation in deployment

## Setup Instructions

### 1. Update Dependencies
```bash
cd backend
npm install
```

New packages added:
- `helmet@^7.1.0` - Security headers
- `express-rate-limit@^7.1.5` - Rate limiting
- `jsonwebtoken@^9.1.2` - JWT authentication
- `xss@^1.0.14` - XSS sanitization
- `joi@^17.11.0` - Input validation

### 2. Configure Environment
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jerney_blog
PORT=5000
NODE_ENV=development
JWT_SECRET=your_long_secure_secret_key_at_least_32_characters
FRONTEND_URL=http://localhost:5173
```

**Important:** Change the default password and JWT_SECRET in production!

### 3. Update Frontend API Client
The frontend needs to be updated to:
1. Send Authorization header with JWT token
2. Handle 401 Unauthorized responses
3. Implement login flow

Example frontend update:
```javascript
// src/api.js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getAuthToken() {
  return localStorage.getItem('authToken');
}

function setAuthToken(token) {
  localStorage.setItem('authToken', token);
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = (username, password) => 
  api.post('/auth/login', { username, password });

export const createPost = (data) => api.post('/posts', data);
```

### 4. Database Migration
The database schema has been updated with:
- New `created_by` column in posts table
- New `created_by` column in comments table
- Indexes for performance optimization

These changes are automatically applied on next server startup via `initDB()` function.

## Testing

### Test 1: Authentication Required
```bash
# This should fail (no token)
curl -X POST http://localhost:5000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "content": "Test"}'
# Expected: 401 Unauthorized

# Login first
token=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' | jq -r '.token')

# Now create post with token
curl -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "content": "Test"}'
# Expected: 201 Created
```

### Test 2: Input Validation
```bash
# This should fail (title too short after trim)
curl -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"title": "", "content": "Test"}'
# Expected: 400 Validation failed
```

### Test 3: XSS Prevention
```bash
# This should be sanitized
curl -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test<script>alert(1)</script>", "content": "Test"}'
# Expected: Script tags removed from stored content
```

### Test 4: Rate Limiting
```bash
# Make multiple requests quickly
for i in {1..35}; do
  curl -s -X POST http://localhost:5000/api/posts \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"title": "Test", "content": "Test"}' | jq '.error' || echo "$i: success"
done
# Expected: After 30 requests, 429 Too Many Requests
```

### Test 5: Ownership Verification
```bash
# Create post as admin
post_id=$(curl -s -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "content": "Test"}' | jq -r '.id')

# Login as different user
admin2_token=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin2", "password": "admin123"}' | jq -r '.token')

# Try to delete post
curl -X DELETE http://localhost:5000/api/posts/$post_id \
  -H "Authorization: Bearer $admin2_token"
# Expected: 403 Unauthorized
```

## Production Deployment Checklist

- [ ] Change JWT_SECRET to a strong random value (min 32 characters)
- [ ] Change default admin password or use proper authentication system
- [ ] Use bcrypt for password hashing instead of plaintext
- [ ] Enable HTTPS/TLS at reverse proxy
- [ ] Configure FRONTEND_URL with production domain
- [ ] Set NODE_ENV=production
- [ ] Use environment variables for sensitive data
- [ ] Implement database backups
- [ ] Set up monitoring and logging
- [ ] Enable database SSL connections
- [ ] Configure WAF (Web Application Firewall) if available
- [ ] Regular security audits and dependency updates
- [ ] Implement database access controls
- [ ] Use secrets management system (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Enable SQL query logging for audit trail
- [ ] Implement automated backups and disaster recovery

## Future Security Improvements

1. **Password Hashing**: Replace plaintext password comparison with bcrypt
2. **OAuth Integration**: Add Google/GitHub OAuth for authentication
3. **HTTPS Enforcement**: Add HSTS headers and enforce HTTPS
4. **Database Row-Level Security**: Implement RLS in PostgreSQL
5. **Audit Logging**: Track all user actions and changes
6. **Two-Factor Authentication**: Add 2FA support
7. **CSRF Protection**: Add CSRF tokens for state-changing operations
8. **API Key Management**: Implement API keys for third-party access
9. **SQL Injection Testing**: Regular SQL injection vulnerability scanning
10. **Dependency Scanning**: Automated vulnerability scanning with Snyk/Dependabot

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT.io](https://jwt.io/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)

## Questions?

For questions about the security implementation, please open an issue or contact the security team.
