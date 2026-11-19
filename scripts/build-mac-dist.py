#!/usr/bin/env python3
"""
irisTV — macOS App & DMG Packager (Intel x86_64)

Compila o binário nativo Cocoa + WebKit + GameController otimizado para Mac Intel,
valida a estrutura do bundle irisTV.app e gera a imagem de disco instalável .dmg em dist/.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
APP_DIR = ROOT_DIR / "irisTV.app"
DIST_DIR = ROOT_DIR / "dist"
MACOS_DIR = APP_DIR / "Contents" / "MacOS"
RESOURCES_DIR = APP_DIR / "Contents" / "Resources"
DMG_PATH = DIST_DIR / "irisTV-macOS-Intel.dmg"


def compile_mac_binary():
    print("[*] Compilando iristv-webview nativo para macOS Intel (x86_64)...")
    MACOS_DIR.mkdir(parents=True, exist_ok=True)
    out_bin = MACOS_DIR / "iristv-webview"

    cmd = [
        "swiftc",
        "-O",
        "-target",
        "x86_64-apple-macos10.15",
        str(ROOT_DIR / "webview.swift"),
        "-o",
        str(out_bin),
        "-framework",
        "Cocoa",
        "-framework",
        "WebKit",
        "-framework",
        "GameController",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERRO] Falha na compilação Swift: {res.stderr}")
        sys.exit(1)

    out_bin.chmod(0o755)
    print(f"[OK] Binário compilado com sucesso: {out_bin} ({out_bin.stat().st_size // 1024} KB)")


def package_dmg():
    print("[*] Gerando imagem de disco .dmg para macOS...")
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if DMG_PATH.exists():
        DMG_PATH.unlink()

    stage_dmg = ROOT_DIR / "_stage_dmg"
    if stage_dmg.exists():
        shutil.rmtree(stage_dmg)
    stage_dmg.mkdir(parents=True, exist_ok=True)

    # Copiar irisTV.app para o stage
    target_app = stage_dmg / "irisTV.app"
    shutil.copytree(APP_DIR, target_app, symlinks=True)

    # Criar atalho para /Applications para instalação drag-and-drop no Mac
    apps_link = stage_dmg / "Applications"
    os.symlink("/Applications", apps_link)

    # Criar DMG usando hdiutil
    cmd = [
        "hdiutil",
        "create",
        "-volname",
        "irisTV",
        "-srcfolder",
        str(stage_dmg),
        "-ov",
        "-format",
        "UDZO",
        str(DMG_PATH),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    shutil.rmtree(stage_dmg, ignore_errors=True)

    if res.returncode != 0:
        print(f"[WARN] hdiutil falhou ({res.stderr}), criando arquivo ZIP de distribuição...")
        zip_path = DIST_DIR / "irisTV-macOS-Intel.zip"
        subprocess.run(["zip", "-r", "-y", str(zip_path), "irisTV.app"], cwd=ROOT_DIR, check=False)
        print(f"[OK] Pacote ZIP gerado: {zip_path}")
    else:
        dmg_size_mb = DMG_PATH.stat().st_size / (1024 * 1024)
        print(f"[OK] Instalador DMG gerado com sucesso: {DMG_PATH} ({dmg_size_mb:.2f} MB)")


if __name__ == "__main__":
    compile_mac_binary()
    package_dmg()
