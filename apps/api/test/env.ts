// Loaded before every e2e test file (jest setupFiles). Uses a separate database: vo_test.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/vo_test?schema=public';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.AUTH_RATE_LIMIT_PER_MIN = '10000';
process.env.LOGIN_MAX_FAILED_ATTEMPTS = '5';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.TRUST_PROXY = '0';
