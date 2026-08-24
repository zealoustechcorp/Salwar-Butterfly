/**
 * @file data.js
 * @description Official seed dataset and size chart specifications for Category Management (F-02).
 * Integrates directly with Product Management (F-03) records, providing pre-configured
 * categories, linked product relationships, and garment measurement matrices.
 */

/**
 * Default fallback lifestyle banner image used when creating a new category
 * without uploading a custom cover graphic.
 */
export const DEFAULT_CATEGORY_IMAGE =
  "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=800&h=500&fit=crop&auto=format";

/**
 * Slim Fit Size Chart Template (in centimetres).
 * Standardized for tailored Kurtis and contour-fitting ethnic garments.
 * Covers sizes XS through XXL with chest, waist, hip, and length measurements.
 */
const slimChart = {
  fit: "Slim Fit",
  rows: [
    { size: "XS", chest: "82–86", waist: "66–70", hip: "88–92", length: "106" },
    { size: "S",  chest: "87–91", waist: "71–75", hip: "93–97", length: "108" },
    { size: "M",  chest: "92–96", waist: "76–80", hip: "98–102", length: "110" },
    { size: "L",  chest: "97–101", waist: "81–85", hip: "103–107", length: "112" },
    { size: "XL", chest: "102–107", waist: "86–91", hip: "108–113", length: "114" },
    { size: "XXL", chest: "108–114", waist: "92–98", hip: "114–120", length: "116" },
  ],
};

/**
 * Normal Fit Size Chart Template (in centimetres).
 * Standard relaxed-fit tailoring for traditional Salwar suits, Churidar sets, and Patialas.
 * Features comfortable ease across the bust, waist, and hip lines.
 */
const normalChart = {
  fit: "Normal Fit",
  rows: [
    { size: "S",  chest: "88–92", waist: "72–76", hip: "94–98", length: "112" },
    { size: "M",  chest: "93–97", waist: "77–81", hip: "99–103", length: "114" },
    { size: "L",  chest: "98–102", waist: "82–86", hip: "104–108", length: "116" },
    { size: "XL", chest: "103–108", waist: "87–92", hip: "109–114", length: "118" },
    { size: "XXL", chest: "109–115", waist: "93–99", hip: "115–121", length: "120" },
  ],
};

/**
 * Special Dress Size Chart Template (in centimetres).
 * Tailored for floor-length Anarkalis, flared gown silhouettes, and bridal shararas.
 * Features extended vertical length (138–144 cm) for sweeping floor-touch drape.
 */
const specialChart = {
  fit: "Special Dress",
  rows: [
    { size: "S",  chest: "86–90", waist: "70–74", hip: "92–96", length: "138" },
    { size: "M",  chest: "91–95", waist: "75–79", hip: "97–101", length: "140" },
    { size: "L",  chest: "96–100", waist: "80–84", hip: "102–106", length: "142" },
    { size: "XL", chest: "101–106", waist: "85–90", hip: "107–112", length: "144" },
  ],
};

/**
 * Complete collection of products from Product Management (F-03).
 * Each product references its assigned category via `category_id` (1–8).
 * Category views compute live inventory and product counts using this dataset.
 */
