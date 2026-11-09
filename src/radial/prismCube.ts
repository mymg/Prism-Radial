// Geometria pura do cubo de cristal do tema Prisma (sem DOM): rotação, projeção em
// perspectiva, faces visíveis e contorno. O desenho fica em PrismCore.tsx.

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/** 8 quinas do cubo [-1, 1]³. O bit 0/1/2 do índice escolhe o sinal de x/y/z. */
export const CUBE: Vec3[] = Array.from({ length: 8 }, (_, i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);

/** Arestas: pares de quinas que diferem em um eixo (o terceiro valor é esse eixo). */
export const EDGES: [number, number, number][] = [];
for (let i = 0; i < 8; i++)
  for (let b = 0; b < 3; b++) {
    const j = i | (1 << b);
    if (j !== i) EDGES.push([i, j, b]);
  }

/** Faces: eixo da normal, sinal e as 4 quinas em ordem ao redor da face. */
export interface Face {
  axis: number;
  sign: 1 | -1;
  idx: number[];
}
export const FACES: Face[] = [];
for (let axis = 0; axis < 3; axis++)
  for (const sign of [-1, 1] as const) {
    const [b, c] = [0, 1, 2].filter((x) => x !== axis);
    const idx = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const p: number[] = [];
      p[axis] = sign;
      p[b] = u;
      p[c] = v;
      return CUBE.findIndex((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]);
    });
    FACES.push({ axis, sign, idx });
  }

/** Distância da câmera ao centro do cubo (em lados/2). Menor = perspectiva mais forte. */
export const CAMERA = 5;

export interface Pose {
  yaw: number;
  pitch: number;
  roll: number;
}

/** Gira no plano da tela (roll), depois em torno de Y (yaw) e de X (pitch). z positivo aponta para a câmera. */
export function rotate([x0, y0, z0]: Vec3, { yaw, pitch, roll }: Pose): Vec3 {
  let x = x0, y = y0, z = z0;
  let c = Math.cos(roll), s = Math.sin(roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(yaw); s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(pitch); s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}

/**
 * Projeta em perspectiva. `radius` é a distância do centro às quinas da face da frente
 * quando o cubo está de frente e girado 45° (silhueta de losango).
 */
export function project([x, y, z]: Vec3, center: number, radius: number, k = 1): Vec2 {
  const focal = (radius * (CAMERA - 1)) / Math.SQRT2;
  const f = focal / (CAMERA - z * k);
  return [center + x * k * f, center + y * k * f];
}

/** Envoltória convexa (monotone chain), em sentido anti-horário. */
export function hull(points: Vec2[]): Vec2[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec2[] = [];
  const up: Vec2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export type EdgeKind = "front" | "rim" | "back";

export interface CubeFrame {
  /** Quinas giradas (espaço 3D). */
  world: Vec3[];
  /** Quinas projetadas (px). */
  screen: Vec2[];
  /** Faces de trás para a frente, com visibilidade e iluminação (0–1) pela direção `light`. */
  faces: (Face & { front: boolean; lit: number; depth: number; points: Vec2[] })[];
  /** Tipo de cada aresta, na mesma ordem de EDGES: "rim" = contorno (uma face visível e outra não). */
  edgeKinds: EdgeKind[];
  /** Contorno do cubo na tela. */
  outline: Vec2[];
}

export function cubeFrame(pose: Pose, center: number, radius: number, light: Vec3 = [0, 0, 1]): CubeFrame {
  const world = CUBE.map((p) => rotate(p, pose));
  const screen = world.map((p) => project(p, center, radius));
  const len = Math.hypot(...light) || 1;
  const L = light.map((v) => v / len);
  const faces = FACES.map((f) => {
    const n: Vec3 = [0, 0, 0];
    n[f.axis] = f.sign;
    const rn = rotate(n, pose);
    const ctr = f.idx.reduce<Vec3>((s, i) => [s[0] + world[i][0] / 4, s[1] + world[i][1] / 4, s[2] + world[i][2] / 4], [0, 0, 0]);
    // Visível se a normal aponta para a câmera (em perspectiva, não só pelo sinal de z).
    const front = rn[0] * -ctr[0] + rn[1] * -ctr[1] + rn[2] * (CAMERA - ctr[2]) > 0;
    const lit = Math.max(0, rn[0] * L[0] + rn[1] * L[1] + rn[2] * L[2]);
    return { ...f, front, lit, depth: ctr[2], points: f.idx.map((i) => screen[i]) };
  }).sort((a, b) => a.depth - b.depth);
  const visible = new Map(faces.map((f) => [`${f.axis}:${f.sign}`, f.front]));
  const edgeKinds = EDGES.map(([i, , axis]): EdgeKind => {
    const [c1, c2] = [0, 1, 2].filter((x) => x !== axis);
    const f1 = visible.get(`${c1}:${CUBE[i][c1]}`);
    const f2 = visible.get(`${c2}:${CUBE[i][c2]}`);
    return f1 && f2 ? "front" : f1 || f2 ? "rim" : "back";
  });
  return { world, screen, faces, edgeKinds, outline: hull(screen) };
}
