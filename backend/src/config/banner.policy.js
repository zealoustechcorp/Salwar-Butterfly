// src/config/banner.policy.js
//
// The one definition of what the home page carousel may hold (F-06).
//
// Mirrors size_chart.policy.js and review.policy.js: this module is what
// the validator and the service refuse on, and 017_create_banners.sql
// duplicates the bounds it can as CHECK constraints so a row nobody
// validated cannot reach the table through psql either.
//
// There is very little here, and that is the shape of the feature rather
// than an omission. A banner is an image and a place in the order, so
// the only rules worth writing down are how many there may be and where
// the files go.

/**
 * The most slides the carousel may hold, live or hidden.
 *
 * The shop opened with five. Twelve leaves room for a festival set to be
 * uploaded and staged before the current one comes down, without leaving
 * room for a carousel nobody will sit through — the autoplay in Hero.js
 * runs at five seconds a slide, so twelve is already a minute to see the
 * set once.
 *
 * Counted across hidden banners too. A hidden slide still holds a
 * Cloudinary file the shop is paying to store, and a cap that only
 * counted the live ones would not bound anything.
 */
export const MAX_BANNERS = 12;

/**
 * How many images one upload may carry.
 *
 * The common gesture is dragging a set of finished artwork in at once,
 * so this is a batch rather than a single file. Matches the multer
 * instance the product gallery already uses — see MAX_PRODUCT_IMAGES in
 * middlewares/upload.middleware.js — which is what actually stops a
 * ninth file being parsed; this constant is what the service checks
 * against the ceiling above, and what the error message quotes.
 */
export const MAX_BANNERS_PER_UPLOAD = 8;

/**
 * Where new banner files are stored on Cloudinary.
 *
 * The five seeded in 017 are not here. They are in `shop/settings`,
 * where the shop originally uploaded them, and they stay there — moving
 * a file on Cloudinary changes its public id and therefore its URL, so
 * tidying the folder name would break every row that already points at
 * one. New uploads land here; old ones are found by the id in their row,
 * which is the only thing either folder is read by.
 */
export const BANNER_FOLDER = "banners";
