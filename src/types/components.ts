export interface SlideContent {
  badge: string;
  title: string;
  description: string;
  image: {
    webp: string;
    jpg: string;
    alt: string;
  };
  shop_now_url?: string;
}

export interface HeroSliderProps {
  slides: SlideContent[];
  autoplay?: boolean;
  autoplayInterval?: number;
  showNavigation?: boolean;
  showDots?: boolean;
  height?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  image: string;
  alt: string;
  gradientFrom: string;
  gradientTo: string;
  href?: string;
}

export interface CategoriesSectionProps {
  title?: string;
  subtitle?: string;
  categories: Category[];
  columns?: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
}

export interface Product {
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
  url?: string; // External URL for Buy button
}

export interface FeaturedProductsProps {
  title?: string;
  subtitle?: string;
  products: Product[];
  showSorting?: boolean;
  showViewToggle?: boolean;
  columns?: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
}

export interface FooterProps {
  companyName?: string;
  currentYear?: number;
  showSocialLinks?: boolean;
  showQuickLinks?: boolean;
  showNewsletter?: boolean;
}
