# Salwar Butterfly — Manual Test Scenarios

| Item | Detail |
|---|---|
| Application | Salwar Butterfly online store (storefront + admin panel) |
| Build under test | Branch `developer`, commit 7610527 or later |
| Document version | 1.0 |
| Prepared on | 14 October 2026 |
| Prepared for | Manual QA testers |

---

## 1. How to use this document

### 1.1 Scope

This document covers manual functional testing of:

- **Storefront (shopper side):** home page, shop listing, product page, bag, checkout, Razorpay payment, order tracking, customer account, addresses, wishlist.
- **Admin panel:** sign-in, dashboard, products, sizes, photos, attributes, categories, size charts, home carousel, customer stories, inventory, orders, customers, reviews, reports.
- **Cross-cutting checks:** sessions, access control, rate limits, notifications, SEO and redirects.

These features **do not exist** in this build. Do not raise defects because they are missing:

- OTP login, Google or social login, email verification.
- Cash on delivery. Payment is online only, through Razorpay.
- Sub-category browsing on the storefront. Sub-categories exist only in the admin API.
- A customer review form or customer story upload. Only the admin creates these.
- A customer returns flow. Returns are handled over WhatsApp, per the policy page.
- A refund button for the admin. Refunds are made in the Razorpay dashboard.
- Admin password reset and an admin-user management screen. Admins are created from the command line.
- Exporting reports to CSV, Excel or PDF.
- Tax (GST) lines. Shipping is always free.

### 1.2 Test environment checklist

Complete these before starting:

1. Frontend is running (default `http://localhost:3000`) and backend API is running (`/api/health` returns `status: ok`).
2. **Razorpay is in TEST mode** (test keys only). Never use live keys for testing.
3. The Razorpay webhook is pointed at the test backend, with the webhook secret set.
4. Email (Resend) and WhatsApp are configured if you are testing notifications (Section 15). Otherwise expect those messages to be skipped.
5. `NODE_ENV` is **not** `test`. Rate limits are switched off in test mode, so the rate-limit cases would wrongly pass.
6. You have at least one admin account (created with `npm run admin:create`).

> **Data safety warning.** If the test environment shares a database with real data, do not delete, deactivate or edit anything you did not create yourself. Before any delete test, note down the exact item you created and delete only that item. Prefer a separate test database.

### 1.3 Test accounts and data to prepare

| Ref | What | Notes |
|---|---|---|
| TD-01 | Customer A | Valid email you can receive mail at, phone `9876543210`, password `Test@1234` |
| TD-02 | Customer B | A second customer, used for "another user's data" tests |
| TD-03 | Admin user | Role `admin` |
| TD-04 | Super admin user | Role `super_admin` (optional; both roles have the same rights) |
| TD-05 | Product P1 | Active, with photos, sizes S/M/L, stock 25 each, priced ₹1,000 with 20% off |
| TD-06 | Product P2 | Active, sold by colour (two colours), one colour fully sold out |
| TD-07 | Product P3 | Active, one size with stock **1** (for "last piece" tests) |
| TD-08 | Product P4 | Active but with **no photos** (should not appear on the storefront) |
| TD-09 | Product P5 | Inactive |
| TD-10 | Sample images | One JPEG, one PNG, one WebP under 5 MB; one 6 MB image; one `.gif`; one `.txt` renamed to `.jpg` |
| TD-11 | Razorpay test card / UPI | Success card, failure card, and the Razorpay test UPI ID `success@razorpay` / `failure@razorpay` |

### 1.4 Columns in the test tables

- **ID** — unique test case number.
- **Scenario** — what is being tested.
- **Steps** — numbered actions in order.
- **Expected result** — what must happen for a pass. Text in quotes is the exact message the app should show.
- **Pri** — priority. H = must pass before release; M = important; L = nice to have.
- **Result** — fill in Pass / Fail / Blocked / N/A, and the defect ID if it failed.

Cases marked **[Known gap]** check behaviour that the code review suspects is wrong. Run them and record what actually happens. A failure here confirms a defect that is already suspected.

---

## 2. Customer sign-up

Sign-up, sign-in and forgot password all happen in one pop-up (the "sign-in dialog"). Open it from the person icon in the header.

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| REG-01 | Successful sign-up | 1. Open the sign-in dialog. 2. Click "Create one". 3. Enter name, email, phone `9876543210`, password `Test@1234`. 4. Submit. | Account is created and you are signed in automatically. Toast "Account created — Anything you had saved on this device is now on your account." Dialog closes. Header shows you are signed in. | H | |
| REG-02 | Name is empty | Leave name blank, fill the rest, submit. | "Name is required". Account is not created. | H | |
| REG-03 | Name too short | Name = `A`. | "Name must be at least 2 characters". | M | |
| REG-04 | Name too long | Name with 256 characters. | "Name must not exceed 255 characters". | L | |
| REG-05 | Invalid email | Email = `abc@`, `abc.com`, `a b@x.com` (try each). | "Invalid email format". | H | |
| REG-06 | Email with capitals and spaces | Email = `  Test.User@Mail.COM  `. | Account is created. Email is saved in lower case without the spaces (check on the Account page). | M | |
| REG-07 | Phone number empty | Leave phone blank. | "Phone number is required". | H | |
| REG-08 | Invalid phone | Try `12345`, `0987654321` (starts with 0), `98765abc10`. | "Invalid phone number format". | H | |
| REG-09 | Phone with spaces and dashes | Phone = `98765-43 210`. | Accepted. The spaces and dash are removed before saving. | M | |
| REG-10 | Phone with +91 | Phone = `+919876543211`. | Accepted. | M | |
| REG-11 | Password too short | Password = `abc1234` (7 characters). | "Password must be at least 8 characters". | H | |
| REG-12 | Password too long | Password with 73 characters. | "Password must not exceed 72 characters". | L | |
| REG-13 | Password complexity | Password = `aaaaaaaa`. | Accepted. There are no complexity rules for customers. | L | |
| REG-14 | Email already registered | Sign up again with Customer A's email. | "Email already registered". | H | |
| REG-15 | Phone already registered | New email, but Customer A's phone. | "Phone number already registered". | H | |
| REG-16 | Same phone, different format | Customer A registered with `9876543210`. Register a new account with `+919876543210`. | **[Known gap]** Expected for the business: refused as a duplicate. Current code compares the exact text, so a second account may be created. Record the result. | M | |
| REG-17 | Several fields wrong at once | Leave name, email and phone blank. Submit. | Each field shows its own error. Toast "Check your details" with "3 fields need fixing." | M | |
| REG-18 | Guest wishlist merges on sign-up | 1. While signed out, heart 2 products. 2. Sign up. 3. Open `/wishlist`. | Both products are in the account's wishlist. | H | |
| REG-19 | Dialog closes and discards input | Type half the form, press Escape, reopen. | Dialog closed on Escape. Fields are empty when reopened. | L | |

---

## 3. Customer sign-in, sessions and sign-out

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| LOG-01 | Successful sign-in | Sign in with Customer A. | Toast "Welcome back, {name} — Your wishlist follows you now." Header shows signed-in state. | H | |
| LOG-02 | Wrong password | Correct email, wrong password. | Red banner and toast "Could not sign you in", message "Invalid email or password". | H | |
| LOG-03 | Unknown email | Email never registered. | Exactly the same message as LOG-02 ("Invalid email or password"). It must not say the email doesn't exist. | H | |
| LOG-04 | Email is case-insensitive | Sign in with Customer A's email in capitals. | Signs in. | M | |
| LOG-05 | Empty fields | Submit with both fields blank. | "Email is required" and "Password is required". | M | |
| LOG-06 | Show / hide password | Click the eye icon in the password field. | Password switches between hidden and visible. | L | |
| LOG-07 | Session survives page reload | Sign in, then refresh the page (F5). | You stay signed in. | H | |
| LOG-08 | Session survives closing the browser | Sign in, close the browser fully, reopen the site within 30 days. | You are still signed in. | M | |
| LOG-09 | Sign-in syncs across tabs | Open the site in two tabs. Sign in in tab 1. Switch to tab 2. | Tab 2 also shows you signed in, without a manual refresh or after focusing it. | M | |
| LOG-10 | Sign-out | Click "Sign out" on `/account`. | Toast "Signed out — Your bag stays on this device." Account page shows "Sign in" and "Create an account". Bag contents are still there. | H | |
| LOG-11 | Sign-out syncs across tabs | Signed in on two tabs. Sign out in tab 1. | Tab 2 also becomes signed out. | M | |
| LOG-12 | Account page while signed out | Signed out, open `/account`. | The sign-in dialog opens by itself once, with "Sign in to see your account." | M | |
| LOG-13 | Account page with a hash | Signed out, open `/account#sizes`. | The sign-in dialog does **not** open by itself. | L | |
| LOG-14 | Access token expiry | Sign in. Leave the tab idle for over 15 minutes. Then open the account page or perform an action. | The app renews the session silently. You remain signed in. | H | |
| LOG-15 | Sign-in from the wishlist banner | Signed out on `/wishlist`, click the sign-in prompt. | The sign-in dialog opens. | L | |

