// Manual operator-console golden-path check (Phase 2, Task 14). Not part of
// `npm test` -- playwright isn't a project dependency. To run:
//   npm install --no-save playwright && npx playwright install chromium
//   npx supabase db reset && npm run dev --workspace apps/dashboard
//   node scripts/e2e-check.mjs
// Screenshots land in .e2e-shots/ (git-ignored). Without NEXT_PUBLIC_MAPBOX_TOKEN
// set, this verifies graceful degradation (no crash) rather than the real
// draw-a-polygon flow -- see step 3's log output.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".e2e-shots");
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
  if (msg.text().includes("DEBUG")) console.log("   [browser]", msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

try {
  console.log("1. nav /zones (unauthenticated) -> expect redirect to /login");
  await page.goto("http://localhost:3000/zones");
  await page.waitForURL(/\/login/);
  console.log("   OK, at", page.url());

  console.log("2. sign in as demo operator");
  await page.fill('input[name="email"]', "demo-operator@hush.local");
  await page.fill('input[name="password"]', "DemoOperator123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/zones$/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  console.log("   OK, at", page.url());
  await page.screenshot({ path: `${shots}/1-zones-list.png` });

  const bodyText = await page.textContent("body");
  if (!bodyText.includes("Demo Cafe")) throw new Error("Seeded 'Demo Cafe' zone not visible on /zones");
  console.log("   OK, seeded 'Demo Cafe' zone visible");

  console.log("3. nav /zones/new -- NO Mapbox token configured in this session,");
  console.log("   so this verifies the graceful-degradation fix, not the real draw flow");
  await page.click('a[href="/zones/new"]');
  await page.waitForURL(/\/zones\/new/);
  await page.waitForLoadState("networkidle");
  await page.fill('input[required]', "Demo Cafe E2E");
  await page.screenshot({ path: `${shots}/2-new-zone-form-no-token.png` });

  const pageErrorOverlay = await page.locator("text=Runtime Error").isVisible().catch(() => false);
  if (pageErrorOverlay) throw new Error("Page crashed with a runtime error overlay (the bug this fix targets)");
  console.log("   OK, no crash; page rendered normally without a Mapbox token");

  const placeholderVisible = await page.locator("text=Map unavailable").first().isVisible().catch(() => false);
  if (!placeholderVisible) throw new Error("Expected 'Map unavailable' placeholder not shown");
  console.log("   OK, 'Map unavailable' placeholder shown instead of crashing");

  // No token means no way to draw a polygon, so geofence stays null --
  // submit should be blocked client-side with this specific message.
  // Use the form-error paragraph specifically (the placeholder's own text
  // also contains the substring "draw a zone boundary", case-insensitively).
  await page.click('button[type="submit"]:has-text("Create zone")');
  await page.waitForSelector("p:has-text('Draw a zone boundary on the map before saving.')", { timeout: 5000 });
  console.log("   OK, submit correctly blocked: no geofence drawn (expected without a token)");
  console.log("   NOTE: the actual draw-a-polygon-and-persist round trip was NOT verified in");
  console.log("   this session -- no NEXT_PUBLIC_MAPBOX_TOKEN was available to test it for real.");

  console.log("4. nav to the seeded Demo Cafe zone (has a pre-existing geofence) and rename it");
  await page.goto("http://localhost:3000/zones");
  await page.waitForLoadState("networkidle");
  await page.click("a:has-text('Demo Cafe')");
  await page.waitForURL(/\/zones\/[0-9a-f-]+$/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${shots}/3-edit-existing-zone.png` });

  const nameInput = page.locator('input[required]').first();
  await nameInput.fill("Demo Cafe Renamed");
  await page.click('button[type="submit"]:has-text("Save changes")');
  await page.waitForTimeout(1500);
  const stillBlocked = await page.locator("p:has-text('Draw a zone boundary on the map before saving.')").count() > 0;
  if (stillBlocked) {
    throw new Error(
      "BUG: editing an existing zone's name was blocked by 'Draw a zone boundary' -- " +
      "the no-token placeholder wiped out the zone's pre-existing geofence on mount."
    );
  }
  const updateFailed = await page.locator("p:has-text('Failed to update zone.')").count() > 0;
  if (updateFailed) {
    throw new Error("BUG: PATCH /api/zones/[id] failed -- check dev server log for the real error.");
  }
  console.log("   OK, renaming an existing zone (with a pre-existing geofence) was NOT blocked and did not error");
  await page.screenshot({ path: `${shots}/4-after-rename-attempt.png` });

  await page.reload();
  await page.waitForLoadState("networkidle");
  const renamedText = await page.textContent("body");
  if (!renamedText.includes("Demo Cafe Renamed")) throw new Error("Renamed zone name did not persist across reload");
  console.log("   OK, renamed zone name persisted across reload");

  console.log("5. add a reward to this zone");
  const rewardNameInput = page.locator('input[required]').last();
  await rewardNameInput.fill("Free pastry");
  const pointsInputs = page.locator('input[type="number"]');
  await pointsInputs.last().fill("30");
  await page.click('button:has-text("Add reward")');
  await page.waitForSelector("text=Free pastry", { timeout: 10000 });
  console.log("   OK, reward appears without reload");
  await page.screenshot({ path: `${shots}/5-reward-added.png` });

  await page.reload();
  await page.waitForLoadState("networkidle");
  const finalText = await page.textContent("body");
  if (!finalText.includes("Free pastry")) throw new Error("Reward lost after reload");
  console.log("   OK, reward persisted across reload");

  console.log("\nConsole errors captured during run:", errors.length ? errors : "(none)");
  console.log("\nGOLDEN PATH: PASS (with the documented Mapbox-token gap above)");
} catch (err) {
  await page.screenshot({ path: `${shots}/FAILURE.png` });
  console.error("\nGOLDEN PATH: FAIL —", err.message);
  console.error("Console errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
