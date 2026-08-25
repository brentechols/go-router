import { expect, test, type APIRequestContext } from "@playwright/test";

function uniqueRoute(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function removeRouteIfPresent(request: APIRequestContext, name: string): Promise<void> {
  const lookup = await request.get(`/api/v1/routes/by-name/${encodeURIComponent(name)}`);
  if (!lookup.ok()) return;
  const route = (await lookup.json()) as { id: string };
  await request.delete(`/api/v1/routes/${encodeURIComponent(route.id)}`);
}

test("creates, lists, edits, follows, and deletes a route", async ({ page, request }) => {
  const name = uniqueRoute("e2e-route");
  const alias = uniqueRoute("e2e-alias");

  try {
    await page.goto("/admin/new");
    await page.getByLabel("Route name").fill(name);
    await page.getByLabel("Destination template").fill("https://example.com/projects/{*}");
    await page.getByLabel("Try it").fill("alpha beta");
    await expect(page.getByLabel("Destination preview")).toContainText(
      "https://example.com/projects/alpha%20beta",
    );

    await page.getByRole("button", { name: "Add details" }).click();
    await page.getByLabel("Description").fill("Created by the browser lifecycle test");
    await page.getByLabel("Aliases").fill(alias);
    await page.getByLabel("Tags").fill("e2e, docs");
    await page.getByRole("button", { name: "Create route" }).click();

    await expect(page).toHaveURL(/\/admin\/routes\/\d+\/edit\?created=1$/);
    await expect(page.getByRole("status")).toContainText("Route saved");

    await page.getByLabel("Breadcrumb").getByRole("link", { name: "Routes" }).click();
    await page.getByRole("searchbox", { name: "Search routes" }).fill(name);
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`^go/${name}`) })).toBeVisible();
    await expect(page.getByText(`go/${alias}`, { exact: true })).toBeVisible();

    await page.getByRole("link", { name: `Edit go/${name}` }).click();
    await page.getByLabel("Description").fill("Updated by the browser lifecycle test");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Route saved");

    const lookup = await request.get(`/api/v1/routes/by-name/${encodeURIComponent(name)}`);
    expect(lookup.ok()).toBeTruthy();
    await expect(lookup.json()).resolves.toMatchObject({
      name,
      aliases: [alias],
      description: "Updated by the browser lifecycle test",
    });

    await page.getByRole("button", { name: "Delete route" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(`Delete go/${name}?`);
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    const removed = await request.get(`/api/v1/routes/by-name/${encodeURIComponent(name)}`);
    expect(removed.status()).toBe(404);
  } finally {
    await removeRouteIfPresent(request, name);
  }
});

test("unknown shortcut can be saved and retried with its original arguments", async ({
  page,
  request,
  baseURL,
}) => {
  const name = uniqueRoute("e2e-missing");
  const argument = "release notes";

  try {
    await page.goto(`/${encodeURIComponent(name)}/${encodeURIComponent(argument)}`);
    await expect(page).toHaveTitle(/not found|unknown|go-router/i);

    const createLink = page.getByRole("link", { name: /create.*go|create.*route/i });
    await expect(createLink).toBeVisible();
    await createLink.click();

    await expect(page).toHaveURL(/\/admin\/new\?/);
    await expect(page.getByLabel("Route name")).toHaveValue(name);
    await expect(page.getByLabel("Try it")).toHaveValue(`"${argument}"`);

    await page
      .getByLabel("Destination template")
      .fill(`${new URL(baseURL!).origin}/healthz?from={*}`);
    await page.getByRole("button", { name: "Save & go" }).click();

    await expect(page).toHaveURL(new RegExp(`/healthz\\?from=${encodeURIComponent(argument)}$`));
    await expect(page.locator("body")).toContainText(/ok/i);
  } finally {
    await removeRouteIfPresent(request, name);
  }
});
