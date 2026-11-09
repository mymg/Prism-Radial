import { describe, expect, it } from "vitest";
import { CUBE, EDGES, FACES, cubeFrame, hull, project, rotate } from "./prismCube";

const C = 240;
const R = 118;
const facing = { yaw: 0, pitch: 0, roll: Math.PI / 4 };

describe("cubo do tema Prisma", () => {
  it("tem 8 quinas, 12 arestas e 6 faces", () => {
    expect(CUBE).toHaveLength(8);
    expect(EDGES).toHaveLength(12);
    expect(FACES).toHaveLength(6);
    FACES.forEach((f) => expect(new Set(f.idx).size).toBe(4));
  });

  it("de frente e girado 45°, a silhueta é um losango com a quina de cima no raio pedido", () => {
    const f = cubeFrame(facing, C, R);
    expect(f.faces.filter((x) => x.front)).toHaveLength(1);
    expect(f.outline).toHaveLength(4);
    const top = f.outline.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(top[0]).toBeCloseTo(C, 6);
    expect(top[1]).toBeCloseTo(C - R, 6);
    // Só a face da frente é visível: 4 arestas de contorno e 8 por trás do vidro.
    expect(f.edgeKinds.filter((k) => k === "rim")).toHaveLength(4);
    expect(f.edgeKinds.filter((k) => k === "back")).toHaveLength(8);
  });

  it("girado em dois eixos mostra 3 faces e contorno hexagonal", () => {
    const f = cubeFrame({ yaw: 0.6, pitch: 0.5, roll: 0 }, C, R);
    expect(f.faces.filter((x) => x.front)).toHaveLength(3);
    expect(f.outline).toHaveLength(6);
    expect(f.edgeKinds.filter((k) => k === "rim")).toHaveLength(6);
    expect(f.edgeKinds.filter((k) => k === "front")).toHaveLength(3);
  });

  it("perspectiva: a face de trás aparece menor que a da frente", () => {
    const front = project([0, -Math.SQRT2, 1], C, R);
    const back = project([0, -Math.SQRT2, -1], C, R);
    expect(C - front[1]).toBeCloseTo(R, 6);
    expect(C - back[1]).toBeLessThan(C - front[1]);
  });

  it("rotação preserva o tamanho do cubo", () => {
    for (const p of CUBE) {
      const q = rotate(p, { yaw: 1.1, pitch: -0.7, roll: 0.3 });
      expect(Math.hypot(...q)).toBeCloseTo(Math.sqrt(3), 9);
    }
  });

  it("a luz vinda da frente ilumina mais a face da frente", () => {
    const f = cubeFrame(facing, C, R, [0, 0, 1]);
    const front = f.faces.find((x) => x.front)!;
    expect(front.lit).toBeCloseTo(1, 6);
    f.faces.filter((x) => !x.front).forEach((x) => expect(x.lit).toBeLessThan(0.01));
  });

  it("hull ignora pontos internos", () => {
    expect(hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]])).toHaveLength(4);
  });
});
