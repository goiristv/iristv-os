#!/usr/bin/env python3
"""
LG webOS .ipk Packager for irisTV (com.iristv.app)
Gera um pacote .ipk compatível com webOS 4.x (Chromium 53) em Smart TVs LG 2018-2019:
- Transpilação esbuild com alvo --target=chrome53 (remove ?., ??, async/await nativo, {...x})
- Inclusão de polyfills mínimos (Object.entries/values, padStart, matchAll, ResizeObserver, etc.)
- Inclusão do perfil tv-compat.css (sem blurs pesados, flexbox fallback, foco D-pad)
- Resolução travada em 1920x1080 no appinfo.json para economizar VRAM
- Empacotamento POSIX ar com debian-binary, control.tar.gz e data.tar.gz
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
WEBOS_DIR = ROOT_DIR / "webos"
DIST_DIR = ROOT_DIR / "dist"
STAGE_DIR = WEBOS_DIR / "_stage_ipk"

APP_ID = "com.iristv.app"
APP_VERSION = "1.0.0"
IPK_NAME = f"{APP_ID}_{APP_VERSION}_all.ipk"


def transpile_js_esbuild(src_path: Path, dst_path: Path):
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "npx",
        "esbuild",
        str(src_path),
        "--target=chrome53",
        "--minify",
        f"--outfile={dst_path}",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[WARN] esbuild falhou para {src_path.name}: {res.stderr}. Usando fallback...")
        dst_path.write_text(src_path.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")


def transpile_css_esbuild(src_paths, dst_path: Path):
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    combined = []
    for sp in src_paths:
        if sp.exists():
            combined.append(sp.read_text(encoding="utf-8", errors="ignore"))
    full_css = "\n\n".join(combined)
    tmp_css = STAGE_DIR / "_temp_combined.css"
    tmp_css.write_text(full_css, encoding="utf-8")

    cmd = [
        "npx",
        "esbuild",
        str(tmp_css),
        "--minify",
        f"--outfile={dst_path}",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if tmp_css.exists():
        tmp_css.unlink()
    if res.returncode != 0:
        print(f"[WARN] esbuild CSS minify falhou: {res.stderr}. Salvando direto...")
        dst_path.write_text(full_css, encoding="utf-8")


def build_ipk():
    print(f"[*] Iniciando build do webOS .ipk para {APP_ID} v{APP_VERSION} (alvo Chromium 53)...")
    if STAGE_DIR.exists():
        shutil.rmtree(STAGE_DIR)
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    app_root = STAGE_DIR / "data" / "usr" / "palm" / "applications" / APP_ID
    ctrl_root = STAGE_DIR / "control"
    app_root.mkdir(parents=True, exist_ok=True)
    ctrl_root.mkdir(parents=True, exist_ok=True)

    use_lightning = os.environ.get("IRISTV_ENGINE", "lightning") == "lightning" or "--lightning" in sys.argv
    main_file = "lightning.html" if use_lightning else "index.html"

    # 1. appinfo.json oficial webOS com resolution 1920x1080 (evita render 4K que consome 4x VRAM)
    appinfo = {
        "id": APP_ID,
        "version": APP_VERSION,
        "vendor": "irisTV",
        "type": "web",
        "main": main_file,
        "title": "irisTV (Lightning 60FPS)",
        "icon": "icon.png",
        "largeIcon": "largeIcon.png",
        "bgColor": "#070b13",
        "iconColor": "#070b13",
        "resolution": "1920x1080",
        "disableBackHistoryAPI": True,
        "handlesRelaunch": True,
        "transparent": False,
        "requiredPermissions": [
            "time.query",
            "application.operation",
            "settings.query",
            "network.operation",
            "audio.operation",
        ],
    }
    (app_root / "appinfo.json").write_text(json.dumps(appinfo, indent=2), encoding="utf-8")

    # 2. Ícones 80x80 e 130x130 exigidos pelo webOS
    src_icon = ROOT_DIR / "docs" / "assets" / "icon.png"
    if src_icon.exists():
        subprocess.run(["sips", "-z", "80", "80", str(src_icon), "--out", str(app_root / "icon.png")], check=False, stdout=subprocess.DEVNULL)
        subprocess.run(["sips", "-z", "130", "130", str(src_icon), "--out", str(app_root / "largeIcon.png")], check=False, stdout=subprocess.DEVNULL)

    # 3. HTML com polyfills webOS injetados
    index_html = (ROOT_DIR / "index.html").read_text(encoding="utf-8", errors="ignore")
    # Injetar polyfills logo antes de vendor/hls ou scripts
    if "webos/polyfills.js" not in index_html:
        index_html = index_html.replace(
            '<script src="vendor/hls.min.js"></script>',
            '<script src="webos/polyfills.js"></script>\n  <script src="vendor/hls.min.js"></script>'
        )
    (app_root / "index.html").write_text(index_html, encoding="utf-8")

    lightning_html_src = ROOT_DIR / "lightning.html"
    if lightning_html_src.exists():
        shutil.copy2(lightning_html_src, app_root / "lightning.html")

    for fname in ("default-theme.json", "logo.svg"):
        src = ROOT_DIR / fname
        if src.exists():
            shutil.copy2(src, app_root / fname)

    # 4. Transpilação de CSS (styles.css + webos/tv-compat.css combinados e minificados)
    print("  -> Transpilando e combinando CSS para TV...")
    transpile_css_esbuild(
        [ROOT_DIR / "styles.css", WEBOS_DIR / "tv-compat.css"],
        app_root / "styles.css"
    )

    # 5. Transpilação esbuild direcionada ao Chromium 53
    print("  -> Transpilando JavaScript para Chromium 53 via esbuild...")
    (app_root / "webos").mkdir(parents=True, exist_ok=True)
    transpile_js_esbuild(WEBOS_DIR / "polyfills.js", app_root / "webos" / "polyfills.js")
    transpile_js_esbuild(WEBOS_DIR / "webos-bridge.js", app_root / "webos" / "webos-bridge.js")

    for js_name in ("app-lightning.js", "app.js", "app-player.js", "app-store.js", "app-native.js", "app-games.js"):
        jf = ROOT_DIR / js_name
        if jf.exists():
            transpile_js_esbuild(jf, app_root / js_name)

    # 6. Vendor, icons, sounds e wallpapers essenciais
    for folder in ("vendor", "icons", "sounds"):
        src_dir = ROOT_DIR / folder
        if src_dir.exists():
            shutil.copytree(src_dir, app_root / folder, dirs_exist_ok=True)

    wp_src = ROOT_DIR / "media" / "wallpapers"
    if wp_src.exists():
        print("  -> Otimizando wallpapers para 1080p...")
        wp_dst = app_root / "media" / "wallpapers"
        wp_dst.mkdir(parents=True, exist_ok=True)
        for item in wp_src.iterdir():
            if item.is_file():
                if item.suffix.lower() in (".jpg", ".jpeg"):
                    subprocess.run(
                        ["sips", "--resampleWidth", "1920", str(item), "--out", str(wp_dst / item.name)],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    shutil.copy2(item, wp_dst / item.name)

    # 7. Calcula tamanho instalado e gera control
    installed_bytes = sum(f.stat().st_size for f in app_root.rglob("*") if f.is_file())
    installed_kb = max(1, installed_bytes // 1024)
    control_txt = (
        f"Package: {APP_ID}\n"
        f"Version: {APP_VERSION}\n"
        "Section: misc\n"
        "Priority: optional\n"
        "Architecture: all\n"
        f"Installed-Size: {installed_kb}\n"
        "Maintainer: irisTV <goiristv@github>\n"
        "Description: irisTV Smart TV Launcher and Media Hub (Chromium 53 Compliant)\n"
        "webOS-Package-Format-Version: 2\n"
        "webOS-Mini-Version: 1.0.0\n"
    )
    (ctrl_root / "control").write_text(control_txt, encoding="utf-8")
    (STAGE_DIR / "debian-binary").write_text("2.0\n", encoding="utf-8")

    # 8. Empacota control.tar.gz, data.tar.gz e ar final (.ipk)
    print("  -> Compactando control.tar.gz e data.tar.gz...")
    ctrl_tar = STAGE_DIR / "control.tar.gz"
    data_tar = STAGE_DIR / "data.tar.gz"

    with tarfile.open(ctrl_tar, "w:gz") as tf:
        tf.add(ctrl_root / "control", arcname="./control")

    with tarfile.open(data_tar, "w:gz") as tf:
        for item in (STAGE_DIR / "data").rglob("*"):
            rel = "./" + item.relative_to(STAGE_DIR / "data").as_posix()
            tf.add(item, arcname=rel, recursive=False)

    ipk_out = DIST_DIR / IPK_NAME
    if ipk_out.exists():
        ipk_out.unlink()

    # Escreve arquivo `ar` padrao POSIX/opkg (`!<arch>\n`) compativel com LG webOS
    with open(ipk_out, "wb") as out_f:
        out_f.write(b"!<arch>\n")
        for member_name in ("debian-binary", "control.tar.gz", "data.tar.gz"):
            member_path = STAGE_DIR / member_name
            payload = member_path.read_bytes()
            mtime = int(member_path.stat().st_mtime)
            header = (
                f"{member_name:<16}"
                f"{mtime:<12}"
                f"{0:<6}"
                f"{0:<6}"
                f"{100644:<8}"
                f"{len(payload):<10}"
                "`\n"
            ).encode("ascii")
            out_f.write(header)
            out_f.write(payload)
            if len(payload) % 2 == 1:
                out_f.write(b"\n")

    shutil.rmtree(STAGE_DIR)
    size_mb = ipk_out.stat().st_size / (1024 * 1024)
    print(f"[OK] webOS .ipk gerado com sucesso: {ipk_out} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    build_ipk()
