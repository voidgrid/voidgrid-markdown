import { expect, type Page, test } from "@playwright/test";

// These run against the real container. File System Access pickers need a real dialog, so most tests
// remove them and exercise the fallback path every non-Chromium browser takes (file input, download).
async function withoutPickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w["showOpenFilePicker"];
    delete w["showSaveFilePicker"];
  });
}

async function setText(page: Page, text: string): Promise<void> {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
}

const preview = (page: Page) => page.locator(".preview");

test.beforeEach(async ({ page }) => {
  await withoutPickers(page);
  await page.goto("/");
  await expect(preview(page).locator("h1")).toHaveText("Welcome");
});

test("serves strict security headers and raises no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text());
  });
  const resp = await page.goto("/");
  const csp = resp?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(resp?.headers()["x-content-type-options"]).toBe("nosniff");
  // The welcome document has a Mermaid diagram, which loads the lazy chunks under that policy.
  await expect(preview(page).locator("img.mermaid-img")).toBeVisible();
  expect(violations).toEqual([]);
});

test("renders the welcome document: front matter, table, task list and a Mermaid diagram", async ({ page }) => {
  await expect(preview(page).locator("details.front-matter")).toContainText("Welcome to voidgrid-markdown");
  await expect(preview(page).locator("table").first()).toBeVisible();
  await expect(preview(page).locator('input[type="checkbox"]').first()).toBeDisabled();
  const src = await preview(page).locator("img.mermaid-img").getAttribute("src");
  expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
});

test("flavour picker changes the rendering", async ({ page }) => {
  await setText(page, "| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~ H~2~O ==hi==\n");
  await expect(preview(page).locator("table")).toHaveCount(1);
  await expect(preview(page).locator("s")).toHaveText("gone");
  await expect(preview(page).locator("mark")).toHaveCount(0);
  await page.selectOption(".field select", "extended");
  await expect(preview(page).locator("mark")).toHaveText("hi");
  await expect(preview(page).locator("sub")).toHaveText("2");
  await page.selectOption(".field select", "commonmark");
  await expect(preview(page).locator("table")).toHaveCount(0);
  await expect(preview(page).locator("s")).toHaveCount(0);
});

test("raw HTML in a document cannot run script", async ({ page }) => {
  await setText(page, '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>\n\n[x](javascript:window.__pwned=3)');
  await expect(preview(page).locator("img")).toHaveCount(1);
  // The image stays (it is harmless) but the handler, the script and the link are gone.
  await expect(preview(page).locator("[onerror], script, a[href^=javascript]")).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)["__pwned"])).toBeUndefined();
});

test("open a file with the file chooser", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.click("#btn-open");
  await (await chooser).setFiles({ name: "opened.md", mimeType: "text/markdown", buffer: Buffer.from("# From disk\n\nbody\n") });
  await expect(preview(page).locator("h1")).toHaveText("From disk");
  await expect(page.locator(".tab[aria-selected=true]")).toContainText("opened.md");
  await expect(page.locator(".doc-name")).toHaveValue("opened.md");
});

test("drag and drop opens markdown files and skips others", async ({ page }) => {
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["# Dropped\n"], "dropped.md", { type: "text/markdown" }));
    dt.items.add(new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" }));
    for (const type of ["dragenter", "dragover", "drop"]) {
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }
  });
  await expect(preview(page).locator("h1")).toHaveText("Dropped");
  await expect(page.locator(".toast")).toContainText("image.png");
});

test("Save as .md downloads the markdown exactly as typed", async ({ page }) => {
  await setText(page, "# Mine\n\ncontent\n");
  await page.fill(".doc-name", "my notes");
  await page.keyboard.press("Tab");
  const download = page.waitForEvent("download");
  await page.click("#btn-save-as");
  const d = await download;
  expect(d.suggestedFilename()).toBe("my notes.md");
  const path = await d.path();
  const { readFile } = await import("node:fs/promises");
  expect(await readFile(path, "utf8")).toBe("# Mine\n\ncontent\n");
  await expect(page.locator("#st-saved")).toHaveText("saved");
});