---

## 4. Forgot and reset password

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| FP-01 | Request a reset link | 1. In the sign-in dialog click "Forgot password?". 2. Enter Customer A's email. 3. Click "Send reset link". | Screen "Check your email — If an account exists for {email}…It works once and expires in 30 minutes." An email with a link arrives. | H | |
| FP-02 | Email carries over | Type an email on the sign-in form, then click "Forgot password?". | The email is already filled in. | L | |
| FP-03 | Unknown email | Enter an email that has no account. | Same success screen as FP-01 (it must not reveal whether the account exists). No email is sent. | H | |
| FP-04 | Repeat request within 60 seconds | Request twice within 60 seconds. | Both show success. Only **one** email is received. | M | |
| FP-05 | Only the newest link works | Request a link, wait over 60 s, request again. Open the **first** link and try to reset. | "This reset link has expired or has already been used. Please ask for a new one." | H | |
| FP-06 | Reset with a valid link | Open the latest link. Enter a new password twice. Submit. | "Password changed — You have been signed out everywhere for safety." You can sign in with the new password, not the old one. | H | |
| FP-07 | Passwords don't match | Type different values in "New password" and "Type it again". | "The two passwords do not match". | M | |
| FP-08 | New password too short | New password 7 characters. | "Password must be at least 8 characters". | M | |
| FP-09 | Link used twice | Use a link successfully, then open it again and try to reset. | "This reset link has expired or has already been used. Please ask for a new one." | H | |
| FP-10 | Link expired | Request a link, wait 31 minutes, then use it. | Same expired/used message as FP-09. | M | |
| FP-11 | Link without token | Open `/reset-password` with no `?token=`. | "This link is incomplete" and a "Go to sign in" button. | M | |
| FP-12 | Tampered token | Change a few characters of the token in the URL, or use `?token=abc`. | "This reset link is not valid. Please ask for a new one." or the expired/used message. | M | |
| FP-13 | Other devices are signed out | Sign in on browser X. Reset the password from browser Y. Go back to X and refresh. | Browser X is signed out. | H | |
| FP-14 | "Ask for a new link" button | On an expired-link error, click "Ask for a new link". | **[Known gap]** Expected: opens the forgot-password form. Code opens the sign-in form instead. Record the result. | L | |
| FP-15 | Reset page not in search engines | View page source of `/reset-password`. | Has a `noindex` robots meta tag. | L | |

---

## 5. Account page — profile and change password

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| PRO-01 | View profile | Signed in, open `/account`. | Shows "Hello, {name}", your details card, address book, order history. | H | |
| PRO-02 | Edit name | Click "Edit", change name, "Save details". | "Your details were updated." and toast "Details updated". New name shows after a refresh. | H | |
| PRO-03 | Save button disabled with no change | Click "Edit" and change nothing. | "Save details" is disabled. | L | |
| PRO-04 | Edit to a taken email | Change the email to Customer B's email. | "Email already in use". | H | |
| PRO-05 | Edit to a taken phone | Change the phone to Customer B's phone. | "Phone number already in use". | H | |
| PRO-06 | Invalid values | Enter an invalid email or a 5-digit phone. | "Invalid email format" / "Invalid phone number format". | M | |
| PRO-07 | Change email without verification | Change your email to a new valid one, save, sign out, sign in with the new email. | Works. Note: no password or email verification is asked. Report to the product owner if this is not acceptable. | M | |
| PRO-08 | Change password | Enter current password and a new one. Submit. | Toast "Password changed — You stay signed in on this device." You can sign in with the new password. | H | |
| PRO-09 | Wrong current password | Enter a wrong current password. | "Invalid current password". | H | |
| PRO-10 | New password same as current | Enter the same value in both fields. | "That is your current password". | M | |
| PRO-11 | New password too short | New password 7 characters. | "Password must be at least 8 characters". | M | |
| PRO-12 | Submit disabled until both filled | Fill only one field. | Submit button is disabled. | L | |
| PRO-13 | Other devices after password change | Sign in on browser X and Y. Change the password on X. Refresh Y. | Y is signed out, X stays signed in. **[Known gap]** The page text says other devices "stay signed in until that session expires", which contradicts this. Log the wording as a defect. | M | |

---

## 6. Address book

Addresses are managed on `/account` and offered at checkout.

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ADDR-01 | Empty state | New customer, open `/account`. | Address book shows "Nothing saved yet…". | L | |
| ADDR-02 | Add first address | Click "Add an address". Fill street, city, state, PIN `600001`. Save. | "That address was saved." It is marked as the default even though you did not tick the box. | H | |
| ADDR-03 | State pre-filled | Open the add form. | State is pre-filled as "Tamil Nadu". | L | |
| ADDR-04 | Required fields | Submit with street, city and PIN empty. | "Address line 1 is required", city required, "PIN code is required". Toast "Check the address". | H | |
| ADDR-05 | Invalid PIN | Try `60001` (5 digits), `060001` (starts with 0), `60000A`. | "PIN code must be 6 digits". PIN field accepts at most 6 characters. | H | |
| ADDR-06 | Field length limits | Label over 40 characters; street over 255; city over 120. | Field stops at the limit, or "{Field} must not exceed N characters". | L | |
| ADDR-07 | Add second address as default | Add a second address, tick "Use this as my default delivery address". | The new address becomes the default. The first loses the default mark. | H | |
| ADDR-08 | Maximum of 3 addresses | Add a third address. | After 3, "Add an address" is disabled with the tooltip "You already have 3 saved." and the note "That is all 3. Remove one to add another." | H | |
| ADDR-09 | Edit an address | Edit the city of an address and save. | "That address was updated." | H | |
| ADDR-10 | Set default | Make another address the default. | "Default address updated." The default is listed first. | M | |
| ADDR-11 | Default checkbox hidden | Edit the address that is currently default. | The default checkbox is not shown. | L | |
| ADDR-12 | Delete — confirm prompt | Click "Remove" on an address. | An inline confirm appears with "Remove" and "Keep it". "Keep it" cancels. | M | |
| ADDR-13 | Delete a non-default address | Remove a non-default address. | "That address was removed." It disappears from the list. | H | |
| ADDR-14 | Delete the default address | Remove the default when others exist. | The oldest remaining address becomes the default. | H | |
| ADDR-15 | Old orders unaffected | Place an order with address X, then edit address X. | The order still shows the original address. | M | |

---

## 7. Wishlist

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| WISH-01 | Save as guest | Signed out, click the heart on a product card. | Heart fills at once. Toast "Saved to wishlist" with a "View wishlist" action. | H | |
| WISH-02 | Guest wishlist page | Open `/wishlist`. | Shows the saved product, "N pieces saved on this device", and "Saved on this browser only. Sign in…". | M | |
| WISH-03 | Remove from wishlist | Click the filled heart again. | Toast "Removed from wishlist". Item disappears from `/wishlist`. | H | |
| WISH-04 | Guest list merges on sign-in | As a guest, heart 2 products. Sign in with an account that already has 1 other item. | Wishlist now has all 3 items. | H | |
| WISH-05 | Wishlist follows the account | Signed in, heart a product. Sign in from another browser. | The product is in the wishlist there too. | H | |
| WISH-06 | Wishlist cleared after sign-out | Sign out, open `/wishlist`. | Shows the guest (device) list, not the account's list. | M | |
| WISH-07 | Empty state | Remove everything. | "No saved pieces yet". | L | |
| WISH-08 | Product deactivated after saving | Heart P1. In admin, deactivate P1. Reload `/wishlist` (allow up to ~1 minute for caches). | P1 is no longer shown. Reactivate it and it returns. | M | |
| WISH-09 | Server refuses | Heart a product while the backend is stopped. | Heart reverts. Toast "Could not save that". | L | |
| WISH-10 | Wishlist page text | Open `/wishlist` with items. | Shows "Runs are short — a saved piece is not a reserved one." | L | |

