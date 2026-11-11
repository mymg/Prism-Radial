/**
 * Anéis do tema Prisma: círculos de segmentos em volta do menu, girando devagar em
 * sentidos alternados. Só traços com animação de transform (sem filtros, caros no WebView).
 * Cada anel tem uma cópia vermelha e uma azul levemente deslocadas, como a aberração
 * cromática do cubo.
 */
import { LAYOUT } from "./geometry";

const C = LAYOUT.size / 2;

export interface PrismRing {
  /** Raio, em unidades do canvas. Fica além do sub-anel e dentro da janela. */
  r: number;
  /** Segmentos e vãos alternados (traço, vão, traço, vão...), em graus. Soma 360. */
  pattern: number[];
  /** Segundos por volta. */
  duration: number;
  /** Gira no sentido anti-horário. */
  reverse: boolean;
  width: number;
}

export const PRISM_RINGS: PrismRing[] = [
  { r: LAYOUT.subOuter + 16, pattern: [48, 14, 20, 34, 76, 22, 12, 42, 58, 34], duration: 90, reverse: false, width: 2 },
  { r: LAYOUT.subOuter + 34, pattern: [26, 40, 62, 18, 14, 52, 38, 30, 54, 26], duration: 130, reverse: true, width: 3 },
  { r: LAYOUT.subOuter + 54, pattern: [70, 36, 16, 26, 44, 60, 24, 84], duration: 180, reverse: false, width: 1.5 },
];

/** Converte o padrão em graus para stroke-dasharray (px ao longo do círculo). */
export function ringDashArray(ring: PrismRing): string {
  const perDeg = (2 * Math.PI * ring.r) / 360;
  return ring.pattern.map((deg) => (deg * perDeg).toFixed(2)).join(" ");
}

export function PrismRings() {
  return (
    <g className="prism-rings" data-testid="prism-rings" aria-hidden="true">
      {PRISM_RINGS.map((ring, i) => {
        const dash = ringDashArray(ring);
        return (
          <g
            key={ring.r}
            className={`prism-ring${ring.reverse ? " prism-ring--rev" : ""}`}
            style={{ animationDuration: `${ring.duration}s`, animationDelay: `${-i * 17}s` }}
          >
            <circle cx={C + 1.6} cy={C} r={ring.r} strokeWidth={ring.width} strokeDasharray={dash} className="prism-ring-line prism-ring-line--red" />
            <circle cx={C - 1.6} cy={C} r={ring.r} strokeWidth={ring.width} strokeDasharray={dash} className="prism-ring-line prism-ring-line--blue" />
            <circle cx={C} cy={C} r={ring.r} strokeWidth={ring.width} strokeDasharray={dash} className="prism-ring-line" />
          </g>
        );
      })}
    </g>
  );
}
