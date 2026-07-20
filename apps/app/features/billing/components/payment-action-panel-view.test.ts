import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SandboxSimulationControls } from "./SandboxSimulationControls";

const props = {
  paymentId: "payment-1",
  pending: false,
  state: {},
  action: () => undefined,
};

describe("SandboxSimulationControls", () => {
  it("renders tutorial and simulation button when eligible", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSimulationControls, { ...props, canSimulate: true }));

    expect(markup).toContain("Sandbox payment tutorial");
    expect(markup).toContain("Simulate payment");
  });

  it("omits tutorial and simulation button when ineligible", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSimulationControls, { ...props, canSimulate: false }));

    expect(markup).not.toContain("Sandbox payment tutorial");
    expect(markup).not.toContain("Simulate payment");
  });
});
