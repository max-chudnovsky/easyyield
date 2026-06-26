# Blog System with R2 Image Storage

This blog system is designed to work seamlessly with Cloudflare R2 for image storage and uses HTML markup for content.

## 🚀 Quick Start

1. **Apply the migration:**
   ```bash
   npm run migrate:blog
   ```

2. **Upload images via API:**
   ```javascript
   const formData = new FormData();
   formData.append('image', imageFile);

   const response = await fetch('/api/blog/upload-image', {
     method: 'POST',
     body: formData
   });

   const result = await response.json();
   console.log(result.data.url); // Full R2 URL
   ```

3. **Create a blog post:**
   ```javascript
   const post = await blogService.createPost({
     title: 'My Blog Post',
     content: '<p>Content with <img src="https://images.erikred.ca/blog/image.jpg" alt="Image"></p>',
     category_id: 'category-uuid',
     featured_image: 'blog/hero-image.jpg'
   });
   ```

## 📸 Image Storage

### R2 Configuration
- **Bucket:** `erikred`
- **Binding:** `IMAGES`
- **Public URL:** `https://images.erikred.ca`
- **File Structure:** `blog/{timestamp}-{uuid}.{ext}`

### Supported Formats
- JPEG, PNG, GIF, WebP
- Max file size: 10MB
- Automatic optimization and caching

## 📝 Content Format

### HTML Markup
Store your blog content as HTML with embedded images:

```html
<h2>My Recipe</h2>
<p>This is a delicious recipe!</p>

<img src="https://images.erikred.ca/blog/recipe.jpg"
     alt="Finished dish"
     class="recipe-image">

<h3>Ingredients:</h3>
<ul>
  <li>Ingredient 1</li>
  <li>Ingredient 2</li>
</ul>
```

### Automatic Image Processing
The system automatically:
- Converts relative image URLs to full R2 URLs
- Processes featured images
- Optimizes image delivery

## �️ Frontend Components

### BlogPost Component
Display individual blog posts with full content:

```astro
---
import BlogPost from '../components/BlogPost.astro';
---

<BlogPost post={postData} />
```

### BlogList Component
Display a grid of blog post previews:

```astro
---
import BlogList from '../components/BlogList.astro';
---

<BlogList posts={posts} title="Latest Posts" />
```

### Available Pages
- `/blog` - List all blog posts
- `/blog/[slug]` - Individual blog post
- `/blog/category/[slug]` - Posts by category
- `/admin/blog` - Admin dashboard
- `/admin/blog/new` - Create new post

## �🛠️ API Endpoints

### Image Upload
```
POST /api/blog/upload-image
Content-Type: multipart/form-data

Response:
{
  "success": true,
  "data": {
    "url": "https://images.erikred.ca/blog/1234567890-uuid.jpg",
    "filename": "blog/1234567890-uuid.jpg",
    "size": 245760,
    "type": "image/jpeg"
  }
}
```

### Blog Posts
```
GET  /api/blog/posts          # List all posts
POST /api/blog/posts          # Create new post
GET  /api/blog/posts/[id]     # Get single post
PUT  /api/blog/posts/[id]     # Update post
DELETE /api/blog/posts/[id]   # Delete post
```

### Categories
```
GET  /api/blog/categories     # List all categories
POST /api/blog/categories     # Create new category
```

## 🎨 Utility Functions

### Generate Image Tags
```javascript
import { R2ImageUtils } from '../utils/r2-images';

// Simple image
const imgTag = R2ImageUtils.generateImageTag('blog/image.jpg', {
  alt: 'Alt text',
  class: 'blog-image'
});

// With caption
const imgWithCaption = R2ImageUtils.generateImageTag('blog/image.jpg', {
  alt: 'Alt text',
  class: 'blog-image',
  caption: 'Image caption'
});
```

### Process Content Images
```javascript
// Automatically convert relative URLs to full R2 URLs
const processedContent = R2ImageUtils.processContentImages(htmlContent);
```

## 📊 Database Schema

### blog_posts
- `id` - UUID primary key
- `title` - Post title
- `content` - HTML content with embedded images
- `excerpt` - Short summary
- `category_id` - Foreign key to blog_categories
- `published_at` - Publication timestamp
- `updated_at` - Last update timestamp
- `slug` - URL-friendly identifier
- `featured_image` - R2 filename (without full URL)

### blog_categories
- `id` - UUID primary key
- `name` - Category name
- `slug` - URL-friendly identifier
- `description` - Category description
- `created_at` - Creation timestamp

## 🔄 WordPress Migration

When migrating from WordPress:

1. **Extract images** from WordPress uploads
2. **Upload to R2** using the upload API
3. **Replace image URLs** in content with R2 URLs
4. **Import posts** using the blog service

The system handles URL conversion automatically when retrieving posts.

### Migration Script
```bash
node scripts/migrate-wordpress.js path/to/wordpress-export.xml
```

## 🏗️ Development

### Adding New Features
1. Update the database schema in `/src/models/schema.sql`
2. Create a new migration script
3. Update TypeScript interfaces in `/src/models/Blog.ts`
4. Add service methods in `/src/lib/services/blogService.ts`
5. Create API endpoints in `/src/pages/api/blog/`
6. Build frontend components in `/src/components/`
7. Create pages in `/src/pages/`

### File Structure
```
src/
├── components/
│   ├── BlogPost.astro     # Individual post display
│   └── BlogList.astro     # Post listing grid
├── lib/services/
│   └── blogService.ts     # Business logic layer
├── models/
│   ├── Blog.ts           # TypeScript interfaces
│   └── schema.sql        # Database schema
├── pages/
│   ├── api/blog/         # REST API endpoints
│   ├── admin/blog/       # Admin interface
│   └── blog/             # Public blog pages
└── utils/
    └── r2-images.ts      # R2 image utilities
```

## 🚀 Deployment

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

3. **Run migrations on remote:**
   ```bash
   wrangler d1 execute erikred-db --remote --file=migrations/0005_add_blog_tables.sql
   ```

The blog system is now ready for content creation and management!
