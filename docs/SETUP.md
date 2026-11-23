# Go-live guide

About an hour, mostly sign-ups. You need: a Google account, a free Cloudflare account, and a LINE Official Account for the shop.

> **Not verified live.** The code is tested against fakes. These pieces have only been checked on paper and must be confirmed during the first live test: saving to the real Sheet, LINE's token-verify call, the in-LINE QR scanner, Apps Script answering the browser from another domain (CORS), and the exact wording of LINE's console menus below (LINE renames things).

## 1. Google: Sheet + back end

Needs Node.js on one computer. Turn on the Apps Script API first: https://script.google.com/home/usersettings → **Google Apps Script API: On**.

```
npx @google/clasp@3 login
npx @google/clasp@3 create-script --type sheets --title "Shop Points" --rootDir backend/src
git checkout backend/src/appsscript.json      # create-script overwrites our settings (Bangkok time zone, web-app access)
npx @google/clasp@3 push --force
```

Then in the script editor (use "Request Desktop Website" on a phone):

1. Choose **setupSheet** in the function drop-down, **Run**, approve the permissions (Advanced → Go to Shop Points → Allow). It creates six tabs with defaults and is safe to re-run.
2. In the Sheet, check the tabs: Settings, Rewards, Staff, Customers, Transactions, Balances.
3. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Copy the Web app URL (ends in `/exec`).

After you change the code later, use **Deploy → Manage deployments → Edit → New version**, or the URL keeps serving the old code.

## 2. Cloudflare Pages: the screens

Dashboard → Workers & Pages → Create → Pages → **Upload assets**, upload the `frontend` folder. You get `https://<name>.pages.dev`.

Edit `frontend/config.js` before uploading (or re-upload after): set `API_URL` to the `/exec` URL. `LIFF_ID` comes from step 3.

## 3. LINE

1. **Official Account**: create the shop's account at https://manager.line.biz (skip if you have one).
2. **LINE Developers** (https://developers.line.biz): create a Provider, then a **LINE Login** channel. Publish it (status Published) so every customer can sign in. Copy the numeric **Channel ID**.
3. In that channel: **LIFF → Add**. Size **Full**. Endpoint URL: your `https://<name>.pages.dev/`. Scopes: **openid** and **profile**. Turn **Scan QR** on (needed for the staff scanner). Copy the **LIFF ID**.
4. Put the LIFF ID in `frontend/config.js` and re-upload.
5. In the Sheet's **Settings** tab set `line_channel_id` to the Channel ID.
6. Optional: link the LIFF to the Official Account's rich menu so customers open the card in one tap. The three links are:
   - Customer: `https://liff.line.me/<LIFF_ID>/`
   - Staff: `https://liff.line.me/<LIFF_ID>/staff.html`
   - Owner: `https://liff.line.me/<LIFF_ID>/owner.html`

   If a path link opens the customer card instead of the staff or owner page, the LIFF endpoint is dropping the path. Fix: create two more LIFF apps whose endpoint URLs are `https://<name>.pages.dev/staff.html` and `https://<name>.pages.dev/owner.html`, each with its own LIFF ID in a copy of `config.js`, or ask for the front end to be changed to read the page from the LIFF `liff.state` parameter. Confirm this during the live test.

## 4. Roles

- **Owner**: open the owner link. It says "ยังไม่มีสิทธิ์" and shows your LINE user id. Paste it into Settings → `owner_line_user_id`, reload.
- **Staff**: each staff member opens the staff link and sends you the id shown. Add a row in the **Staff** tab: `lineUserId`, `name`, `active` = TRUE. Set `active` to FALSE to remove someone; their old entries stay.

## 5. Tuning (all in the Sheet, no code)

- Settings: `baht_per_point`, `max_points_per_entry`, `duplicate_window_minutes`, `shop_name`.
- Rewards: add/edit rows; `active` FALSE hides one.
- Never edit or delete Transactions rows by hand. Use the owner screen to adjust, so there is always a reason on record.

## 6. Live test (two phones)

1. Customer phone: open the card, register with a phone number starting with 0. In the Sheet's Customers tab the phone must still start with 0.
2. Staff phone: scan the QR (or type the phone), enter a bill of 500 → 5 points suggested → save. The customer card shows 5.
3. Try a higher number than suggested, and the same bill twice: both must ask for confirmation.
4. Redeem a reward, then cancel it: points come back. Cancel is only possible the same day.
5. Owner: check the day summary and make one adjustment.
6. Let a phone sit for an hour, then open the card again: it should sign in again by itself.
