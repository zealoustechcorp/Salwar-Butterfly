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

export default router;
