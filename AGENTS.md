# Store template — notes for AI coding agents

Stack: React (Vite SPA, `frontend/`) + Laravel 12 / PHP 8.2 API (`backend/`) + MySQL. Hosted on Hostinger
shared hosting. GitHub Actions (`.github/workflows/deploy.yml`) builds the site into the `site/` folder of the branch it ran on, `main` or `stable` (a bot commit marked `[skip ci]`; never edit `site/` by hand); client sites' Hostinger Git pulls `stable`, while `main` is where work lands and the root `.htaccess` serves `site/` (no SSH, no secrets, no second branch), and `App\Support\Updater` runs migrations on the first request after a pull. See `README.md` and `DEPLOYMENT.md`.

- Do not rewrite published git history (no force-push, rebase or amend of pushed commits).
- Keep `main` deployable: every push to `main` is built into `site/` on `main`, and merging `main` into `stable` is what reaches client sites. Run `git pull --rebase` before pushing, because the workflow adds a "Build site" commit after each push.
- The site ships as an enquiry-only catalogue (WhatsApp) and every selling feature is OFF by default. Cart, checkout,
  wishlist and customer accounts are switched on in Admin -> Store features (`site_settings`, group `commerce`) and are
  enforced on the server (`App\Support\Commerce`), not just hidden in the UI. Keep that: new selling features need a
  switch, and prices/stock/shipping must always be computed on the server from the database, never from the browser.
- Products can have options (Size, Colour...) and variants (`products.options` + `product_variants`). A variant may override
  the price and has its own stock; cart lines are keyed by product + variant (`lineKey`). Variants are written only through
  the product save endpoint, and prices/stock are re-read on the server at checkout.
- Product-card design (5 styles, hover actions, quick view, grid columns) comes from `site_settings` group `appearance`,
  edited in Admin -> Product cards, which previews the real shop in an iframe via postMessage (`lib/appearance.ts`).
- Orders, customers and addresses are admin-read-only in the generic query endpoint; they change only through the
  dedicated endpoints (`CheckoutController`, `AccountController`, `Admin\OrderController`), which write the order timeline.
- Razorpay keys, the reCAPTCHA secret and SMTP accounts are entered in the admin by the main administrator only (`owner@example.com`,
  role `super`) and stored **encrypted** with the app key (`secure_settings`, `smtp_accounts`; `App\Support\Secrets`,
  `App\Support\Mail\SmtpAccounts`). Never return a stored secret to the browser (only whether it is set), never log one, never put
  one in the repo. The `.env` values still work as a fallback. Those endpoints sit behind the `admin.super` middleware, and
  `IntegrationGuard` stops other admins writing integration settings through the generic data API.
- Shipping goes through Shiprocket (`App\Support\Shiprocket`, `Admin\ShippingController`, webhook `/api/webhooks/shiprocket`). The API user's login and the
  webhook token are stored encrypted like the other secrets; the pickup address, default parcel and on/off switch are `site_settings` rows in
  group `integrations` (so only the main administrator can change them). Order staff may create shipments and book couriers.
- Admin notifications: `App\Support\Notifier` writes the shared feed (`admin_notifications`, shown in the bell) and sends web push to every active
  admin's subscribed devices (`push_subscriptions`, VAPID keys kept encrypted in `secure_settings`). Which events fire is the main
  administrator's setting (`notification_settings`). It never throws; hook new events in with `Notifier::send()` and add them to `Notifier::EVENTS`.
- Admin accounts: `admin_users` has roles `super` / `admin`. The super admin cannot be deleted, switched off or demoted; only they
  can manage users, read the activity log (`admin_activity`, written by `Activity`, `QueryLog` and the `admin.log` middleware) and use
  integrations. New admin actions must be logged the same way.
- The admin panel (`frontend/src/components/admin`) uses a Shopify-style look scoped by the `.admin-ui` class; the
  storefront keeps the the store brand styling.
- Admin authentication is a custom session in MySQL (`admin_users`, `admin_sessions`) with an HttpOnly,
  same-origin cookie. Do not introduce bearer tokens or third-party auth.
