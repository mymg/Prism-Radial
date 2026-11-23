import { ChevronDown, ChevronUp, CornerDownRight, GripVertical, ImagePlus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useIconImage } from "../../hooks/useIconImage";
import { getIcon, ICONS } from "../../shared/icons";
import { importIconImage, pickIconImage } from "../../shared/ipc";
import { LIMITS, isIconImagePath, type MenuItem, type Profile, type SubmenuStyle } from "../../shared/types";
import { ActionEditor, defaultAction } from "../ActionEditor";
import { Field, Segmented } from "../controls";

export interface Selection {
  main: number;
  child: number | null;
}

interface Props {
  profile: Profile;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Aplica uma mutação ao perfil (sobre uma cópia do rascunho). */
  edit: (fn: (p: Profile) => void) => void;
}

const COLORS = ["#4ade9b", "#43c7d9", "#f2c46d", "#a78bfa", "#e879d8", "#ff5c7a", "#9aa5b8"];

/** Ícone de um item: a imagem própria, se houver e carregar; senão o ícone embutido. */
function ItemIcon({ item, size }: { item: MenuItem; size: number }) {
  const src = useIconImage(item.iconImage);
  const Icon = getIcon(item.icon);
  return src ? (
    <img src={src} alt="" width={size} height={size} className="item-icon-image" />
  ) : (
    <Icon size={size} />
  );
}

