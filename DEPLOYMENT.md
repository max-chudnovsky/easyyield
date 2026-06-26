# Deployment Guide: Product & Category Service

## 1. Database Schema
- Ensure your database is running and accessible.
- Run the SQL schema in `src/models/schema.sql` to create tables for products, categories, and product_category.

## 2. Service Layer
- The service classes (`ProductService.ts`, `CategoryService.ts`) are located in `src/services/`.
- These handle all CRUD operations and relationships.

## 3. API Endpoints
- Admin API endpoints are in `src/pages/api/admin/`.
- Endpoints require admin access (see `src/middleware/auth.ts`).

## 4. Admin Dashboard
- Admin UI pages are in `src/pages/admin/`.
- Use these to manage products and categories.

## 5. Testing
- Automated tests are in `tests/product-category.test.ts`.
- Run `npm test -- --config jest.config.cjs` to validate functionality.

## 6. Environment
- Ensure Node.js, npm, and your database are installed.
- Install dependencies: `npm install`

## 7. Deployment
- Build the project: `npm run build`
- Deploy using your preferred method (see scripts in `package.json`).

## 8. Troubleshooting
- Check permissions for npm installs (use `sudo` if needed).
- Validate DB connection settings.
- Review logs for errors during build or test.

