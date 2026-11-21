# Online shop (jentiskitchen.id)

The public shop runs in the same Cloudflare Worker as the admin. `src/middleware.ts` sends requests for a host in
`SHOP_HOSTS` (jentiskitchen.id) to `src/app/shop/*` without login; everything else still requires Cloudflare Access.
From the shop host, only `src/app/shop` is reachable (admin pages and APIs return 404).

| What | Where |
|---|---|
| Products, prices, delivery fee, bank account, voucher sizes | `src/lib/shop/catalog.ts` (real menu: 4 × 500 g at Rp 160.000; bank account still DUMMY) |
| Product photos (900×900, metadata removed) | `public/shop/products/*.jpg` |
| Accounts, vouchers, orders, emails (logic, tested) | `src/lib/shop/*.ts`, `tests/shop.test.ts` |
| Customer pages | `src/app/shop/` (UI in Bahasa Indonesia) |
| Admin page | `/website-orders`: transfer proof, Confirm paid, Mark delivered, monthly vouchers |
| Tables | `migrations/0003_online_shop.sql`, `0004_shop_payments.sql` (additive; existing tables unchanged) |

## Rules
- Register: name, email, phone, password, optional referrer phone. Email and phone must be new. A 35% voucher (max Rp 100.000, no expiry) is issued and emailed.
- Monthly: the owner clicks **Send** on `/website-orders` once a month. Every customer gets a 20% voucher (max Rp 100.000) valid until the end of that month (WIB). Clicking again only sends what has not been sent.
- Referral: when a referred customer's first order is marked **Delivered**, the referrer gets a 25% voucher (max Rp 100.000), once per referred friend.
- Vouchers: one per order, owner only, used once, discount on products only (not delivery). Cancelling an order frees its voucher.
- Delivery: Rp 15.000 for 1 pack, free for 2 or more.
- Payment with DOKU (when `DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` are set): after placing the order the customer is sent to the
  DOKU Checkout page (link valid 120 minutes, invoice `JK<order number>`, `…R2` for a new link). DOKU's signed notification
  (`/api/payments/doku/notify`) marks the order PAID if the amount matches exactly; the order page also asks DOKU for the
  status as a backup. Then the customer gets "payment received" and you get "[PAID]". Code: `src/lib/shop/doku.ts`,
  `payments.ts`, tests in `tests/payments.test.ts`.
- Payment with Duitku (when `DUITKU_MERCHANT_CODE` and `DUITKU_API_KEY` are set) works the same way through the Duitku POP
  page; its signed callback is `/api/payments/duitku/callback`. Code: `src/lib/shop/duitku.ts`.
- With both configured, `PAYMENT_GATEWAY` (`doku` or `duitku`, default DOKU) picks the one for new payments; payments already
  started with the other one are still checked. Each row in `shop_payments` remembers its `gateway`.
- Payment without DOKU or Duitku (manual transfer): the order is created as PENDING and stock is deducted. The customer uploads a transfer screenshot, you get an email, check the bank and click **Confirm paid**. That emails the customer and sends you a "[PAID]" email.
- Mark delivered (here or in the normal order list) emails the customer.

## DOKU go-live
1. Sandbox: put the sandbox Client ID / Secret Key in `.dev.vars` (`DOKU_ENV=sandbox`) and test a payment locally.
2. Production keys (after DOKU activates the account): `npx wrangler secret put DOKU_CLIENT_ID` and `DOKU_SECRET_KEY`.
3. `npm run db:migrate:production` (adds shop_payments), then `npm run deploy:production`.
The notification URL is sent with every payment request (override_notification_url), so nothing has to be set in the DOKU dashboard.

## Payment choice at checkout
"Bayar" opens a pop-up: QRIS (`PAYMENT_GATEWAY`, DOKU), OVO (Duitku, `paymentMethod: "OV"` on the POP invoice) and manual BCA transfer. OVO only appears while `DUITKU_MERCHANT_CODE` and the secret `DUITKU_API_KEY` are set.

## Duitku go-live
1. Sandbox (sandbox.duitku.com, separate account): Merchant Code / API Key in `.dev.vars` with `DUITKU_ENV=sandbox` and
   `PAYMENT_GATEWAY=duitku`. Test payments: pick a VA on the Duitku page, then pay it at
   https://sandbox.duitku.com/payment/demo/demosuccesstransaction.aspx. Locally the callback cannot reach the laptop; opening
   the order page asks Duitku for the status instead.
2. Production (after Duitku verifies the account): in `wrangler.jsonc` set `DUITKU_ENV: "production"`,
   `DUITKU_MERCHANT_CODE` and `PAYMENT_GATEWAY: "duitku"`; `npx wrangler secret put DUITKU_API_KEY`.
3. `npm run db:migrate:production` (0012 adds shop_payments.gateway), then `npm run deploy:production`.
The callback URL is sent with every invoice, so nothing has to be set in the Duitku project for it. Which methods appear on the
Duitku page is set in the Duitku dashboard (project payment channels).

## Go-live checklist (each Cloudflare step needs the owner's OK)
1. Replace the dummy bank account in `catalog.ts`; optional QRIS image at `public/shop/qris.png`, with `qrisImage: '/qris.png'`.
2. Email: create a free Resend account, add the domain `jentiskitchen.id`, add the DNS records it shows in Cloudflare, then
   `npx wrangler secret put RESEND_API_KEY` and `npx wrangler secret put OWNER_EMAIL` (also with `--env preview`).
3. Make sure `jentiskitchen.id` (the bare domain) has no leftover parking A/CNAME record in Cloudflare DNS.
4. Back up production D1, then `npm run db:migrate:preview`, deploy preview, and test at `<preview url>/shop`.
5. `npm run db:migrate:production`, then `npm run deploy:production` (adds the jentiskitchen.id custom domain).

## Local testing
`.env.local` and `.dev.vars` need `SHOP_HOSTS=shop.localhost` (under `next dev` the middleware reads `.env.local`).
Shop: http://shop.localhost:3001, admin: http://localhost:3001. Without `RESEND_API_KEY`, emails are only logged.
