-- D1 migration: create account deletion request table
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  claimed_at TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_token ON account_deletion_requests(token);
CREATE INDEX IF NOT EXISTS idx_user_id ON account_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_expires_at ON account_deletion_requests(expires_at);
