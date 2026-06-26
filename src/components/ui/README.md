# UI Components Documentation

A collection of modular, reusable UI components for the Easy Yield e-commerce platform.

## Components Overview

### 1. HeroSlider Component
A responsive image slider with autoplay, navigation, and dynamic content.

### 2. CategoriesSection Component  
A grid-based category showcase with hover effects and customizable layouts.

### 3. FeaturedProducts Component
A product grid with sorting options, badges, and shopping functionality.

### 4. Footer Component
A comprehensive footer with company info, quick links, newsletter signup, and copyright.

---

## HeroSlider Component

### Features
- **Responsive Design**: Works on all screen sizes
- **Autoplay**: Automatic slide progression with configurable intervals
- **Navigation**: Previous/Next buttons and dot indicators
- **Keyboard Support**: Arrow key navigation
- **Lazy Loading**: Images load only when needed
- **TypeScript**: Full type safety with proper interfaces
- **Customizable**: Configurable height, timing, and display options

### Usage
```astro
---
import HeroSlider from '../components/ui/HeroSlider.astro'
import { heroSlides, sliderConfig } from '../data/slider'
---

<HeroSlider 
  slides={heroSlides}
  autoplay={sliderConfig.autoplay}
  autoplayInterval={sliderConfig.autoplayInterval}
  showNavigation={sliderConfig.showNavigation}
  showDots={sliderConfig.showDots}
  height={sliderConfig.height}
/>
```

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `slides` | `SlideContent[]` | Required | Array of slide content |
| `autoplay` | `boolean` | `true` | Enable automatic slide progression |
| `autoplayInterval` | `number` | `5000` | Time between slides (ms) |
| `showNavigation` | `boolean` | `true` | Show prev/next buttons |
| `showDots` | `boolean` | `true` | Show dot indicators |
| `height` | `string` | `"700px"` | Slider height |

---

## CategoriesSection Component

### Features
- **Grid Layout**: Responsive grid with configurable columns
- **Hover Effects**: Smooth animations and overlays
- **Gradient Backgrounds**: Customizable gradient colors for each category
- **SEO Optimized**: Proper alt texts and semantic HTML
- **Lazy Loading**: Performance optimized image loading

### Usage
```astro
---
import CategoriesSection from '../components/ui/CategoriesSection.astro'
import { categories, categoriesConfig } from '../data/categories'
---

<CategoriesSection 
  title={categoriesConfig.title}
  subtitle={categoriesConfig.subtitle}
  categories={categories}
  columns={categoriesConfig.columns}
/>
```

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `"Shop by Category"` | Section heading |
| `subtitle` | `string` | `"Browse our extensive..."` | Section description |
| `categories` | `Category[]` | Required | Array of category objects |
| `columns` | `object` | `{mobile: 1, tablet: 2, desktop: 4}` | Responsive grid configuration |

### Category Data Structure
```typescript
interface Category {
  id: string;
  name: string;
  description: string;
  image: string;
  alt: string;
  gradientFrom: string;
  gradientTo: string;
  href?: string;
}
```

---

## FeaturedProducts Component

### Features
- **Product Grid**: Responsive product display
- **Sorting Options**: Dropdown for sorting products
- **View Toggle**: Grid/List view switching
- **Product Badges**: Customizable badges (bestseller, new, sale, featured)
- **Price Display**: Formatted pricing with sale price support
- **Hover Effects**: Smooth animations and interactions
- **Wishlist Button**: Heart icon for favorites

### Usage
```astro
---
import FeaturedProducts from '../components/ui/FeaturedProducts.astro'
import { featuredProducts, productsConfig } from '../data/products'
---

<FeaturedProducts 
  title={productsConfig.title}
  subtitle={productsConfig.subtitle}
  products={featuredProducts}
  showSorting={productsConfig.showSorting}
  showViewToggle={productsConfig.showViewToggle}
  columns={productsConfig.columns}
/>
```

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `"Featured Products"` | Section heading |
| `subtitle` | `string` | `"Handpicked items..."` | Section description |
| `products` | `Product[]` | Required | Array of product objects |
| `showSorting` | `boolean` | `true` | Show sorting dropdown |
| `showViewToggle` | `boolean` | `true` | Show grid/list toggle |
| `columns` | `object` | `{mobile: 1, tablet: 2, desktop: 4}` | Responsive grid configuration |

### Product Data Structure
```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  alt: string;
  badge?: {
    text: string;
    type: 'bestseller' | 'new' | 'sale' | 'featured';
  };
  href?: string;
}
```

---

## File Structure

