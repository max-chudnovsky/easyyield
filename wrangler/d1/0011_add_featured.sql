-- Add featured column to blog_posts (1 = featured, shown first in all listings)
ALTER TABLE blog_posts ADD COLUMN featured INTEGER DEFAULT 0;
