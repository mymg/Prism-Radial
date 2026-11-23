import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../shared/types";
import { ItemsPage, type Selection } from "./ItemsPage";

// Teste adicionado pelo QA: "Ao selecionar" com 3 opções limpa children/action/dynamic.

const baseProfile = (): Profile => ({
  id: "p",
  name: "P",
  items: [
    { id: "a", label: "A", icon: "code", action: { type: "url", url: "https://a.b" } },
    {
      id: "b", label: "B", icon: "code",
      children: [{ id: "b1", label: "B1", icon: "code", action: { type: "url", url: "https://a.b" } }],
    },
    { id: "c", label: "C", icon: "code", action: { type: "url", url: "https://a.b" } },
  ],
});

let latest: Profile;

function Harness({ initial, main }: { initial: Profile; main: number }) {
  const [profile, setProfile] = useState(initial);
  const [sel, setSel] = useState<Selection>({ main, child: null });
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Os botões ficam dentro de um <label> (Field), então o nome acessível inclui o rótulo: busca pelo texto.
const radio = (name: RegExp) => screen.getAllByRole("radio").find((b) => name.test(b.textContent ?? ""))!;
const pick = (name: RegExp) => fireEvent.click(radio(name));

describe("ItemsPage › Ao selecionar", () => {
  it("ação → saídas de áudio → submenu → ação limpa os campos corretamente", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    expect(radio(/Executar ação/).getAttribute("aria-checked")).toBe("true");

    pick(/Saídas de áudio/);
    expect(latest.items[0]).toMatchObject({ dynamic: "audioOutputs" });
    expect(latest.items[0].action).toBeUndefined();
    expect(latest.items[0].children).toBeUndefined();
    expect(screen.getByText(/atualizadas a cada abertura do menu/)).toBeTruthy();
    expect(screen.getByTitle("Submenu automático")).toBeTruthy();

    pick(/Abrir submenu/);
    expect(latest.items[0].dynamic).toBeUndefined();
    expect(latest.items[0].action).toBeUndefined();
    expect(latest.items[0].children).toEqual([]);

    pick(/Executar ação/);
    expect(latest.items[0].children).toBeUndefined();
    expect(latest.items[0].dynamic).toBeUndefined();
    expect(latest.items[0].action?.type).toBe("launch");
  });

  it("submenu com subitens pede confirmação; cancelar mantém, confirmar troca para áudio", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness initial={baseProfile()} main={1} />);
    pick(/Saídas de áudio/);
    expect(confirm).toHaveBeenCalled();
    expect(latest.items[1].children).toHaveLength(1);
    expect(latest.items[1].dynamic).toBeUndefined();

    confirm.mockReturnValue(true);
    pick(/Saídas de áudio/);
    expect(latest.items[1].children).toBeUndefined();
    expect(latest.items[1].dynamic).toBe("audioOutputs");
  });

  it("clicar na opção já ativa não altera nada", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    const before = JSON.stringify(latest);
    pick(/Executar ação/);
    expect(JSON.stringify(latest)).toBe(before);
  });
});

describe("ItemsPage › arrastar para reordenar", () => {
  const ptr = (el: Element | Window, type: string) =>
    act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 })));
  const handle = (testId: string) => screen.getByTestId(testId).querySelector(".drag-handle")!;
  const withKids = (): Profile => {
    const p = baseProfile();
    p.items[1].children = ["b1", "b2", "b3"].map((id) => ({
      id, label: id.toUpperCase(), icon: "code", action: { type: "url" as const, url: "https://a.b" },
    }));
    return p;
  };

  it("arrastar a 1ª fatia até a 3ª move e mantém selecionada", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    ptr(handle("row-0"), "pointerdown");
    expect(screen.getByTestId("row-0").className).toContain("is-dragging");
    ptr(screen.getByTestId("row-2"), "pointerover");
    expect(screen.getByTestId("row-2").className).toContain("is-drop-after");
    ptr(window, "pointerup");
    expect(latest.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(screen.getByTestId("row-2").className).toContain("is-selected");
    expect(document.querySelector(".is-dragging, .is-drop-after, .is-drop-before")).toBeNull();
  });

  it("arrastar para cima mostra a linha de inserção acima", () => {
    render(<Harness initial={baseProfile()} main={2} />);
    ptr(handle("row-2"), "pointerdown");
    ptr(screen.getByTestId("row-0"), "pointerover");
    expect(screen.getByTestId("row-0").className).toContain("is-drop-before");
    ptr(window, "pointerup");
    expect(latest.items.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("subitens se reordenam dentro da própria fatia", () => {
    render(<Harness initial={withKids()} main={1} />);
    ptr(handle("row-1-2"), "pointerdown");
    ptr(screen.getByTestId("row-1-0"), "pointerover");
    ptr(window, "pointerup");
    expect(latest.items[1].children!.map((c) => c.id)).toEqual(["b3", "b1", "b2"]);
  });

  it("subitem não pode ir para o meio das fatias, nem fatia para o meio dos subitens", () => {
    render(<Harness initial={withKids()} main={1} />);
    const before = JSON.stringify(latest.items);
    ptr(handle("row-1-0"), "pointerdown");
    ptr(screen.getByTestId("row-0"), "pointerover");
    expect(screen.getByTestId("row-0").className).not.toContain("is-drop");
    ptr(window, "pointerup");
    ptr(handle("row-0"), "pointerdown");
    ptr(screen.getByTestId("row-1-1"), "pointerover");
    ptr(window, "pointerup");
    expect(JSON.stringify(latest.items)).toBe(before);
  });

  it("soltar sem passar por outra linha, ou cancelar com Esc, não muda nada", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    const before = JSON.stringify(latest.items);
    ptr(handle("row-0"), "pointerdown");
    ptr(window, "pointerup");
    ptr(handle("row-0"), "pointerdown");
    ptr(screen.getByTestId("row-2"), "pointerover");
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    ptr(window, "pointerup");
    expect(JSON.stringify(latest.items)).toBe(before);
  });

  it("Alt+↓ e Alt+↑ na linha movem o item", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    fireEvent.keyDown(screen.getByTestId("row-0"), { key: "ArrowDown", altKey: true });
    expect(latest.items.map((i) => i.id)).toEqual(["b", "a", "c"]);
    fireEvent.keyDown(screen.getByTestId("row-1"), { key: "ArrowUp", altKey: true });
    expect(latest.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("ItemsPage › formato do submenu", () => {
  it("só aparece em fatia com submenu; Barra compacta grava e Anel remove o campo", () => {
    render(<Harness initial={baseProfile()} main={0} />);
    expect(screen.queryByText("Formato do submenu")).toBeNull(); // fatia com ação
    cleanup();
    render(<Harness initial={baseProfile()} main={1} />);
    expect(radio(/^Anel$/).getAttribute("aria-checked")).toBe("true");
    pick(/Barra compacta/);
    expect(latest.items[1].submenuStyle).toBe("compact");
    expect(screen.getByText(/botões só com ícone/)).toBeTruthy();
    pick(/^Anel$/);
    expect("submenuStyle" in latest.items[1]).toBe(false);
  });

  it("trocar a fatia para Executar ação limpa o formato do submenu", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness initial={baseProfile()} main={1} />);
    pick(/Barra compacta/);
    pick(/Executar ação/);
    expect(latest.items[1].submenuStyle).toBeUndefined();
  });
});
