# Shop Points

QR-code loyalty points for a small shop, run inside LINE.

- **Customer card** (`frontend/index.html`): personal QR code, points, rewards with "อีก X แต้ม", recent history.
- **Staff screen** (`frontend/staff.html`): scan the customer's QR or search by phone, enter the bill, points are suggested (default 1 point per 100 baht), redeem rewards, cancel your own entry the same day. Warns on extra points, a repeat entry within 30 minutes, or a repeated bill number.
- **Owner screen** (`frontend/owner.html`): the day's entries and totals, add/remove points with a required reason and a confirm step showing the new balance.
- **Data** lives in one Google Sheet: Settings, Rewards, Staff, Customers, Transactions, Balances. Transactions is append-only (a cancel is a new reversing row). Times are Bangkok time.
- **No monthly cost**: the app never sends paid LINE messages.

## Layout

| Path | What |
|---|---|
| `backend/src/` | Google Apps Script (V8) web app: one JSON endpoint, LINE ID-token check, roles, points rules |
| `frontend/` | Static pages (plain JS + LIFF SDK + vendored `qrcode-generator`, MIT) |
| `test/` | Node tests (`npm test`) and a browser end-to-end run (`node test/e2e/run.js`) |
| `docs/SETUP.md` | Go-live steps: Google, Cloudflare Pages, LINE |

## Tests

```
npm test                 # 32 tests, no dependencies, Node 20+
node test/e2e/run.js     # browser flow; needs the `playwright` package + Chromium
```

The e2e run uses the real back-end code with an in-memory store and a fake LINE SDK. It does **not** touch real Google or LINE services; see "Not verified live" in `docs/SETUP.md`.

## Security model

The browser never says who it is. Every request carries a LINE ID token; the back end verifies it with LINE and derives the role itself: owner = the LINE user id in Settings, staff = active rows in the Staff tab, everyone else = customer. Staff/owner actions are refused for customers.
