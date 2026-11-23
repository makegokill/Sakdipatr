// Browser end-to-end: real front end + real back-end code (memory store). Only LINE's SDK is faked.
// Run: node test/e2e/run.js   (needs the `playwright` package and a Chromium)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { makeApp, OWNER, STAFF1, CUST1 } = require('../harness');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const OUT = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const app = makeApp();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const out = app.g.handleRequest_(app.env, body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(out));
    });
    return;
  }
  const f = path.join(FRONT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(FRONT) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('nf'); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});

const FAKE_LIFF = (who) => `window.liff = { init: () => Promise.resolve(), isLoggedIn: () => true,
  getIDToken: () => 'tok:${who}', getProfile: () => Promise.resolve({ displayName: 'สมศรี ใจดี' }),
  isApiAvailable: () => false, login() {}, logout() {} };`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { throw e; });
    p.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text()); });
    await p.route('**/sdk.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_LIFF(who) }));
    await p.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.SHOP_CONFIG={LIFF_ID:'x',API_URL:'${base}/api'}` }));
    return p;
  };

  // 1. Customer registers
  const cust = await page(CUST1);
  await cust.goto(base + '/index.html');
  await cust.fill('input[type=tel]', '081-234-5678');
  await cust.screenshot({ path: OUT + '/1-register.png' });
  await cust.click('text=ลงทะเบียน');
  await cust.waitForSelector('#pts');
  assert.equal(await cust.textContent('#pts'), '0');
  assert.ok(await cust.locator('.qr img').getAttribute('src').then((s) => s.startsWith('data:image/')));
  const code = (await cust.textContent('.code')).trim();
  assert.match(code, /^SP[A-Z2-9]{8}$/);

  // 2. A customer opening the staff page is told they have no access
  const wrong = await page(CUST1);
  await wrong.goto(base + '/staff.html');
  await wrong.waitForSelector('text=ยังไม่มีสิทธิ์');
  assert.ok(await wrong.locator('.code').textContent().then((t) => t.includes(CUST1)));

  // 3. Staff: lookup by phone, bill 5,000 -> 50 points auto-filled, save
  const staff = await page(STAFF1);
  await staff.goto(base + '/staff.html');
  await staff.fill('#q', '0812345678');
  await staff.click('text=ค้นหา');
  await staff.waitForSelector('#bill');
  await staff.fill('#bill', '5000');
  assert.equal(await staff.inputValue('#pts'), '50');
  await staff.fill('#billno', 'INV-1');
  await staff.click('#save');
  await staff.waitForFunction(() => document.getElementById('bal').textContent === '50');
  await staff.screenshot({ path: OUT + '/2-staff.png' });

  // 4. Giving more than suggested must ask for confirmation; declining writes nothing
  await staff.fill('#bill', '100');
  await staff.fill('#pts', '9');
  await staff.fill('#billno', 'INV-2');
  await staff.click('#save');
  await staff.waitForSelector('.overlay');
  await staff.screenshot({ path: OUT + '/3-confirm.png' });
  await staff.click('.overlay button.secondary');
  assert.equal(await staff.textContent('#bal'), '50');

  // 5. Redeem a 50-point reward
  await staff.click('.reward button:has-text("แลก")');
  await staff.click('.overlay button:not(.secondary)');
  await staff.waitForFunction(() => document.getElementById('bal').textContent === '0');

  // 6. Customer sees updated card and history
  await cust.reload();
  await cust.waitForSelector('#pts');
  assert.equal(await cust.textContent('#pts'), '0');
  assert.ok((await cust.locator('.list li').count()) >= 2);
  await cust.screenshot({ path: OUT + '/4-card.png', fullPage: true });

  // 7. Staff cancels the redemption: points come back
  await staff.click('#mine button:has-text("ยกเลิก")');
  await staff.click('.overlay button:not(.secondary)');
  await staff.waitForFunction(() => document.getElementById('bal').textContent === '50');

  // 8. Owner: day summary and adjustment with confirmation
  const owner = await page(OWNER);
  await owner.goto(base + '/owner.html');
  await owner.waitForSelector('#totals');
  await owner.fill('#date', '2026-11-22'); // the fake clock's day, not the real today
  await owner.waitForFunction(() => document.getElementById('totals').textContent.includes('ให้แต้ม 50'));
  await owner.fill('#q', code);
  await owner.click('text=ค้นหา');
  await owner.fill('#apts', '5');
  await owner.fill('#why', 'ทดสอบ');
  await owner.click('button:has-text("ปรับแต้ม")');
  await owner.waitForSelector('.overlay');
  assert.ok((await owner.locator('.sheet').textContent()).includes('50 → 55'));
  await owner.screenshot({ path: OUT + '/5-owner-confirm.png' });
  await owner.click('.overlay button:not(.secondary)');
  await owner.waitForSelector('.toast');
  await cust.reload();
  await cust.waitForSelector('#pts');
  assert.equal(await cust.textContent('#pts'), '55');

  await browser.close();
  server.close();
  console.log('E2E OK. Screenshots in', OUT);
})().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
