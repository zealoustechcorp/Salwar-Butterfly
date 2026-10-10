// src/routes/storefront.routes.js
//
// The public catalogue (F-06 Product Browsing & Search).
//
// This is the router routes/index.js said would eventually exist: the
// place where the catalogue's *reads* are opened to the world, one
// endpoint at a time and on purpose, instead of by relaxing the guard on
// the admin routers that also carry thirty writes.
//
// The split matters more than it looks. /products and /categories stay
// entirely behind `requireAdmin`, so nothing here can be widened by
// accident — opening a new public read means adding a line to this file,
// which is a decision somebody has to make on purpose. What this router
// may say is bounded by storefront.repository.js, which names its columns
// rather than selecting `p.*`.
//
// Everything here is GET, unauthenticated, and safe to cache.

import express from "express";

import { StorefrontController } from "../controllers/storefront.controller.js";

const router = express.Router();

router.get("/getCatalogue", StorefrontController.getCatalogue);

// The size charts the shop publishes (F-06).
//
// The third public read, and added the way this file's header says one
// should be: a single endpoint backed by a six-column list in
// storefront.repository.js. The admin's own /sizeCharts router returns
// the id, the print position and the published flag; none of those are
// here, and the difference is enforced by that column list rather than
// by a filter downstream.
router.get("/getSizeCharts", StorefrontController.getSizeCharts);

// What shoppers have said about one piece (F-06.08).
//
// The second public read, added the way this file's header says a
// public read should be: one endpoint, on purpose, backed by a column
// list in storefront.repository.js that names four fields and a date.
// The admin's own /reviews router returns the customer link, the email
// and the published flag; none of those are here, and the difference is
// enforced by that column list rather than by a filter downstream.
router.get("/getProductReviews/:id", StorefrontController.getProductReviews);

// The slides on the home page carousel (F-06).
//
// The fourth public read, added the way this file's header says one
// should be: a single endpoint backed by a one-column list in
// storefront.repository.js. The admin's own /banners router returns the
// id, the position, the active flag and the R2 object key — the
// last of which is the handle that deletes the file — and none of them
// are here. The difference is enforced by that column list rather than
// by a filter downstream.
router.get("/getBanners", StorefrontController.getBanners);

// What customers have sent the shop, as printed on the home page
// (F-06.08).
//
// The fifth public read. Its column list is the one worth reading
// twice: it carries a customer's name, their words and their
// photograph, which is exactly what the shop has chosen to publish and
// nothing more. The admin's own /customerStories router returns the id,
// the position, the published flag and the R2 object key, and
// none of those are here.
router.get("/getCustomerStories", StorefrontController.getCustomerStories);

export default router;
