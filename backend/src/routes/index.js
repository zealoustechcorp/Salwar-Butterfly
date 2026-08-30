import { Router } from 'express';

import healthRoutes from './health.routes.js';
import customerRoutes from './customer.routes.js'
import categoryRoutes from './category.routes.js'
import productRoutes from './product.routes.js';
import productVariantRoutes from './product_variant.routes.js';
import productAttributeRoutes from './product_attribute_value.routes.js';
import productImageRoutes from './product_image.routes.js';
import inventoryRoutes from './inventory.routes.js';
import subCategories from './sub_categories.router.js';
import adminAuthRoutes from './admin.auth.routes.js';

import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/authorize.middleware.js';

/**
 * Where the API decides who may reach what (F-01.07).
 *
 * The rule is deny by default. Anything not listed under "public"
 * below is behind an admin token, applied here at the mount rather
 * than route by route — a router mounted with the guard cannot grow a
 * new endpoint that forgets it, which is exactly how the catalogue
 * ended up with thirty unauthenticated writes.
 *
 * Reads are behind the guard too, and that is deliberate rather than
 * an oversight. The storefront renders from a committed snapshot and
 * never calls this API, so there is no public reader to serve today.
 * When F-06 moves the storefront onto live data, the catalogue's read
 * endpoints get split into their own public router and opened one at a
 * time — a decision worth taking on purpose, per endpoint, rather than
 * inheriting by leaving the door open now.
 *
 * Two routers do their own thing and must not be blanket-guarded:
 *
 *   /admin/auth   signing in cannot require being signed in. It gates
 *                 /me and /logout itself.
 *   /customers    mostly admin, but registration is public and
 *                 password change is a customer's own business. The
 *                 split lives in that file, next to the reasons.
 */

const router = Router();

// ============================================================
// PUBLIC
// ============================================================

router.use('/health', healthRoutes);

// ============================================================
// MIXED — these routers gate themselves, route by route
// ============================================================

router.use('/admin/auth', adminAuthRoutes);
router.use('/customers', customerRoutes);

// ============================================================
// ADMIN ONLY
// ============================================================
//
// The guard runs before the router, so it also runs before multer on
// the image routes — an unauthenticated upload is rejected before its
// body is ever parsed to disk.

const adminOnly = [authenticate, requireAdmin];

router.use('/categories', adminOnly, categoryRoutes);
router.use('/subCategories', adminOnly, subCategories);
router.use('/products', adminOnly, productRoutes);
router.use('/productVariants', adminOnly, productVariantRoutes);
router.use('/productAttributes', adminOnly, productAttributeRoutes);
router.use('/productImages', adminOnly, productImageRoutes);
router.use('/inventory', adminOnly, inventoryRoutes);

export default router;