---

## 8. Home page

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| HOME-01 | Page loads | Open `/`. | Sections appear in order: banner carousel, trust bar, categories, fabric strip, product tabs, customer stories, story, policies, follow us. | H | |
| HOME-02 | Banner carousel rotation | Watch the carousel. | Slides change every 5 seconds. Only active banners appear, in the order set by the admin. | H | |
| HOME-03 | Banner links | Click a banner linked to an active product. | Opens that product page. A banner with no product, or a product that is inactive, is shown but not clickable. | M | |
| HOME-04 | Reduced motion | Turn on "reduce motion" in OS settings, reload. | Carousel does not auto-rotate. | L | |
| HOME-05 | No banners | Hide all banners in admin, reload (allow up to 5 minutes). | An illustrated fallback hero is shown, not an empty space. | M | |
| HOME-06 | Categories | Check the category tiles. | Only active categories with at least one sellable product. Ordered by number of products, then name. | M | |
| HOME-07 | Click a category | Click a category tile. | Filters are cleared, that category is selected, page scrolls to the product section. | M | |
| HOME-08 | Products without photos are hidden | Search for P4 (no photos). | P4 does not appear anywhere on the storefront. | H | |
| HOME-09 | Inactive products are hidden | Search for P5 (inactive). | P5 does not appear. | H | |
| HOME-10 | Customer stories | Check the "Worn, and sent back to us" section. | Shows published stories. 4 on a phone, 9 on a wide screen, with "Show all N photographs" to expand. | M | |
| HOME-11 | No stories | Unpublish all stories (allow up to 5 minutes). | The stories section is hidden completely. | L | |
| HOME-12 | WhatsApp and Instagram links | Click the follow links. | WhatsApp opens `wa.me/918778921938`; Instagram opens the shop profile. | L | |
| HOME-13 | Backend down | Stop the API, reload `/`. | "Something went wrong" error page (no blank or broken page). | M | |

---

## 9. Shop — listing, tabs, filters, search

Open `/shop`. The same product section also appears on the home page.

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| SHOP-01 | Default tab | Open `/shop`. | "New In" tab is selected; newest products first. Count "N pieces" shown. | H | |
| SHOP-02 | No On Offer tab | Look at the tabs. Open `/shop?tab=offers`. | Only New In, Lowest Price and Almost Gone. The old offers URL opens on New In. | M | |
| SHOP-03 | Lowest Price tab | Click "Lowest Price". | Products sorted from cheapest to most expensive. | H | |
| SHOP-04 | Almost Gone tab | Click "Almost Gone". | Only in-stock products with fewer than 20 pieces, lowest stock first. | M | |
| SHOP-05 | Swipe between tabs (phone) | On a phone, swipe left/right on the grid. | Tab changes. Does not wrap from last to first. | L | |
| SHOP-06 | Category filter | Pick a category. | Only that category's products. | H | |
| SHOP-07 | Fabric filter (multi-select) | Pick 2 fabrics. | Products of either fabric. | M | |
| SHOP-08 | Size filter | Pick size M. | Only products that have M **in stock**. | H | |
| SHOP-09 | Price filter | Pick a price band such as "Under ₹500". | Only products in that range. Upper edge is excluded (₹500 is not "Under ₹500"). | M | |
| SHOP-10 | In-stock only | Turn on "In stock only". | Sold-out products are hidden. | M | |
| SHOP-11 | Rating filter | Pick "4+". | Only products rated 4 or more. Products with no reviews are hidden. | L | |
| SHOP-12 | Combined filters | Category + size + price. | Only products matching all of them. | M | |
| SHOP-13 | No results | Choose filters that match nothing. | "Nothing matches that yet" and a "Clear filters" button. Clicking it shows all products. | M | |
| SHOP-14 | Search from header | Type a product name in the header search. | Goes to `/shop?q=…` with matching products. | H | |
| SHOP-15 | Search by several words | Search `cotton M`. | Products matching **both** words (e.g. cotton in size M). | M | |
| SHOP-16 | Search is not case-sensitive | Search `COTTON` and `cotton`. | Same results. | M | |
| SHOP-17 | Search by piece code | Copy a piece code (e.g. `SB-1A2B3C4D`) from a product page and search it. | That product is found. | L | |
| SHOP-18 | Search by colour | Search a colour name used by P2. | P2 is found. | L | |
| SHOP-19 | Load more | With more than 12 results, click "Show 12 more". | 12 more products load. Button shows the remaining count when fewer than 12 are left. | H | |
| SHOP-20 | Count resets | Load more, then change a filter. | Back to the first 12 results. | L | |
| SHOP-21 | URL filters | Open `/shop?tab=lowest&size=M&q=cotton`. | Lowest Price tab, size M and search "cotton" are applied. | M | |
| SHOP-22 | Bad URL filter values | Open `/shop?tab=xyz&category=nonsense`. | Ignored: New In tab, all categories. No error. | L | |
| SHOP-23 | Product card badges | Look at cards. | "X% off" on discounted items, "Sold out" on sold-out items, "Only N left — order fast!" when 1–19 pieces left. | H | |
| SHOP-24 | Hover second photo | Hover a card with 2+ photos (desktop). | Shows the second photo. | L | |
| SHOP-25 | Add from card | On P1's card, pick size S and add. | "Added to bag". Without a size, button reads "Select a size" and does nothing. | H | |
| SHOP-26 | Colour products from card | On P2's card. | Button reads "Choose a colour" (or "Sold out — see colours") and opens the product page. It cannot be added from the card. | M | |

---

## 10. Product page

Open `/product/{id}` for each test product.

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| PDP-01 | Page content | Open P1. | Name, photos, price, sizes, size chart button, details list, policy points, related products, breadcrumb "Home > Shop > Category > Name". | H | |
| PDP-02 | Price and discount | P1 priced ₹1,000, 20% off. | Shows ₹800, MRP ₹1,000 struck through, "20% off", "You save ₹200". | H | |
| PDP-03 | No discount | Product with 0% off. | Only the price; no MRP, no "% off". | M | |
| PDP-04 | Photo gallery | Use arrows, thumbnails and swipe. | Photos change. "Photo i of n" shown. With one photo, there are no arrows or thumbnails. | M | |
| PDP-05 | Size selection | Before picking a size. | "Pick a size to see how many are left." Button "Select a size". | H | |
| PDP-06 | Stock message per size | Pick a size with 1 left (P3). | "Last one left in size X." | H | |
| PDP-07 | Low total stock | Product with under 20 total pieces. | "Only N left across all sizes — order fast!" | M | |
| PDP-08 | Sold-out size | Size with 0 stock. | Chip is struck through and cannot be selected. | H | |
| PDP-09 | Fully sold out | Product with no stock at all. | "Sold out — this run has ended." Button "Sold out". WhatsApp link reads "Ask the shop if this run returns". | H | |
| PDP-10 | Colour selection | Open P2. | First colour that has stock is selected. Sold-out colour swatch is struck through, labelled "{colour} — sold out". | H | |
| PDP-11 | Sizes change with colour | Switch colour on P2. | Size chips change to that colour's sizes and stock. | H | |
| PDP-12 | All sizes gone in a colour | Select the sold-out colour. | "Every size in {colour} is gone — try another colour." | M | |
| PDP-13 | Quantity limited by stock | P1 size S (25 in stock). Raise quantity. | Stops at 20 with "20 of one size is the most a single order may carry." | H | |
| PDP-14 | Quantity counts the bag | Open P3 and add the size that has stock 1 to the bag. Reopen P3 and select the same size. | Button reads "All of it is in your bag". | H | |
| PDP-15 | Size chart | Click the size chart button. | Opens the chart that matches the product's fit, in inches by default. | M | |
| PDP-16 | WhatsApp enquiry | Click "Ask about this piece on WhatsApp". | WhatsApp opens with the shop's number. | L | |
| PDP-17 | Reviews section | Product with published reviews. | Stars near the title link to `#reviews`. Section shows "N reviews", average and breakdown, newest first. | M | |
| PDP-18 | No reviews | Product with no reviews. | No reviews section and no stars. | L | |
| PDP-19 | Over 50 reviews | (Only if data allows) product with more than 50 reviews. | "Showing the 50 most recent of M." | L | |
| PDP-20 | Related products | Scroll to related products. | Up to 4 products from the same category (or same fabric), in-stock first. | L | |
| PDP-21 | Unknown product | Open `/product/00000000-0000-0000-0000-000000000000`. | "We could not find that piece" page. Browser tab title "Piece not found". | H | |
| PDP-22 | Inactive product link | Open P5's product URL directly. | Same "We could not find that piece" page. | H | |

