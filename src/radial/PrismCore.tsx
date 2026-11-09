/**
 * Núcleo do tema Prisma: cubo de cristal animado que acompanha o cursor (parallax em camadas
 * e inclinação 3D). Desenhado num único <canvas> dentro de um <foreignObject>, para escalar
 * junto com o SVG do menu. Só anima enquanto está montado (o menu desmonta ao fechar).
 */
import { useEffect, useRef } from "react";
import { PRISM_DEFAULTS, type PrismConfig } from "../shared/types";
import { LAYOUT } from "./geometry";
import { CUBE, EDGES, cubeFrame, project, rotate, type Pose, type Vec2 } from "./prismCube";

interface Props {
  accent: string;
  prism?: Partial<PrismConfig>;
  /** Ângulo (graus, 0° = direita) da fatia sob o cursor; o cubo "olha" para ela. */
  lookAngle: number | null;
  /** Cor da fatia sob o cursor (tinge o núcleo). */
  lookColor?: string;
  /** Cursor sobre o centro (fechar/voltar): o núcleo brilha mais. */
  hubHovered: boolean;
}

// Espaço de desenho do canvas (unidades próprias) e tamanho dele no SVG do menu.
const S = 480;
const C = S / 2;
const R = 118; // raio do losango da face da frente
const CSS_SIZE = 400; // unidades do SVG (o anel começa em LAYOUT.mainInner = 140)
const FO = 760; // área do foreignObject: comporta proximidade máxima + parallax
const DEPTH = { back: 0.35, crystal: 0.8, front: 1.5 };

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const VIOLET: RGB = [139, 125, 255];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [169, 220, 255];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface Bolt {
  pts: Vec2[];
  born: number;
  life: number;
  w: number;
}

function makeBolt(t: number, P: Vec2[]): Bolt {
  const [i, j] = EDGES[Math.floor(Math.random() * EDGES.length)];
  const u = Math.random();
  const x1 = P[i][0] + (P[j][0] - P[i][0]) * u;
  const y1 = P[i][1] + (P[j][1] - P[i][1]) * u;
  const x0 = C + (Math.random() - 0.5) * 36;
  const y0 = C + (Math.random() - 0.5) * 20;
  const pts: Vec2[] = [[x0, y0]];
  const sub = (xa: number, ya: number, xb: number, yb: number, d: number) => {
    if (d < 3) return void pts.push([xb, yb]);
    const mx = (xa + xb) / 2 + (Math.random() - 0.5) * d;
    const my = (ya + yb) / 2 + (Math.random() - 0.5) * d;
    sub(xa, ya, mx, my, d / 2);
    sub(mx, my, xb, yb, d / 2);
  };
  sub(x0, y0, x1, y1, 46);
  return { pts, born: t, life: 0.25 + Math.random() * 0.35, w: 0.6 + Math.random() * 1.2 };
}

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  a: (i / 30) * Math.PI * 2 + Math.random() * 0.2,
  sp: 0.25 + Math.random() * 0.2,
  r: 1 + Math.random() * 0.12,
}));

interface FrameInput {
  t: number;
  tint: RGB;
  glow: number;
  ca: number;
  px: number;
  py: number;
  pulse: number;
  strength: number;
  reduce: boolean;
}

function poly(ctx: CanvasRenderingContext2D, pts: Vec2[], ox = 0) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y) : ctx.moveTo(x + ox, y)));
  ctx.closePath();
}
function seg(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, ox = 0) {
  ctx.beginPath();
  ctx.moveTo(a[0] + ox, a[1]);
  ctx.lineTo(b[0] + ox, b[1]);
}

