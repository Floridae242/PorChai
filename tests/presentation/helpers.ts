import { expect, type Page, type TestInfo } from "@playwright/test";

export async function isolate(page: Page) {
  await page.context().route("**/*", async route => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    return route.abort("blockedbyclient");
  });
}
export async function checkpoint(page: Page, info: TestInfo, title: string) {
  await expect(page.locator("body")).not.toContainText(/NaN|Infinity|Application error:/);
  await page.evaluate(title => {
    let label = document.getElementById("automation-caption");
    if (!label) {
      label = document.createElement("div"); label.id = "automation-caption";
      label.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#163e2e;color:white;padding:8px 12px;font:12px sans-serif;pointer-events:none";
      document.body.append(label);
    }
    label.textContent = `DEMO · ข้อมูลจำลอง · ${title}`;
  }, title);
  // Presentation pacing only; assertions, not sleeps, decide whether a step passed.
  await page.waitForTimeout(Number(process.env.DEMO_PAUSE_MS ?? 1200));
  await info.attach(title, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
export async function tab(page: Page, path: string) {
  await page.locator(`a[href="${path}"]:visible`).first().click();
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?.*)?$`));
}
