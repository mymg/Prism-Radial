import { useEffect, useState } from "react";
import { readIconImage } from "../shared/ipc";
import { perfLog } from "../shared/perf";

// Cache por caminho: o menu remonta a cada abertura e não deve reler o disco nem piscar.
const loaded = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function load(path: string): Promise<string> {
  let p = pending.get(path);
  if (!p) {
    p = readIconImage(path).then(
      (src) => {
        loaded.set(path, src);
        pending.delete(path);
        return src;
      },
      (e) => {
        // Falha não fica em cache: o arquivo pode voltar a existir.
        pending.delete(path);
        throw e;
      },
    );
    pending.set(path, p);
  }
  return p;
}

/** Esquece as imagens carregadas (ex.: o arquivo foi trocado no disco). */
export function clearIconImageCache() {
  loaded.clear();
  pending.clear();
}

/**
 * Imagem própria de um item (data URL). `null` enquanto carrega, sem imagem ou se falhar
 * (arquivo sumiu, formato inválido): quem chama mostra o ícone embutido no lugar.
 */
export function useIconImage(path: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => (path ? loaded.get(path) ?? null : null));
  useEffect(() => {
    if (!path) return void setSrc(null);
    const hit = loaded.get(path);
    if (hit) return void setSrc(hit);
    setSrc(null);
    let alive = true;
    load(path).then(
      (s) => alive && setSrc(s),
      (e) => perfLog(`ícone: imagem "${path}" não carregou: ${String(e)}`),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return src;
}
