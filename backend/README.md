# backend

Express 5 + PostgreSQL (`pg`) API for Salwar Butterfly.

## Setup

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm install
npm run db:check       # verifies the PostgreSQL connection
npm run db:migrate     # applies src/migrations/*.sql in order
npm run dev            # http://localhost:4000
```

### Creating an admin

There is no admin sign-up endpoint — accounts are provisioned from
the CLI. Omit `--password` and the script prompts for it with the
input masked, so the password never reaches your shell history:

```bash
npm run admin:create -- --name "Your Name" --email you@example.com --role super_admin
```

Roles are `admin` and `super_admin`.

## Structure

```
backend/
├── .env.example            # template — copy to .env (git-ignored)
├── package.json
└── src/
    ├── server.js           # http server, startup DB check, graceful shutdown
    ├── app.js              # express app: middleware + route mounting
    ├── config/
    │   ├── env.js          # validated environment config
    │   ├── db.js           # pg Pool, query(), withTransaction(), connectDb(), closeDb()
    │   ├── cloudinary.cdn.js
    │   ├── razorpay.gateway.js
    │   └── *.policy.js     # one module per feature's rules — see below
    ├── migrations/         # numbered .sql, applied by npm run db:migrate
    ├── routes/             # index.js mounts every feature router under /api
    ├── validators/         # request *shape* checks only
    ├── controllers/        # req/res handling only
    ├── services/           # business logic; owns every rule worth enforcing
    ├── repository/         # SQL, one file per feature (uses config/db.js)
    ├── mapper/             # database rows → the shape the API returns
    ├── dto/                # input shapes
    ├── models/             # entity definitions
    ├── middlewares/        # auth, authorization, uploads, rate limits, errors
    ├── utils/              # ApiError, asyncHandler, apiResponse, jwt, logger
    └── scripts/            # db:check, db:migrate, admin:create, import-catalogue
