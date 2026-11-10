import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Simula o app (Tauri) com o hook do backend sem entregar nada: os eventos nunca chegam.
const ipc = vi.hoisted(() => ({
  isTauri: () => true,
  onEvent: vi.fn(async () => () => {}),
  startKeyCapture: vi.fn(async () => {}),
  stopKeyCapture: vi.fn(async () => {}),
  setHotkeyPaused: vi.fn(async () => {}),
}));
vi.mock("../shared/ipc", () => ipc);

import { HotkeyRecorder } from "./HotkeyRecorder";

afterEach(cleanup);

describe("HotkeyRecorder no app", () => {
  it("grava pela página quando a tecla chega até ela (hook do backend não capturou)", () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder value="Ctrl+Alt+Q" requireModifier pauseGlobal onChange={onChange} />);
    const box = screen.getByRole("button", { name: "Gravar atalho" });
    fireEvent.focus(box);
    expect(ipc.setHotkeyPaused).toHaveBeenCalledWith(true);
    fireEvent.keyDown(box, { key: "k", code: "KeyK", ctrlKey: true, shiftKey: true });
    expect(onChange).toHaveBeenCalledWith("Ctrl+Shift+K");
    expect(ipc.stopKeyCapture).toHaveBeenCalled();
  });

  it("continua exigindo modificador no atalho global", () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder value="Ctrl+Alt+Q" requireModifier onChange={onChange} />);
    const box = screen.getByRole("button", { name: "Gravar atalho" });
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "k", code: "KeyK" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/pelo menos um modificador/)).toBeTruthy();
  });
});