function drawBack(ctx: CanvasRenderingContext2D, { t, tint, glow }: FrameInput) {
  ctx.globalCompositeOperation = "lighter";
  const blobs: [number, number, number, number, RGB][] = [
    [0, 0, 150, 0.32, tint],
    [Math.cos(t * 0.3) * 30, Math.sin(t * 0.4) * 20, 110, 0.22, VIOLET],
    [Math.cos(t * 0.23 + 2) * 40, Math.sin(t * 0.31 + 1) * 30, 90, 0.18, tint],
  ];
  for (const [ox, oy, r, a, c] of blobs) {
    const g = ctx.createRadialGradient(C + ox, C + oy, 0, C + ox, C + oy, r);
    g.addColorStop(0, rgba(c, a * glow));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(C + ox - r, C + oy - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawCrystal(ctx: CanvasRenderingContext2D, f: FrameInput, bolts: { list: Bolt[]; next: number }) {
  const { t, tint, glow, ca, px, py, pulse, reduce } = f;
  const sway = reduce ? 0 : 1;
  const pose: Pose = {
    yaw: px * 0.36 + Math.sin(t * 0.37) * 0.2 * sway,
    pitch: -py * 0.32 + Math.sin(t * 0.29 + 1) * 0.12 * sway,
    roll: Math.PI / 4 + Math.sin(t * 0.21) * 0.05 * sway,
  };
  const frame = cubeFrame(pose, C, R, [px * 0.9, py * 0.9, 1]);
  const P = frame.screen;
  const pale = mix(tint, WHITE, 0.55);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Faces e arestas de trás, vistas através do vidro
  for (const face of frame.faces) {
    if (face.front) continue;
    poly(ctx, face.points);
    ctx.fillStyle = rgba(tint, 0.035);
    ctx.fill();
  }
  EDGES.forEach(([i, j], e) => {
    if (frame.edgeKinds[e] !== "back") return;
    seg(ctx, P[i], P[j]);
    ctx.strokeStyle = rgba(pale, 0.32);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  });

  // Cubo interno girando devagar
  const innerPose: Pose = { yaw: pose.yaw + t * 0.35 * sway, pitch: pose.pitch - t * 0.22 * sway, roll: pose.roll };
  const inner = CUBE.map((p) => project(rotate(p, innerPose), C, R, 0.42));
  ctx.strokeStyle = rgba(pale, 0.18);
  ctx.lineWidth = 0.8;
  for (const [i, j] of EDGES) {
    seg(ctx, inner[i], inner[j]);
    ctx.stroke();
  }

  // Núcleo dentro do cubo: nuvens, faixa ondulada, anel pontilhado e raios
  ctx.save();
  poly(ctx, frame.outline);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 6; k++) {
    const a = t * 0.35 + k * 1.05;
    ctx.save();
    ctx.translate(C + Math.cos(a) * (24 + k * 5), C + Math.sin(a * 1.3) * 11);
    ctx.scale(1.9, 0.7);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 32);
    g.addColorStop(0, rgba(pale, 0.22 * glow));
    g.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (let j = 0; j < 4; j++) {
    ctx.beginPath();
    for (let x = C - R; x <= C + R; x += 4) {
      const y = C + Math.sin(x * 0.045 + t * 1.6 + j * 1.7) * (5 + j * 3) * Math.cos(((x - C) / R) * 1.4);
      if (x === C - R) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(mix(tint, WHITE, 0.6), 0.09 + 0.05 * j);
    ctx.lineWidth = 9 - j * 2;
    ctx.stroke();
  }
  const cr = 15 * (1 + 0.18 * Math.sin(t * 2.6)) * (1 + pulse * 0.8);
  const cg = ctx.createRadialGradient(C, C, 0, C, C, cr * 3);
  cg.addColorStop(0, `rgba(255,255,255,${0.95 * glow + 0.05})`);
  cg.addColorStop(0.25, rgba(tint, 0.55 * glow));
  cg.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(C, C, cr * 3, 0, Math.PI * 2);
  ctx.fill();
  for (let d = 0; d < 40; d++) {
    const a = (d / 40) * Math.PI * 2 + t * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.35 * Math.max(0, Math.sin(a * 3 - t * 2))})`;
    ctx.beginPath();
    ctx.arc(C + Math.cos(a) * 42, C + Math.sin(a) * 16, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!reduce) {
    if (t > bolts.next) {
      bolts.list.push(makeBolt(t, P));
      if (Math.random() < 0.4) bolts.list.push(makeBolt(t, P));
      bolts.next = t + 0.08 + Math.random() * 0.25;
    }
    bolts.list = bolts.list.filter((b) => t - b.born < b.life);
    ctx.shadowColor = rgba(tint, 1);
    ctx.shadowBlur = 8;
    for (const b of bolts.list) {
      const a = 1 - (t - b.born) / b.life;
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = `rgba(235,245,255,${0.75 * a})`;
      ctx.lineWidth = b.w;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // Faces da frente: vidro com reflexo que segue a luz do cursor
  ctx.globalCompositeOperation = "lighter";
  for (const face of frame.faces) {
    if (!face.front) continue;
    const [p0, , p2] = face.points;
    const g = ctx.createLinearGradient(p0[0], p0[1], p2[0], p2[1]);
    const a = 0.04 + face.lit * 0.14;
    g.addColorStop(0, rgba(pale, a * 1.6));
    g.addColorStop(0.45, rgba(tint, a * 0.4));
    g.addColorStop(1, rgba(pale, a));
    poly(ctx, face.points);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Arestas da frente e contorno (com separação RGB)
  EDGES.forEach(([i, j], e) => {
    if (frame.edgeKinds[e] !== "front") return;
    seg(ctx, P[i], P[j]);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
  const rim = EDGES.filter((_, e) => frame.edgeKinds[e] === "rim");
  ctx.lineWidth = 2.4;
  if (ca > 0) {
    ctx.strokeStyle = "rgba(255,50,70,.55)";
    for (const [i, j] of rim) { seg(ctx, P[i], P[j], ca); ctx.stroke(); }
    ctx.strokeStyle = "rgba(40,120,255,.6)";
    for (const [i, j] of rim) { seg(ctx, P[i], P[j], -ca); ctx.stroke(); }
  }
  ctx.shadowColor = rgba(tint, 1);
  ctx.shadowBlur = 20 * glow;
  ctx.strokeStyle = "rgba(245,250,255,.95)";
  for (const [i, j] of rim) { seg(ctx, P[i], P[j]); ctx.stroke(); }
  ctx.shadowBlur = 0;

  // Brilho nas quinas da frente
  frame.world.forEach((w, i) => {
    if (w[2] < 0.2) return;
    const [x, y] = P[i];
    const s = 3 + w[2] * 3 + Math.sin(t * 3 + i) * 1.2;
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.2 * w[2]})`;
    poly(ctx, [[x - s * 2, y], [x, y - 0.7], [x + s * 2, y], [x, y + 0.7]]);
    ctx.fill();
    poly(ctx, [[x, y - s * 2], [x + 0.7, y], [x, y + s * 2], [x - 0.7, y]]);
    ctx.fill();
  });
  ctx.globalCompositeOperation = "source-over";
}

