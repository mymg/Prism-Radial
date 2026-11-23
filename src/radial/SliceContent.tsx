import { useIconImage } from "../hooks/useIconImage";
import { getIcon } from "../shared/icons";

interface Props {
  x: number;
  y: number;
  icon: string;
  /** Imagem própria; enquanto carrega (ou se falhar), mostra `icon`. */
  image?: string;
  label: string;
  /** "compact" = só o ícone, centrado (barra compacta). */
  size: "main" | "sub" | "compact";
  active?: boolean;
}

/** Ícone + rótulo empilhados, centrados em (x, y). Tudo em SVG puro (sem foreignObject). */
export function SliceContent({ x, y, icon, image, label, size, active }: Props) {
  const src = useIconImage(image);
  const Icon = getIcon(icon);
  const iconSize = size === "main" ? 30 : size === "sub" ? 26 : 22;
  const labelOffset = size === "main" ? 22 : 18;
  const iconOffset = size === "main" ? -14 : size === "sub" ? -12 : 0;
  return (
    <g className="slice-content" pointerEvents="none">
      {src ? (
        <image
          href={src}
          x={x - iconSize / 2}
          y={y + iconOffset - iconSize / 2}
          width={iconSize}
          height={iconSize}
          preserveAspectRatio="xMidYMid meet"
          className="slice-icon-image"
          data-testid="slice-icon-image"
        />
      ) : (
        <Icon
          x={x - iconSize / 2}
          y={y + iconOffset - iconSize / 2}
          width={iconSize}
          height={iconSize}
          strokeWidth={1.75}
          className="slice-icon"
        />
      )}
      {size !== "compact" && (
        <text x={x} y={y + labelOffset} className={`slice-label slice-label--${size}`} textAnchor="middle">
          {label.toUpperCase()}
        </text>
      )}
      {active && size === "main" && (
        <rect x={x - 10} y={y + labelOffset + 12} width={20} height={2.5} rx={1.25} className="slice-marker" />
      )}
    </g>
  );
}
