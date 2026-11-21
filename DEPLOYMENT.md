# Jentis Kitchen — Cloudflare deployment guide

Architecture: **Next.js app on Cloudflare Workers** (via the OpenNext adapter) + **Cloudflare D1** (managed SQLite,
same tables as your laptop database) + **Cloudflare Access** (login in front of everything).

You run every command on your laptop. Nobody needs your passwords or API tokens: `wrangler login` opens
Cloudflare in your browser and you approve it there.

Expected cost: Workers Free may be enough (try it first); if the deploy reports the Worker is too large, upgrade to
Workers Paid (US$5/month). D1 usage at your volume fits the included allowance. Access is free for up to 50 users.

---

## 0. Before anything else (5 minutes)

1. **GitHub privacy.** Open `github.com/yuwono2606/jentis-program` → Settings. If the repository is public, change it to
   private now. Its history contains customer names, phone numbers and addresses (`orders.json`, `exported-data.json`,
   `Reseller - Sheet1.csv`). Removing them from history is a separate step; ask before doing it.
2. **Stop the old app while migrating** (later, at cutover). Until cutover the laptop stays the source of truth.

## 1. Put the new code in place (keeps your git history)

```bash
cd ~/path/to                                   # the folder that contains jentis-program
mv jentis-program jentis-program-old           # keep the original untouched
unzip jentis-kitchen-cloudflare.zip            # creates jentis-program/
mv jentis-program-old/.git jentis-program/     # reuse your git history
cd jentis-program
git checkout -b cloudflare-deploy
git status                                     # shows exactly what changed (see CHANGES.md)
```

## 2. Back up the real database (two copies)

The real data is `jentis-program-old/prisma/dev.db` (the root-level `dev.db` is an empty file).

```bash
mkdir -p backups data-export
cp ../jentis-program-old/prisma/dev.db "backups/dev-$(date +%Y%m%d-%H%M).db"
```
Also copy that file to a second place (USB drive or cloud storage). `backups/` and `data-export/` are git-ignored.

## 3. Install and test locally

Requires Node.js 22.6 or newer (`node -v`).

```bash
npm install
npm test                    # 11 business-logic tests (orders, stock, retries, Jakarta dates)
cp .dev.vars.example .dev.vars
cp .dev.vars.example .env.local
```

## 4. Create the Cloudflare resources

1. Create a Cloudflare account at dash.cloudflare.com if you do not have one.
2. Then:

```bash
npx wrangler login                      # browser opens; approve
npx wrangler d1 create jentis-db-preview
npx wrangler d1 create jentis-db-prod
```
Each `create` prints a `database_id`. Paste them into `wrangler.jsonc` in place of
`REPLACE_ME_PREVIEW_DATABASE_ID` and `REPLACE_ME_PRODUCTION_DATABASE_ID` (they are not secrets).

## 5. Rehearse the migration locally

```bash
npm run db:migrate:local
python3 scripts/sqlite_to_d1.py export backups/dev-XXXXXXXX-XXXX.db data-export/jentis-data.sql
npx wrangler d1 execute jentis-db-prod --local --file=data-export/jentis-data.sql
npm run db:fingerprint:local
python3 scripts/sqlite_to_d1.py fingerprint backups/dev-XXXXXXXX-XXXX.db
```
The two fingerprints must match on every line (orders, resellers, stock_movements, inventory_now, totals,
`non_integer_dates: 0`). If anything differs, stop and send me both outputs.

Then run the app against the local copy:

```bash
npm run dev          # http://localhost:3000 — click through the smoke test (section 10)
npm run preview      # same app inside the real Workers runtime, locally
```
Local tests only touch the local copy under `.wrangler/`, never Cloudflare.

## 6. Deploy the preview environment

```bash
npm run db:migrate:preview
npx wrangler d1 execute jentis-db-preview --remote --env preview --file=data-export/jentis-data.sql
npm run db:fingerprint:preview          # compare with the laptop fingerprint again
npm run deploy:preview
```
The deploy prints a URL like `https://jentis-kitchen-preview.<your-subdomain>.workers.dev`. It will answer
"Authentication is not configured" until step 7. That is expected: the app refuses to run unprotected.

