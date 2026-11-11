//! Ícone flutuante ("orbe"): janela pequena, transparente e sempre no topo que abre o
//! menu ao ser clicada e pode ser arrastada para qualquer lugar da tela.

use crate::config::{self, Config};
use crate::menu::{self, AppState};
use crate::positioning;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

pub const ORB: &str = "orb";

/// A janela tem margem em volta do orbe para o brilho não ser cortado.
pub const WINDOW_FACTOR: f64 = 1.5;

/// Lado da janela (px lógicos) para um orbe de `size` px.
pub fn window_side(size: f64) -> f64 {
    (size * WINDOW_FACTOR).round()
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(ORB)
}

/// HWND da janela do ícone (0 se não existir).
pub fn hwnd(app: &AppHandle) -> isize {
    window(app).and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0)
}

/// Configura a janela uma única vez: não rouba o foco ao ser clicada (o menu precisa
/// saber qual app estava ativo) e aparece/some sem a animação do Windows.
pub fn init(app: &AppHandle) {
    let h = hwnd(app);
    if h == 0 {
        return;
    }
    crate::foreground::disable_transitions(h);
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};
    unsafe {
        let w = HWND(h as *mut _);
        let ex = GetWindowLongPtrW(w, GWL_EXSTYLE);
        SetWindowLongPtrW(w, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
    }
}

/// Mostra/esconde direto pelo Win32. Mostrar precisa ser SW_SHOWNOACTIVATE (não tira o
/// foco do app em uso), e por isso esconder também precisa ser direto: o Tauri (tao)
/// guarda o próprio "visível" e só aplica mudanças em relação a ele — como ele nunca
/// soube que a janela apareceu, `win.hide()` não fazia nada e o ícone não sumia.
fn set_visible(win: &WebviewWindow, visible: bool) {
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE, SW_SHOWNOACTIVATE};
    if let Ok(h) = win.hwnd() {
        unsafe {
            let _ = ShowWindow(windows::Win32::Foundation::HWND(h.0 as *mut _), if visible { SW_SHOWNOACTIVATE } else { SW_HIDE });
        }
    }
}

/// Aplica a configuração: mostra/esconde o ícone, ajusta tamanho e posição.
pub fn apply(app: &AppHandle, cfg: &Config) {
    let Some(win) = window(app) else { return };
    let state = app.state::<AppState>();
    let hidden = state.orb_hidden.load(Ordering::SeqCst)
        || (cfg.launcher.orb.hide_on_fullscreen && state.orb_fullscreen.load(Ordering::SeqCst));
    if !cfg.launcher.mode.wants_orb() || hidden {
        set_visible(&win, false);
        return;
    }
    let orb = &cfg.launcher.orb;
    let side_logical = window_side(orb.size());
    let _ = win.set_size(LogicalSize::new(side_logical, side_logical));
    let side = win.outer_size().map(|s| s.width as i32).unwrap_or(side_logical as i32);
    let saved = orb.x.zip(orb.y);
    let (monitors, primary_work) = positioning::monitors();
    let (x, y) = positioning::orb_position(saved, side, &monitors, primary_work);
    // Movimento feito pelo próprio app: não deve virar "posição escolhida pelo usuário"
    // (senão o canto padrão seria gravado como posição fixa).
    *PLACED.lock().unwrap() = Some((x, y));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    set_visible(&win, true);
    let _ = app.emit_to(ORB, "orb:config", cfg.launcher.orb.clone());
}

/// Centro do ícone em px físicos da tela.
pub fn center(app: &AppHandle) -> Option<(i32, i32)> {
    let win = window(app)?;
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    Some((pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2))
}

/// Clique no ícone: abre o menu centrado nele (ou fecha, se já estiver aberto).
pub fn clicked(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.visible.load(Ordering::SeqCst) {
        menu::hide(app);
        return Ok(());
    }
    let (x, y) = center(app).ok_or("ícone não encontrado")?;
    menu::show_from(app, menu::Origin::Point(x, y))
}

static MOVE_GEN: AtomicU64 = AtomicU64::new(0);
/// Última posição aplicada pelo app (não pelo usuário).
static PLACED: Mutex<Option<(i32, i32)>> = Mutex::new(None);