---

## 11. Bag

The bag is stored in the browser, not on the server.

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| BAG-01 | Add to bag | Add P1 size M, quantity 2. | Toast "Added to bag". Bag icon count updates. | H | |
| BAG-02 | View bag | Open `/bag`. | Lists item, size, colour, quantity, price and line total. Total = sum of lines. | H | |
| BAG-03 | Change quantity | Use + and − on a line. | Quantity and totals update. + is disabled at the stock or 20 limit. | H | |
| BAG-04 | Remove item | Remove a line. | Toast "Removed from bag". | H | |
| BAG-05 | Empty bag | Remove all. | "Your bag is empty". | M | |
| BAG-06 | Same item twice | Add P1 size M twice. | One line, quantity increases (not two lines). | M | |
| BAG-07 | Different sizes are separate lines | Add P1 sizes S and M. | Two lines. | M | |
| BAG-08 | Bag line limit (15) | Add 15 different size/colour lines, then a 16th. | "Your bag is full — A bag holds up to 15 pieces, counting each size separately…" | M | |
| BAG-09 | Add more than stock | P3 (stock 1): add it, then try again from the product page or card. | "That is all of it already — That is the last one on the shelf." | H | |
| BAG-10 | Stock drops while in bag | Add 5 of P1 size M. In admin, set that size's stock to 2. Reload `/bag` (wait ~1 minute for caches). | Quantity is reduced to 2. Message "Only 2 left — that is all of them." | H | |
| BAG-11 | Item sells out while in bag | Add P1 size L. In admin, set its stock to 0. Reload `/bag`. | Line shows "Size L sold out since you added it — remove it before you check out." Checkout is blocked until removed. | H | |
| BAG-12 | Price changes while in bag | Add P1. In admin, change P1's price. Reload `/bag` after ~1 minute. | Bag shows the new price. (Note: there is no notice that the price changed.) | M | |
| BAG-13 | Bag survives reload and sign-in/out | Add items, reload, sign in, sign out. | Items are still in the bag each time. | H | |
| BAG-14 | Bag in two tabs | Add an item in tab 1. Look at tab 2 without reloading. | Tab 2 does not update until it is reloaded. Record behaviour; this is expected in the current build. | L | |
| BAG-15 | Bag page text | Read the copy on `/bag`. | **[Known gap]** Page says "Nothing is charged at checkout — the shop confirms your order and sends a payment link" and "nothing here is reserved until the shop confirms it". In reality payment happens at checkout through Razorpay and stock is held when the order is placed. Log the wording as a defect. | M | |

---

## 12. Checkout and placing an order

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| CHK-01 | Guest checkout | Signed out with items in bag. Go to `/checkout`, fill contact and address, click "Place order". | Toast "Order SB-xxxxxx placed — Your sizes are held for you. Pay on the next screen…". Goes to `/checkout/done`. Bag is emptied. | H | |
| CHK-02 | Signed-in checkout pre-fill | Signed in, go to checkout. | Name, email and phone pre-filled. Saved addresses shown as choices, default chosen first. | H | |
| CHK-03 | Use a new address and save it | Signed in with fewer than 3 addresses. Enter a new address, tick "Save this address to my account", place order. | Order placed; address appears in the address book. | M | |
| CHK-04 | Save option hidden | With 3 saved addresses, or as a guest, or when the new address equals a saved one. | "Save this address to my account" is not offered. | L | |
| CHK-05 | Required field errors | Submit with name, email, phone, street, city and PIN empty. | Each field shows its error. Toast "Your order was not placed". | H | |
| CHK-06 | Invalid email / phone / PIN | Use `abc@`, `12345`, `06000`. | "Invalid email format", "Invalid phone number format", "PIN code must be 6 digits". | H | |
| CHK-07 | State dropdown | Open the state list. | List of states, Tamil Nadu selected by default. Country is fixed as India. | L | |
| CHK-08 | Order note | Add a note under 1000 characters. | Accepted and visible in the admin order page. | L | |
| CHK-09 | WhatsApp opt-in | Check the checkbox. | "WhatsApp me updates about this order" is ticked by default. Unticking it means no WhatsApp messages for this order (see NOTIF-04). | M | |
| CHK-10 | Order summary | Look at the summary. | Subtotal, Shipping "Free all over India", Total = subtotal. No tax line. | H | |
| CHK-11 | Place order button disabled | Have a sold-out item in the bag. | Banner "One piece in your bag can no longer be ordered" or the sold-out banner; "Place order" disabled. | H | |
| CHK-12 | Double-click "Place order" | Double-click quickly. | Only one order is created (check admin Orders). | H | |
| CHK-13 | Last piece bought by two people | Two browsers, both with P3's last piece in the bag. Place order in browser 1, then browser 2. | Browser 1 succeeds. Browser 2: "{Product} (…) sold out while you were checking out. Remove it from your bag to continue." | H | |
| CHK-14 | Partial stock at checkout | Bag has 5 of a size. Admin sets stock to 3 just before you place the order. | "Only 3 left of {Product} (…). Reduce the quantity to continue." | H | |
| CHK-15 | Product deactivated at checkout | Admin deactivates a product in your bag just before you place the order. | "{Product} (…) is no longer on sale. Remove it from your bag to continue." | M | |
| CHK-16 | Price changes at checkout | Admin changes P1's price within a minute before you place the order. | Order total uses the **new** price. Confirmation page shows the server's total. Note any mismatch with what checkout showed. | M | |
| CHK-17 | Stock is held on order | Note the stock of a size in admin. Place an order for 2 (do not pay). | Admin stock for that size drops by 2 immediately. | H | |
| CHK-18 | Order number format | Place an order. | Number looks like `SB-001001` (SB- plus 6 digits), increasing with each order. | M | |
| CHK-19 | Checkout page not indexed | View source of `/checkout`. | Contains `noindex`. | L | |

---

## 13. Payment (Razorpay — test mode)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| PAY-01 | Successful payment | After placing an order, on `/checkout/done` click Pay now. Pay with a test success card or `success@razorpay`. | Razorpay window opens with name/email/phone pre-filled. After payment the page shows "Thank you…". Admin shows the order as Confirmed and payment Paid. | H | |
| PAY-02 | Payment window closed | Open Pay now, then close the Razorpay window. | "Payment cancelled. Your order is still here — the pieces are held for you." Pay now is still available. | H | |
| PAY-03 | Payment declined | Pay with a test failure card / `failure@razorpay`. | Razorpay's error text, or "The payment did not go through. Nothing has been charged." Order stays Awaiting payment; you can retry. | H | |
| PAY-04 | Retry after failure | After PAY-03, retry with a success card. | Payment succeeds; order becomes Confirmed. | H | |
| PAY-05 | Double-click Pay now | Click Pay now twice quickly, or refresh and click again. | Only one Razorpay order is created (check Razorpay dashboard). | M | |
| PAY-06 | Close tab right after paying | Pay successfully, then immediately close the tab before the page updates. | Within a minute the webhook confirms the order. Admin shows Confirmed / Paid. | H | |
| PAY-07 | Only one confirmation | After any successful payment. | Customer receives exactly one "order confirmed" email and WhatsApp message. Admin receives one new-order alert. | H | |
| PAY-08 | Payments switched off | Remove Razorpay keys from the backend config and restart. Place an order. | No Pay now button. Done page says "If you would rather pay another way, the shop will be in touch on WhatsApp." | M | |
| PAY-09 | Ad blocker blocks Razorpay | Enable an ad blocker that blocks `checkout.razorpay.com`. Click Pay now. | "The payment window could not be loaded. An ad blocker will do this — try again with it paused, or on another browser." | L | |
| PAY-10 | Pay for a cancelled order | Cancel a pending order (ORD-08), then try to pay it from `/track`. | Refused: "This order was cancelled and cannot be paid for." | H | |
| PAY-11 | Pay an already-paid order | After PAY-01, try paying the same order again via `/track`. | No Pay now button, or "This order has already been paid for." | H | |
| PAY-12 | Pay another account's order | Customer A places an order. Signed in as Customer B (or as guest), try to pay it. | Refused with "Order not found" or "Sign in first to pay for it from your account." | H | |
| PAY-13 | Payment error message | Force a verification failure (ask a developer to help if needed). | **[Known gap]** The page shows "Your payment went through and the shop is confirming it…" even when verification fails. Log as a defect if seen. | M | |
| PAY-14 | Cancel while paying | Open the Razorpay window for a pending order. In another tab cancel the order. Then complete the payment. | **[Known gap]** Money is taken but the order stays Cancelled with no warning to admin. Record the result and the order number. | M | |
| PAY-15 | Refund from Razorpay | Refund a test payment from the Razorpay dashboard. | Within a minute, admin shows payment status Refunded. Order status itself is unchanged. | M | |
| PAY-16 | Unpaid order holds stock | Place an order and never pay. Check stock the next day. | Stock stays reserved (no automatic expiry). Confirm this is acceptable with the product owner. | M | |

