import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneConfig, defaultConfig } from "../../shared/defaults";
import { HOLO_ACCENT, PRISM_ACCENT, PRISM_DEFAULTS, type Config } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { AppearancePage, applyTheme } from "./SimplePages";

afterEach(cleanup);

function Harness({ onChange }: { onChange: (c: Config) => void }) {
  const [c, setC] = useState(() => cloneConfig(defaultConfig));
  const update = (fn: (c: Config) => void) =>
    setC((prev) => {
      const next = cloneConfig(prev);
      fn(next);
      onChange(next);
      return next;
    });
  return <AppearancePage config={c} update={update} />;
}

describe("Aparência › tema", () => {
  it("padrão é Prisma; trocar de tema troca a cor sugerida", () => {
    let last: Config | null = null;
    render(<Harness onChange={(c) => (last = c)} />);
    expect(screen.getByRole("radio", { name: "Prisma" }).getAttribute("aria-checked")).toBe("true");
    expect(defaultConfig.appearance.accent).toBe(PRISM_ACCENT);
    fireEvent.click(screen.getByRole("radio", { name: "Holográfico" }));
    expect(last!.appearance.theme).toBe("holo");
    expect(last!.appearance.accent).toBe(HOLO_ACCENT);
    expect(screen.getByRole("radio", { name: "Holográfico" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Vidro" }));
    expect(last!.appearance.theme).toBe("glass");
    expect(last!.appearance.accent).toBe("#4ade9b");
    fireEvent.click(screen.getByRole("radio", { name: "Prisma" }));
    expect(last!.appearance.theme).toBe("prism");
    expect(last!.appearance.accent).toBe(PRISM_ACCENT);
  });

  it("ajustes do Prisma só aparecem no tema Prisma e são salvos na config", () => {
    let last: Config | null = null;
    render(<Harness onChange={(c) => (last = c)} />);
    const slider = screen.getByLabelText(/Proximidade/) as HTMLInputElement;
    expect(slider.value).toBe(String(PRISM_DEFAULTS.size));
    fireEvent.change(slider, { target: { value: "1.6" } });
    expect(last!.appearance.prism!.size).toBe(1.6);
    expect(screen.getByText("Proximidade: 160%")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Olhar para a fatia sob o cursor"));
    expect(last!.appearance.prism!.lookAt).toBe(false);
    expect(validateConfig(last!)).toEqual([]);
    fireEvent.click(screen.getByRole("radio", { name: "Vidro" }));
    expect(screen.queryByLabelText(/Proximidade/)).toBeNull();
  });

  it("config sem ajustes do Prisma recebe os padrões ao escolher o tema", () => {
    const c = cloneConfig(defaultConfig);
    c.appearance.theme = "glass";
    delete c.appearance.prism;
    applyTheme(c, "prism");
    expect(c.appearance.prism).toEqual(PRISM_DEFAULTS);
  });

  it("não sobrescreve cor personalizada", () => {
    const c = cloneConfig(defaultConfig);
    c.appearance.accent = "#43c7d9";
    applyTheme(c, "holo");
    expect(c.appearance.theme).toBe("holo");
    expect(c.appearance.accent).toBe("#43c7d9");
  });

  it("validação aceita temas conhecidos e config antiga sem tema", () => {
    const c = cloneConfig(defaultConfig);
    expect(validateConfig(c)).toEqual([]);
    c.appearance.theme = "holo";
    expect(validateConfig(c)).toEqual([]);
    (c.appearance as { theme: string }).theme = "matrix";
    expect(validateConfig(c).some((e) => e.includes("Tema"))).toBe(true);
  });

  it("opacidade do menu: padrão 100%, o controle grava na config e a validação limita a faixa", () => {
    let last: Config | null = null;
    render(<Harness onChange={(c) => (last = c)} />);
    const slider = screen.getByLabelText(/Opacidade do menu: 100%/) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0.6" } });
    expect(last!.appearance.opacity).toBe(0.6);
    expect(screen.getByLabelText(/Opacidade do menu: 60%/)).toBeTruthy();
    expect(validateConfig(last!)).toEqual([]);
    last!.appearance.opacity = 0.05;
    expect(validateConfig(last!).some((e) => e.includes("Opacidade do menu"))).toBe(true);
  });

  it("validação rejeita ajustes do Prisma fora da faixa", () => {
    const c = cloneConfig(defaultConfig);
    c.appearance.prism = { ...PRISM_DEFAULTS, size: 3, chroma: -1 };
    const errors = validateConfig(c);
    expect(errors.some((e) => e.includes("Proximidade"))).toBe(true);
    expect(errors.some((e) => e.includes("Aberração"))).toBe(true);
    delete c.appearance.prism;
    expect(validateConfig(c)).toEqual([]);
  });
});