```
src/
├── components/ui/
│   ├── HeroSlider.astro          # Image slider component
│   ├── CategoriesSection.astro   # Categories grid component
│   ├── FeaturedProducts.astro    # Products grid component
│   ├── Footer.astro              # Footer component
│   └── README.md                 # This documentation
├── data/
│   ├── slider.ts                 # Slider content and configuration
│   ├── categories.ts             # Categories data and configuration
│   ├── products.ts               # Products data and configuration
│   └── footer.ts                 # Footer configuration
└── types/
    └── components.ts             # TypeScript interfaces
```

---

## Customization Guide

### Adding New Slides
Edit `/src/data/slider.ts`:
```typescript
export const heroSlides: SlideContent[] = [
  // existing slides...
  {
    badge: "New Collection",
    title: "Your New Product Title",
    description: "Product description here...",
    image: {
      webp: "/images/new-slide.webp",
      jpg: "/images/new-slide.jpg",
      alt: "new-slide"
    }
  }
];
```

### Adding New Categories
Edit `/src/data/categories.ts`:
```typescript
export const categories: Category[] = [
  // existing categories...
  {
    id: 'new-category',
    name: 'New Category',
    description: 'Category description',
    image: '/images/new-category.svg',
    alt: 'new category description',
    gradientFrom: 'from-purple-100',
    gradientTo: 'to-pink-100',
    href: '/categories/new-category'
  }
];
```

### Adding New Products
Edit `/src/data/products.ts`:
```typescript
export const featuredProducts: Product[] = [
  // existing products...
  {
    id: 'new-product',
    name: 'New Product Name',
    description: 'Product description',
    price: 99.99,
    originalPrice: 129.99, // optional
    image: '/images/new-product.svg',
    alt: 'new product description',
    badge: {
      text: 'Limited',
      type: 'featured'
    },
    href: '/products/new-product'
  }
];
```

### Modifying Grid Layouts
Adjust column configuration in respective config files:
```typescript
columns: {
  mobile: 1,    // 1 column on mobile
  tablet: 3,    // 3 columns on tablet
  desktop: 5    // 5 columns on desktop
}
```

### Customizing Footer
Edit `/src/data/footer.ts`:
```typescript
export const footerConfig = {
  companyName: "Your Company",
  showSocialLinks: true,      // Show/hide social media icons
  showQuickLinks: false,      // Hide navigation sections
  showNewsletter: true        // Keep newsletter signup
};
```

### Footer Links Customization
Edit the Footer component directly to modify:
- Navigation links and their URLs
- Social media platforms and links
- Legal page links (Privacy, Terms, etc.)
- Newsletter form action and styling

### Badge Color Customization
Badge colors are defined in `FeaturedProducts.astro`:
- `bestseller`: Amber to Orange gradient
- `new`: Green to Emerald gradient  
- `sale`: Red to Pink gradient
- `featured`: Blue to Purple gradient

### Performance Features
- **Lazy Loading**: Images load only when in viewport
- **Optimized CSS**: Component-scoped styles with minimal overhead
- **Type Safety**: Full TypeScript support prevents runtime errors
- **Responsive Images**: WebP format support with fallbacks
- **Smooth Animations**: Hardware-accelerated CSS transitions

---

## Footer Component

### Features
- **Company Information**: Logo, description, and social media links
- **Quick Links**: Navigation to important pages
- **Customer Service**: Support and help links
- **Newsletter Signup**: Email subscription form
- **Copyright Notice**: Automatic year and legal links
- **Responsive Design**: Mobile-friendly layout
- **Social Media Integration**: FontAwesome social icons

### Usage
```astro
---
import Footer from '../components/ui/Footer.astro'
import { footerConfig } from '../data/footer'
---

<Footer 
  companyName={footerConfig.companyName}
  showSocialLinks={footerConfig.showSocialLinks}
  showQuickLinks={footerConfig.showQuickLinks}
  showNewsletter={footerConfig.showNewsletter}
/>
```

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `companyName` | `string` | `"Easy Yield"` | Company name displayed in footer |
| `currentYear` | `number` | `new Date().getFullYear()` | Copyright year (auto-generated) |
| `showSocialLinks` | `boolean` | `true` | Show social media icons |
| `showQuickLinks` | `boolean` | `true` | Show navigation and service links |
| `showNewsletter` | `boolean` | `true` | Show newsletter signup form |

### Sections
- **Company Info**: Logo, description, social links
- **Quick Links**: Home, Products, Categories, About, Contact
- **Customer Service**: Help, Shipping, Returns, Warranty, FAQ
- **Newsletter**: Email subscription with branded button
- **Copyright Bar**: Legal notice and policy links

---

## Browser Support
- Modern browsers with CSS Grid support
- Mobile-first responsive design
- Progressive enhancement for older browsers
- Accessibility features included (ARIA labels, keyboard navigation)
