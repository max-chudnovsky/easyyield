-- Unify velesco's legacy `subscribers` table into the canonical cms-users `users`
-- model (an email-only subscriber = a users row with password_hash NULL +
-- promotional_email_consent=1). Backfills the ~290 active subscribers so the
-- unified Subscribers admin (which reads users WHERE promotional_email_consent=1)
-- shows them. Going forward, velesco's native subscribe/verify dual-write to users
-- to keep them in sync. Idempotent: re-running updates consent and skips rows
-- already present.

-- 1) Existing users whose email matches an active subscriber: mark consented +
--    carry over verification timestamp and unsubscribe token.
UPDATE users SET
  promotional_email_consent = 1,
  email_verified_at = COALESCE(email_verified_at,
    (SELECT s.verified_at FROM subscribers s
       WHERE lower(s.email) = lower(users.email) AND s.is_active = 1 AND s.is_verified = 1 LIMIT 1)),
  unsubscribe_token = COALESCE(unsubscribe_token,
    (SELECT s.unsubscribe_token FROM subscribers s
       WHERE lower(s.email) = lower(users.email) AND s.is_active = 1 LIMIT 1)),
  updated_at = datetime('now')
WHERE lower(email) IN (SELECT lower(email) FROM subscribers WHERE is_active = 1);

-- 2) Active subscribers with no matching users row: insert as email-only subscribers.
INSERT INTO users (
  id, email, name, password_hash, role, status, language_code,
  promotional_email_consent, transactional_email_consent,
  email_verified_at, unsubscribe_token, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),
  s.email,
  NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''),
  NULL, 'user', 'active', 'en',
  1, 0,
  CASE WHEN s.is_verified = 1 THEN s.verified_at ELSE NULL END,
  s.unsubscribe_token,
  COALESCE(s.subscribed_at, datetime('now')),
  datetime('now')
FROM subscribers s
WHERE s.is_active = 1
  AND lower(s.email) NOT IN (SELECT lower(email) FROM users);

-- 3) Verified subscribers whose verified_at was NULL (is_verified=1 set without a
--    timestamp): stamp email_verified_at from a fallback so the verified count is
--    accurate. Idempotent (COALESCE only fills NULLs).
UPDATE users SET email_verified_at = COALESCE(email_verified_at,
    (SELECT COALESCE(s.verified_at, s.subscribed_at, datetime('now')) FROM subscribers s
       WHERE lower(s.email) = lower(users.email) AND s.is_active = 1 AND s.is_verified = 1 LIMIT 1))
WHERE email_verified_at IS NULL
  AND lower(email) IN (SELECT lower(email) FROM subscribers WHERE is_active = 1 AND is_verified = 1);