- All browser data access goes through the `db.from(...)` query builder (`frontend/src/lib/data`) →
  `POST /api/query` → `backend/app/Support/Data/QueryEngine.php`. New tables/columns must be added to
  both a Laravel migration and `backend/app/Support/Data/Schema.php` (and `frontend/src/lib/data/schema`
  is no longer used for access control — the PHP schema is the only authority).
- Uploaded images are files in `backend/public/media` (production: `public_html/media`), referenced in
  the database as `/api/public/img/<path>`. Never commit uploads; never delete files that are still
  referenced (`App\Support\Media::deleteIfUnreferenced`).
- The template ships without seasonal campaign pages (Diwali, Navratri): build them with the page builder and your own uploads. The product/collection flag columns `navratri_2026`, `diwali_2026`, `navratri_only`, `diwali_only` still exist in the database but are not used by any screen.
- Page `<head>` tags for crawlers are produced twice on purpose: by React (`head()` in each route) and by
  `backend/app/Support/Seo.php` for non-JavaScript crawlers. Change both when a page's SEO changes.
- Shipping zones (`shipping_zones`: states, fee, optional free-over; Admin -> Store features -> Shipping) and "spend X, get a free gift"
  steps (`commerce_gifts` setting) are resolved on the server in `Commerce::shippingRule()` / `Commerce::gifts()` from the delivery
  state. A state in no zone pays the standard fee. Earned gifts and the zone are written to the order timeline.
- Returns (`return_requests`, `App\Support\Returns`, `Admin\ReturnController`) are OFF by default (`commerce_returns_enabled`); the window
  counts from `orders.fulfilled_at`. Every change to a piece's quantity goes through `App\Support\StockLog` (`stock_adjustments`) so the
  Inventory screen can show history; never update `stock_quantity` without logging it.
- A client's own website (hand-built or static, on another domain) can use this store as its backend through the
  **external storefront API**: `GET /api/public/products`, `GET /api/public/coupon`, `POST /api/public/order`
  (`StorefrontApiController`). It is the one group of routes outside `same-origin`, so `App\Http\Middleware\StorefrontApi`
  guards it instead: the `external_storefront` add-on must be on (`FEATURE_EXTERNAL_STOREFRONT`), the caller's origin must be
  in `STOREFRONT_API_ORIGINS`, and the CORS headers go out only for those origins. A cart line from such a site is
  `{id, q, n}`: product slug, pack size (the variant) and how many packs. Prices, discounts and stock are re-read here
  through `Commerce::quote` and `OrderService::place`, never taken from the caller. Keep it that way, and keep the
  response shape stable: client sites in the wild depend on it.
- Reports (`Admin\ReportController`) and the Google/Meta product feed (`/api/feeds/products.xml`, `ProductFeedController`) are read-only.
- Loading states use the shimmering `.skel` class (`components/ui/loading-rows.tsx`, `skeleton.tsx`), not "Loading…" text.

- Paid add-ons (`App\Support\Features`, `config/prihika.php` -> `features`) are switched on by the vendor with a line in `backend/.env`
  (`FEATURE_OFFLINE_SHOP=true`, then `php artisan config:cache`), never from the admin panel, and are OFF by default. The **offline shop**
  (Inventory -> Quick sell and Barcode labels, piece barcodes `stock_units`, shop sales `orders.channel = 'shop'`, shop customers
  `customers.source = 'shop'` via `ShopCustomers`, the online/shop split in Reports and Orders/Customers filters) is one such add-on. Its endpoints sit
  behind `->middleware('feature:offline_shop')` (the server refuses them with 403) and the panel hides its screens through `useFeatures()`.
  New add-on code must be gated the same way. Shop sales share the website's stock and go through `OrderService::placeShopSale` and `StockLog`.
- The store's identity (name, tagline, contact details, social links) lives in ONE place: `backend/config/brand.php`, set per site in `backend/.env` (`BRAND_NAME`, ...). The server reads it through `App\Support\Brand` (SEO tags use a `{brand}` placeholder, e-mails use `{{store_name}}`); the web app reads it from `window.__BRAND__`, written into the page by `SpaController` (`GET /api/brand` serves the same for the dev server), through `frontend/src/config/brand.ts`. Never type the store name into new code or copy: use `brand.name` / `Brand::name()`. `robots.txt` is built by a route, not a static file.