test("Ctrl+S saves and clears the unsaved marker", async ({ page }) => {
  await setText(page, "# Changed\n");
  await expect(page.locator(".tab[aria-selected=true] .dirty")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+S");
  await download;
  await expect(page.locator(".tab[aria-selected=true] .dirty")).toHaveCount(0);
});

test("export: markdown, standalone HTML without scripts", async ({ page }) => {
  await setText(page, "---\ntitle: Exported\n---\n\n# Heading\n\n```js\nconst a = 1;\n```\n");
  await page.click("#export-menu summary");
  const md = page.waitForEvent("download");
  await page.click('[data-export="md"]');
  expect((await md).suggestedFilename()).toBe("welcome.md");

  await page.click("#export-menu summary");
  const html = page.waitForEvent("download");
  await page.click('[data-export="html"]');
  const d = await html;
  expect(d.suggestedFilename()).toBe("welcome.html");
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(await d.path(), "utf8");
  expect(text).toContain("<title>Exported</title>");
  expect(text).toContain("<h1>Heading</h1>");
  expect(text).toContain("hljs-keyword");
  expect(text).not.toContain("<script");
  expect(text).toContain("default-src 'none'");
});

test("print view shows only the rendered document", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".editor-pane")).toBeHidden();
  await expect(preview(page).locator("h1")).toBeVisible();
});

test("drafts, extra documents and settings survive a reload", async ({ page }) => {
  await setText(page, "# Draft one\n");
  await page.click(".tab.new button");
  await setText(page, "# Draft two\n");
  await page.selectOption(".field select", "extended");
  await page.click('.seg button[data-view="edit"]');
  await page.waitForTimeout(600); // autosave debounce
  await page.reload();
  await expect(page.locator(".tab")).toHaveCount(3); // welcome, untitled, plus the new-document button
  await expect(page.locator(".cm-content")).toContainText("Draft two");
  await expect(page.locator(".field select")).toHaveValue("extended");
  await page.click('.seg button[data-view="split"]');
  await page.locator(".tab button", { hasText: "welcome.md" }).click();
  await expect(page.locator(".cm-content")).toContainText("Draft one");
});

test("closing a document with unsaved changes asks first", async ({ page }) => {
  await setText(page, "# Unsaved\n");
  await page.click('.tab[aria-selected=true] .close');
  await expect(page.locator("dialog#confirm")).toBeVisible();
  await page.click("#confirm-cancel");
  await expect(page.locator(".cm-content")).toContainText("Unsaved");
  await page.click('.tab[aria-selected=true] .close');
  await page.click("#confirm-ok");
  await expect(page.locator(".cm-content")).not.toContainText("Unsaved");
});

test("lint problems appear in the panel and jump to the line", async ({ page }) => {
  await setText(page, "# Title\n\n### Skipped a level\n");
  await page.click("#btn-problems");
  await expect(page.locator("#problem-list")).toContainText("MD001");
  await expect(page.locator("#problem-count")).not.toHaveText("0");
  await page.locator("#problem-list button").first().click();
  await expect(page.locator("#st-cursor")).toHaveText(/^Ln 3,/);
});

test("outline lists headings and jumps to them", async ({ page }) => {
  await setText(page, "# One\n\ntext\n\n## Two\n\nmore\n");
  await page.click("#btn-outline");
  await expect(page.locator("#outline-list button")).toHaveText(["One", "Two"]);
  await page.locator("#outline-list button", { hasText: "Two" }).click();
  await expect(page.locator("#st-cursor")).toHaveText(/^Ln 5,/);
});

test("toolbar formatting and statistics", async ({ page }) => {
  await setText(page, "hello world");
  await page.keyboard.press("Control+A");
  await page.click('[data-cmd="bold"]');
  await expect(page.locator(".cm-content")).toContainText("**hello world**");
  await expect(page.locator("#st-stats")).toContainText("2 words");
});

test("find and replace opens in the editor", async ({ page }) => {
  await page.click('[data-cmd="find"]');
  await expect(page.locator(".cm-search")).toBeVisible();
});
