# Documentation: Product & Category Service

## Data Models
- **Product**: id, title, descriptionHtml, price, salePrice, quantity, images, categories
- **Category**: id, title, description, featuredProductId
- Many-to-many relationship via `product_category` join table

## Service Layer
- **ProductService**: CRUD for products, assign categories/images/prices
- **CategoryService**: CRUD for categories, assign featured product

## Access Control
- Admin-only features enforced via `requireAdmin` middleware (`src/middleware/auth.ts`)
- API endpoints check user group/role

## API Endpoints
- Located in `src/pages/api/admin/`
- Endpoints for product/category CRUD, assignments

## Admin Dashboard
- UI pages in `src/pages/admin/`
- Forms for editing products, uploading images, assigning categories

## Testing
- Automated tests in `tests/product-category.test.ts`
- Covers CRUD, relationships, access control

## Usage
- Run tests: `npm test -- --config jest.config.cjs`
- Build: `npm run build`
- Deploy: see `DEPLOYMENT.md`

