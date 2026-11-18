#!/usr/bin/env python3
"""
LG webOS .ipk Packager for irisTV (com.iristv.app)
Gera um pacote .ipk válido (arquivo ar com debian-binary, control.tar.gz e data.tar.gz)
pronto para instalação em TVs LG webOS via ares-install ou Dev Manager.
"""

import json
import os
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
WEBOS_DIR = ROOT_DIR / "webos"
DIST_DIR = ROOT_DIR / "dist"
STAGE_DIR = WEBOS_DIR / "_stage_ipk"

APP_ID = "com.iristv.app"
APP_VERSION = "1.0.0"
IPK_NAME = f"{APP_ID}_{APP_VERSION}_all.ipk"


def minify_css(raw: str) -> str:
    txt = re.sub(r"/\*[\s\S]*?\*/", "", raw)
    txt = re.sub(r"\s+", " ", txt)
    txt = re.sub(r"\s*([{}:;,])\s*", r"\1", txt)
    return txt.strip()


def minify_js_safe(raw: str) -> str:
    lines = []
    for ln in raw.splitlines():
        s = ln.strip()
        if not s or s.startswith("//"):
            continue
        lines.append(s)
    return "\n".join(lines)


def build_ipk():
    if STAGE_DIR.exists():
        shutil.rmtree(STAGE_DIR)
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    app_root = STAGE_DIR / "data" / "usr" / "palm" / "applications" / APP_ID
    ctrl_root = STAGE_DIR / "control"
    app_root.mkdir(parents=True, exist_ok=True)
    ctrl_root.mkdir(parents=True, exist_ok=True)

    # 1. appinfo.json oficial webOS
    appinfo = {
        "id": APP_ID,
        "version": APP_VERSION,
        "vendor": "irisTV",
        "type": "web",
        "main": "index.html",
        "title": "irisTV",
        "icon": "icon.png",
        "largeIcon": "largeIcon.png",
        "bgColor": "#0b101b",
        "iconColor": "#0b101b",
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
        subprocess.run(["sips", "-z", "80", "80", str(src_icon), "--out", str(app_root / "icon.png")], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["sips", "-z", "130", "130", str(src_icon), "--out", str(app_root / "largeIcon.png")], check=True, stdout=subprocess.DEVNULL)

    # 3. Arquivos web essenciais
    for fname in ("index.html", "default-theme.json", "logo.svg"):
        src = ROOT_DIR / fname
        if src.exists():
            shutil.copy2(src, app_root / fname)

    (app_root / "webos").mkdir(parents=True, exist_ok=True)
    shutil.copy2(WEBOS_DIR / "webos-bridge.js", app_root / "webos" / "webos-bridge.js")

    css_src = ROOT_DIR / "styles.css"
    if css_src.exists():
        (app_root / "styles.css").write_text(minify_css(css_src.read_text(encoding="utf-8", errors="ignore")), encoding="utf-8")

    for js_name in ("app.js", "app-player.js", "app-store.js", "app-native.js", "app-games.js"):
        jf = ROOT_DIR / js_name
        if jf.exists():
            (app_root / js_name).write_text(minify_js_safe(jf.read_text(encoding="utf-8", errors="ignore")), encoding="utf-8")

    # 4. Vendor, icons, sounds e wallpapers essenciais
    for folder in ("vendor", "icons", "sounds"):
        src_dir = ROOT_DIR / folder
        if src_dir.exists():
            shutil.copytree(src_dir, app_root / folder, dirs_exist_ok=True)

    wp_src = ROOT_DIR / "media" / "wallpapers"
    if wp_src.exists():
        wp_dst = app_root / "media" / "wallpapers"
        wp_dst.mkdir(parents=True, exist_ok=True)
        for item in wp_src.iterdir():
            if item.is_file():
                # Copia em tamanho 1080p para caber com folga na flash interna da TV
                if item.suffix.lower() in (".jpg", ".jpeg"):
                    subprocess.run(
                        ["sips", "--resampleWidth", "1920", str(item), "--out", str(wp_dst / item.name)],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    shutil.copy2(item, wp_dst / item.name)

    # 5. Calcula tamanho instalado e gera control
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
        "Description: irisTV Smart TV Launcher and Media Hub\n"
        "webOS-Package-Format-Version: 2\n"
        "webOS-Mini-Version: 1.0.0\n"
    )
    (ctrl_root / "control").write_text(control_txt, encoding="utf-8")
    (STAGE_DIR / "debian-binary").write_text("2.0\n", encoding="utf-8")

    # 6. Empacota control.tar.gz, data.tar.gz e ar final (.ipk)
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
    print(f"[OK] webOS .ipk gerado: {ipk_out} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    build_ipk()