export const ALL_PRODUCTS = [
  {
    id: "1",
    name: "Rani Pink Chanderi Anarkali",
    sku: "SB-ANK-0001-S-RNP",
    price: 2899,
    stock: 144,
    category_id: 1,
    image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "2",
    name: "Mustard Cotton Straight Kurti",
    sku: "SB-KRT-0002-S-MST",
    price: 899,
    stock: 271,
    category_id: 2,
    image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "3",
    name: "Ivory Georgette Palazzo Set",
    sku: "SB-PLZ-0003-S-IVR",
    price: 1799,
    stock: 140,
    category_id: 3,
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "4",
    name: "Royal Blue Churidar Suit",
    sku: "SB-CHD-0004-S-RYB",
    price: 1599,
    stock: 57,
    category_id: 4,
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "5",
    name: "Maroon Zari Sharara Set",
    sku: "SB-SHR-0005-S-MRN",
    price: 3499,
    stock: 87,
    category_id: 5,
    image: "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "6",
    name: "Teal Rayon Patiala Suit",
    sku: "SB-PTL-0006-M-TEA",
    price: 1249,
    stock: 132,
    category_id: 6,
    image: "https://images.unsplash.com/photo-1610030469668-93593025287f?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "7",
    name: "Black Muslin Daily Kurti",
    sku: "SB-CDW-0007-XS-BLK",
    price: 749,
    stock: 243,
    category_id: 7,
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "8",
    name: "Peach Organza Anarkali",
    sku: "SB-ANK-0008-S-PCH",
    price: 3199,
    stock: 29,
    category_id: 1,
    image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "9",
    name: "Bottle Green Mirror Work Kurti",
    sku: "SB-KRT-0009-S-BTE",
    price: 1099,
    stock: 102,
    category_id: 2,
    image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "10",
    name: "Lavender Crepe Palazzo Set",
    sku: "SB-PLZ-0010-M-LAV",
    price: 1699,
    stock: 87,
    category_id: 3,
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "11",
    name: "Ivory Chanderi Festive Suit",
    sku: "SB-CHD-0011-S-IVR",
    price: 2599,
    stock: 58,
    category_id: 4,
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "12",
    name: "Maroon Printed Daily Kurti",
    sku: "SB-CDW-0012-S-MRN",
    price: 699,
    stock: 278,
    category_id: 7,
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "13",
    name: "Royal Blue Sequin Sharara",
    sku: "SB-SHR-0013-S-RYB",
    price: 3899,
    stock: 29,
    category_id: 5,
    image: "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "14",
    name: "Peach Rayon Patiala Set",
    sku: "SB-PTL-0014-M-PCH",
    price: 1349,
    stock: 104,
    category_id: 6,
    image: "https://images.unsplash.com/photo-1610030469668-93593025287f?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "15",
    name: "Black Georgette Party Anarkali",
    sku: "SB-ANK-0015-S-BLK",
    price: 2999,
    stock: 75,
    category_id: 1,
    image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "16",
    name: "Teal Cotton Straight Kurti",
    sku: "SB-KRT-0016-S-TEA",
    price: 849,
    stock: 142,
    category_id: 2,
    image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "17",
    name: "Mustard Zari Palazzo Set",
    sku: "SB-PLZ-0017-M-MST",
    price: 2099,
    stock: 39,
    category_id: 3,
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "18",
    name: "Lavender Muslin Kurti",
    sku: "SB-CDW-0018-XS-LAV",
    price: 799,
    stock: 141,
    category_id: 7,
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "19",
    name: "Bottle Green Churidar Suit",
    sku: "SB-CHD-0019-S-BTE",
    price: 1699,
    stock: 90,
    category_id: 4,
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "20",
    name: "Ivory Mirror Work Sharara",
    sku: "SB-SHR-0020-S-IVR",
    price: 3299,
    stock: 32,
    category_id: 5,
    image: "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "21",
    name: "Maroon Crepe Patiala Suit",
    sku: "SB-PTL-0021-M-MRN",
    price: 1449,
    stock: 80,
    category_id: 6,
    image: "https://images.unsplash.com/photo-1610030469668-93593025287f?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "22",
    name: "Royal Blue Cotton Kurti",
    sku: "SB-KRT-0022-S-RYB",
    price: 879,
    stock: 134,
    category_id: 2,
    image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "23",
    name: "Peach Chanderi Anarkali",
    sku: "SB-ANK-0023-M-PCH",
    price: 2749,
    stock: 0,
    category_id: 1,
    image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "24",
    name: "Black Rayon Palazzo Set",
    sku: "SB-PLZ-0024-M-BLK",
    price: 1549,
    stock: 67,
    category_id: 3,
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "25",
    name: "Mustard Muslin Daily Kurti",
    sku: "SB-CDW-0025-S-MST",
    price: 729,
    stock: 107,
    category_id: 7,
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "26",
    name: "Teal Embroidered Churidar",
    sku: "SB-CHD-0026-S-TEA",
    price: 1899,
    stock: 56,
    category_id: 4,
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "27",
    name: "Lavender Sequin Gown",
    sku: "SB-GWN-0027-M-LAV",
    price: 4199,
    stock: 10,
    category_id: 8,
    image: "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=400&h=400&fit=crop&auto=format",
  },
  {
    id: "28",
    name: "Ivory Cotton Everyday Kurti",
    sku: "SB-CDW-0028-XS-IVR",
    price: 769,
    stock: 106,
    category_id: 7,
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=400&h=400&fit=crop&auto=format",
  },
];