/// Deve gravar a posição `now`? Só se veio do usuário (diferente da aplicada pelo app)
/// e mudou em relação à salva.
pub fn should_save(now: (i32, i32), placed: Option<(i32, i32)>, saved: (Option<i32>, Option<i32>)) -> bool {
    placed != Some(now) && saved != (Some(now.0), Some(now.1))
}

/// A janela do ícone mudou de lugar (arrastada pelo usuário). Grava a posição
/// 400 ms depois do último movimento, para não escrever no disco a cada pixel.
pub fn on_moved(app: &AppHandle, x: i32, y: i32) {
    let gen = MOVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        if MOVE_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        let placed = *PLACED.lock().unwrap();
        if !cfg.launcher.mode.wants_orb() || !should_save((x, y), placed, (cfg.launcher.orb.x, cfg.launcher.orb.y)) {
            return;
        }
        cfg.launcher.orb.x = Some(x);
        cfg.launcher.orb.y = Some(y);
        if let Err(e) = config::save(&cfg) {
            eprintln!("[prism-radial] falha ao salvar posição do ícone: {e}");
        }
    });
}

/// Volta o ícone para o canto padrão (botão nas configurações).
pub fn reset_position(app: &AppHandle) {
    let cfg = {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        cfg.launcher.orb.x = None;
        cfg.launcher.orb.y = None;
        let _ = config::save(&cfg);
        cfg.clone()
    };
    apply(app, &cfg);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_grava_posicao_escolhida_pelo_usuario() {
        // Reset: app colocou no canto (sem posição salva) → não grava o canto como fixo.
        assert!(!should_save((1752, 864), Some((1752, 864)), (None, None)));
        // Usuário arrastou para outro lugar → grava.
        assert!(should_save((300, 200), Some((1752, 864)), (None, None)));
        // Já salva igual → não regrava.
        assert!(!should_save((300, 200), None, (Some(300), Some(200))));
    }

    #[test]
    fn janela_tem_margem_para_o_brilho() {
        assert_eq!(window_side(96.0), 144.0);
        assert_eq!(window_side(56.0), 84.0);
    }
}

// ---------------------------------------------------------------------------
// Imagem própria (GIF/WebP/PNG/APNG): lida pelo backend e entregue como data URL,
// sem abrir o "asset protocol" do Tauri para o disco inteiro.

/// Limite de tamanho da imagem do ícone.
pub const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;

/// Tipo MIME pela extensão; `None` = formato não aceito.
pub fn image_mime(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "png" | "apng" => Some("image/png"),
        _ => None,
    }
}

/// Tipo MIME das imagens aceitas como ícone de fatia (estáticas ou animadas).
pub fn icon_mime(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        _ => image_mime(path),
    }
}

/// Limite de tamanho da imagem de um ícone de fatia.
pub const MAX_ICON_BYTES: u64 = 2 * 1024 * 1024;

fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Lê a imagem do ícone e devolve `data:<mime>;base64,...`.
pub fn read_image(path: &str) -> Result<String, String> {
    let mime = image_mime(path).ok_or("formato não suportado (use GIF, WebP ou PNG)")?;
    read_data_url(path, mime, MAX_IMAGE_BYTES)
}

/// Lê a imagem de um ícone de fatia e devolve `data:<mime>;base64,...`.
pub fn read_icon_image(path: &str) -> Result<String, String> {
    let mime = icon_mime(path).ok_or("formato não suportado (use PNG, SVG, ICO, JPG, WebP ou GIF)")?;
    read_data_url(path, mime, MAX_ICON_BYTES)
}

/// Pasta das imagens próprias dos itens: `%APPDATA%\Prism-Radial\custom-icons`.
pub fn custom_icons_dir() -> std::path::PathBuf {
    crate::config::config_dir().join("custom-icons")
}

