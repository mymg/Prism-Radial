import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, defaultProfile } from "../shared/defaults";
import { RadialCanvas } from "./RadialCanvas";

const base = {
  items: defaultProfile.items,
  hubHovered: false,
  stats: { cpu: 85, ram: 50 },
  appearance: { ...defaultConfig.appearance, theme: "glass" as const },
};

afterEach(cleanup);

describe("RadialCanvas", () => {
  it("renderiza uma fatia por item", () => {
    render(<RadialCanvas {...base} activeMain={null} activeSub={null} />);
    expect(screen.getAllByTestId("main-slice")).toHaveLength(defaultProfile.items.length);
    expect(screen.queryByTestId("submenu")).toBeNull();
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("abre o sub-anel da fatia ativa com filhos", () => {
    const idx = defaultProfile.items.findIndex((i) => i.id === "pastas");
    render(<RadialCanvas {...base} activeMain={idx} activeSub={1} />);
    expect(screen.getByTestId("submenu")).toBeTruthy();
    expect(screen.getByText("DOWNLOADS")).toBeTruthy();
  });

  it("fatia sem filhos não abre sub-anel", () => {
    render(<RadialCanvas {...base} activeMain={0} activeSub={null} />);
    expect(screen.queryByTestId("submenu")).toBeNull();
  });

  it("tema vidro não desenha a camada holográfica nem o cubo", () => {
    const { container } = render(<RadialCanvas {...base} activeMain={null} activeSub={null} />);
    expect(screen.queryByTestId("holo-back")).toBeNull();
    expect(container.querySelector("svg")!.classList.contains("theme-glass")).toBe(true);
    expect(screen.queryByTestId("prism-core")).toBeNull();
  });

  it("tema Prisma (padrão) desenha o cubo no centro e esconde relógio e CPU", () => {
    const { container } = render(
      <RadialCanvas {...base} appearance={defaultConfig.appearance} activeMain={2} activeSub={null} />,
    );
    const svg = container.querySelector("svg")!;
    expect(defaultConfig.appearance.theme).toBe("prism");
    expect(svg.classList.contains("theme-prism")).toBe(true);
    const core = screen.getByTestId("prism-core");
    expect(core.getAttribute("aria-hidden")).toBe("true");
    expect(core.querySelector("canvas")).toBeTruthy();
    expect(screen.getAllByTestId("main-slice")).toHaveLength(defaultProfile.items.length);
    expect(screen.queryByText("85%")).toBeNull();
    expect(svg.querySelector(".hub-disc")).toBeNull();
    expect(svg.querySelector(".hub-well")).toBeTruthy();
  });

  it("tema holográfico desenha esfera, varredura e retícula sem perder fatias e hub", () => {
    const { container } = render(
      <RadialCanvas {...base} appearance={{ ...base.appearance, theme: "holo" }} activeMain={0} activeSub={null} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("theme-holo")).toBe(true);
    expect(screen.getByTestId("holo-back")).toBeTruthy();
    expect(svg.querySelectorAll(".holo-meridian")).toHaveLength(6);
    expect(svg.querySelector(".holo-sweep")).toBeTruthy();
    expect(svg.querySelector(".holo-front")).toBeTruthy();
    expect(svg.querySelector(".orbit-hot")).toBeNull();
    expect(screen.getAllByTestId("main-slice")).toHaveLength(defaultProfile.items.length);
    expect(screen.getByText("85%")).toBeTruthy();
    // Decoração não pode capturar o ponteiro.
    svg.querySelectorAll(".holo").forEach((g) => expect(g.getAttribute("aria-hidden")).toBe("true"));
  });
});