/**
 * Salwar Butterfly Official Dress Categories (Seed Dataset for F-02 Catalogue).
 * 
 * Category Object Schema:
 * - `id`: Unique identifier string (1–8 for seed, timestamped for user-created).
 * - `name`: Official display name shown in navigation menus and storefront headers.
 * - `slug`: SEO-friendly URL slug (e.g., "anarkali-suits" -> salwarbutterfly.com/category/anarkali-suits).
 * - `description`: Customer-facing summary describing the fabric, craftsmanship, and occasion fit.
 * - `active`: Boolean storefront visibility flag (true = published, false = hidden draft).
 * - `productIds`: Array of string IDs pointing to products mapped under this category.
 * - `sizeCharts`: Array of fit-specific size chart matrices (`slimChart`, `normalChart`, `specialChart`).
 * - `image`: High-resolution banner image URL displayed on category cards and hero banners.
 * - `createdAt`: ISO date string recording when the category was established.
 */
export const INITIAL_CATEGORIES = [
  {
    id: "1",
    name: "Anarkali Suits",
    slug: "anarkali-suits",
    description: "Floor-length flared Anarkali suits with zari borders, intricate panel gheras, and matching organza dupattas.",
    active: true,
    productIds: ["1", "8", "15", "23"],
    sizeCharts: [specialChart, normalChart],
    image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-06-28",
  },
  {
    id: "2",
    name: "Straight Cut Kurtis",
    slug: "straight-cut-kurtis",
    description: "Classic straight-cut cotton and mirror-work kurtis with side slits, tailored for everyday style and office comfort.",
    active: true,
    productIds: ["2", "9", "16", "22"],
    sizeCharts: [slimChart, normalChart],
    image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-07-15",
  },
  {
    id: "3",
    name: "Palazzo Sets",
    slug: "palazzo-sets",
    description: "Three-piece co-ord sets pairing thread-embroidered georgette kurtis with breezy, pleated wide-leg palazzos.",
    active: true,
    productIds: ["3", "10", "17", "24"],
    sizeCharts: [normalChart, slimChart],
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-06-05",
  },
  {
    id: "4",
    name: "Churidar Suits",
    slug: "churidar-suits",
    description: "Elegant churidar salwar suits in matte crepe and Chanderi silk with contrast piping and flowing dupattas.",
    active: true,
    productIds: ["4", "11", "19", "26"],
    sizeCharts: [normalChart, specialChart],
    image: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-05-19",
  },
  {
    id: "5",
    name: "Sharara Sets",
    slug: "sharara-sets",
    description: "Bridal and festive shararas in raw silk and georgette with all-over zari booti, peplum kurtis, and heavy net dupattas.",
    active: true,
    productIds: ["5", "13", "20"],
    sizeCharts: [specialChart, normalChart],
    image: "https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-07-20",
  },
  {
    id: "6",
    name: "Patiala Suits",
    slug: "patiala-suits",
    description: "Authentic Patiala salwar suits in soft rayon and crepe with generous pleating, short kurtis, and printed dupattas.",
    active: true,
    productIds: ["6", "14", "21"],
    sizeCharts: [normalChart],
    image: "https://images.unsplash.com/photo-1610030469668-93593025287f?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-04-27",
  },
  {
    id: "7",
    name: "Cotton Daily Wear",
    slug: "cotton-daily-wear",
    description: "Breathable pure muslin and cotton daily wear kurtis — soft-washed, pre-shrunk, and easy to maintain.",
    active: true,
    productIds: ["7", "12", "18", "25", "28"],
    sizeCharts: [slimChart, normalChart],
    image: "https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-07-29",
  },
  {
    id: "8",
    name: "Festive Gowns",
    slug: "festive-gowns",
    description: "Party and festive evening gowns in sheer organza with sequinned yokes and cutwork hems.",
    active: false,
    productIds: ["27"],
    sizeCharts: [specialChart],
    image: "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=800&h=500&fit=crop&auto=format",
    createdAt: "2026-08-14",
  },
];
