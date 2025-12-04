/**
 * Simple Playwright smoke test for login flow.
 * Usage:
 *   TEST_EMAIL="user@example.com" TEST_PASSWORD="hunter2" TEST_BASE_URL="http://localhost:3000" node scripts/playwright-login.js
 * Requires: npm install -D playwright
 */
const { chromium } = require('playwright');

(async () => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

  if (!email || !password) {
    console.error('Please set TEST_EMAIL and TEST_PASSWORD environment variables.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    let clicked = false;
    const headerSignIn = page.locator('header button:has-text("Sign In")').first();
    try {
      await headerSignIn.click({ timeout: 5000 });
      clicked = true;
    } catch (_err) {
      // Fallback to any visible Sign In button
      const anySignIn = page.locator('button:has-text("Sign In")').first();
      await anySignIn.click({ timeout: 10000 });
      clicked = true;
    }

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.waitFor({ timeout: 15000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);

    const submitButton = page.locator('form button[type="submit"]').first();
    await submitButton.waitFor({ timeout: 15000 });
    await submitButton.click();

    const storedUser = await page.waitForFunction(() => {
      const raw = localStorage.getItem('ultramagnus_user');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_err) {
        return null;
      }
    }, { timeout: 15000 });

    const user = await storedUser.jsonValue();
    if (!user || !user.email) {
      throw new Error('Login did not persist user in localStorage.');
    }

    await page.screenshot({ path: 'playwright-login.png', fullPage: true });
    console.log(`Login smoke test passed as ${user.email}. Screenshot saved to playwright-login.png`);
  } catch (err) {
    console.error('Login smoke test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
