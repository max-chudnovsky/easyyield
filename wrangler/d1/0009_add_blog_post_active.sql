-- Add active column to blog_posts (1 = active/published, 0 = disabled/hidden)
ALTER TABLE blog_posts ADD COLUMN active INTEGER DEFAULT 1;
