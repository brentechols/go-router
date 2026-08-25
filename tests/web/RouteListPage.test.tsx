// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteListPage } from "../../src/web/pages/RouteListPage";

const route = {
  id: "42",
  name: "design-system",
  aliases: ["components"],
  destinationTemplate: "https://design.example.com/{*}",
  description: "Shared components and design guidance",
  tags: ["design", "docs"],
  hitCount: "128",
  lastUsedAt: "2026-08-24T18:00:00.000Z",
  createdAt: "2026-08-20T18:00:00.000Z",
  updatedAt: "2026-08-24T18:00:00.000Z",
};

function renderPage(initialEntry = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<RouteListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RouteListPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders route metadata and cursor controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [route],
            page: { limit: 50, total: 1, previousCursor: null, nextCursor: "next-page" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText("design-system", { selector: "a.go-link" })).toBeInTheDocument();
    expect(screen.getByText("Shared components and design guidance")).toBeInTheDocument();
    expect(screen.getByText("go/components")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeEnabled();
  });

  it("keeps search and tag filters in the URL-backed request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: { limit: 50, total: 0, previousCursor: null, nextCursor: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Create your first shortcut");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search routes" }), {
      target: { value: "component" },
    });
    fireEvent.change(screen.getByLabelText("Filter by comma-separated tags"), {
      target: { value: "design, docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(secondUrl).toContain("q=component");
    expect(secondUrl).toContain("tags=design%2Cdocs");
  });
});
