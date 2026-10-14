// tests/catalogue.fixes.test.js
//
// The catalogue's write rules: categories, products, variants, size
// charts and the attribute register.
//
// Every repository is replaced with an in-memory stand-in via
// mock.method, so what is under test is the service and validator logic —
// which status a failure becomes, what the error map names, and what is
// refused before anything is written. Whether the SQL itself is right is
// a question for a live database.
//
// Run with: npm test

import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// env.js validates at import time and the services pull it in, so the
// variables have to exist before the dynamic imports below.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";
process.env.RAZORPAY_KEY_ID ??= "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET ??= "rzp_test_secret";

const { ApiError } = await import("../src/utils/ApiError.js");
const { ImageStorage } = await import("../src/config/r2.storage.js");
const { ProductService } = await import("../src/services/product.service.js");
const { CategoryService, categoryUniqueField } = await import(
  "../src/services/category.service.js"
);
const { ProductVariantService } = await import(
  "../src/services/product_variant.service.js"
);
const { SizeChartService } = await import("../src/services/size_chart.service.js");
const { AttributeValueService } = await import(
  "../src/services/product_attribute_value.service.js"
);
const { ProductRepository, isSlugViolation, slugFromDetail } = await import(
  "../src/repository/poduct.repository.js"
);
const { CategoryRepository } = await import("../src/repository/category.repository.js");
const { SubCategoryRepository } = await import(
  "../src/repository/sub_categories.repository.js"
);
const { SizeChartRepository } = await import("../src/repository/size_chart.repository.js");
const { ProductVariantRepository, findStockConflicts } = await import(
  "../src/repository/product_variant.repository.js"
);
const { AttributeValueRepository } = await import(
  "../src/repository/product_attribute_value.repository.js"
);
const {
  collectBulkCreateErrors,
  validateCreateProduct,
  validateUpdateProduct,
} = await import("../src/validators/product.validator.js");

const CAT = "3f1a7c2e-9b84-4d61-8a05-6c7e2f9d4b13";
const OTHER_CAT = "8b2d4e6f-1a3c-4e5f-9a7b-2c4d6e8f0a1b";
const SUB = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const PROD = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const VAR = "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a";

const category = (over = {}) => ({
  id: CAT,
  name: "Kurtis",
  slug: "kurtis",
  image_public_id: null,
  deleted_at: null,
  active: true,
  ...over,
});

const productRow = (over = {}) => ({
  id: PROD,
  category_id: CAT,
  sub_category_id: null,
  name: "Silk Kurti",
  slug: "silk-kurti",
  base_price: "1000.00",
  discount_percentage: "0",
  current_price: "1000.00",
  attributes: {},
  is_featured: false,
  active: true,
  images: [],
  ...over,
});

