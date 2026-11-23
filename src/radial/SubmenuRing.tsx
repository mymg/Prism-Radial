import type { CSSProperties } from "react";
import type { MenuItem } from "../shared/types";
import { COMPACT, DEG, LAYOUT, compactAngles, compactItemSpan, donutSlicePath, polar, submenuAngles, submenuItemSpan } from "./geometry";
import { SliceContent } from "./SliceContent";

interface Props {
  items: MenuItem[];
  parentAngle: number;
  activeIndex: number | null;
  /** Barra compacta só com ícones, na largura da fatia-pai. */
  compact?: boolean;
  /** Número de fatias principais (largura da fatia-pai, para a barra compacta). */
  mainCount?: number;
}

export function SubmenuRing({ items, parentAngle, activeIndex, compact, mainCount }: Props) {
  if (compact && mainCount) return <CompactBar items={items} parentAngle={parentAngle} activeIndex={activeIndex} mainCount={mainCount} />;
  const c = LAYOUT.size / 2;
  const span = submenuItemSpan(items.length);
  const centers = submenuAngles(parentAngle, items.length);
  return (
    <g className={`submenu-ring${items.length > 5 ? " is-dense" : ""}`} data-testid="submenu">
      {items.map((item, i) => {
        const a = centers[i];
        const d = donutSlicePath(c, c, LAYOUT.subInner, LAYOUT.subOuter, a - span / 2, a + span / 2, LAYOUT.subGap);
        const mid = polar(c, c, (LAYOUT.subInner + LAYOUT.subOuter) / 2 + 3, a);
        const style = {
          "--item-color": item.color ?? "var(--accent)",
          "--stagger": `${i * 28}ms`,
        } as CSSProperties;
        return (
          <g
            key={item.id}
            className={`sub-slice${activeIndex === i ? " is-active" : ""}`}
            style={style}
            role="menuitem"
            aria-label={item.label}
          >
            {activeIndex === i && <path d={d} className="slice-halo" />}
            <path d={d} className="slice-shape" />
            <SliceContent x={mid.x} y={mid.y} icon={item.icon} image={item.iconImage} label={item.label} size="sub" />
          </g>
        );
      })}
    </g>
  );
}

/** Submenu em barra: faixa contínua com um botão por item (só ícone); o rótulo do item
 *  ativo aparece logo abaixo da faixa. */
function CompactBar({ items, parentAngle, activeIndex, mainCount }: Required<Omit<Props, "compact">>) {
  const c = LAYOUT.size / 2;
  const span = compactItemSpan(items.length, mainCount);
  const centers = compactAngles(parentAngle, items.length, mainCount);
  const first = Math.min(...centers) - span / 2;
  const last = Math.max(...centers) + span / 2;
  const active = activeIndex !== null ? items[activeIndex] : undefined;
  // Nome do item ativo logo além da barra, alinhado para fora (não cobre os botões).
  const labelAngle = activeIndex !== null ? centers[activeIndex] : 0;
  const labelAt = active ? polar(c, c, COMPACT.outer + 10, labelAngle) : null;
  const cos = Math.cos(labelAngle * DEG);
  const sin = Math.sin(labelAngle * DEG);
  const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
  const dy = sin > 0.35 ? 12 : sin < -0.35 ? -2 : 4;
  return (
    <g className="submenu-ring submenu-compact" data-testid="submenu" data-compact="true">
      <path d={donutSlicePath(c, c, COMPACT.inner, COMPACT.outer, first, last)} className="compact-band" />
      {items.map((item, i) => {
        const a = centers[i];
        const d = donutSlicePath(c, c, COMPACT.inner + 4, COMPACT.outer - 4, a - span / 2, a + span / 2, COMPACT.gap);
        const mid = polar(c, c, (COMPACT.inner + COMPACT.outer) / 2, a);
        const style = { "--item-color": item.color ?? "var(--accent)", "--stagger": `${i * 22}ms` } as CSSProperties;
        return (
          <g
            key={item.id}
            className={`sub-slice compact-cell${activeIndex === i ? " is-active" : ""}`}
            style={style}
            role="menuitem"
            aria-label={item.label}
          >
            <path d={d} className="slice-shape" />
            <SliceContent x={mid.x} y={mid.y} icon={item.icon} image={item.iconImage} label={item.label} size="compact" />
          </g>
        );
      })}
      {active && labelAt && (
        <text
          x={labelAt.x}
          y={labelAt.y + dy}
          textAnchor={anchor}
          className="compact-label"
          style={{ "--item-color": active.color ?? "var(--accent)" } as CSSProperties}
        >
          {active.label.toUpperCase()}
        </text>
      )}
    </g>
  );
}