/// Copia a imagem escolhida para `dir` e devolve o caminho da cópia. O menu passa a usar a
/// cópia, então o arquivo original pode ser movido ou apagado.
///
/// O nome é `<nome original>-<hash do conteúdo>.<ext>`: importar o mesmo arquivo de novo
/// reaproveita a cópia, e arquivos diferentes com o mesmo nome não se sobrescrevem.
pub fn import_icon_image(path: &str, dir: &std::path::Path) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    use std::path::Path;

    icon_mime(path).ok_or("formato não suportado (use PNG, SVG, ICO, JPG, WebP ou GIF)")?;
    let src = Path::new(path);
    let meta = std::fs::metadata(src).map_err(|e| format!("não foi possível abrir a imagem: {e}"))?;
    if !meta.is_file() {
        return Err("o caminho não é um arquivo".into());
    }
    if meta.len() > MAX_ICON_BYTES {
        return Err(format!(
            "imagem muito grande ({:.1} MB; máximo {} MB)",
            meta.len() as f64 / 1_048_576.0,
            MAX_ICON_BYTES / 1_048_576
        ));
    }
    // Já está na pasta (ex.: escolhida de dentro dela): não duplica.
    if src.parent().is_some_and(|p| p == dir) {
        return Ok(path.to_string());
    }
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    let stem: String = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("icone")
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .take(40)
        .collect();
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png").to_ascii_lowercase();
    let dest = dir.join(format!("{stem}-{:08x}.{ext}", hasher.finish() as u32));
    std::fs::create_dir_all(dir).map_err(|e| format!("não foi possível criar a pasta de ícones: {e}"))?;
    if !dest.exists() {
        std::fs::write(&dest, &bytes).map_err(|e| format!("não foi possível copiar a imagem: {e}"))?;
    }
    Ok(dest.to_string_lossy().into_owned())
}

fn read_data_url(path: &str, mime: &str, max_bytes: u64) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("não foi possível abrir a imagem: {e}"))?;
    if !meta.is_file() {
        return Err("o caminho não é um arquivo".into());
    }
    if meta.len() > max_bytes {
        return Err(format!(
            "imagem muito grande ({:.1} MB; máximo {} MB)",
            meta.len() as f64 / 1_048_576.0,
            max_bytes / 1_048_576
        ));
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(format!("data:{mime};base64,{}", base64(&bytes)))
}

// ---------------------------------------------------------------------------
// Menu do botão direito no ícone e item da bandeja.

pub const MENU_SETTINGS: &str = "orb-settings";
pub const MENU_HIDE: &str = "orb-hide";

pub fn context_menu(app: &AppHandle) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    let win = window(app).ok_or("ícone não encontrado")?;
    let settings = MenuItem::with_id(app, MENU_SETTINGS, "Configurações", true, None::<&str>).map_err(|e| e.to_string())?;
    let sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let hide = MenuItem::with_id(app, MENU_HIDE, "Esconder ícone (volta pela bandeja)", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&settings, &sep, &hide]).map_err(|e| e.to_string())?;
    // Win32: o dono de um menu de contexto precisa estar em primeiro plano, senão o menu
    // não fecha ao clicar fora (a janela do ícone é WS_EX_NOACTIVATE). Foi um clique
    // intencional no ícone, então trazê-lo à frente aqui é esperado.
    if let Ok(h) = win.hwnd() {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow(windows::Win32::Foundation::HWND(h.0 as *mut _));
        }
    }
    win.popup_menu(&menu).map_err(|e| e.to_string())
}

/// Esconde/mostra o ícone temporariamente (até reiniciar o app ou alternar de novo).
pub fn set_hidden(app: &AppHandle, hidden: bool) {
    let cfg = {
        let state = app.state::<AppState>();
        state.orb_hidden.store(hidden, Ordering::SeqCst);
        state.config()
    };
    apply(app, &cfg);
}

pub fn toggle_hidden(app: &AppHandle) {
    let hidden = app.state::<AppState>().orb_hidden.load(Ordering::SeqCst);
    set_hidden(app, !hidden);
}

// ---------------------------------------------------------------------------
// Esconder em tela cheia: consulta o Windows a cada 1,5 s (custo desprezível) e
// esconde o ícone enquanto um jogo, vídeo ou apresentação ocupa a tela inteira.

