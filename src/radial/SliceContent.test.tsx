import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  readIconImage: vi.fn(async (p: string) => {
    if (p.includes("sumiu")) throw new Error("não foi possível abrir a imagem");
    return `data:image/png;base64,${p.length}`;
  }),
}));
vi.mock("../shared/ipc", async (orig) => ({ ...(await orig<typeof import("../shared/ipc")>()), ...ipc }));

import { clearIconImageCache } from "../hooks/useIconImage";
import { defaultConfig, defaultProfile } from "../shared/defaults";
import { RadialCanvas } from "./RadialCanvas";

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const canvas = (items = defaultProfile.items, appearance = defaultConfig.appearance) => (
  <RadialCanvas items={items} activeMain={null} activeSub={null} hubHovered={false} stats={null} appearance={appearance} />
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  clearIconImageCache();
});

describe("ícones personalizados nas fatias", () => {
  it("fatia com imagem própria desenha <image>; as outras seguem com o ícone embutido", async () => {
    const items = structuredClone(defaultProfile.items);
    items[0].iconImage = "C:\\icones\\steam.png";
    const { container } = render(canvas(items));
    expect(screen.queryByTestId("slice-icon-image")).toBeNull(); // ainda carregando: ícone embutido
    await flush();
    const imgs = screen.getAllByTestId("slice-icon-image");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("href")).toMatch(/^data:image\/png;base64,/);
    expect(container.querySelectorAll(".slice-icon")).toHaveLength(items.length - 1);
  });

  it("reabrir o menu usa o cache: sem reler o arquivo nem piscar o ícone embutido", async () => {
    const items = structuredClone(defaultProfile.items);
    items[0].iconImage = "C:\\icones\\steam.png";
    const first = render(canvas(items));
    await flush();
    first.unmount();
    render(canvas(items));
    expect(screen.getAllByTestId("slice-icon-image")).toHaveLength(1); // já no primeiro render
    expect(ipc.readIconImage).toHaveBeenCalledTimes(1);
  });

  it("imagem que não carrega cai no ícone embutido", async () => {
    const items = structuredClone(defaultProfile.items);
    items[0].iconImage = "C:\\icones\\sumiu.png";
    const { container } = render(canvas(items));
    await flush();
    expect(screen.queryByTestId("slice-icon-image")).toBeNull();
    expect(container.querySelectorAll(".slice-icon")).toHaveLength(items.length);
  });
});

describe("opacidade do menu", () => {
  it("passa a opacidade configurada ao canvas (padrão 1)", () => {
    const a = render(canvas());
    expect(a.container.querySelector("svg")!.style.getPropertyValue("--menu-opacity")).toBe("1");
    a.unmount();
    const b = render(canvas(defaultProfile.items, { ...defaultConfig.appearance, opacity: 0.6 }));
    expect(b.container.querySelector("svg")!.style.getPropertyValue("--menu-opacity")).toBe("0.6");
  });
});
