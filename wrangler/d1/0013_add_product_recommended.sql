-- Add recommended column (1 = show in blog/front page, 0 = products page only)
ALTER TABLE products ADD COLUMN recommended INTEGER DEFAULT 1;