/// Estado do Windows (QUERY_USER_NOTIFICATION_STATE) que indica tela cheia:
/// app em tela cheia (BUSY), jogo Direct3D exclusivo ou modo apresentação.
pub fn is_fullscreen_state(quns: i32) -> bool {
    use windows::Win32::UI::Shell::{QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
    [QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE].iter().any(|s| s.0 == quns)
}

fn fullscreen_now() -> bool {
    use windows::Win32::UI::Shell::SHQueryUserNotificationState;
    unsafe { SHQueryUserNotificationState() }.map(|s| is_fullscreen_state(s.0)).unwrap_or(false)
}

pub fn spawn_fullscreen_watch(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1500));
        let state = app.state::<AppState>();
        let cfg = state.config();
        // Recurso desligado (ou modo sem ícone): esquece o estado de tela cheia.
        if !cfg.launcher.mode.wants_orb() || !cfg.launcher.orb.hide_on_fullscreen {
            if state.orb_fullscreen.swap(false, Ordering::SeqCst) {
                apply(&app, &cfg);
            }
            continue;
        }
        // Menu aberto: não mexe em nada (o ícone não deve reaparecer sobre um jogo só
        // porque o menu foi aberto pelo atalho).
        if state.visible.load(Ordering::SeqCst) {
            continue;
        }
        let full = fullscreen_now();
        if state.orb_fullscreen.swap(full, Ordering::SeqCst) != full {
            crate::perf::log("rust", if full { "ícone escondido: app em tela cheia" } else { "ícone de volta: saiu da tela cheia" });
            apply(&app, &cfg);
        }
    });
}

#[cfg(test)]
mod fullscreen_tests {
    use super::*;

    #[test]
    fn so_estados_de_tela_cheia_escondem() {
        use windows::Win32::UI::Shell::*;
        for s in [QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE] {
            assert!(is_fullscreen_state(s.0));
        }
        // Protetor/bloqueio, uso normal, "horas tranquilas" e app da Loja aberto: ícone fica.
        for s in [QUNS_NOT_PRESENT, QUNS_ACCEPTS_NOTIFICATIONS, QUNS_QUIET_TIME, QUNS_APP] {
            assert!(!is_fullscreen_state(s.0));
        }
    }
}

#[cfg(test)]
mod image_tests {
    use super::*;

    #[test]
    fn aceita_so_formatos_de_imagem_animada() {
        assert_eq!(image_mime(r"C:\a\jarvis.GIF"), Some("image/gif"));
        assert_eq!(image_mime("x.webp"), Some("image/webp"));
        assert_eq!(image_mime("x.apng"), Some("image/png"));
        assert_eq!(image_mime("x.exe"), None);
        assert_eq!(image_mime("semextensao"), None);
        assert!(read_image("nada.exe").is_err());
    }

    #[test]
    fn icone_de_fatia_aceita_tambem_svg_ico_e_jpg() {
        assert_eq!(icon_mime(r"C:\icones\steam.SVG"), Some("image/svg+xml"));
        assert_eq!(icon_mime("x.ico"), Some("image/x-icon"));
        assert_eq!(icon_mime("x.jpeg"), Some("image/jpeg"));
        assert_eq!(icon_mime("x.png"), Some("image/png"));
        assert_eq!(icon_mime("x.exe"), None);
        // A imagem do orbe continua restrita aos formatos animados.
        assert_eq!(image_mime("x.svg"), None);
        assert!(read_icon_image("nada.exe").is_err());

        let dir = std::env::temp_dir().join("prism-icon-test");
        std::fs::create_dir_all(&dir).unwrap();
        let ok = dir.join("a.svg");
        std::fs::write(&ok, b"<svg/>").unwrap();
        assert_eq!(read_icon_image(ok.to_str().unwrap()).unwrap(), "data:image/svg+xml;base64,PHN2Zy8+");
        let big = dir.join("big.png");
        std::fs::File::create(&big).unwrap().set_len(MAX_ICON_BYTES + 1).unwrap();
        assert!(read_icon_image(big.to_str().unwrap()).unwrap_err().contains("máximo 2 MB"));
    }

