import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../shared/types";
import { validateConfig } from "../../shared/validate";
import { cloneConfig, defaultConfig } from "../../shared/defaults";

const ipc = vi.hoisted(() => ({
  pickIconImage: vi.fn(async (): Promise<string | null> => "C:\\icones\\steam.png"),
  readIconImage: vi.fn(async (p: string) => `data:image/png;base64,${p.length}`),
}));
vi.mock("../../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../../shared/ipc")>()), ...ipc }));

import { clearIconImageCache } from "../../hooks/useIconImage";
import { ItemsPage, type Selection } from "./ItemsPage";

const baseProfile = (): Profile => ({
  id: "p",
  name: "P",
  items: ["a", "b", "c"].map((id) => ({
    id, label: id.toUpperCase(), icon: "code", action: { type: "url" as const, url: "https://a.b" },
  })),
});

let latest: Profile;
function Harness() {
  const [profile, setProfile] = useState(baseProfile);
  const [sel, setSel] = useState<Selection>({ main: 0, child: null });
  latest = profile;
  return (
    <ItemsPage
      profile={profile}
      selection={sel}
      onSelect={setSel}
      edit={(fn) =>
        setProfile((p) => {
          const next = structuredClone(p);
          fn(next);
          return next;
        })
      }
    />
  );
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  clearIconImageCache();
});

describe("Itens › imagem própria do ícone", () => {
  it("escolher uma imagem grava o caminho no item e mostra a miniatura; remover volta ao ícone", async () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Usar imagem própria/ }));
    await flush();
    expect(latest.items[0].iconImage).toBe("C:\\icones\\steam.png");
    expect(latest.items[0].icon).toBe("code"); // ícone embutido fica como reserva
    expect(screen.getByText("steam.png")).toBeTruthy();
    expect(container.querySelectorAll("img.item-icon-image").length).toBeGreaterThanOrEqual(2); // lista + editor
    fireEvent.click(screen.getByRole("button", { name: /Remover imagem/ }));
    expect("iconImage" in latest.items[0]).toBe(false);
    expect(container.querySelector("img.item-icon-image")).toBeNull();
  });

  it("recusa formato que não é imagem", async () => {
    ipc.pickIconImage.mockResolvedValueOnce("C:\\apps\\steam.exe");
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Usar imagem própria/ }));
    await flush();
    expect(latest.items[0].iconImage).toBeUndefined();
    expect(screen.getByText(/Formato não suportado/)).toBeTruthy();
  });

  it("cancelar a escolha não muda nada", async () => {
    ipc.pickIconImage.mockResolvedValueOnce(null);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Usar imagem própria/ }));
    await flush();
    expect(latest.items[0].iconImage).toBeUndefined();
  });

  it("validação aceita imagem e rejeita extensão desconhecida", () => {
    const c = cloneConfig(defaultConfig);
    c.profiles[0].items[0].iconImage = "D:\\x\\logo.SVG";
    expect(validateConfig(c)).toEqual([]);
    c.profiles[0].items[0].iconImage = "D:\\x\\logo.exe";
    expect(validateConfig(c).some((e) => e.includes("imagem do ícone"))).toBe(true);
  });
});