---

## 14. Order confirmation, tracking, history and cancellation

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ORD-01 | Confirmation page — unpaid | Right after placing an order. | "One step left / Almost there, {first name}" with Pay now. | H | |
| ORD-02 | Confirmation page in a new tab | Copy `/checkout/done` URL into a new tab. | "Nothing to show here" with links to Track and Shop. | L | |
| ORD-03 | Track an order | On `/track`, enter order number and the email used. | Shows the order, status, items and total. | H | |
| ORD-04 | Short order number | Enter `1001` or `sb-1001` instead of `SB-001001`. | Finds the same order. | M | |
| ORD-05 | Wrong email or number | Correct number, wrong email (and vice versa). | Same message: "No order found with that number and email". | H | |
| ORD-06 | Badly formatted number | Enter `ABC`. | "Order numbers look like SB-001042". | L | |
| ORD-07 | Order history | Signed in, open `/account`. | Your orders listed, newest first. "Show older orders" when there are more than 20. Guest orders are not shown. | H | |
| ORD-08 | Customer cancels unpaid order | In order history, click "Cancel this order" on an Awaiting-payment order. | Order becomes Cancelled. Stock goes back up in admin. Note: there is no "Are you sure?" prompt — log as a usability issue. | H | |
| ORD-09 | Cannot cancel a paid order | Look for the cancel option on a Confirmed order. | Not offered. If attempted: "This order is already being prepared. Contact the shop to cancel it." | H | |
| ORD-10 | Guest cannot cancel | As a guest, view an order on `/track`. | No cancel option. | M | |
| ORD-11 | Status labels | Move an order through each status in admin; view it as the customer. | Labels: Awaiting payment, Confirmed, Packed, On its way, Delivered, Cancelled. Courier and tracking number shown once packed. Admin notes are never shown to the customer. | H | |
| ORD-12 | Other customer's order | Open Customer A's order URL/ID while signed in as Customer B. | "Order not found". | H | |
| ORD-13 | Cancelled paid order wording | Admin cancels a paid order. View it as the customer. | **[Known gap]** Text "nothing was charged" is shown although the customer did pay. Log as a defect. | M | |
| ORD-14 | Returns page | Open `/returns`. | Policy page (48-hour returns via WhatsApp). **[Known gap]** It says orders cannot be cancelled once placed, which contradicts ORD-08. | L | |

---

## 15. Notifications (email and WhatsApp)

No message is sent when an order is placed but unpaid. Messages are sent within about 1 minute of the event.