    #[test]
    fn importa_imagem_para_a_pasta_de_icones() {
        let base = std::env::temp_dir().join("prism-import-test");
        let _ = std::fs::remove_dir_all(&base);
        let origem = base.join("origem");
        let outra = base.join("outra");
        let dest = base.join("custom-icons");
        std::fs::create_dir_all(&origem).unwrap();
        std::fs::create_dir_all(&outra).unwrap();
        let a = origem.join("meu icone.PNG");
        std::fs::write(&a, b"aaa").unwrap();

        // Copia para a pasta (criando-a), com nome seguro e extensão minúscula.
        let copia = import_icon_image(a.to_str().unwrap(), &dest).unwrap();
        let copia_path = std::path::Path::new(&copia);
        assert_eq!(copia_path.parent().unwrap(), dest);
        let nome = copia_path.file_name().unwrap().to_str().unwrap();
        assert!(nome.starts_with("meu-icone-") && nome.ends_with(".png"), "{nome}");
        assert_eq!(std::fs::read(copia_path).unwrap(), b"aaa");

        // A cópia sobrevive à remoção do original e é lida normalmente.
        std::fs::remove_file(&a).unwrap();
        assert!(read_icon_image(&copia).unwrap().starts_with("data:image/png;base64,"));

        // Mesmo conteúdo → mesma cópia; mesmo nome com outro conteúdo → outra cópia.
        std::fs::write(&a, b"aaa").unwrap();
        assert_eq!(import_icon_image(a.to_str().unwrap(), &dest).unwrap(), copia);
        let b = outra.join("meu icone.png");
        std::fs::write(&b, b"bbb").unwrap();
        let copia_b = import_icon_image(b.to_str().unwrap(), &dest).unwrap();
        assert_ne!(copia_b, copia);
        assert_eq!(std::fs::read_dir(&dest).unwrap().count(), 2);

        // Arquivo que já está na pasta não é duplicado.
        assert_eq!(import_icon_image(&copia, &dest).unwrap(), copia);
        assert_eq!(std::fs::read_dir(&dest).unwrap().count(), 2);

        // Formato inválido e arquivo inexistente são recusados sem criar nada.
        assert!(import_icon_image("nada.exe", &dest).is_err());
        assert!(import_icon_image(origem.join("sumiu.png").to_str().unwrap(), &dest).is_err());
    }

    #[test]
    fn base64_confere_com_rfc4648() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn le_arquivo_e_recusa_grande_demais() {
        let dir = std::env::temp_dir().join("prism-orb-test");
        std::fs::create_dir_all(&dir).unwrap();
        let ok = dir.join("a.gif");
        std::fs::write(&ok, b"GIF89a").unwrap();
        assert_eq!(read_image(ok.to_str().unwrap()).unwrap(), "data:image/gif;base64,R0lGODlh");
        let big = dir.join("b.png");
        let f = std::fs::File::create(&big).unwrap();
        f.set_len(MAX_IMAGE_BYTES + 1).unwrap();
        assert!(read_image(big.to_str().unwrap()).unwrap_err().contains("muito grande"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod visibility_qa_tests {
    /// Regressão v0.3.4 (QA): mostrar e esconder o ícone precisam passar pelo mesmo
    /// caminho (Win32 em `set_visible`). Se `win.show()`/`win.hide()` do Tauri voltar a
    /// ser usado aqui, o estado VISIBLE do tao fica dessincronizado e o ícone não some.
    #[test]
    fn icone_nao_usa_show_hide_do_tauri() {
        let src = include_str!("orb.rs");
        let code: Vec<&str> = src.lines().filter(|l| !l.trim_start().starts_with("//")).collect();
        for m in ["hide", "show"] {
            let needle = format!(".{m}()");
            let hits: Vec<&&str> = code.iter().filter(|l| l.contains(&needle) && !l.contains("needle")).collect();
            assert!(hits.is_empty(), "orb.rs usa {needle} do Tauri: {hits:?}");
        }
        assert!(src.contains("SW_HIDE") && src.contains("SW_SHOWNOACTIVATE"));
    }
}