/** Runs fn and returns the ApiError it threw, failing if it did not. */
const rejected = async (fn) => {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${error}`);
    return error;
  }
  assert.fail("expected the call to throw");
};

/** Drives an Express-style validator and returns what it passed to next. */
const runMiddleware = (middleware, req) => {
  let passed;
  middleware(req, {}, (error) => {
    passed = error;
  });
  return passed;
};

afterEach(() => mock.restoreAll());

// ============================================================
// SLUG CONSTRAINT NAMES (B1)
// ============================================================

describe("product slug unique violations", () => {
  it("recognises the live and the migration constraint names, and the detail", () => {
    for (const constraint of [
      "products_slug_key",
      "products_slug_unique",
      "idx_products_slug",
    ]) {
      assert.equal(isSlugViolation({ code: "23505", constraint }), true, constraint);
    }

    assert.equal(
      isSlugViolation({
        code: "23505",
        constraint: "some_future_name",
        detail: "Key (slug)=(silk-kurti) already exists.",
      }),
      true,
    );

    assert.equal(
      isSlugViolation({ code: "23505", constraint: "products_pkey", detail: "Key (id)=(x) already exists." }),
      false,
    );
  });

  it("reads the offending slug out of the detail", () => {
    assert.equal(
      slugFromDetail("Key (slug)=(silk-kurti) already exists."),
      "silk-kurti",
    );
    assert.equal(slugFromDetail(undefined), null);
  });

  it("createProduct turns a slug clash into a 409 naming the slug", async () => {
    mock.method(CategoryRepository, "findById", async () => category());
    mock.method(ProductRepository, "create", async () => {
      const err = new Error("PRODUCT_SLUG_EXISTS");
      err.code = "PRODUCT_SLUG_EXISTS";
      err.slug = "silk-kurti";
      throw err;
    });

    const error = await rejected(() =>
      ProductService.create({
        name: "Silk Kurti",
        slug: "silk-kurti",
        categoryId: CAT,
        basePrice: 1000,
      }),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.errors.slug, /silk-kurti/);
  });

  it("updateProduct turns a slug clash into a 409, not a 500", async () => {
    mock.method(ProductRepository, "findById", async () => productRow());
    mock.method(ProductRepository, "update", async () => {
      const err = new Error("PRODUCT_SLUG_EXISTS");
      err.code = "PRODUCT_SLUG_EXISTS";
      throw err;
    });

    const error = await rejected(() =>
      ProductService.updateProduct(PROD, { slug: "taken" }),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.errors.slug, /taken/);
  });
});

// ============================================================
// BULK CREATE (B1, B7)
// ============================================================

describe("bulk product create", () => {
  const goodRow = (over = {}) => ({
    name: "Silk Kurti",
    slug: "silk-kurti",
    basePrice: 1000,
    ...over,
  });

  it("holds every row to the single-create rules and reports them all", () => {
    const { errors, rowsWithErrors } = collectBulkCreateErrors({
      categoryId: CAT,
      products: [
        goodRow(),
        goodRow({ slug: "Bad Slug!" }),
        goodRow({ slug: "two", subCategoryId: "nope" }),
        goodRow({ slug: "three", name: 12345 }),
        goodRow({ slug: "four", basePrice: 1_000_000 }),
        goodRow({ slug: "five", description: "x".repeat(5001) }),
        goodRow({ slug: "six", attributes: { fabric: { nested: true } } }),
        goodRow({ slug: "seven", sizeChartId: CAT }),
        goodRow({ slug: "silk-kurti" }),
      ],
    });

    assert.equal(rowsWithErrors, 8);
    assert.ok(errors["products[1].slug"]);
    assert.ok(errors["products[2].subCategoryId"]);
    assert.ok(errors["products[3].name"]);
    assert.ok(errors["products[4].basePrice"]);
    assert.ok(errors["products[5].description"]);
    assert.ok(errors["products[6].attributes"]);
    assert.ok(errors["products[7].sizeChartId"]);
    assert.match(errors["products[8].slug"], /products\[0\]/);
    assert.equal(errors["products[0].name"], undefined);
  });

  it("refuses slugs already in the catalogue with a 409 naming each row", async () => {
    mock.method(CategoryRepository, "findById", async () => category());
    mock.method(ProductRepository, "findExistingSlugs", async () => ["b"]);
    const bulkAdd = mock.method(ProductRepository, "bulkAdd", async () => []);

    const error = await rejected(() =>
      ProductService.bulkCreateByCategoryId(CAT, [
        goodRow({ slug: "a" }),
        goodRow({ slug: "b" }),
      ]),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.errors["products[1].slug"], /"b"/);
    assert.equal(bulkAdd.mock.callCount(), 0);
  });

  it("maps a slug clash raised by the insert itself to a 409, not a 500", async () => {
    mock.method(CategoryRepository, "findById", async () => category());
    mock.method(ProductRepository, "findExistingSlugs", async () => []);
    mock.method(ProductRepository, "bulkAdd", async () => {
      const err = new Error("PRODUCT_SLUG_EXISTS");
      err.code = "PRODUCT_SLUG_EXISTS";
      err.slug = "a";
      throw err;
    });

    const error = await rejected(() =>
      ProductService.bulkCreateByCategoryId(CAT, [goodRow({ slug: "a" })]),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.message, /"a"/);
  });
});

// ============================================================
// PARENT CATEGORY / SUB-CATEGORY (B4, B5, B6, B8, B14)
// ============================================================

describe("product parent checks", () => {
  it("refuses a deleted category on create", async () => {
    mock.method(CategoryRepository, "findById", async () => null);
    const create = mock.method(ProductRepository, "create", async () => productRow());

    const error = await rejected(() =>
      ProductService.create({ name: "Kurti", slug: "kurti", categoryId: CAT, basePrice: 10 }),
    );

    assert.equal(error.statusCode, 404);
    assert.ok(error.errors.categoryId);
    assert.equal(create.mock.callCount(), 0);
  });

  it("refuses a deleted category as a bulk move target", async () => {
    mock.method(CategoryRepository, "findById", async () => null);
    const move = mock.method(ProductRepository, "bulkUpdateCategoryByIds", async () => 1);

    const error = await rejected(() =>
      ProductService.bulkUpdateCategoryByProductIds(CAT, [PROD]),
    );

    assert.equal(error.statusCode, 404);
    assert.equal(move.mock.callCount(), 0);
  });

  it("refuses a sub-category from another category on create", async () => {
    mock.method(CategoryRepository, "findById", async () => category());
    mock.method(SubCategoryRepository, "findById", async () => ({
      id: SUB,
      name: "Anarkali",
      category_id: OTHER_CAT,
    }));

    const error = await rejected(() =>
      ProductService.create({
        name: "Kurti",
        slug: "kurti",
        categoryId: CAT,
        subCategoryId: SUB,
        basePrice: 10,
      }),
    );

    assert.equal(error.statusCode, 400);
    assert.match(error.errors.subCategoryId, /different category/);
  });

  it("accepts an update that only changes the sub-category, and checks it", async () => {
    mock.method(ProductRepository, "findById", async () => productRow());
    mock.method(SubCategoryRepository, "findById", async () => ({
      id: SUB,
      name: "Anarkali",
      category_id: CAT,
    }));
    const update = mock.method(ProductRepository, "update", async (_id, data) =>
      productRow({ sub_category_id: data.subCategoryId }),
    );

    const result = await ProductService.updateProduct(PROD, { subCategoryId: SUB });

    assert.equal(result.subCategoryId, SUB);
    assert.equal(update.mock.callCount(), 1);
  });

  it("is a 404 for an unknown product id, before any write", async () => {
    mock.method(ProductRepository, "findById", async () => null);
    const update = mock.method(ProductRepository, "update", async () => productRow());

    const error = await rejected(() =>
      ProductService.updateProduct(PROD, { name: "New name" }),
    );

    assert.equal(error.statusCode, 404);
    assert.equal(update.mock.callCount(), 0);
  });

  it("maps PRODUCT_NOT_FOUND from the repository to a 404", async () => {
    mock.method(ProductRepository, "findById", async () => productRow());
    mock.method(ProductRepository, "update", async () => {
      const err = new Error("Product not found");
      err.code = "PRODUCT_NOT_FOUND";
      throw err;
    });

    const error = await rejected(() =>
      ProductService.updateProduct(PROD, { name: "New name" }),
    );

    assert.equal(error.statusCode, 404);
  });

  it("saves a product whose unchanged fit no longer has a chart", async () => {
    mock.method(ProductRepository, "findById", async () =>
      productRow({ attributes: { fit: "Slim Fit" } }),
    );
    const findByFit = mock.method(SizeChartRepository, "findByFit", async () => null);
    mock.method(ProductRepository, "update", async (_id, data) =>
      productRow({ attributes: data.attributes }),
    );

    const result = await ProductService.updateProduct(PROD, {
      attributes: { fit: "slim fit", fabric: "Silk" },
    });

    assert.equal(findByFit.mock.callCount(), 0);
    assert.equal(result.attributes.fit, "Slim Fit");
  });

  it("still refuses a changed fit with no chart", async () => {
    mock.method(ProductRepository, "findById", async () =>
      productRow({ attributes: { fit: "Slim Fit" } }),
    );
    mock.method(SizeChartRepository, "findByFit", async () => null);
    mock.method(SizeChartRepository, "list", async () => []);

    const error = await rejected(() =>
      ProductService.updateProduct(PROD, { attributes: { fit: "Boxy" } }),
    );

    assert.equal(error.statusCode, 400);
  });

  it("rejects unknown fields instead of ignoring them", () => {
    const created = runMiddleware(validateCreateProduct, {
      body: { name: "Kurti", slug: "kurti", categoryId: CAT, basePrice: 10, sizeChartId: CAT },
    });
    assert.equal(created?.statusCode, 400);
    assert.ok(created.errors.sizeChartId);

    const updated = runMiddleware(validateUpdateProduct, {
      params: { id: PROD },
      body: { categoryId: CAT },
    });
    assert.equal(updated?.statusCode, 400);
    assert.match(updated.errors.categoryId, /bulkUpdateCategory/);
  });
});

// ============================================================
// CATEGORIES (B3, B9, item 10, item 11)
// ============================================================

describe("categories", () => {
  it("is a 400, not a 500, for a non-UUID id", async () => {
    for (const call of [
      () => CategoryService.getById("abc"),
      () => CategoryService.update("abc", { name: "x" }),
      () => CategoryService.delete("abc"),
    ]) {
      const error = await rejected(call);
      assert.equal(error.statusCode, 400);
    }
  });

  it("refuses to delete a category that still has products, and says how many", async () => {
    mock.method(CategoryRepository, "findById", async () => category());
    mock.method(CategoryRepository, "countDependents", async () => ({
      products: 3,
      subCategories: 1,
    }));
    const softDelete = mock.method(CategoryRepository, "softDelete", async () => ({}));

    const error = await rejected(() => CategoryService.delete(CAT));

    assert.equal(error.statusCode, 409);
    assert.match(error.message, /3 products and 1 sub-category/);
    assert.ok(error.errors.products);
    assert.equal(softDelete.mock.callCount(), 0);
  });

  it("deletes an empty category", async () => {
    mock.method(CategoryRepository, "findById", async () => category());
    mock.method(CategoryRepository, "countDependents", async () => ({
      products: 0,
      subCategories: 0,
    }));
    const softDelete = mock.method(CategoryRepository, "softDelete", async () => ({}));

    assert.deepEqual(await CategoryService.delete(CAT), { success: true });
    assert.equal(softDelete.mock.callCount(), 1);
  });

  it("reports a duplicate slug as {slug: message}, not {field: 'slug'}", async () => {
    mock.method(CategoryRepository, "checkSlugExists", async () => true);

    const error = await rejected(() =>
      CategoryService.create({ name: "Kurtis", slug: "kurtis" }),
    );

    assert.equal(error.statusCode, 409);
    assert.deepEqual(error.errors, { slug: "Category with this slug already exists" });
  });

  it("tells a duplicate name from a duplicate slug", async () => {
    assert.equal(
      categoryUniqueField({ code: "23505", constraint: "categories_name_key", detail: "Key (name)=(Kurtis) already exists." }),
      "name",
    );
    assert.equal(
      categoryUniqueField({ code: "23505", constraint: "categories_slug_unique" }),
      "slug",
    );

    mock.method(CategoryRepository, "checkSlugExists", async () => false);
    mock.method(CategoryRepository, "create", async () => {
      const err = new Error("duplicate");
      err.code = "23505";
      err.constraint = "categories_name_key";
      err.detail = "Key (name)=(Kurtis) already exists.";
      throw err;
    });

    const error = await rejected(() =>
      CategoryService.create({ name: "Kurtis", slug: "kurtis-2" }),
    );

    assert.equal(error.statusCode, 409);
    assert.ok(error.errors.name);
    assert.equal(error.errors.slug, undefined);
  });

  it("names a deleted category that still holds the slug", async () => {
    mock.method(CategoryRepository, "checkSlugExists", async () => false);
    mock.method(CategoryRepository, "create", async () => {
      const err = new Error("duplicate");
      err.code = "23505";
      err.constraint = "categories_slug_key";
      err.detail = "Key (slug)=(kurtis) already exists.";
      throw err;
    });
    mock.method(CategoryRepository, "findSlugHolder", async () => ({
      id: OTHER_CAT,
      name: "Old Kurtis",
      deleted_at: new Date(),
    }));

    const error = await rejected(() =>
      CategoryService.create({ name: "Kurtis", slug: "kurtis" }),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.errors.slug, /deleted category "Old Kurtis"/);
  });

  it("removes the replaced image from storage after a successful update", async () => {
    mock.method(CategoryRepository, "findById", async () =>
      category({ image_public_id: "categories/old.jpg" }),
    );
    mock.method(ImageStorage, "uploadImage", async () => ({
      imageUrl: "https://images.test/categories/new.jpg",
      imagePublicId: "categories/new.jpg",
    }));
    const deleted = mock.method(ImageStorage, "deleteImage", async () => null);
    mock.method(CategoryRepository, "update", async () =>
      category({ image_public_id: "categories/new.jpg" }),
    );

    await CategoryService.update(CAT, { imageFile: { buffer: Buffer.from("x") } });

    assert.deepEqual(
      deleted.mock.calls.map((call) => call.arguments[0]),
      ["categories/old.jpg"],
    );
  });
});

// ============================================================
// VARIANTS (B11, size-matrix overwrite, summaries)
// ============================================================

describe("variants", () => {
  it("finds rows whose stock moved since the form loaded", () => {
    const conflicts = findStockConflicts(
      [
        { size: "M", colour: "", expectedStock: 5 },
        { size: "L", colour: "", expectedStock: 2 },
        { size: "XL", colour: "" }, // no expectation: last write wins
        { size: "S", colour: "", expectedStock: 9 }, // new row: nothing to compare
        { size: "M", colour: "Maroon", expectedStock: 1 },
      ],
      [
        { size: "M", colour: "", stock_quantity: 3 },
        { size: "L", colour: "", stock_quantity: 2 },
        { size: "XL", colour: "", stock_quantity: 0 },
        { size: "M", colour: "Maroon", stock_quantity: 0 },
      ],
    );

    assert.deepEqual(
      conflicts.map((c) => [c.size, c.colour, c.expected, c.current]),
      [
        ["M", "", 5, 3],
        ["M", "Maroon", 1, 0],
      ],
    );
  });

  it("rejects a size-matrix save over moved stock with 409 STOCK_CHANGED", async () => {
    mock.method(ProductRepository, "exists", async () => true);
    mock.method(ProductVariantRepository, "replaceForProduct", async () => {
      const err = new Error("VARIANT_STOCK_CHANGED");
      err.code = "VARIANT_STOCK_CHANGED";
      err.conflicts = [{ index: 0, size: "M", colour: "Maroon", expected: 5, current: 3 }];
      throw err;
    });

    const error = await rejected(() =>
      ProductVariantService.replaceForProduct(PROD, [
        { size: "m", colour: "Maroon", stockQuantity: 5, expectedStock: 5 },
      ]),
    );

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "STOCK_CHANGED");
    assert.match(error.errors["Maroon M"], /from 5 to 3/);
  });

  it("passes expectedStock through only when it was sent", async () => {
    mock.method(ProductRepository, "exists", async () => true);
    const replace = mock.method(ProductVariantRepository, "replaceForProduct", async () => []);

    await ProductVariantService.replaceForProduct(PROD, [
      { size: "M", stockQuantity: 5, expectedStock: 4 },
      { size: "L", stockQuantity: 2 },
    ]);

    const [, rows] = replace.mock.calls[0].arguments;
    assert.equal(rows[0].expectedStock, 4);
    assert.equal("expectedStock" in rows[1], false);
  });

  it("refuses to delete a single size that still holds stock unless forced", async () => {
    const remove = mock.method(ProductVariantRepository, "delete", async (_id, { force }) =>
      force
        ? { status: "deleted", row: { id: VAR } }
        : {
            status: "blocked",
            row: { id: VAR, product_name: "Silk Kurti", size: "M", colour: "", stock_quantity: 4 },
          },
    );

    const error = await rejected(() => ProductVariantService.delete(VAR));
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "VARIANT_HAS_STOCK");

    assert.deepEqual(await ProductVariantService.delete(VAR, { force: "true" }), { id: VAR });
    assert.equal(remove.mock.calls[1].arguments[1].force, true);
  });

  it("builds summaries from every row of each product on the page", async () => {
    mock.method(ProductVariantRepository, "findAll", async () => ({
      rows: [{ id: VAR, product_id: PROD, size: "M", colour: "", stock_quantity: 1, active: true }],
      total: 3,
    }));
    const forSummaries = mock.method(ProductVariantRepository, "findForSummaries", async () => [
      { product_id: PROD, size: "M", colour: "", stock_quantity: 1, active: true },
      { product_id: PROD, size: "L", colour: "", stock_quantity: 4, active: true },
      { product_id: PROD, size: "XL", colour: "", stock_quantity: 4, active: true },
    ]);

    const result = await ProductVariantService.getAll({ page: 1, limit: 1 });

    assert.deepEqual(forSummaries.mock.calls[0].arguments[0], [PROD]);
    assert.equal(result.summaries[PROD].sizeCount, 3);
    assert.equal(result.summaries[PROD].totalStock, 9);
  });
});

// ============================================================
// SIZE CHARTS AND THE ATTRIBUTE REGISTER (B12, B13)
// ============================================================

describe("size charts and attribute values", () => {
  it("refuses to delete a chart products are still cut to", async () => {
    mock.method(SizeChartRepository, "findById", async () => ({ id: VAR, fit: "Slim Fit" }));
    mock.method(SizeChartRepository, "countProductsWithFit", async () => 2);
    const remove = mock.method(SizeChartRepository, "remove", async () => true);

    const error = await rejected(() => SizeChartService.remove(VAR));

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "SIZE_CHART_IN_USE");
    assert.match(error.message, /2 products are cut to "Slim Fit"/);
    assert.equal(remove.mock.callCount(), 0);
  });

  it("refuses a value that differs from an existing one only by case", async () => {
    mock.method(AttributeValueRepository, "findCaseInsensitiveMatch", async () => ({
      id: VAR,
      value: "Silk",
    }));
    const create = mock.method(AttributeValueRepository, "create", async () => ({}));

    const error = await rejected(() =>
      AttributeValueService.create({ groupName: "fabric", value: "silk" }),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.errors.value, /"Silk"/);
    assert.equal(create.mock.callCount(), 0);
  });
});