| ID | Scenario | Trigger | Expected result | Pri | Result |
|---|---|---|---|---|---|
| NOTIF-01 | Order paid | Pay an order (PAY-01) or admin confirms payment. | Customer: email "Order confirmed — SB-…" and WhatsApp confirmation with amount. Admin: email "New order SB-… — ₹{total} from {name}" and WhatsApp alert. | H | |
| NOTIF-02 | Order packed | Admin marks Packed with courier and tracking. | Customer: email "Your order is packed — SB-…" with tracking, and WhatsApp. | H | |
| NOTIF-03 | Shipped / delivered / cancelled | Admin marks Shipped, then Delivered; cancel another order. | WhatsApp only for each (no email). | M | |
| NOTIF-04 | WhatsApp opt-out | Place an order with the WhatsApp box unticked, then pay. | No WhatsApp to the customer. Email still sent. | M | |
| NOTIF-05 | No message for unpaid order | Place an order, don't pay. | No email or WhatsApp. | M | |
| NOTIF-06 | Unusable phone for WhatsApp | Checkout with phone `5876543210`, pay. | Order succeeds. No customer WhatsApp is sent (number can't be used). Email still sent. | L | |
| NOTIF-07 | Password reset email | FP-01. | Email arrives with a working link. | H | |

---

## 16. Old links, SEO and error pages

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| SEO-01 | Old cart link | Open `/cart`. | Redirects to `/bag`. | M | |
| SEO-02 | Old search link | Open `/search?q=cotton`. | Redirects to `/shop?q=cotton`. | M | |
| SEO-03 | Old account sub-pages | Open `/account/orders`. | Redirects to `/account`. | L | |
| SEO-04 | Old policy pages | Open `/pages/track-order`, `/pages/refund-policy`, `/pages/privacy-policy`, `/pages/about`, `/policies/shipping-policy`, `/policies/terms`. | Go to `/track`, `/returns`, `/privacy`, `/`, `/returns`, `/privacy` respectively. | L | |
| SEO-05 | Old collection links | Open `/collections/all`, `/collections/{a category name}`, `/collections/{a fabric}` e.g. `/collections/kalamkari`. | `/shop`, `/shop?category=…`, `/shop?fabric=…`. | M | |
| SEO-06 | Old product links | Open `/products/{product name as slug}`. | Redirects to that product page. Unknown name → `/shop` or a search. | M | |
| SEO-07 | robots.txt | Open `/robots.txt`. | Blocks `/admin`, `/account`, `/bag`, `/wishlist`, `/checkout`, `/reset-password`, `/track`. Points to the sitemap. | L | |
| SEO-08 | Sitemap | Open `/sitemap.xml`. | Lists home, shop, returns, privacy and every active product page. | L | |
| SEO-09 | Page titles | Visit home, shop, bag, product pages. | Tab titles like "The Shop · Salwar Butterfly". Product title uses the product name. | L | |
| SEO-10 | Share preview | Paste a product URL into WhatsApp or use a social preview tool. | Shows product photo, name and price. | L | |
| SEO-11 | Unknown page | Open `/this-does-not-exist`. | A 404 page is shown (currently the default Next.js 404; a branded page is not built). | L | |

---

## 17. Admin sign-in and sessions

Admin panel: `/admin`. Sign-in: `/admin/login`.

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AAUTH-01 | Successful sign-in | Sign in with TD-03. | Lands on `/admin/products` (or the page you were trying to reach). | H | |
| AAUTH-02 | Wrong password / unknown email | Try each. | Same message: "Invalid email or password". | H | |
| AAUTH-03 | Empty / invalid fields | Blank email; email `abc@`; blank password. | "Email is required", "Invalid email format", "Password is required". | M | |
| AAUTH-04 | Admin pages need sign-in | Signed out, open `/admin/orders`. | Redirects to `/admin/login?next=/admin/orders`. After sign-in you land on `/admin/orders`. | H | |
| AAUTH-05 | Unsafe redirect blocked | Open `/admin/login?next=//evil.com` and `?next=https://evil.com`, then sign in. | You land on `/admin/products`, never on the outside site. | H | |
| AAUTH-06 | Customer cannot use admin | Sign in as a customer on the storefront, then open `/admin`. | Not allowed in; admin sign-in is required. | H | |
| AAUTH-07 | Session survives reload | Sign in, refresh. | Still signed in. | H | |
| AAUTH-08 | Idle over 15 minutes | Leave idle 16+ minutes, then click around. | Session renews silently; no sign-out. | M | |
| AAUTH-09 | Sign-out | Sign out. | Back at login. Pressing Back does not show admin data. | H | |
| AAUTH-10 | Sign-out across tabs | Admin open in two tabs; sign out in one. | Other tab is signed out too. | M | |
| AAUTH-11 | Deactivated admin | While admin X is signed in, a developer deactivates X in the database. X clicks something. | **[Known gap]** Expected: immediate clean sign-out. Current code may show an error first and sign out only on the next refresh. Record the result. | L | |
| AAUTH-12 | Roles | Sign in as `admin` and as `super_admin`. | Both can reach and use every admin page (no role differences exist in this build). | L | |

---

## 18. Admin dashboard

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| DASH-01 | Tiles load | Open `/admin`. | Tiles: Today, This week, This month (orders and revenue), Awaiting payment, Products live, Sizes low, Sizes sold out, Pieces in stock, Customers. | H | |
| DASH-02 | Revenue counts paid orders only | Note today's revenue. Place an unpaid order; then pay a different order. | Revenue unchanged by the unpaid order; increases by the paid order's total. | H | |
| DASH-03 | Awaiting payment tile | Click it. | Opens Orders filtered to pending payment. Count matches. | M | |
| DASH-04 | Latest orders / Needs reordering | Check both lists. | Up to 10 rows each. Low stock = 1–19 pieces; sold out = 0. | M | |
| DASH-05 | Time zone | Place a paid order close to midnight IST. | It counts in the correct IST day. | L | |

---

## 19. Admin — products

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| APROD-01 | Create a product | Products > Add. Name, category, price ₹1,000, 10% off, fit, description. Save. | Product created. URL slug filled from the name. Sale price ₹900. | H | |
| APROD-02 | Required fields | Save with name, category, price blank. | Error on each field. | H | |
| APROD-03 | Name length | Name 1 character; 201 characters. | Rejected (2–200 characters). | L | |
| APROD-04 | Slug format | Slug `My Product!`. | "Product slug may contain only lowercase letters, numbers and hyphens". | M | |
| APROD-05 | Duplicate slug | Use an existing product's slug. | `A product with the slug "x" already exists`. | H | |
| APROD-06 | Price limits | Price 0; −5; 1000000. | "Base price must be at least 0.01" / "Base price cannot be negative" / "Base price exceeds maximum limit". | M | |
| APROD-07 | Discount 100% | Discount 100. | "A 100% discount would make this product free". | M | |
| APROD-08 | Discount leaves ₹0 | Price ₹100, discount 99.99. | "That discount leaves the customer paying ₹0". | L | |
| APROD-09 | Fit must have a size chart | Enter a fit with no published size chart. | `No size chart is published for the fit "X". The shop's fits are: …` | M | |
| APROD-10 | Description length | Over 5000 characters. | Rejected. | L | |
| APROD-11 | Edit product | Edit name and price, save. | Saved. Storefront shows the change within about a minute. | H | |
| APROD-12 | Edit tabs | Open edit, switch tabs details/pricing/sizes/photos; open `…/edit?tab=photos`. | Tabs switch; URL tab opens directly. | L | |
| APROD-13 | Deactivate / activate | Toggle status. | Deactivated product disappears from storefront (≈1 min); reappears when activated. | H | |
| APROD-14 | Product list filters | Use search, category, status, discount, featured, stock, sort, pagination; grid and list views. | Results match each filter. | M | |
| APROD-15 | Bulk activate / deactivate | Select several products, Activate / Deactivate. | All selected change. Partial failures are listed. | M | |
| APROD-16 | Bulk discount | Select several, Discount… 15%. | All selected get 15% off. Value outside 0–100: "Discount must be between 0 and 100." | M | |
| APROD-17 | Delete an unsold product | Create a test product, then delete it. | Product removed, along with its sizes and photos. | H | |
| APROD-18 | Delete a product that has orders | Delete a **test** product that has been ordered. | **[Known gap]** UI says products with orders cannot be deleted. Code may actually allow it. Record what happens and check that the old order still displays. | H | |
| APROD-19 | Move products to another category | Category edit > Associated products, or bulk category change. | Products move to the new category. | M | |

### 19.1 Bulk product upload (`/admin/products/bulk`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ABULK-01 | Create several products | Pick category, shared price and description. Fill 3 rows. Create. | 3 products created, each with sizes 36/38/40/42 at stock 0 unless changed. | H | |
| ABULK-02 | Row inherits shared price | Leave one row's price blank. | That product uses the shared price. | M | |
| ABULK-03 | No rows | Clear all rows, submit. | "Fill in at least one row". | L | |
| ABULK-04 | Duplicate slugs in rows | Two rows with the same name. | "Two rows would have the same URL slug". | M | |
| ABULK-05 | Slug already in use | Row whose slug matches an existing product. | "N slug(s) are already in use: …". Nothing is created. | M | |
| ABULK-06 | Row error | Make one row invalid (e.g. 1-character name). | "Row n (name): …" naming the problem row. | M | |
| ABULK-07 | Photo upload partial failure | Include a 6 MB photo for one row. | Products created; toast "N products created, but X did not get their … photographs". | L | |

---

## 20. Admin — sizes and stock per product

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AVAR-01 | Add sizes | On the product's Sizes tab, add S, M, L with stock. Save. | Saved. Sizes show in upper case. | H | |
| AVAR-02 | Sizes with colours | Add size M in Red and M in Blue. | Saved as two separate sizes. | H | |
| AVAR-03 | Duplicate size+colour | Add M / Red twice. | "…is listed more than once" or "This product already has that size in that colour". | M | |
| AVAR-04 | Stock limits | Stock −1; 1.5; 1000001. | Rejected (whole number, 0 to 1,000,000). | M | |
| AVAR-05 | Stock changed by someone else | Open the Sizes tab in two tabs. Save a stock change in tab 1. Change and save in tab 2. | Tab 2: "Stock changed for … since this page was loaded. Reload the sizes and save again — nothing was saved." with a reload option. | H | |
| AVAR-06 | Delete a size with stock | Delete a size that still has stock. | "{product} ({size}) still holds N in stock. Set its stock to 0 or deactivate it…". | H | |
| AVAR-07 | Delete an empty size | Set stock 0, then delete. | Deleted. | M | |
| AVAR-08 | Deactivate a size | Deactivate a size. | It is no longer offered on the storefront. | M | |

---

## 21. Admin — product photos

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AIMG-01 | Upload JPEG, PNG, WebP | Upload one of each. | All three appear. First one is the cover. | H | |
| AIMG-02 | Too large | Upload a 6 MB image. | "{name} is 6 MB — the limit is 5 MB." | H | |
| AIMG-03 | Wrong type | Upload a `.gif`. | "{name} is not a JPEG, PNG or WebP." | H | |
| AIMG-04 | Fake image | Upload a text file renamed `.jpg`. | "Image n (name) is not a valid image. Only JPEG, PNG and WebP are allowed." | H | |
| AIMG-05 | One bad file in a batch | Upload 3 good images and 1 bad. | Whole batch rejected; no images added. | M | |
| AIMG-06 | 20-photo limit | Upload until the product has 20, then add one more. | "This product already has the maximum of 20 images. Remove one before adding another." | M | |
| AIMG-07 | Reorder photos | Drag a photo to first place, save. | It becomes the cover on the storefront. | H | |
| AIMG-08 | Delete cover photo | Delete the first photo. | Next photo becomes the cover. | M | |
| AIMG-09 | Alt text | Add alt text over 200 characters. | "Alt text must not exceed 200 characters". | L | |
| AIMG-10 | Delete all photos | Remove every photo of a test product. | Product disappears from the storefront (no photo = not shown). | M | |

---

## 22. Admin — approved attributes (`/admin/products/attributes`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AATTR-01 | Add a colour with hex | Group `colour`, value "Maroon", hex `#7B1E3A`. | Saved. Swatch shows on product pages that use it. | M | |
| AATTR-02 | Invalid hex | Hex `red` or `#12345`. | "Colour must be a hex code such as #7B1E3A". | L | |
| AATTR-03 | Duplicate value | Add "maroon" when "Maroon" exists. | `"maroon" is already in this group` (case does not matter). | M | |
| AATTR-04 | Fit group not allowed | Group `fit`. | "Fits are not registered here — add a size chart for the fit instead". | L | |
| AATTR-05 | Rename a value in use | Rename a colour used by products. | Renamed everywhere; message says how many products were updated. | M | |
| AATTR-06 | Delete a value in use | Delete a value used by products. | `"X" is used by N product(s) — retire it instead of deleting it`. | M | |

---

## 23. Admin — categories

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ACAT-01 | Create category | Name, slug auto-filled, description, image (600×400 recommended), active. Save. | Created. Appears on the storefront once it has a sellable product. | H | |
| ACAT-02 | Duplicate name / slug | Reuse an existing name; then an existing slug. | "Category with this name already exists" / "Category with this slug already exists". | M | |
| ACAT-03 | Slug rules | Blank slug; 1-character slug. | "A URL slug is required." / "A URL slug needs at least 2 characters." | L | |
| ACAT-04 | Image too large / wrong type | 6 MB image; `.gif`. | Rejected with size / type message. | M | |
| ACAT-05 | Edit category and replace image | Change name and image. | Saved; new image shows. | M | |
| ACAT-06 | Hide category | Toggle visibility off on the list. | Category and its products vanish from the storefront. | H | |
| ACAT-07 | Move products in | Associated products tab, tick products, save. | Products move into this category. If the move fails: "Category saved, products not moved". | M | |
| ACAT-08 | Delete category (API only) | No delete button exists in the UI. (Optional, developer-assisted API test: delete a category that still has products.) | `"Name" still has N products and M sub-categories. Move or delete them before deleting the category.` | L | |

---

## 24. Admin — size charts (`/admin/size-charts`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ASC-01 | Create chart | Fit "Regular", title, unit inches, columns size/bust/waist/hip, rows S/M/L with values. Save. | Created. Product pages with fit "Regular" show it. | H | |
| ASC-02 | Duplicate fit | Create another chart for "Regular". | "There is already a chart for 'Regular'. Edit that one instead." | M | |
| ASC-03 | First column must be size | Remove or move the size column. | Rejected. | L | |
| ASC-04 | Measurement range | Value 0 or 401. | "Row n (M): bust must be between 1 and 400". | M | |
| ASC-05 | Duplicate row size | Two rows labelled M. | Rejected. | L | |
| ASC-06 | Hide chart | Set inactive. | Not shown on the storefront. | M | |
| ASC-07 | Reorder charts | Change order, save. | Storefront shows the new order (when all charts are shown). | L | |
| ASC-08 | Delete chart in use | Delete a chart whose fit is used by products. | `N products are cut to "X". Change their fit, or hide this chart instead of deleting it.` | M | |
| ASC-09 | Unit cm | Set unit to cm. | Storefront shows cm. | L | |

---

## 25. Admin — home carousel (`/admin/home/carousel`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ABAN-01 | Upload banners | Upload 2 images. | Two banners added, active, shown on the home page (within ~5 minutes). | H | |
| ABAN-02 | No file | Click upload with nothing chosen. | "Choose at least one banner image". | L | |
| ABAN-03 | More than 8 at once | Select 9 images. | Rejected (max 8 per upload). | M | |
| ABAN-04 | 12-banner limit | Fill to 12 banners, add one more. | "The carousel already holds 12 banners…" | M | |
| ABAN-05 | Link to product | Link a banner to a product; remove the link. | Banner clicks through to the product; unlinked banner is not clickable. | M | |
| ABAN-06 | Hide banner | Set inactive. | Disappears from the home page. | H | |
| ABAN-07 | Reorder | Change order. | Home page rotates in the new order. | M | |
| ABAN-08 | Replace image | Replace a banner's image. | New image shown. | L | |
| ABAN-09 | Delete banner | Delete one **test** banner. | Removed permanently (no undo). | M | |

---

## 26. Admin — customer stories (`/admin/home/stories`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ASTORY-01 | Add stories | Upload photos (1–8), add name and quote, link a product. | Stories created and published; shown on the home page. | H | |
| ASTORY-02 | No photo | Upload with none chosen. | "Choose at least one photograph". | L | |
| ASTORY-03 | More than 8 photos | Select 9. | "At most 8 photographs can be uploaded at once". | M | |
| ASTORY-04 | Text limits | Name over 120 characters; quote over 600. | Rejected. | L | |
| ASTORY-05 | Unpublish | Unpublish a story. | Hidden on the home page. | M | |
| ASTORY-06 | Reorder | Reorder stories. | Home page follows the new order. | L | |
| ASTORY-07 | 60-story limit | (If practical) reach 60, add one more. | "There are already 60 stories…" | L | |

---

## 27. Admin — inventory (`/admin/inventory`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AINV-01 | View inventory | Open the page. | Every size listed with stock and status. Summary counts at top. | H | |
| AINV-02 | Filters and sort | Filter by status (in stock, low, out, unavailable), category, search; sort by stock. | Results match. | M | |
| AINV-03 | Add / remove stock | Adjust +5, then −3. | Stock changes accordingly. | H | |
| AINV-04 | Adjust by zero | Adjustment 0. | "Adjustment cannot be zero". | L | |
| AINV-05 | Below zero | Stock 2, adjust −5. | "Only 2 in stock — that would take … below zero." | H | |
| AINV-06 | Set exact stock | Set stock to 10. | Stock = 10. | H | |
| AINV-07 | Stale screen | Open in two tabs. Change stock in tab 1. Set stock in tab 2. | "That stock count changed while this screen was open. Reload and try again." | M | |
| AINV-08 | Bulk adjust all-or-nothing | Bulk adjust where one line would go below zero. | "…would take it below zero. Nothing was changed." No lines change. | M | |
| AINV-09 | Storefront reflects stock | Set a size to 0. | Storefront shows it sold out (≈1 min). | H | |

---

## 28. Admin — orders

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AORD-01 | Order list | Open `/admin/orders`. | Orders listed. Filters (status, payment status, search, sort) work. | H | |
| AORD-02 | Order detail | Open an order. | Customer, address, items, totals, note, timeline (Placed, Payment confirmed, Packed, Handed to the courier, Delivered, Cancelled). | H | |
| AORD-03 | Confirm payment manually | Pending order > Confirm payment, optional reference. | Order Confirmed, payment Paid. Customer gets confirmation messages. | H | |
| AORD-04 | Mark packed — tracking required | Mark packed without courier or tracking number. | Both fields required. | H | |
| AORD-05 | Mark packed | Courier name, tracking number, tracking link `https://…`. | Status Packed; customer sees courier details; packed email sent. | H | |
| AORD-06 | Invalid tracking link | Tracking link `www.x.com` or `ftp://x`. | "Tracking link must be a full web address starting with https://". | M | |
| AORD-07 | Ship and deliver | Mark Shipped, then Delivered. | Status updates; timeline stamps each step. Delivered cannot change further. | H | |
| AORD-08 | Skipping steps not allowed | Try to mark a Confirmed order Shipped directly; or a Delivered order anything. | "An order that is confirmed can only become: …" / "This order is delivered and cannot be changed." | H | |
| AORD-09 | Cancel needs a reason | Admin cancel with blank reason. | Reason required. | M | |
| AORD-10 | Cancel confirmed or packed order | Cancel with a reason. | Order Cancelled; stock returned. Note: **no refund is made automatically** — refund in Razorpay manually. | H | |
| AORD-11 | Cannot cancel shipped | Try to cancel a Shipped order. | "An order that is shipped cannot be cancelled — it has already been dispatched." | H | |
| AORD-12 | Two admins at once | Open the same order in two tabs. Change status in tab 1, then in tab 2. | Tab 2: "This order changed while the screen was open. Reload and try again." | M | |
| AORD-13 | Confirm a cancelled order | Try to confirm payment on a cancelled order. | "This order was cancelled and cannot be confirmed." | M | |
| AORD-14 | Paid then cancelled in revenue | Cancel a paid order; check the dashboard. | Revenue still includes it until refunded. Confirm this is acceptable with the business. | L | |

---

## 29. Admin — customers

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| ACUST-01 | Customer list and search | Search by name, email, phone. Sort and page. | Matching customers. | H | |
| ACUST-02 | Edit customer | Change name/phone. | Saved. Customer sees change on their account. | M | |
| ACUST-03 | Duplicate email / phone | Set to another customer's email or phone. | "Email already in use" / "Phone number already in use". | M | |
| ACUST-04 | Close account | Close a **test** customer's account. | Toast "{name}'s account was closed." The customer can no longer sign in ("Invalid email or password"). Their orders remain visible to admin. | H | |
| ACUST-05 | Closed account's open session | Customer signed in on a browser; admin closes the account; customer keeps browsing and refreshes. | The customer should be signed out. **[Known gap]** Sessions may not be ended immediately. Record what happens. | M | |
| ACUST-06 | Re-register with closed email | Sign up again with the closed account's email. | "This email belonged to a closed account. Use a different email, or contact the shop to reopen that account." | M | |

---

## 30. Admin — reviews

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AREV-01 | Create review | Product, author name, rating 5, title, body. Save. | Published by default. Visible on the product page within 5 minutes. | H | |
| AREV-02 | Required fields | No product; no author name. | "A product must be chosen" / "A name to publish the review under is required". | M | |
| AREV-03 | Rating range | Rating 0, 6, 3.5. | "Rating must be a whole number between 1 and 5". | M | |
| AREV-04 | Text limits | Title over 150; body over 2000. | Rejected ("Review cannot exceed 2000 characters"). | L | |
| AREV-05 | Unpublish | Unpublish a review. | Disappears from the product page; average and count update. | M | |
| AREV-06 | Edit / delete | Edit text; delete a **test** review. | Changes reflected on the storefront. | M | |

---

## 31. Admin — reports (`/admin/reports`)

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| AREP-01 | Sales report | Sales tab, group by day/week/month. | Revenue and units per period; top sellers (by units or revenue). Cancelled orders excluded from best-sellers. | H | |
| AREP-02 | Default range | Open without dates. | Last 30 days / 12 weeks / 12 months for day/week/month. | L | |
| AREP-03 | Orders report | Orders tab with status and payment filters. | Matches the order list. | M | |
| AREP-04 | Inventory report | Inventory tab, filter by category. | Stock summary, per-category breakdown, low and out-of-stock lists. | M | |
| AREP-05 | End before start | From 2026-10-10, To 2026-10-01. | "The end of the range cannot fall before its start". | M | |
| AREP-06 | Impossible date | 2026-02-31. | "… is not a real date". | L | |
| AREP-07 | Year out of range | 1999-01-01 or 2101-01-01. | "From must fall between 2000 and 2100". | L | |
| AREP-08 | Too long a range | Daily report over 2 years. | "That range is N days long — more than the 400 a single report will return…" | M | |
| AREP-09 | Figures match dashboard | Compare this month's revenue here and on the dashboard. | Same figure. | M | |

---

## 32. Security and cross-cutting checks

| ID | Scenario | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| SEC-01 | Sign-in rate limit (customer) | Try 11 sign-ins within 15 minutes from one network. | 11th attempt: "Too many authentication attempts. Please try again later." | H | |
| SEC-02 | Sign-up rate limit | 11 sign-ups within 15 minutes. | "Too many sign-up attempts. Please try again in a few minutes." | M | |
| SEC-03 | Forgot-password rate limit | 6 requests within 15 minutes. | "Too many password reset requests. Please try again in a few minutes." | M | |
| SEC-04 | Checkout rate limit | 21 place-order / pay attempts within 15 minutes. | "Too many checkout attempts. Please try again in a few minutes." | M | |
| SEC-05 | Track order rate limit | 31 tracking lookups within 15 minutes. | Refused with a "too many" message. | L | |
| SEC-06 | Admin sign-in rate limit | 11 admin sign-ins within 15 minutes. | "Too many authentication attempts. Please try again later." | H | |
| SEC-07 | Customer cannot read another's data | As Customer B, try Customer A's order ID or address ID (via the URL or a developer tool). | "Order not found" / "Address not found". Nothing of A's is shown. | H | |
| SEC-08 | Admin API without sign-in | Developer-assisted: call an admin endpoint (e.g. `/api/products/getAllProducts`) with no token. | 401 "Authentication token is required". | H | |
| SEC-09 | Customer token on admin API | Developer-assisted: call an admin endpoint with a customer's token. | 403 "You do not have permission to perform this action". | H | |
| SEC-10 | No passwords or tokens in browser storage | Open browser DevTools > Application > Local Storage after signing in. | No password or access token stored. Only `sb.customer.user` (name/email/phone), `sb.bag`, `sb.wishlist`. | M | |
| SEC-11 | Session cookie flags | DevTools > Cookies. | `sb_customer_refresh` / `sb_admin_refresh` are HttpOnly, SameSite=Strict, and Secure on the live (HTTPS) site. | M | |
| SEC-12 | Unknown API route | Open `/api/does-not-exist`. | 404 "Route not found: GET /api/does-not-exist". | L | |
| SEC-13 | Health checks | Open `/api/health` and `/api/health/db`. | Both return `status: ok`. | M | |
| SEC-14 | Error pages hide internals | On the production-like environment, cause a server error. | Generic message "Internal Server Error"; no code or stack trace shown. | M | |
| SEC-15 | Script injection in text | Enter `<script>alert(1)</script>` as a name, address, review body or order note; view it on storefront and admin. | Shown as plain text; no pop-up appears. | H | |

---

## 33. End-to-end journeys

Run these after the module tests pass. Each one chains many features together.

| ID | Journey | Steps | Expected result | Pri | Result |
|---|---|---|---|---|---|
| E2E-01 | New customer buys and receives an order | 1. Admin creates product with sizes and photos. 2. Shopper finds it via search. 3. Signs up during browsing. 4. Adds to bag, checks out with a new saved address. 5. Pays by Razorpay test card. 6. Admin marks Packed, Shipped, Delivered. 7. Customer tracks the order at each step. | Every step works. Stock decreases by the ordered quantity. Customer gets confirmation, packed, shipped and delivered messages. Dashboard and reports include the sale. | H | |
| E2E-02 | Guest buys and tracks | Guest checkout, pays, tracks with order number + email. | Order confirmed; tracking shows each status update. | H | |
| E2E-03 | Abandoned then cancelled | Place order, close payment window, later cancel from account. | Stock returns to its original level. No payment taken. | H | |
| E2E-04 | Admin cancels a paid order and refunds | Customer pays; admin cancels with reason; admin refunds in Razorpay dashboard. | Order Cancelled; stock returned; payment shows Refunded; customer gets cancellation WhatsApp. | M | |
| E2E-05 | Last piece race | Two shoppers try to buy the same last piece at the same time. | Exactly one order succeeds; stock never goes below 0. | H | |
| E2E-06 | Mobile journey | Repeat E2E-02 on a phone (Android Chrome and iPhone Safari). | Layout fits the screen; no sideways scrolling; Razorpay works on mobile; UPI option is available. | H | |

---

## 34. Browser and device coverage

Run at least the High-priority cases on:

| Platform | Browser |
|---|---|
| Windows desktop | Chrome (latest), Edge (latest), Firefox (latest) |
| macOS | Safari (latest) |
| Android phone | Chrome |
| iPhone | Safari |

---

## 35. Known issues to confirm

The code review found the following likely problems. Each one has a test case above. Confirm or reject each one and raise a defect where confirmed.

| # | Issue | Test case |
|---|---|---|
| 1 | Bag page says no payment at checkout and nothing is reserved; in fact payment is via Razorpay and stock is held on order. | BAG-15 |
| 2 | Password-change form says other devices stay signed in; they are actually signed out. | PRO-13 |
| 3 | Payment page shows "Your payment went through" even when verification fails. | PAY-13 |
| 4 | Customer can pay for an order that was cancelled while the payment window was open; money taken with no alert. | PAY-14 |
| 5 | Cancelled paid orders tell the customer "nothing was charged". | ORD-13 |
| 6 | Returns policy says orders can't be cancelled; the app allows cancelling unpaid orders. | ORD-14 |
| 7 | Customer cancel has no confirmation prompt. | ORD-08 |
| 8 | Product with existing orders may be deletable, despite the UI warning. | APROD-18 |
| 9 | Phone numbers in different formats (`98…` vs `+9198…`) can create duplicate accounts. | REG-16 |
| 10 | Closing a customer account may not end their active session. | ACUST-05 |
| 11 | Deactivated admin is not signed out cleanly mid-session. | AAUTH-11 |
| 12 | "Ask for a new link" on an expired reset link opens sign-in, not forgot-password. | FP-14 |
| 13 | Unpaid orders hold stock forever (no automatic expiry). | PAY-16 |
| 14 | Delivery time shown as "10 working days" in one place and "5–10 working days" elsewhere. | Check footer/feature text vs product page |
| 15 | Shop logo used in the Razorpay window points to a disabled image host, so it may not load. | PAY-01 (look at the logo in the Razorpay window) |

---

## 36. Defect report template

| Field | Value |
|---|---|
| Defect ID | |
| Test case ID | |
| Title | |
| Environment / browser / device | |
| Steps to reproduce | |
| Expected result | |
| Actual result | |
| Screenshot / video | |
| Order number or product (if any) | |
| Severity (Critical / High / Medium / Low) | |
| Reported by / date | |

---

## 37. Test sign-off

| Module | Total cases | Passed | Failed | Blocked | Tester | Date |
|---|---|---|---|---|---|---|
| Customer account (2–7) | | | | | | |
| Storefront (8–11) | | | | | | |
| Checkout and payment (12–15) | | | | | | |
| SEO and redirects (16) | | | | | | |
| Admin (17–31) | | | | | | |
| Security (32) | | | | | | |
| End-to-end (33) | | | | | | |

Release recommendation: ☐ Go ☐ Go with known issues ☐ No go

Signed: ______________________ Date: ______________