```

Request flow:
`routes → validators → controllers → services → repository → db`,
with `mapper` on the way back out.

**Policy modules.** `config/*.policy.js` is where a feature's rules live
when the validator, the service and the repository all need to agree
about them — `stock.policy.js` (what "low stock" means),
`order.policy.js` (which status transitions are legal),
`payment.policy.js`, `report.policy.js` (where a day starts) and
`review.policy.js`. Several are duplicated as CHECK constraints in the
migrations, deliberately: the module decides what the application will
accept, the constraint stops a value nobody defined reaching the table
at all, including through `psql`.

## Authentication

Two kinds of token, both signed with the same `JWT_SECRET` and told
apart by a `typ` claim — `"admin"` or `"customer"`. That claim is
load-bearing: without it a storefront customer's token would verify
perfectly well against an admin route, so `requireAdmin` and
`requireCustomer` check it rather than trusting the signature alone.

The **Auth** column below uses:

| Value      | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| —          | public; no token                                                |
| admin      | `authenticate` + `requireAdmin`                                 |
| customer   | `authenticate` + `requireCustomer`                              |
| either     | any valid token; ownership is checked in the service            |
| optional   | a token is used if sent, and must be valid if it is             |
| signature  | not a token — an HMAC over the request body                     |

Access control is applied at the **mount** in `routes/index.js` wherever
a whole router has one audience, so a new endpoint in that router cannot
forget its guard. The four routers that serve more than one audience —
`/admin/auth`, `/customers`, `/orders`, `/payments` — guard themselves
route by route, with the reason next to each.

There is no admin sign-up endpoint. Accounts are provisioned from the
CLI; see [Creating an admin](#creating-an-admin).

## Endpoints

All paths are relative to `/api`.

### Health

| Method | Path          | Auth | Description           |
| ------ | ------------- | ---- | --------------------- |
| GET    | `/health`     | —    | process liveness      |
| GET    | `/health/db`  | —    | database reachability |

### Authentication — F-01

| Method | Path                        | Auth     | Description                              |
| ------ | --------------------------- | -------- | ---------------------------------------- |
| POST   | `/admin/auth/login`         | —        | issue an admin JWT (10 req/15 min)       |
| GET    | `/admin/auth/me`            | admin    | the signed-in admin                      |
| POST   | `/admin/auth/logout`        | admin    | audit-only; the client drops the token   |
| POST   | `/customers/auth/login`     | —        | issue a customer JWT (10 req/15 min)     |
| GET    | `/customers/auth/me`        | customer | the signed-in shopper                    |
| PUT    | `/customers/auth/me`        | customer | edit own profile (F-05.02, F-05.06)      |
| POST   | `/customers/auth/logout`    | customer | audit-only                               |

Email OTP (F-01.02, F-01.03) is not implemented — the project has no
mail provider yet. The token a password login issues is the same shape
OTP would issue, so adding it later is a second route ending in the
same `generateToken` call.

### Storefront — F-06 (public reads)

The only unauthenticated reader in the system, and deliberately narrow:
GET only, no writes, and a column list named one field at a time in
`storefront.repository.js`. Opening a new public read means adding a
line to that file.

| Method | Path                            | Auth | Description                                    |
| ------ | ------------------------------- | ---- | ---------------------------------------------- |
| GET    | `/storefront/getCatalogue`      | —    | the whole shelf: categories, products, sizes, stock, ratings |
| GET    | `/storefront/getProductReviews/:id` | — | published reviews and the score for one piece (F-06.08) |

### Categories — F-02

| Method | Path                          | Auth  |
| ------ | ----------------------------- | ----- |
| POST   | `/categories/createCategory`  | admin |
| GET    | `/categories/getAllCategories` | admin |
| GET    | `/categories/getCategoryById/:id` | admin |
| PUT    | `/categories/updateCategory/:id` | admin |
| DELETE | `/categories/deleteCategory/:id` | admin |

Sub-categories mirror these under `/subCategories`:
`createSubCategory`, `getAllSubCategories`,
`getSubCategoriesByCategory/:categoryId`, `getSubCategoryById/:id`,
`updateSubCategory/:id`, `deleteSubCategory/:id` — all admin.

### Products — F-03

| Method | Path                                | Auth  | Description                          |
| ------ | ----------------------------------- | ----- | ------------------------------------ |
| POST   | `/products/createProduct`           | admin |                                      |
| POST   | `/products/bulkCreateProducts`      | admin | F-03.04                              |
| POST   | `/products/bulkUpdateCategory`      | admin | F-03.07                              |
| GET    | `/products/getAllProducts`          | admin |                                      |
| GET    | `/products/getProductById/:id`      | admin |                                      |
| GET    | `/products/getProductBySlug/:slug`  | admin |                                      |
| PUT    | `/products/updateProduct/:id`       | admin | also applies discounts (F-03.12)     |
| PATCH  | `/products/updateProductStatus/:id` | admin | F-03.11                              |
| DELETE | `/products/deleteProduct/:id`       | admin | F-03.11                              |

**Variants** under `/productVariants` (all admin): `createVariant`,
`replaceProductVariants/:productId`, `getAllVariants`,
`getVariantsByProduct/:productId`, `getVariantById/:id`,
`updateVariant/:id`, `updateVariantStock/:id`, `bulkSetVariantActive`,
`bulkDeleteVariants`, `deleteVariant/:id`.

**Images** under `/productImages` (all admin):
`uploadProductImages/:productId`, `getAllProductImages`,
`getImagesByProduct/:productId`, `reorderProductImages/:productId`,
`updateProductImage/:id`, `deleteProductImage/:id`. The admin guard runs
before multer, so an unauthenticated upload is refused before its body
is written to disk.

**Approved attributes** under `/productAttributes` (all admin, F-03.09):
`createAttributeValue`, `getAllAttributeValues`,
`getAttributeValuesByGroup/:groupName`, `updateAttributeValue/:id`,
`updateAttributeValueStatus/:id`, `deleteAttributeValue/:id`.

### Inventory — F-04

| Method | Path                              | Auth  | Description                                  |
| ------ | --------------------------------- | ----- | -------------------------------------------- |
| GET    | `/inventory/getInventory`         | admin | stock across the catalogue, variant-first    |
| GET    | `/inventory/getInventorySummary`  | admin | the tiles alone                              |
| PATCH  | `/inventory/adjustStock/:id`      | admin | a movement (delta), not a new total          |
| PATCH  | `/inventory/setStock/:id`         | admin | a stock-take; optimistically concurrent      |
| PUT    | `/inventory/bulkAdjustStock`      | admin | a whole delivery, in one transaction         |

Thresholds live in `config/stock.policy.js` and are mirrored on the
client in `frontend/src/lib/stock.js`. Low stock is under 20 (F-04.05,
the FRS's number). Out of stock is a true zero rather than the reserve
buffer F-04.06 suggests — this catalogue stocks one or two pieces per
size, so a floor of ten would take the whole shop off sale. That
deviation is recorded, not coded.

### Customers — F-05

| Method | Path                              | Auth     | Description                        |
| ------ | --------------------------------- | -------- | ---------------------------------- |
| POST   | `/customers/register`             | —        | F-05.01                            |
| POST   | `/customers/:id/change-password`  | customer | own account only (`requireSelf`)   |
| GET    | `/customers/getAllCustomers`      | admin    | F-05.04, paginated and searchable  |
| GET    | `/customers/getCustomerById/:id`  | admin    | F-05.04                            |
| PUT    | `/customers/updateCustomer/:id`   | admin    | F-05.06                            |
| DELETE | `/customers/deleteCustomer/:id`   | admin    | soft delete — orders keep their customer |

### Addresses — F-05.03, F-08.05

The shopper's own address book. Every route is "mine", read off the
token — none of them takes a customer id.

| Method | Path                                | Auth     | Description                            |
| ------ | ----------------------------------- | -------- | -------------------------------------- |
| GET    | `/addresses/getMyAddresses`         | customer | default first, then oldest             |
| POST   | `/addresses/addAddress`             | customer | 409 `ADDRESS_LIMIT_REACHED` past three |
| PUT    | `/addresses/updateAddress/:id`      | customer | a full replace, not a patch            |
| PATCH  | `/addresses/setDefaultAddress/:id`  | customer | one default per customer               |
| DELETE | `/addresses/deleteAddress/:id`      | customer | the oldest survivor inherits `default` |

A saved address and the address on an order are two different things.
`orders.shipping_*` is a snapshot frozen at the sale (see migration 008);
this table is the book the shopper edits, and nothing joins one to the
other. Editing an address here never changes where an old order went.

The field rules are shared with checkout — `validators/address.rules.js`
— so an address the book accepts is one an order can be placed with.

### Wishlist

| Method | Path                          | Auth     | Description                              |
| ------ | ----------------------------- | -------- | ---------------------------------------- |
| GET    | `/wishlist/getMyWishlist`     | customer | every route here is "mine", off the token |
| POST   | `/wishlist/addItem`           | customer | idempotent                               |
| DELETE | `/wishlist/removeItem/:productId` | customer |                                      |
| POST   | `/wishlist/mergeWishlist`     | customer | folds in what was saved before signing in |

### Orders — F-09

Three audiences in one router, so the guards live route by route.

| Method | Path                            | Auth     | Description                                  |
| ------ | ------------------------------- | -------- | -------------------------------------------- |
| POST   | `/orders/placeOrder`            | optional | checkout is open to guests; rate limited     |
| POST   | `/orders/trackOrder`            | —        | order number + email; a POST because it reads secrets |
| GET    | `/orders/getMyOrders`           | customer | F-09.03                                      |
| GET    | `/orders/getAllOrders`          | admin    | F-09.04                                      |
| GET    | `/orders/getOrderSummary`       | admin    | the queue's tiles                            |
| GET    | `/orders/getOrderById/:id`      | either   | ownership checked in the service             |
| POST   | `/orders/confirmPayment/:id`    | admin    | records that the money arrived               |
| PATCH  | `/orders/updateOrderStatus/:id` | admin    | F-09.05; legal transitions only              |
| POST   | `/orders/cancelOrder/:id`       | either   | one act, two windows — see the service       |

### Payments — F-10

| Method | Path                                  | Auth      | Description                              |
| ------ | ------------------------------------- | --------- | ---------------------------------------- |
| GET    | `/payments/getPaymentConfig`          | —         | the publishable key; checkout needs it first |
| POST   | `/payments/webhook`                   | signature | Razorpay's; body parsed as a raw Buffer  |
| POST   | `/payments/createPaymentSession/:orderId` | optional | opens the payment sheet                |
| POST   | `/payments/verifyPayment`             | signature | the checkout return                      |
| GET    | `/payments/getOrderPayments/:orderId` | admin     | the attempts behind one order            |

Online payment is off when `RAZORPAY_KEY_ID` is empty.

### Dashboard & reports — F-11

| Method | Path                              | Auth  | Description                                      |
| ------ | --------------------------------- | ----- | ------------------------------------------------ |
| GET    | `/reports/getDashboard`           | admin | F-11.01/02 — one request for the whole screen    |
| GET    | `/reports/getSalesReport`         | admin | F-11.02/05 — `period`, `from`, `to`, `topSort`   |
| GET    | `/reports/getOrderReport`         | admin | F-11.03 — orders in a range, with quantities     |
| GET    | `/reports/getInventoryReport`     | admin | F-11.04 — stock by status and by category        |

Days, weeks and months are cut in `Asia/Kolkata`, in Postgres. An order
placed at 1am IST belongs to that day; bucketing in UTC would file it
under the previous one.

### Reviews & ratings — F-11.06

Admin-only by design, not by omission: the shop publishes what customers
say on WhatsApp and on the phone, so there is no shopper write path. The
public read is `/storefront/getProductReviews/:id`, which returns four
fields and a date — never the customer link, the email, or the
published flag.

| Method | Path                          | Auth  | Description                            |
| ------ | ----------------------------- | ----- | -------------------------------------- |
| GET    | `/reviews/getReviews`         | admin | filtered by product, stars, visibility |
| GET    | `/reviews/getRatingSummary`   | admin | the score alone                        |
| GET    | `/reviews/getReviewById/:id`  | admin |                                        |
| POST   | `/reviews/createReview`       | admin |                                        |
| PUT    | `/reviews/updateReview/:id`   | admin | partial; `""` clears a field           |
| PATCH  | `/reviews/setPublished/:id`   | admin | hide without deleting                  |
| DELETE | `/reviews/deleteReview/:id`   | admin | hard delete, no undo                   |
