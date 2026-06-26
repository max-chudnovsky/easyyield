-- Align velesco `products` with the canonical cms-products schema.
-- The module's ProductService.update writes whatever fields it is given
-- (e.g. the update-amazon-prices cron sets amazon_rating); these two columns
-- were the only gap between velesco's table and cms-products/migrations/0001.
ALTER TABLE products ADD COLUMN amazon_rating REAL;
ALTER TABLE products ADD COLUMN amazon_review_count INTEGER;