function drawFront(ctx: CanvasRenderingContext2D, { t, tint, glow, ca }: FrameInput) {
  ctx.save();
  ctx.translate(C, C);
  ctx.rotate(-0.32);
  ctx.globalCompositeOperation = "lighter";
  const ribbons: [number, string, number][] = [
    [ca, "rgba(255,60,80,.18)", 3],
    [-ca, "rgba(50,130,255,.2)", 3],
    [0, rgba(mix(tint, WHITE, 0.4), 0.22), 7],
    [0, "rgba(255,255,255,.5)", 1.4],
  ];
  for (const [off, col, w] of ribbons) {
    ctx.beginPath();
    for (let k = 0; k <= 60; k++) {
      const a = -2.6 + (k / 60) * 2.4 + Math.sin(t * 0.4) * 0.2;
      const rr = 1 + Math.sin(a * 3 + t * 1.2) * 0.06;
      const x = Math.cos(a) * 150 * rr + off;
      const y = Math.sin(a) * 56 * rr;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = w * (0.6 + glow * 0.6);
    ctx.stroke();
  }
  for (const p of PARTICLES) {
    const a = p.a + t * p.sp;
    const z = Math.sin(a);
    const x = Math.cos(a) * 156 * p.r;
    const y = z * 60 * p.r;
    const al = 0.35 + (0.5 * (z + 1)) / 2;
    const s = 1.2 + (z + 1);
    ctx.fillStyle = `rgba(255,60,80,${al * 0.7})`;
    ctx.fillRect(x - s - ca * 0.6, y - s / 2, s * 1.6, s);
    ctx.fillStyle = `rgba(50,140,255,${al * 0.7})`;
    ctx.fillRect(x - s + ca * 0.6, y - s / 2, s * 1.6, s);
    ctx.fillStyle = `rgba(255,248,235,${al})`;
    ctx.fillRect(x - s * 0.6, y - s / 2, s * 1.2, s);
  }
  ctx.restore();
}

export function PrismCore({ accent, prism, lookAngle, lookColor, hubHovered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cfg = { ...PRISM_DEFAULTS, ...prism };
  // Props atuais para o loop de animação (sem reiniciá-lo a cada render).
  const live = useRef({ cfg, accent, lookAngle, lookColor, hubHovered });
  live.current = { cfg, accent, lookAngle, lookColor, hubHovered };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return; // jsdom / sem canvas: nada a animar

    const reduce = prefersReducedMotion();
    const svg = canvas.closest("svg");
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = svg?.getBoundingClientRect();
      if (!r || !r.width) return;
      const k = r.width / LAYOUT.size; // px de tela por unidade do SVG
      pointer = {
        x: (e.clientX - (r.left + r.width / 2)) / k / LAYOUT.mainOuter,
        y: (e.clientY - (r.top + r.height / 2)) / k / LAYOUT.mainOuter,
      };
    };
    const onLeave = () => (pointer = null);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);

    // Resolução do canvas proporcional ao tamanho real na tela (nítido sem pesar).
    let res = 0;
    const fit = (size: number) => {
      const r = svg?.getBoundingClientRect();
      const screenPerUnit = r && r.width ? r.width / LAYOUT.size : 1;
      const want = Math.min(3, Math.max(1, (CSS_SIZE / S) * screenPerUnit * size * (window.devicePixelRatio || 1)));
      if (Math.abs(want - res) < 0.05) return;
      res = want;
      canvas.width = Math.round(S * res);
      canvas.height = Math.round(S * res);
    };

    const sm = { x: 0, y: 0 };
    const prev = { x: 0, y: 0 };
    let pulse = 0;
    let tint = hexToRgb(live.current.accent);
    const bolts = { list: [] as Bolt[], next: 0 };
    const t0 = performance.now();
    let raf = 0;
    let lastSize = -1;

    const frame = (now: number) => {
      const { cfg: c, accent: acc, lookAngle: look, lookColor: lc, hubHovered: hub } = live.current;
      const t = (now - t0) / 1000;
      if (c.size !== lastSize) { lastSize = c.size; fit(c.size); }

      let tx = 0, ty = 0;
      if (pointer) {
        tx = Math.max(-1, Math.min(1, pointer.x));
        ty = Math.max(-1, Math.min(1, pointer.y));
      } else if (!reduce) {
        tx = Math.sin(t * 0.5) * 0.35;
        ty = Math.cos(t * 0.37) * 0.25;
      }
      if (c.lookAt && look !== null) {
        const a = (look * Math.PI) / 180;
        tx = tx * 0.4 + Math.cos(a) * 0.7;
        ty = ty * 0.4 + Math.sin(a) * 0.7;
      }
      const ease = reduce ? 0.2 : 0.085;
      sm.x += (tx - sm.x) * ease;
      sm.y += (ty - sm.y) * ease;
      const vel = Math.hypot(sm.x - prev.x, sm.y - prev.y);
      prev.x = sm.x;
      prev.y = sm.y;
      pulse = Math.max(pulse * 0.92, hub ? 0.45 : 0);

      const near = c.size;
      const strength = (reduce ? c.parallax * 0.3 : c.parallax) * (0.6 + near * 0.4);
      const breathe = c.breathe && !reduce;
      const sc = (1 + (breathe ? Math.sin(t * 1.4) * 0.015 : 0) + pulse * 0.04) * near;
      const fy = breathe ? Math.sin(t * 0.9) * 4 * near : 0;
      wrap.style.transform =
        `translate(-50%, -50%) perspective(${Math.round(900 / near)}px) translateY(${fy.toFixed(2)}px) ` +
        `rotateY(${(sm.x * c.tilt).toFixed(2)}deg) rotateX(${(-sm.y * c.tilt).toFixed(2)}deg) scale(${sc.toFixed(4)})`;

      const target = lc ? mix(hexToRgb(acc), hexToRgb(lc), 0.65) : hexToRgb(acc);
      tint = mix(tint, target, 0.08);
      const ca = c.chroma > 0 ? c.chroma + Math.min(6, vel * 120) : 0;
      const input: FrameInput = { t, tint, glow: c.glow, ca, px: sm.x, py: sm.y, pulse, strength, reduce };

      ctx.setTransform(res, 0, 0, res, 0, 0);
      ctx.clearRect(0, 0, S, S);
      const layer = (d: number, draw: () => void) => {
        ctx.save();
        ctx.translate(sm.x * strength * d, sm.y * strength * d);
        draw();
        ctx.restore();
      };
      layer(DEPTH.back, () => drawBack(ctx, input));
      layer(DEPTH.crystal, () => drawCrystal(ctx, input, bolts));
      layer(DEPTH.front, () => drawFront(ctx, input));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const c = LAYOUT.size / 2;
  return (
    <foreignObject
      x={c - FO / 2}
      y={c - FO / 2}
      width={FO}
      height={FO}
      className="prism-core"
      data-testid="prism-core"
      aria-hidden="true"
    >
      <div ref={wrapRef} className="prism-core-wrap" style={{ width: CSS_SIZE, height: CSS_SIZE }}>
        <canvas ref={canvasRef} width={S} height={S} style={{ width: CSS_SIZE, height: CSS_SIZE }} />
      </div>
    </foreignObject>
  );
}
