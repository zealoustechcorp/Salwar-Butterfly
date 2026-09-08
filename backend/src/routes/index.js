import { Router } from 'express';

import healthRoutes from './health.routes.js';
import customerRoutes from './customer.routes.js'
import customerAuthRoutes from './customer.auth.routes.js';
import categoryRoutes from './category.routes.js'
import productRoutes from './product.routes.js';
import productVariantRoutes from './product_variant.routes.js';
import productAttributeRoutes from './product_attribute_value.routes.js';
import productImageRoutes from './product_image.routes.js';
import inventoryRoutes from './inventory.routes.js';
import orderRoutes from './order.routes.js';
import subCategories from './sub_categories.router.js';
import adminAuthRoutes from './admin.auth.routes.js';
import storefrontRoutes from './storefront.routes.js';
import paymentRoutes from './payment.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import customerAddressRoutes from './customer_address.routes.js';
import reportRoutes from './report.routes.js';
import reviewRoutes from './review.routes.js';

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
 * The catalogue's reads stay behind the guard, and that is still
 * deliberate. /products and /categories carry thirty writes between
 * them, so opening them to serve the storefront would open those too.
 * Instead the public reads live in their own router — /storefront —
 * which is GET-only and whose columns are named one at a time in
 * storefront.repository.js. Adding a public read means adding a line to
 * that file, which is a decision somebody has to take on purpose rather
 * than inherit by leaving a door open here.
 *
 * The routers that do their own thing and must not be blanket-guarded:
 *
 *   /admin/auth   signing in cannot require being signed in. It gates
 *                 /me and /logout itself.
 *   /customers    mostly admin, but registration is public and
 *                 password change is a customer's own business. The
 *                 split lives in that file, next to the reasons.
 *   /orders       three audiences at once — a guest places one, a
 *                 signed-in shopper reads their own, the shop moves
 *                 all of them. Guarded route by route in that file.
 *   /payments     the same three, plus a fourth that has no token at
 *                 all: Razorpay's webhook, whose credential is an HMAC
 *                 over its body rather than a bearer token.
 */

const router = Router();

// ============================================================
// PUBLIC
// ============================================================

router.use('/health', healthRoutes);

// The customer's view of the catalogue (F-06). GET only, no tokens, and
// no column the shop would not print on a price tag.
router.use('/storefront', storefrontRoutes);

// ============================================================
// MIXED — these routers gate themselves, route by route
// ============================================================

router.use('/admin/auth', adminAuthRoutes);

// Mounted before /customers so the sign-in routes are matched by their
// own router rather than falling through to the one that owns /:id.
router.use('/customers/auth', customerAuthRoutes);
router.use('/customers', customerRoutes);

// Checkout is public, "my orders" is behind a storefront token, and the
// queue is behind an admin one. See order.routes.js.
router.use('/orders', orderRoutes);

// Opening a payment sheet is public, the checkout return is verified by
// signature rather than by token, and the webhook belongs to Razorpay.
// See payment.routes.js.
router.use('/payments', paymentRoutes);

// ============================================================
// CUSTOMER ONLY
// ============================================================
//
// Guarded at the mount, like the admin routers below, but with the
// storefront's token rather than an admin's. Nothing here takes a
// customer id — every endpoint is "mine", read off the token.

router.use('/wishlist', wishlistRoutes);

// The address book (F-05.03, F-08.05). Mounted here rather than under
// /customers because that router owns /:id and is mostly admin — an
// address book is neither, and the split would have to be argued route
// by route in a file that already argues one.
router.use('/addresses', customerAddressRoutes);

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

// The dashboard and the reports (F-11). GET only, and every figure on
// them is the shop's own business — a revenue total, and an order
// report carrying customers' names and addresses in bulk. There is no
// public subset of this to carve out, which is why it is guarded here
// with the rest rather than gating itself.
router.use('/reports', adminOnly, reportRoutes);

// Reviews and ratings (F-11.06). Admin-only by design and not by
// omission: the shop publishes what customers say on WhatsApp, so
// there is no shopper write path. Showing these on a product page
// (F-06.08) is a read for /storefront when it is built.
router.use('/reviews', adminOnly, reviewRoutes);

export default router;
