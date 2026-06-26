-- Products table
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description_html TEXT,
  price REAL NOT NULL,
  sale_price REAL,
  quantity INTEGER NOT NULL,
  url TEXT, -- External website URL for the product
  detect_country INTEGER DEFAULT 1, -- Enable/disable country detection for URL (1=yes, 0=no)
  images TEXT, -- Comma-separated list of image URLs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  featured_product_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Join table for many-to-many relationship
CREATE TABLE product_category (
  product_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (product_id, category_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Blog posts table (minimal structure)
CREATE TABLE blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Can contain HTML with <img> tags or Markdown
  excerpt TEXT,
  category_id TEXT NOT NULL,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  slug TEXT UNIQUE,
  featured_image TEXT, -- Main post image URL
  FOREIGN KEY (category_id) REFERENCES blog_categories(id)
);

-- Blog categories table
CREATE TABLE blog_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Blog images table for tracking embedded images
CREATE TABLE blog_post_images (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  caption TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
);
