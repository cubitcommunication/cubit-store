# Deploying a store to Hostinger (shared hosting)

Architecture: **React (static files) + Laravel/PHP API + MySQL**, deployed from GitHub. The same steps are used for
every site made from this project.

Hostinger shared hosting cannot run `npm` or `composer`, so **GitHub Actions builds the website** and saves it in the
**`site/` folder of the branch it ran on** (one extra commit made by the workflow, marked `[skip ci]`).

## Two branches: `main` for work, `stable` for client sites

The workflow builds **`main`** and **`stable`**. Client sites pull **`stable`**, never `main`, so a broken commit
cannot reach every site at once:

```
push to main -> Actions builds site/ on main -> check it on your own test site
merge main into stable -> Actions builds site/ on stable -> client sites pull stable -> the first visit finishes the update
```

One repository serves every client site. Each site keeps its own database, its own `site/backend/.env` and its own
`media/`, none of which are in Git, so a pull never touches a client's data, logo, products or settings. Never fork
the repository for one client: a fork stops receiving updates. Per-client differences belong in that site's `.env`
and in Admin -> Store features.

No SSH keys, no GitHub secrets and no commands on the server. After a pull, the first request runs any new database
migrations and refreshes the caches by itself (`App\Support\Updater`).

## What lives where

Hostinger's Git copies the whole repository into `public_html`. A small `.htaccess` in the repository root hands every
request to the `site/` folder, so source code, docs and workflow files are never reachable from a browser.

```
public_html/                       <- a clone of the repository (main)
|-- .htaccess                      sends every request to site/ (and nothing else is served)
|-- frontend/, backend/, docs/ ... the source code (not reachable from the web)
`-- site/                          the finished website, written by GitHub Actions. NEVER edit it by hand.
    |-- index.php, .htaccess, app.html, assets/ ...   React build + Laravel entry point
    |-- backend/                   Laravel app with vendor/  (blocked from the web by site/backend/.htaccess)
    |   |-- .env                   this site's settings. Created by the installer. NEVER in Git, never overwritten.
    |   |-- RELEASE                the commit this build came from (the server compares it to know an update is due)
    |   `-- storage/               logs, sessions, caches. Not in Git.
    `-- media/                     uploaded pictures and videos. Not in Git, so a pull never touches them.
```

`git pull` only changes files that are in the repository. `site/backend/.env`, `site/media/` and the runtime folders are
not, so they survive every update.

## One-time setup for a site (about 10 minutes)

1. **GitHub.** The repo's Settings → Actions → General → Workflow permissions must be **"Read and write"** (the workflow
   saves `site/` with its own token). Push to `main` once; when the **Build the site** run is green, `site/` exists on `main`.
2. **Hostinger: the website.** hPanel → Websites → add the domain or a subdomain as a **custom PHP website**.
   Choose PHP **8.2 or newer** (Advanced → PHP Configuration) with `pdo_mysql`, `mbstring`, `fileinfo`, `gd`, `openssl`
   ticked, and `upload_max_filesize` / `post_max_size` of **64M**.
3. **Hostinger: the database.** hPanel → Databases → MySQL Databases → create a database, a user and a password.
   Write the three down (Hostinger adds a prefix such as `u123456789_`).
4. **Hostinger: connect Git.** hPanel → Advanced → **Git** → create a repository: your GitHub repository URL, branch
   **`stable`**, install path empty (= the site's `public_html`). For a private repository hPanel shows a **deploy key**:
   add it in GitHub → repo → Settings → Deploy keys. Press **Deploy**.
   If hPanel says the folder is not empty, open File Manager and delete `default.php` (the placeholder page) first.
5. **Automatic deploys.** hPanel's Git page shows a **webhook URL**. Add it in GitHub → repo → Settings → Webhooks
   (content type `application/json`, "just the push event"). From then on every push is pulled automatically. Note that the
   build commit arrives a few minutes after your push, so the site updates once that commit is on `main`. Without the
   webhook, press **Deploy** in hPanel after the build is green.
6. **Open the site and fill in the installer.** A new site has no `site/backend/.env` yet, so its first visit shows **Set up your
   store**: it asks for the database (the three values from step 3), the store's name and address, and the owner's e-mail and
   password. Press **Install**. In a few seconds it creates the tables and the admin account, writes `site/backend/.env` (with a
   fresh `APP_KEY`) and offers a link to `/admin`. Do this straight away after step 4, before sharing the address.
   - It cannot be used on a finished site (it answers 404 once `site/backend/.env` exists), and it only connects to the
     server's own MySQL, so a stranger who finds the page first still needs your database password.
   - Optional settings that are not in the form (Instagram and Facebook links, order e-mails, the `FEATURE_*` add-ons)
     go into `site/backend/.env` later (File Manager, "show hidden files"); the `BRAND_*` names are listed in `backend/.env.example`.
   - If you prefer, create `site/backend/.env` by hand from `backend/.env.example` instead. Generate `APP_KEY` with
     `php -r "echo 'base64:'.base64_encode(random_bytes(32));"` on any computer with PHP. The first visit then creates the
     tables, and `/admin` shows a one-time "create first admin" screen.
7. **Check:** `https://your-domain.com/backend/.env` must show **403 or 404**, never file contents, and
   `https://your-domain.com/` shows the site.