/** Escolha de uma imagem própria para o item selecionado. */
function IconImagePicker({ item, onChange }: { item: MenuItem; onChange: (path: string | undefined) => void }) {
  const [error, setError] = useState<string | null>(null);
  const src = useIconImage(item.iconImage);
  const pick = async () => {
    const path = await pickIconImage();
    if (!path) return;
    if (!isIconImagePath(path)) return void setError("Formato não suportado. Use PNG, SVG, ICO, JPG, WebP ou GIF.");
    setError(null);
    try {
      // O app guarda uma cópia: o arquivo original pode ser movido ou apagado depois.
      onChange(await importIconImage(path));
    } catch (e) {
      setError(`Não foi possível copiar a imagem: ${String(e)}`);
    }
  };
  return (
    <div className="icon-image-row">
      {item.iconImage && (
        <span className="icon-image-current" title={item.iconImage}>
          {src ? <img src={src} alt="" width={22} height={22} className="item-icon-image" /> : null}
          <span className="icon-image-path">{item.iconImage.split(/[\\/]/).pop()}</span>
        </span>
      )}
      <button type="button" className="btn btn-ghost" onClick={() => void pick()}>
        <ImagePlus size={14} /> {item.iconImage ? "Trocar imagem" : "Usar imagem própria"}
      </button>
      {item.iconImage && (
        <button type="button" className="btn btn-ghost" onClick={() => { setError(null); onChange(undefined); }}>
          <X size={14} /> Remover imagem
        </button>
      )}
      {error && <span className="field-hint is-error">{error}</span>}
      {item.iconImage && !src && !error && (
        <span className="field-hint">Se a imagem não carregar, o ícone escolhido acima é usado.</span>
      )}
      {!item.iconImage && !error && (
        <span className="field-hint">A imagem é copiada para a pasta do app (custom-icons).</span>
      )}
    </div>
  );
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function move<T>(arr: T[], from: number, to: number) {
  if (to < 0 || to >= arr.length) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}

export function ItemsPage({ profile, selection, onSelect, edit }: Props) {
  const items = profile.items;
  const main = items[selection.main];
  const selected: MenuItem | undefined =
    selection.child !== null ? main?.children?.[selection.child] : main;

  const editSelected = (fn: (it: MenuItem) => void) =>
    edit((p) => {
      const m = p.items[selection.main];
      const target = selection.child !== null ? m.children![selection.child] : m;
      fn(target);
    });

  const addMain = () => {
    if (items.length >= LIMITS.maxSlices) return;
    edit((p) => p.items.push({ id: newId("item"), label: "Novo", icon: "app-window", action: defaultAction("launch") }));
    onSelect({ main: items.length, child: null });
  };

  const addChild = (mi: number) => {
    const kids = items[mi].children ?? [];
    if (kids.length >= LIMITS.maxChildren) return;
    edit((p) => {
      const m = p.items[mi];
      m.children = [...(m.children ?? []), { id: newId("sub"), label: "Novo", icon: "app-window", color: COLORS[kids.length % COLORS.length], action: defaultAction("launch") }];
      delete m.action;
    });
    onSelect({ main: mi, child: kids.length });
  };

  const remove = (mi: number, ci: number | null) => {
    if (ci === null && items.length <= LIMITS.minSlices) return;
    edit((p) => {
      if (ci === null) p.items.splice(mi, 1);
      else p.items[mi].children!.splice(ci, 1);
    });
    onSelect(ci === null ? { main: Math.max(0, mi - 1), child: null } : { main: mi, child: null });
  };

  /** Move a fatia `mi` (ou o subitem `ci` dela) para a posição `to` do mesmo grupo e o mantém selecionado. */
  const moveTo = (mi: number, ci: number | null, to: number) => {
    const len = ci === null ? items.length : items[mi].children!.length;
    const from = ci ?? mi;
    if (to < 0 || to >= len || to === from) return;
    edit((p) => (ci === null ? move(p.items, mi, to) : move(p.items[mi].children!, ci, to)));
    onSelect(ci === null ? { main: to, child: null } : { main: mi, child: to });
  };
  const reorder = (mi: number, ci: number | null, d: number) => moveTo(mi, ci, (ci ?? mi) + d);

  // --- Arrastar pela alça. Usa eventos de ponteiro: a API de drag do HTML5 é ruim no WebView2.
  // (Mesma abordagem do Kira Radial, de Hideki515.)
  type Drag = { mi: number; ci: number | null; over: number | null };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && d.over !== null) moveTo(d.mi, d.ci, d.over);
    };
    const cancel = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", cancel);
    };
  });
  /** Fatias só trocam de lugar com fatias; subitens, só dentro da própria fatia. */
  const sameGroup = (d: Drag, mi: number, ci: number | null) => (d.ci === null ? ci === null : ci !== null && mi === d.mi);
  const hover = (mi: number, ci: number | null) => {
    const d = dragRef.current;
    if (d && sameGroup(d, mi, ci)) setDrag({ ...d, over: ci ?? mi });
  };
  const rowDragClass = (mi: number, ci: number | null) => {
    if (!drag) return "";
    if (drag.mi === mi && drag.ci === ci) return " is-dragging";
    if (!sameGroup(drag, mi, ci) || drag.over !== (ci ?? mi)) return "";
    // A linha de inserção aparece do lado para onde o item vai: acima ao subir, abaixo ao descer.
    return (ci ?? mi) < (drag.ci ?? drag.mi) ? " is-drop-before" : " is-drop-after";
  };
  /** Alt+↑/↓ na linha move o item (alternativa de teclado ao arrastar). */
  const onRowKey = (mi: number, ci: number | null) => (e: ReactKeyboardEvent) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    reorder(mi, ci, e.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div className={`items-page${drag ? " is-dragging-item" : ""}`}>
      <div className="item-tree">
        <div className="tree-head">
          <span>Fatias ({items.length}/{LIMITS.maxSlices})</span>
          <button type="button" className="btn btn-ghost" onClick={addMain} disabled={items.length >= LIMITS.maxSlices}>
            <Plus size={14} /> Fatia
          </button>
        </div>
        <ol className="tree-list">
          {items.map((it, mi) => {
            const isSel = selection.main === mi && selection.child === null;
            return (
              <li key={it.id}>
                <div
                  className={`tree-row${isSel ? " is-selected" : ""}${rowDragClass(mi, null)}`}
                  onClick={() => onSelect({ main: mi, child: null })}
                  onPointerOver={() => hover(mi, null)}
                  onKeyDown={onRowKey(mi, null)}
                  tabIndex={0}
                  data-testid={`row-${mi}`}
                >
                  <DragHandle onStart={() => setDrag({ mi, ci: null, over: null })} />
                  <ItemIcon item={it} size={16} />
                  <span className="tree-label">{it.label || "(sem nome)"}</span>
                  {it.dynamic ? (
                    <span className="tree-badge" title="Submenu automático"><Sparkles size={11} /></span>
                  ) : it.children?.length ? (
                    <span className="tree-badge">{it.children.length}</span>
                  ) : null}
                  <RowTools
                    onUp={() => reorder(mi, null, -1)}
                    onDown={() => reorder(mi, null, 1)}
                    onDelete={items.length > LIMITS.minSlices ? () => remove(mi, null) : undefined}
                  />
                </div>
                {it.children && (
                  <ol className="tree-children">
                    {it.children.map((ch, ci) => {
                      const sel = selection.main === mi && selection.child === ci;
                      return (
                        <li key={ch.id}>
                          <div
                            className={`tree-row is-child${sel ? " is-selected" : ""}${rowDragClass(mi, ci)}`}
                            style={{ "--item-color": ch.color ?? "var(--accent)" } as CSSProperties}
                            onClick={() => onSelect({ main: mi, child: ci })}
                            onPointerOver={() => hover(mi, ci)}
                            onKeyDown={onRowKey(mi, ci)}
                            tabIndex={0}
                            data-testid={`row-${mi}-${ci}`}
                          >
                            <DragHandle onStart={() => setDrag({ mi, ci, over: null })} />
                            <CornerDownRight size={13} className="tree-elbow" />
                            <ItemIcon item={ch} size={15} />
                            <span className="tree-label">{ch.label || "(sem nome)"}</span>
                            <RowTools onUp={() => reorder(mi, ci, -1)} onDown={() => reorder(mi, ci, 1)} onDelete={() => remove(mi, ci)} />
                          </div>
                        </li>
                      );
                    })}
                    {it.children.length < LIMITS.maxChildren && (
                      <li>
                        <button type="button" className="tree-add" onClick={() => addChild(mi)}>
                          <Plus size={13} /> Subitem
                        </button>
                      </li>
                    )}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {selected && (
        <div className="item-editor" key={`${selection.main}-${selection.child}`}>
          <h3>{selection.child === null ? "Fatia" : "Subitem"}</h3>
          <Field label="Rótulo">
            <input value={selected.label} maxLength={14} onChange={(e) => editSelected((it) => void (it.label = e.target.value))} />
          </Field>

          <Field label="Ícone" group>
            <div className="icon-grid">
              {Object.entries(ICONS).map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  className={`icon-choice${selected.icon === name ? " is-on" : ""}`}
                  onClick={() => editSelected((it) => void (it.icon = name))}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
            <IconImagePicker
              item={selected}
              onChange={(path) =>
                editSelected((it) => {
                  if (path) it.iconImage = path;
                  else delete it.iconImage;
                })
              }
            />
          </Field>

          {selection.child !== null && (
            <Field label="Cor da borda">
              <div className="color-row">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch${selected.color === c ? " is-on" : ""}`}
                    style={{ background: c }}
                    onClick={() => editSelected((it) => void (it.color = c))}
                    aria-label={c}
                  />
                ))}
                <input type="color" value={selected.color ?? "#43c7d9"} onChange={(e) => editSelected((it) => void (it.color = e.target.value))} />
              </div>
            </Field>
          )}

          {selection.child === null && (
            <Field label="Ao selecionar">
              <Segmented
                value={selected.dynamic ? "audio" : selected.children ? "submenu" : "action"}
                options={[
                  { value: "action", label: "Executar ação" },
                  { value: "submenu", label: "Abrir submenu" },
                  { value: "audio", label: "Saídas de áudio (auto)" },
                ]}
                onChange={(v) =>
                  editSelected((it) => {
                    const current = it.dynamic ? "audio" : it.children ? "submenu" : "action";
                    if (v === current) return;
                    if (it.children?.length && !window.confirm("Remover os subitens desta fatia?")) return;
                    delete it.children;
                    delete it.action;
                    delete it.dynamic;
                    if (v === "submenu") it.children = [];
                    else if (v === "audio") it.dynamic = "audioOutputs";
                    else it.action = defaultAction("launch");
                    if (v !== "submenu") delete it.submenuStyle;
                  })
                }
              />
            </Field>
          )}

          {selection.child === null && selected.children && !selected.dynamic && (
            <Field
              label="Formato do submenu"
              group
              hint={selected.submenuStyle === "compact"
                ? "Os subitens viram botões só com ícone, numa faixa logo abaixo da fatia. Bom para mídia e ações rápidas; o nome aparece ao apontar."
                : "Os subitens abrem num anel em volta do menu, com ícone e nome."}
            >
              <Segmented<SubmenuStyle>
                value={selected.submenuStyle ?? "ring"}
                options={[
                  { value: "ring", label: "Anel" },
                  { value: "compact", label: "Barra compacta" },
                ]}
                onChange={(v) =>
                  editSelected((it) => {
                    if (v === "compact") it.submenuStyle = "compact";
                    else delete it.submenuStyle;
                  })
                }
              />
            </Field>
          )}

          {selected.dynamic === "audioOutputs" ? (
            <p className="muted">
              O sub-anel mostra automaticamente as saídas de áudio reconhecidas pelo Windows (até {LIMITS.maxChildren}),
              atualizadas a cada abertura do menu. A saída em uso aparece em verde; clique em outra para trocar.
            </p>
          ) : selected.children ? (
            <p className="muted">
              Esta fatia abre um sub-anel com {selected.children.length} item(ns). Use “+ Subitem” na lista ao lado.
            </p>
          ) : (
            <ActionEditor
              action={selected.action ?? defaultAction("launch")}
              onChange={(a) => editSelected((it) => void (it.action = a))}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Alça de arrastar: inicia o arrasto; o destino é a linha sob o ponteiro. */
function DragHandle({ onStart }: { onStart: () => void }) {
  return (
    <span
      className="drag-handle"
      title="Arraste para reordenar (ou Alt+↑/↓)"
      aria-label="Arrastar para reordenar"
      role="button"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onStart();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical size={14} />
    </span>
  );
}

function RowTools({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete?: () => void }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <span className="row-tools">
      <button type="button" title="Subir" onClick={stop(onUp)}><ChevronUp size={14} /></button>
      <button type="button" title="Descer" onClick={stop(onDown)}><ChevronDown size={14} /></button>
      {onDelete && <button type="button" title="Remover" className="danger" onClick={stop(onDelete)}><Trash2 size={14} /></button>}
    </span>
  );
}
