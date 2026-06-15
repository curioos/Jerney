/**
 * Validate required environment variables
 */
function validateEnv() {
  const requiredEnvs = [
    'DB_USER',
    'DB_PASSWORD',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'JWT_SECRET'
  ];

  const missing = requiredEnvs.filter(env => !process.env[env]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long');
    process.exit(1);
  }
}

module.exports = { validateEnv };