8. **Sign in** at `/admin` with the owner account, then add the logo, colours, products and pages.


## Every day after that

```bash
git pull --rebase    # the workflow adds a "Build site" commit to main after each push, so pull first
git add -A && git commit -m "Describe the change" && git push
```

Actions tests and builds in about 3 minutes and adds the "Build site" commit; Hostinger pulls it; the first visit applies
database changes. Uploaded files and `site/backend/.env` are never touched. To see where an update stands:
`site/backend/RELEASE` on the server holds the commit that was pulled, and `site/backend/storage/framework/release.txt`
the one that has been applied.

## Going live checklist

- [ ] The domain and `www.` open the site with the padlock (hPanel → Security → SSL).
- [ ] `https://your-domain.com/backend/.env` and `https://your-domain.com/site/backend/.env` both show 403 or 404.
- [ ] `FORCE_CANONICAL_HOST=true` is in `site/backend/.env`, so `www.` and any other name redirect to `SITE_URL`.
- [ ] Admin sign-in works at `/admin`.
- [ ] **Admin → Website content → SEO**: the Analytics, Tag Manager and Clarity IDs are for this domain.
- [ ] **Admin → Store features**: the cart, checkout, accounts and payment switches are what you want, and the storefront password is switched off.
- [ ] One test order (Cash on Delivery) placed and its e-mail received.
- [ ] If the domain has e-mail, never change the nameservers without copying the MX records.

---

## Optional: order e-mails and online payments

Both stay off until you configure them; the shop works with Cash on Delivery without either.

Add to `site/backend/.env` (File Manager, "show hidden files"). The change applies on the next request; nothing else to run:

```ini
# E-mail (Hostinger mailbox: hPanel -> Emails -> create e.g. orders@your-domain.com).
# If the your-domain mailboxes are hosted somewhere else, use that provider's SMTP host and port instead.
MAIL_MAILER=smtp
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_SCHEME=smtps
MAIL_USERNAME=orders@your-domain.com
MAIL_PASSWORD=YOUR_MAILBOX_PASSWORD
MAIL_FROM_ADDRESS=orders@your-domain.com
MAIL_FROM_NAME=the store
# Optional: only used until you set the alert addresses in Admin -> Emails.
ORDER_NOTIFY_EMAIL=orders@your-domain.com

# Online payments (Razorpay dashboard -> Settings -> API keys). Use test keys first.
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
# Secret you choose for the webhook below (any long random text).
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx
```