## 7. Turn on login (Cloudflare Access)

1. Dashboard → **Zero Trust**. The first time, choose a team name (e.g. `jentiskitchen`). Your team domain is
   `jentiskitchen.cloudflareaccess.com`. Pick the Free plan; Cloudflare may ask for a payment method.
2. Zero Trust → **Access → Applications → Add an application → Self-hosted**.
   - Name: `Jentis Kitchen (preview)`. Domain: the preview `workers.dev` hostname from step 6.
   - Policy: **Allow**, include **Emails** → list each person who may use the app.
   - Login method: **One-time PIN** (default), optionally Google.
3. Open the application → **Overview** → copy the **Application Audience (AUD) Tag**.
4. In `wrangler.jsonc`, `env.preview.vars`, set `CF_ACCESS_TEAM_DOMAIN` (e.g. `jentiskitchen.cloudflareaccess.com`)
   and `CF_ACCESS_AUD`. Then run `npm run deploy:preview` again.
5. Open the preview URL. You should see the Cloudflare login, then the app. Run the smoke test (section 10).

Production gets its own Access application (step 8) with its own AUD tag.

## 8. Domain and production

### 8a. Check the domain
- `.co.id` is managed by PANDI and sold by accredited Indonesian registrars (Cloudflare Registrar does not sell it).
  Search `jentiskitchen.co.id` at an accredited registrar (e.g. PANDI's registrar list).
- If it is available: `.co.id` requires company documents (such as an NIB or deed of establishment) and an ID.
- If you are not eligible or it is taken: `jentiskitchen.id` needs only an Indonesian ID card. `jentiskitchen.com`
  can be bought directly in Cloudflare Registrar. Consider also buying the `.com` and redirecting it, to protect the brand.

### 8b. Move DNS to Cloudflare (no change to how the domain behaves yet)
1. Dashboard → **Add a site** → enter the domain → Free plan.
2. Cloudflare scans the existing DNS records. **Before switching, compare them with your registrar's records**,
   especially MX (email). Nothing should be missing.
3. At your registrar, replace the nameservers with the two Cloudflare nameservers shown. This can take a few hours.

**I will not change these with you until you confirm you want to; nameserver changes affect email and any existing website.**

### 8c. Recommended layout (keeps the future plan simple)
| Hostname | Use | Notes |
|---|---|---|
| `jentiskitchen.co.id`, `www` | Shopify storefront (later) | Shopify's records, set to **DNS only** (grey cloud), as Shopify recommends |
| `ops.jentiskitchen.co.id` | This inventory app | Worker custom domain, behind Access |
| `api.jentiskitchen.co.id` | Future Shopify / Telegram webhooks | Separate Worker; verifies webhook signatures (not an Access login) |

Putting the operations app on `ops.` now leaves the main domain free for the storefront, so nothing has to move later.

### 8d. Production cutover
1. Pick a quiet time. Stop using the laptop app.
2. Fresh backup and export at that moment (the data has changed since step 5):
   ```bash
   cp ../jentis-program-old/prisma/dev.db "backups/dev-cutover-$(date +%Y%m%d-%H%M).db"
   python3 scripts/sqlite_to_d1.py export backups/dev-cutover-XXXX.db data-export/jentis-cutover.sql
   ```
3. Load production and verify:
   ```bash
   npm run db:migrate:production
   npx wrangler d1 execute jentis-db-prod --remote --file=data-export/jentis-cutover.sql
   npm run db:fingerprint:production
   python3 scripts/sqlite_to_d1.py fingerprint backups/dev-cutover-XXXX.db     # must match
   ```
4. Create the Access application for `ops.jentiskitchen.co.id` (same as step 7, its own AUD). Put the production
   team domain and AUD in the top-level `vars` of `wrangler.jsonc`.
5. In `wrangler.jsonc`, uncomment the `routes` line (custom domain `ops.jentiskitchen.co.id`). Then:
   ```bash
   npm run deploy:production
   ```
   Cloudflare creates the DNS record and HTTPS certificate for `ops.` automatically. This is the only DNS change.
6. Open `https://ops.jentiskitchen.co.id`, log in, run the smoke test.
7. Delete `data-export/*.sql` (it contains customer data). Keep the `backups/` copies offline.

## 9. Optional next step: Git-based deploys
After the first manual deploy works: Dashboard → Workers → `jentis-kitchen` → Settings → **Builds** → connect the (private)
GitHub repository. Deploy command `npm run deploy:production` for `main`; for other branches use `npm run deploy:preview`.
This needs no API token from you. If you ever deploy from GitHub Actions instead, create an API token from the
"Edit Cloudflare Workers" template plus **D1 Edit**, limited to your account, and store it only as a GitHub secret.

## 10. Smoke test (preview and production)

- [ ] Opening the site without logging in shows the Cloudflare login; a non-listed email is refused.
- [ ] `/api/health` (while logged in) returns `"status":"ok"`.
- [ ] Homepage stock numbers equal `inventory_now` from the fingerprint.
- [ ] Order list shows your orders; today/tomorrow/pending cards look right.
- [ ] Create a test order. Its ID starts with today's date (WIB), and stock goes down by the right amounts.
- [ ] Double-click Submit on another test order: only one order is created.
- [ ] Edit the test order's quantities: stock changes by the difference; Stock Movement shows `EDIT_ORDER`.
- [ ] Cancel it (try twice): stock is returned once; one `CANCEL_ORDER` movement.
- [ ] Mark paid and delivered on a test order.
- [ ] Add production, then a stock adjustment, then set the stock back to the real values with another adjustment.
- [ ] Reseller Sales: weekly and reward numbers match what the laptop showed for the same date; CSV downloads.
- [ ] Add and delete a test reseller; deleting a reseller that has orders is refused.
- [ ] Redeploy (`npm run deploy:preview`) and confirm the data is still there.

Test orders on production can be cancelled; they remain in history as cancelled (orders are never deleted).

## 11. Logs and troubleshooting

- Dashboard → Workers & Pages → `jentis-kitchen` → **Logs**: every write is logged as JSON with who did it
  (`order_created`, `order_cancelled`, `stock_adjusted`, …) and every error with details.
- Live stream: `npx wrangler tail jentis-kitchen` (preview: `npx wrangler tail jentis-kitchen-preview`).

| Symptom | Cause |
|---|---|
| "Authentication is not configured" | `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` missing for that environment; redeploy after setting them |
| "Access denied" after logging in | AUD tag in `wrangler.jsonc` does not match that Access application |
| "Could not load data" page | D1 binding or migrations missing; check `/api/health` and the logs |
| Deploy says the Worker is too large | Upgrade to Workers Paid, then deploy again |

## 12. Rollback

**Before cutover:** nothing to roll back. The laptop app and its database are untouched; just keep using them.

**Code (after cutover):**
```bash
npx wrangler deployments list
npx wrangler rollback <version-id>        # or Dashboard → Deployments → Rollback
```
Code rollbacks never touch data.

**Data (after cutover):** D1 Time Travel restores the database to any minute in the retention window
(30 days on Workers Paid, 7 days on Free).
```bash
npx wrangler d1 time-travel info jentis-db-prod --timestamp="2026-10-20T08:00:00+07:00"
npx wrangler d1 time-travel restore jentis-db-prod --bookmark=<bookmark from the info command>
```
A restore discards everything written after that time, so export first:
`npx wrangler d1 export jentis-db-prod --remote --output=backups/prod-before-restore.sql`.

**Going back to the laptop after cutover** would lose orders entered in the cloud. Export D1 first (command above)
and ask me to help bring that data back into SQLite.

**Routine backups:** weekly, run
`npx wrangler d1 export jentis-db-prod --remote --output=backups/prod-$(date +%Y%m%d).sql`
and keep the files off the laptop as well.
