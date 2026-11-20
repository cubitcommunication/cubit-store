# Store template

An online store with a Shopify-style admin panel and a page builder. It launches as an enquiry catalogue (WhatsApp) and can become a
full online shop later: **cart, mini-cart, wishlist, checkout (Cash on Delivery + Razorpay), thank-you page, customer
accounts, orders** are all built in and switched on/off from **Admin → Store features** (everything is OFF by default).
Create a new site from this template: see `DEPLOYMENT.md` (about 10 minutes, no SSH).

| Layer     | Technology                                                                          |
| --------- | ----------------------------------------------------------------------------------- |
| Frontend  | **React 19** + TypeScript, Vite, TanStack Router + Query, Tailwind CSS 4, shadcn/ui |
| Backend   | **PHP 8.2+ / Laravel 12** JSON API                                                  |
| Database  | **MySQL / MariaDB**                                                                 |
| Images    | Files on the web server (`public/media`), served at `/api/public/img/*`             |
| Hosting   | Hostinger shared hosting, built by GitHub Actions into `site/` on `main`, which Hostinger's Git pulls                  |

```
frontend/   React single-page app (builds to frontend/dist)
backend/    Laravel API + page shell (SEO tags, sitemap) + database migrations
.github/    Deploy workflow
```

How a request flows: the browser loads the React app from Laravel (`/`, `/product/…`, …). Laravel writes
the right `<title>`, Open Graph tags and JSON-LD into the HTML so Google and WhatsApp previews work, and
answers real `404`/`301` statuses. The app then calls `/api/query` for catalogue data and
`/api/auth|admin/*` for the admin panel.

## Run it on your computer

Requirements: PHP 8.2+, Composer, Node 22+, and MySQL (XAMPP's MySQL is fine).

```bash
# 1) Database + API (terminal 1)
cd backend
composer install
cp .env.example .env          # then set DB_DATABASE / DB_USERNAME / DB_PASSWORD
php artisan key:generate
php artisan migrate
php artisan shop:create-admin you@example.com
php artisan serve                      # http://127.0.0.1:8000

# 2) Website (terminal 2)
cd frontend
npm install
npm run dev                            # http://localhost:5173  (proxies /api to :8000)
```

Open <http://localhost:5173>. The admin panel is at `/admin`.

## Turning on online selling (when you are ready)

1. Sign in at `/admin` → **Store features**.
2. Switch on **Cart**, then **Checkout** (and **Wishlist** / **Customer accounts** if you want them) → **Save**.
   The site changes immediately: "Add to cart", the slide-in cart, checkout and `/account` appear.
3. Optional: set shipping, free-shipping threshold and Cash on Delivery fee on the same page.
4. Optional: track stock per product (Products → edit → *Available quantity*). A sold-out piece cannot be ordered.
5. For **online payment**, add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` to the server `.env`, then switch on
   *Online payment*. For **order e-mails**, add your SMTP details (see `backend/.env.example`).

Manage orders under **Admin → Orders** (mark paid, fulfil, cancel, add notes), and see sales on **Home**.

## Production build

```bash
cd frontend && npm run build      # → frontend/dist
```

Deploying to Hostinger is automatic on every push to `main` — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Useful commands

| Command                                         | What it does                                               |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `php artisan migrate`                           | Create / update the database tables                        |
| `php artisan shop:create-admin <email>`      | Create an admin, or reset its password                     |
| `npm run typecheck` / `npm run lint`            | Check the frontend                                         |

## Project brief

The original product brief (brand, categories, WhatsApp flow) is kept in
[docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md).