**Which address does what** is set in the admin panel, not in code: Admin → **Emails** has the sender name, the *orders*
e-mail (order mail is sent from it, so it must be the mailbox used for `MAIL_USERNAME`), the *support* e-mail (replies and
the address shown on the website) and the *alert* addresses that are told about new orders, payments, cancellations and
abandoned carts. The same screen edits the wording of every automatic e-mail and has a **Send test** button. Only the SMTP
login stays in `.env`.

#### Cron job (needed for abandoned-cart reminders)
hPanel → **Advanced → Cron Jobs** → add a job that runs **every minute** (this is Hostinger's own scheduler, not SSH):

```
cd /home/YOUR_USER/domains/YOUR_DOMAIN/public_html/site/backend && php artisan schedule:run >> /dev/null 2>&1
```

(Use the `backend` folder inside `site`.) Admin → **Abandoned carts** shows whether the schedule is running.
Without the cron job, order e-mails still work but abandoned-cart reminders and alerts are not sent.

Then in **Admin → Store features** switch on *Online payment*. Customers pay in Razorpay's secure popup; the server
checks the payment signature before marking the order as paid. Do a test order with Razorpay test keys before going live.

### Razorpay webhook (recommended)

Without it, an order stays "pending" if the customer pays and then closes the browser before the site is told. With it,
Razorpay tells the server directly. In the Razorpay dashboard: **Settings → Webhooks → Add new webhook**

- URL: `https://your-domain.com/api/webhooks/razorpay`
- Secret: the same text as `RAZORPAY_WEBHOOK_SECRET` in `.env`
- Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`

Every call is verified with the secret; unsigned calls are refused. Paid, failed and refunded states are written to the
order timeline, and the amount must match the order total. **Admin → Integrations** shows when Razorpay last called.
Test and live modes have separate webhooks in Razorpay, so create one in each.

## Optional: Google reCAPTCHA (spam protection)

1. Create a **reCAPTCHA v3** site at <https://www.google.com/recaptcha/admin> and add `your-domain.com` as the domain.
2. Paste the **site key** in **Admin → Integrations → Google reCAPTCHA v3** and save.
3. Add the **secret key** to `site/backend/.env`:
   ```ini
   RECAPTCHA_SECRET_KEY=your-secret-key
   ```
Protection switches on only when both keys exist. It checks the newsletter, customer sign-up, sign-in, forgotten
password and checkout forms, invisibly. The Integrations page shows whether the secret key was found.

## Analytics and other integrations

Google Analytics, Tag Manager, Microsoft Clarity, the Meta Pixel and the search-engine verification codes are set in
**Admin → Integrations** (never in the HTML files). They load only on the live website, never in the admin panel or on
a copy opened on your own computer. Razorpay keys, the reCAPTCHA secret and the e-mail password stay in `site/backend/.env`;
the Integrations page shows whether each is present and can test the Razorpay keys.

## Paid add-on: offline shop

The offline shop (Quick sell with barcode scanning, barcode and piece labels, shop customers, online/shop reports) is a paid add-on.
It is **off** until the vendor switches it on. In `site/backend/.env` add:

```
FEATURE_OFFLINE_SHOP=true
```

(File Manager → `public_html/site/backend/.env`). The admin panel shows the shop screens straight away and the server accepts
their requests. To switch it off again, remove the line (or set it to `false`). Shop sales and
customers already saved are kept; nothing is deleted.

## Backups

- **Database:** hPanel → Databases → phpMyAdmin → Export (or the Backups tool).
- **Uploaded files:** download `public_html/site/media/` (File Manager). It holds product photos, banners and reel videos.
- **Admin panel:** *Export & backup* downloads the whole catalogue as JSON.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The Actions run is red | Open the run, then the step with the red cross. *Test and build* or *Test the API* failing is a code problem. *Save the built site* failing usually means the repo's Settings → Actions → General → Workflow permissions must allow "Read and write". |
| Pushed to `main` but the site did not change | Hostinger has not pulled yet. Check `main` has a new "Build site" commit (it arrives a few minutes after your push), then press **Deploy** in hPanel → Git (or add the webhook, setup step 5). |
| White page / HTTP 500 | Read the newest file in `public_html/backend/storage/logs/` (File Manager). |
| "The web app has not been built yet" | `app.html` is missing: the Git deploy has not pulled a release yet. |
| "Table not found" after an update | The automatic update failed: see `backend/storage/framework/update-failed.txt` and the log. Fix the cause (usually wrong `DB_*` in `.env`); it retries every 5 minutes. |
| Changed `.env` but nothing happens | Reload the site once. If the server still uses an old value, delete `backend/bootstrap/cache/config.php` (File Manager). |
| Whole site shows 403 Forbidden | `public_html/site/index.php` is missing: Git has not pulled a build yet. |
| The site shows 403 although the repository was pulled | `site/` is missing (the build has not run or failed) or the root `.htaccess` was not pulled. Check the folder holds `.htaccess` and `site/index.php`. |
| Every `/api/...` call returns 403 | The app folder must be named `backend` and `backend/.htaccess` must be present (it is part of the release). |
| Sign-in loops back to the login screen | Open the site over HTTPS on the same address as `APP_URL` / `SITE_URL`. |
| Upload fails for big pictures or videos | Raise `upload_max_filesize` / `post_max_size` in hPanel → PHP Configuration (64M or more for reels). |
| Uploads vanished after a deploy | They are in `public_html/site/media/`; a Git pull never touches it. Check the folder was not deleted by hand. |
| E-mail stopped working after a domain switch | The nameservers were changed without copying the MX records. Restore the MX records at the DNS provider. |

## Connecting a client's existing website (external storefront API)

A client may already have a website whose design they want to keep. It can keep its pages and still use this store as
its backend: the catalogue, discount codes and orders come from here, so stock, coupons, customers and the order list
all live in the admin panel.

Switch it on in that site's `backend/.env`:

```
FEATURE_EXTERNAL_STOREFRONT=true
STOREFRONT_API_ORIGINS=https://example.com,https://www.example.com
```

Any `.env` value that contains a space has to be quoted — `SHOP_MATERIALS="Bagasse, Wood"`. An unquoted one stops
the site from starting at all, with a 500 and nothing in the log, because it fails before the app boots.

List every origin the browser may send, with scheme and without a trailing slash (`https://example.com` and
`https://www.example.com` are two different origins). A request from any other website is refused, and the CORS
headers are sent only to the ones listed.

The client's site then talks to three endpoints:

| Endpoint | What it does |
| --- | --- |
| `GET /api/public/products` | the catalogue: price, MRP, stock, images and the pack variants |
| `GET /api/public/coupon?code=&subtotal=` | checks a discount code before the order is placed |
| `POST /api/public/order` | places the order and returns its number |

An order posts `{name, phone, address, city, state, pin, gstin, note, coupon, items}`, where each item is
`{id, q, n}`: the product's **slug**, the **pack size** (matched against the variant's title or SKU, so name a pack
variant "Pack of 25") and **how many packs**. Prices, discounts, shipping and stock are worked out on the server from
the database; whatever the browser says about money is ignored.

Orders arrive as ordinary unpaid orders, so a site that takes its orders over WhatsApp keeps doing exactly that — the
order is simply recorded here as well, with its own number. If the site has no e-mail field, the customer's phone
number becomes their stand-in address (`STOREFRONT_API_PHONE_EMAIL_DOMAIN`), which keeps their order history and
coupon limits together; collecting a real e-mail on the form is better.

An `Origin` header is only trustworthy from a browser, so the allow-list stops other websites, not a determined
script. Order intake is rate limited, and every order still has to be confirmed by staff.
