D1 & Auth setup

1) Install node deps

   npm install

2) Install runtime dependencies for auth

   npm install bcryptjs dotenv

3) Run D1 migration

   Use Wrangler to apply the SQL in wrangler/d1/0001_create_users_sessions.sql to your D1 database:

   wrangler d1 execute --binding DB --file wrangler/d1/0001_create_users_sessions.sql

4) Secrets

   Ensure your .env contains JWT_SECRET and PRODUCTION_DB or that wrangler.toml points to the correct D1 database binding.

Notes

 - The auth endpoints are lightweight examples using env.DB (the binding name in wrangler.toml).
 - You should harden password rules, error handling, CSRF protection, and session management for production.
