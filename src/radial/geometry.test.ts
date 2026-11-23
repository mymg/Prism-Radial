import { describe, expect, it } from "vitest";
import { angleDiff, COMPACT, compactAngles, compactItemSpan, compactReadsReversed, donutSlicePath, hitTest, LAYOUT, normalizeAngle, polar, sliceAngle, submenuAngles } from "./geometry";

describe("ângulos", () => {
  it("normaliza", () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(720)).toBe(0);
  });
  it("angleDiff pega o menor caminho", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
  });
  it("fatia 0 fica no topo e as demais seguem sentido horário", () => {
    expect(sliceAngle(0, 8)).toBe(-90);
    expect(sliceAngle(1, 8)).toBe(-45);
    expect(sliceAngle(2, 8)).toBe(0);
  });
  it("polar", () => {
    const p = polar(0, 0, 10, -90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-10);
  });
});

describe("donutSlicePath", () => {
  it("gera path fechado com dois arcos", () => {
    const d = donutSlicePath(450, 450, 140, 287, -112.5, -67.5, 10);
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/A/g)).toHaveLength(2);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("submenuAngles", () => {
  it("centraliza no ângulo do pai", () => {
    const a = submenuAngles(-45, 3, 38);
    expect(a).toHaveLength(3);
    expect(a[1]).toBeCloseTo(-45);
    expect(a[0]).toBeCloseTo(-83);
    expect(a[2]).toBeCloseTo(-7);
  });
  it("reduz o espaçamento quando há muitos itens", () => {
    const a = submenuAngles(0, 10, 38);
    expect(a[1] - a[0]).toBeCloseTo(32);
  });
});

describe("hitTest", () => {
  const dz = 120;
  it("zona morta = centro", () => {
    expect(hitTest(10, 10, 8, dz)).toEqual({ ring: "center" });
  });
  it("seleciona por ângulo no anel principal", () => {
    expect(hitTest(0, -200, 8, dz)).toEqual({ ring: "main", index: 0 }); // topo
    expect(hitTest(200, 0, 8, dz)).toEqual({ ring: "main", index: 2 }); // direita
    expect(hitTest(0, 200, 8, dz)).toEqual({ ring: "main", index: 4 }); // baixo
    expect(hitTest(-200, 0, 8, dz)).toEqual({ ring: "main", index: 6 }); // esquerda
  });
  it("funciona além do anel (gesto)", () => {
    expect(hitTest(0, -800, 8, dz)).toEqual({ ring: "main", index: 0 });
  });
  it("detecta item do sub-anel quando aberto", () => {
    const sub = { parentAngle: -45, count: 3 };
    const p = polar(0, 0, 330, -45);
    expect(hitTest(p.x, p.y, 8, dz, sub)).toEqual({ ring: "sub", index: 1 });
    const q = polar(0, 0, 330, -83);
    expect(hitTest(q.x, q.y, 8, dz, sub)).toEqual({ ring: "sub", index: 0 });
  });
  it("fora do arco do sub-anel volta para o anel principal", () => {
    const sub = { parentAngle: -45, count: 3 };
    const p = polar(0, 0, 330, 90);
    expect(hitTest(p.x, p.y, 8, dz, sub)).toEqual({ ring: "main", index: 4 });
  });
  it("no anel principal ignora o sub-anel", () => {
    const sub = { parentAngle: -45, count: 3 };
    const p = polar(0, 0, LAYOUT.mainInner + 20, -45);
    expect(hitTest(p.x, p.y, 8, dz, sub)).toEqual({ ring: "main", index: 1 });
  });
});

describe("barra compacta", () => {
  it("botões lado a lado na largura da fatia-pai, centrados nela", () => {
    const parent = sliceAngle(3, 7);
    const span = compactItemSpan(6, 7);
    const angles = compactAngles(parent, 6, 7);
    expect(span * 6).toBeCloseTo((360 / 7) * COMPACT.fill, 6);
    expect((angles[0] + angles[5]) / 2).toBeCloseTo(parent, 6);
  });

  it("fatia estreita: cada botão tem a largura mínima", () => {
    expect(compactItemSpan(8, 10)).toBe(COMPACT.minItemSpan);
  });

  it("hitTest usa a geometria da barra quando compact", () => {
    const parent = sliceAngle(0, 6); // topo
    const angles = compactAngles(parent, 5, 6);
    const r = (COMPACT.inner + COMPACT.outer) / 2;
    const sub = { parentAngle: parent, count: 5, compact: true };
    angles.forEach((a, i) => {
      const p = polar(0, 0, r, a);
      expect(hitTest(p.x, p.y, 6, 40, sub)).toEqual({ ring: "sub", index: i });
    });
    // Fora da barra (ângulo de outra fatia), mesmo no raio dela: volta para as fatias principais.
    const out = polar(0, 0, r, sliceAngle(2, 6));
    expect(hitTest(out.x, out.y, 6, 40, sub)).toEqual({ ring: "main", index: 2 });
  });
});

describe("barra compacta › ordem de leitura", () => {
  const points = (parent: number) => compactAngles(parent, 3, 6).map((a) => polar(0, 0, 300, a));
  it("em cima e embaixo lê da esquerda para a direita", () => {
    for (const parent of [-90, 90]) {
      const [a, b, c] = points(parent);
      expect(a.x).toBeLessThan(b.x);
      expect(b.x).toBeLessThan(c.x);
    }
  });
  it("nas laterais lê de cima para baixo", () => {
    for (const parent of [0, 180]) {
      const [a, b, c] = points(parent);
      expect(a.y).toBeLessThan(b.y);
      expect(b.y).toBeLessThan(c.y);
    }
  });
  it("inverte só embaixo e na esquerda", () => {
    expect([-90, 0, 90, 180].map(compactReadsReversed)).toEqual([false, false, true, true]);
  });
});
