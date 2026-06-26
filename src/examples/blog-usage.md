# Blog Component Usage Examples

The `Blog.astro` component is designed to be flexible and reusable across different contexts.

## Basic Usage

### On Front Page (Homepage)
```astro
---
// src/pages/index.astro
import Blog from '../components/Blog.astro';
import { BlogService } from '@cms/cms-blog';
import { env } from '../env';

const blogService = new BlogService(env.DB);
const posts = await blogService.listPosts(6); // Show only 6 latest posts
---

<Layout title="Easy Yield Inc">
  <!-- Other homepage content -->

  <Blog
    posts={posts}
    title="Latest From Our Blog"
    maxPosts={6}
    layout="grid"
    className="front-page"
    showExcerpt={true}
    showCategories={true}
  />

  <!-- More homepage content -->
</Layout>
```

### Full Blog Page
```astro
---
// src/pages/blog/index.astro
import Layout from '../../layouts/Layout.astro';
import Blog from '../../components/Blog.astro';
import { BlogService } from '@cms/cms-blog';
import { env } from '../../env';

const blogService = new BlogService(env.DB);
const posts = await blogService.listPosts(20); // Show more posts
---

<Layout title="Blog - Easy Yield Inc">
  <main>
    <Blog
      posts={posts}
      title="Our Blog"
      layout="grid"
      className="blog-page"
      showExcerpt={true}
      showCategories={true}
      showReadMore={true}
    />
  </main>
</Layout>
```

### Compact Sidebar Widget
```astro
---
// In any page's sidebar
import Blog from '../components/Blog.astro';
import { BlogService } from '@cms/cms-blog';
import { env } from '../env';

const blogService = new BlogService(env.DB);
const posts = await blogService.listPosts(3);
---

<aside>
  <Blog
    posts={posts}
    title="Recent Posts"
    maxPosts={3}
    layout="compact"
    showExcerpt={false}
    showCategories={false}
    showTitle={true}
  />
</aside>
```

### Category-Specific Blog
```astro
---
// src/pages/blog/category/[slug].astro
import Layout from '../../../layouts/Layout.astro';
import Blog from '../../../components/Blog.astro';
import { BlogService } from '@cms/cms-blog';
import { env } from '../../../env';

const { slug } = Astro.params;
const blogService = new BlogService(env.DB);

const category = await blogService.getCategoryBySlug(slug);
if (!category) {
  return Astro.redirect('/blog');
}

const posts = await blogService.getPostsByCategory(category.id);
---

<Layout title={`${category.name} - Blog - Easy Yield Inc`}>
  <main>
    <Blog
      posts={posts}
      title={`Posts in ${category.name}`}
      layout="list"
      className="blog-page"
    />
  </main>
</Layout>
```

## Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `posts` | `BlogPostWithCategory[]` | Required | Array of blog posts to display |
| `title` | `string` | "Latest Posts" | Title for the blog section |
| `showTitle` | `boolean` | `true` | Whether to show the title |
| `maxPosts` | `number` | `undefined` | Limit number of posts shown |
| `showExcerpt` | `boolean` | `true` | Whether to show post excerpts |
| `showCategories` | `boolean` | `true` | Whether to show post categories |
| `showReadMore` | `boolean` | `true` | Whether to show "Read More" links |
| `layout` | `'grid' \| 'list' \| 'compact'` | `'grid'` | Layout style |
| `className` | `string` | `''` | Additional CSS classes |

## Layout Options

- **grid**: Default card-based grid layout
- **list**: Horizontal layout with image on left, content on right
- **compact**: Smaller cards for sidebars or limited spaces

## Styling Classes

- `.front-page`: Optimized spacing for homepage use
- `.blog-page`: Standard blog page styling
- Custom classes can be added via the `className` prop