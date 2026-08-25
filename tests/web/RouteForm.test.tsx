// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteForm } from "../../src/web/components/RouteForm";

describe("RouteForm", () => {
  afterEach(cleanup);

  it("previews interpolation with the shared renderer and submits normalized lists", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <RouteForm pending={false} onSubmit={onSubmit} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Route name"), { target: { value: "project" } });
    fireEvent.change(screen.getByLabelText("Destination template"), {
      target: { value: "https://example.com/projects/{*}" },
    });
    fireEvent.change(screen.getByLabelText("Try it"), { target: { value: "alpha beta" } });

    expect(screen.getByLabelText("Destination preview")).toHaveTextContent(
      "https://example.com/projects/alpha%20beta",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add details" }));
    fireEvent.change(screen.getByLabelText("Aliases"), {
      target: { value: "projects, proj, projects" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "Engineering, docs, Engineering" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create route" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "project",
        aliases: ["projects", "proj"],
        destinationTemplate: "https://example.com/projects/{*}",
        tags: ["engineering", "docs"],
      }),
      "save",
    );
  });

  it("shows shared schema validation messages without calling the API", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <RouteForm pending={false} onSubmit={onSubmit} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Route name"), { target: { value: "Not Valid!" } });
    fireEvent.change(screen.getByLabelText("Destination template"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create route" }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
