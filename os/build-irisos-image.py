#!/usr/bin/env python3
"""
irisOS Full Linux TV Operating System Builder (.iso, .img & Live USB)
Constrói o sistema operacional completo irisOS (baseado em Linux Kernel 6.6 LTS +
Drivers Reais de Wi-Fi/GPU/Áudio + Wayland Cage Kiosk + irisTV Core):
  1. Baixa o Alpine Standard ISO (com UEFI bootx64.efi, BIOS syslinux,
     modloop-lts com todos os drivers e firmwares Wi-Fi, e repositório offline /apks).
  2. Monta a raiz completa do Sistema Operacional Linux em os/rootfs/.
  3. Inclui o Assistente de Conexão Wi-Fi automático e interativo no boot
     (/sbin/irisos-wifi-setup e /sbin/irisos-session) + suporte a Wi-Fi dentro do irisTV.
  4. Gera o irisTV.apkovl.tar.gz enxuto (~4 MB), a imagem .ISO/.IMG e grava o
     Live USB bootável diretamente no pendrive.
"""

import os
import re
import sys
import stat
import shutil
import tarfile
import urllib.request
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OS_DIR = BASE_DIR / "os"
CACHE_DIR = OS_DIR / ".cache"
ROOTFS_DIR = OS_DIR / "rootfs"
ISO_STAGE_DIR = OS_DIR / "iso_stage"

ALPINE_MIRROR = "https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64"
MINIROOTFS_URL = f"{ALPINE_MIRROR}/alpine-minirootfs-3.20.3-x86_64.tar.gz"
STANDARD_ISO_URL = f"{ALPINE_MIRROR}/alpine-standard-3.20.3-x86_64.iso"

ISO_OUT = OS_DIR / "irisOS-1.0-x86_64.iso"
IMG_OUT = OS_DIR / "irisOS-1.0-x86_64.img"
APKOVL_OUT = OS_DIR / "irisTV.apkovl.tar.gz"


def download_file(url: str, dest: Path, label: str):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1024 * 100:
        print(f"  [OK] {label} já em cache ({dest.stat().st_size / (1024*1024):.1f} MB)")
        return
    print(f"  [↓] Baixando {label} ({url})...")
    req = urllib.request.Request(url, headers={"User-Agent": "irisOS-Builder/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as out:
        shutil.copyfileobj(resp, out)
    print(f"  [✓] {label} concluído ({dest.stat().st_size / (1024*1024):.1f} MB)")


def write_executable(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def build_rootfs():
    print("\n==> [1/5] Baixando Base Linux Completa (Kernel 6.6 LTS + Drivers Wi-Fi/GPU + UEFI Boot)...")
    minirootfs_tar = CACHE_DIR / "alpine-minirootfs-3.20.3-x86_64.tar.gz"
    standard_iso = CACHE_DIR / "alpine-standard-3.20.3-x86_64.iso"

    download_file(MINIROOTFS_URL, minirootfs_tar, "Linux MiniRootFS (x86_64)")
    download_file(STANDARD_ISO_URL, standard_iso, "Linux Standard Hardware Base ISO (Drivers Wi-Fi/GPU + UEFI)")

    print("\n==> [2/5] Construindo árvore completa do Sistema Operacional Linux em os/rootfs/...")
    if ROOTFS_DIR.exists():
        shutil.rmtree(ROOTFS_DIR)
    ROOTFS_DIR.mkdir(parents=True, exist_ok=True)

    with tarfile.open(minirootfs_tar, "r:gz") as tar:
        tar.extractall(path=ROOTFS_DIR)

    # 1. Identidade do Sistema Operacional (/etc/os-release, /etc/hostname, /etc/issue)
    (ROOTFS_DIR / "etc" / "os-release").write_text(
        'NAME="irisOS"\n'
        'ID=irisos\n'
        'VERSION_ID=1.0.0\n'
        'PRETTY_NAME="irisOS 1.0 (Smart TV Operating System)"\n'
        'HOME_URL="https://iristv.local"\n',
        encoding="utf-8",
    )
    (ROOTFS_DIR / "etc" / "hostname").write_text("irisTV\n", encoding="utf-8")
    (ROOTFS_DIR / "etc" / "issue").write_text(
        "\n  irisOS 1.0 — Smart TV Operating System (Powered by irisTV)\n\n",
        encoding="utf-8",
    )

    # 2. Configura DNS público de fallback
    (ROOTFS_DIR / "etc" / "resolv.conf").write_text(
        "nameserver 1.1.1.1\nnameserver 8.8.8.8\n",
        encoding="utf-8",
    )

    # 3. Tema de Boot Plymouth (Splash Screen do irisOS)
    plymouth_dir = ROOTFS_DIR / "usr" / "share" / "plymouth" / "themes" / "irisos"
    plymouth_dir.mkdir(parents=True, exist_ok=True)
    if (BASE_DIR / "site" / "logo.svg").exists():
        shutil.copy2(BASE_DIR / "site" / "logo.svg", plymouth_dir / "logo.svg")
    (plymouth_dir / "irisos.plymouth").write_text(
        "[Plymouth Theme]\n"
        "Name=irisOS Boot Splash\n"
        "Description=Boot silencioso com logo irisTV\n"
        "ModuleName=script\n\n"
        "[script]\n"
        "ImageDir=/usr/share/plymouth/themes/irisos\n"
        "ScriptFile=/usr/share/plymouth/themes/irisos/irisos.script\n",
        encoding="utf-8",
    )
    (plymouth_dir / "irisos.script").write_text(
        "Window.SetBackgroundTopColor(0.035, 0.051, 0.086);\n"
        "Window.SetBackgroundBottomColor(0.020, 0.027, 0.055);\n",
        encoding="utf-8",
    )

    # 4. Copia todo o código do irisTV para /opt/iristv dentro do Linux (excluindo arquivos gigantes de gravação .mov/.mp4)
    opt_iristv = ROOTFS_DIR / "opt" / "iristv"
    opt_iristv.mkdir(parents=True, exist_ok=True)

    exclude_names = {
        "os",
        "node_modules",
        ".git",
        ".DS_Store",
        "irisTV.app",
        "recordings",
        "wifi-helper",
    }
    for item in BASE_DIR.iterdir():
        if item.name in exclude_names:
            continue
        if item.is_file() and item.suffix.lower() in {".mov", ".iso", ".img", ".dmg"}:
            continue
        if item.name == "screenshot.png":
            continue
        dest = opt_iristv / item.name
        if item.is_dir():
            shutil.copytree(item, dest, dirs_exist_ok=True)

        else:
            shutil.copy2(item, dest)

    # Minifica CSS e JS copiados para /opt/iristv para carregamento mais rápido no WPE WebKit
    css_file = opt_iristv / "styles.css"
    if css_file.exists():
        raw_css = css_file.read_text(encoding="utf-8", errors="ignore")
        min_css = re.sub(r"/\*[\s\S]*?\*/", "", raw_css)
        min_css = re.sub(r"\s+", " ", min_css)
        min_css = re.sub(r"\s*([{}:;,])\s*", r"\1", min_css).strip()
        css_file.write_text(min_css, encoding="utf-8")

    for js_name in ("app.js", "app-player.js", "app-store.js", "app-native.js", "app-games.js", "server.js"):
        jf = opt_iristv / js_name
        if not jf.exists():
            continue
        lines = []
        for ln in jf.read_text(encoding="utf-8", errors="ignore").splitlines():
            s = ln.strip()
            if not s or s.startswith("//"):
                continue
            lines.append(s)
        jf.write_text("\n".join(lines), encoding="utf-8")

    # 5. Session script mantido à mão (os/irisos-session.sh) sobrescreve o template acima:
    #    inclui coldplug de USB/HID (mouse+teclado) e fallback sem seatd.
    custom_session = OS_DIR / "irisos-session.sh"
    if custom_session.exists():
        shutil.copy2(custom_session, ROOTFS_DIR / "sbin" / "irisos-session")
        (ROOTFS_DIR / "sbin" / "irisos-session").chmod(0o755)

    # Copia a extensão de navegação por Controle Remoto (Spatial Nav + Cursor Virtual + Teclado Virtual)
    ext_dest = opt_iristv / "os" / "tv-nav-extension"
    ext_dest.mkdir(parents=True, exist_ok=True)
    for item in (OS_DIR / "tv-nav-extension").iterdir():
        shutil.copy2(item, ext_dest / item.name)

    (opt_iristv / "recordings").mkdir(parents=True, exist_ok=True)

    # 5. Utilitário interativo de Conexão Wi-Fi (/sbin/irisos-wifi) para conectar em qualquer computador
    write_executable(
        ROOTFS_DIR / "sbin" / "irisos-wifi",
        """#!/bin/sh
# ==============================================================================
# irisOS Wi-Fi & Network Manager (Funciona 100% Offline a partir do Live USB)
# ==============================================================================
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Localiza onde o pendrive USB está montado
USB_MNT=""
for m in /media/usb /media/sd* /media/mmc* /run/media/*; do
  if [ -d "$m/apks" ]; then
    USB_MNT="$m"
    break
  fi
done

if [ -n "$USB_MNT" ]; then
  mount -o remount,rw "$USB_MNT" 2>/dev/null || true
  if ! grep -q "$USB_MNT/apks" /etc/apk/repositories 2>/dev/null; then
    echo "$USB_MNT/apks" > /etc/apk/repositories
  fi
fi

# Instala ferramentas de Wi-Fi a partir do próprio pendrive (sem precisar de internet!)
if ! command -v wpa_supplicant >/dev/null 2>&1 || ! command -v iw >/dev/null 2>&1; then
  echo "  [irisOS] Ativando drivers de placa de rede e Wi-Fi..."
  apk add --no-network --quiet wpa_supplicant wireless-tools iw iproute2 dbus eudev 2>/dev/null || \\
  apk add --quiet wpa_supplicant wireless-tools iw iproute2 dbus eudev 2>/dev/null || true
fi

# Carrega módulos de hardware (Wi-Fi, placa de vídeo, som, USB)
udevadm trigger 2>/dev/null || mdev -s 2>/dev/null || true
sleep 1

# 1. Tenta cabo de rede Ethernet primeiro (se estiver plugado)
for eth in $(ls /sys/class/net 2>/dev/null | grep -E '^(eth|enp|eno|ens)'); do
  ip link set "$eth" up 2>/dev/null || true
  udhcpc -i "$eth" -n -q -t 3 >/dev/null 2>&1 &
done

check_internet() {
  ping -c 1 -W 2 1.1.1.1 >/dev/null 2>&1 || ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1
}

if check_internet && [ "$1" != "--force" ]; then
  echo "  [✓] Internet conectada!"
  exit 0
fi

# Descobre placa Wi-Fi (wlan0, wlp2s0, etc.)
WLAN_IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^(wl|wlan|ath)' | head -n 1)
if [ -z "$WLAN_IFACE" ]; then
  # Tenta carregar módulos comuns de Wi-Fi
  for mod in iwlwifi rtw88_pci rtw88_usb ath9k ath10k_pci mt76x2u brcmfmac rtl8xxxu; do
    modprobe "$mod" 2>/dev/null || true
  done
  sleep 2
  WLAN_IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^(wl|wlan|ath)' | head -n 1)
fi

if [ -z "$WLAN_IFACE" ]; then
  echo "  [!] Nenhuma placa Wi-Fi encontrada neste computador. Conecte um cabo de rede ou adaptador USB Wi-Fi."
  exit 1
fi

ip link set "$WLAN_IFACE" up 2>/dev/null || true
mkdir -p /etc/wpa_supplicant

# 2. Se já existir Wi-Fi salvo no pendrive, tenta conectar sozinho!
if [ -n "$USB_MNT" ] && [ -f "$USB_MNT/irisos-wifi.conf" ] && [ "$1" != "--force" ]; then
  echo "  [irisOS] Conectando automaticamente na rede Wi-Fi salva no pendrive..."
  cp "$USB_MNT/irisos-wifi.conf" /etc/wpa_supplicant/wpa_supplicant.conf
  killall wpa_supplicant 2>/dev/null || true
  wpa_supplicant -B -i "$WLAN_IFACE" -c /etc/wpa_supplicant/wpa_supplicant.conf >/dev/null 2>&1
  udhcpc -i "$WLAN_IFACE" -n -q -t 6 >/dev/null 2>&1 || true
  echo -e "nameserver 1.1.1.1\\nnameserver 8.8.8.8" >> /etc/resolv.conf
  if check_internet; then
    echo "  [✓] Wi-Fi conectado automaticamente!"
    exit 0
  fi
fi

# 3. Assistente Interativo de Wi-Fi na tela para escolher a rede e digitar a senha
while true; do
  clear
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════════════╗"
  echo "  ║             irisOS 1.0 — CONEXÃO WI-FI DO SISTEMA                ║"
  echo "  ╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Placa Wi-Fi detectada: $WLAN_IFACE"
  echo "  Escaneando redes Wi-Fi próximas..."
  echo ""

  SCAN_FILE="/tmp/wifi_ssids.txt"
  iw dev "$WLAN_IFACE" scan 2>/dev/null | sed -n 's/^[[:space:]]*SSID: //p' | grep -v '^$' | awk '!seen[$0]++' | head -n 15 > "$SCAN_FILE"
  if [ ! -s "$SCAN_FILE" ]; then
    iwlist "$WLAN_IFACE" scanning 2>/dev/null | sed -n 's/.*ESSID:"\\([^"]*\\)".*/\\1/p' | grep -v '^$' | awk '!seen[$0]++' | head -n 15 > "$SCAN_FILE"
  fi

  if [ -s "$SCAN_FILE" ]; then
    i=1
    while IFS= read -r line; do
      printf "    [%d] %s\\n" "$i" "$line"
      i=$((i + 1))
    done < "$SCAN_FILE"
  else
    echo "    (Nenhuma rede listada automaticamente — você pode digitar o nome da rede)"
  fi

  echo ""
  echo "  --------------------------------------------------------------------"
  printf "  Digite o NÚMERO da rede (ou o nome exato do Wi-Fi, ou 'r' p/ reescanear): "
  read -r CHOICE

  if [ "$CHOICE" = "r" ] || [ "$CHOICE" = "R" ] || [ -z "$CHOICE" ]; then
    continue
  fi

  if echo "$CHOICE" | grep -Eq '^[0-9]+$' && [ -s "$SCAN_FILE" ]; then
    SSID=$(sed -n "${CHOICE}p" "$SCAN_FILE")
  else
    SSID="$CHOICE"
  fi

  if [ -z "$SSID" ]; then
    echo "  Rede inválida."
    sleep 1
    continue
  fi

  printf "  Digite a senha do Wi-Fi '%s' (ou deixe em branco se for aberta): " "$SSID"
  read -r PASS

  echo ""
  echo "  Conectando a '$SSID'..."
  if [ -n "$PASS" ]; then
    wpa_passphrase "$SSID" "$PASS" > /etc/wpa_supplicant/wpa_supplicant.conf
  else
    cat > /etc/wpa_supplicant/wpa_supplicant.conf <<EOF
network={
  ssid="$SSID"
  key_mgmt=NONE
}
EOF
  fi

  killall wpa_supplicant 2>/dev/null || true
  wpa_supplicant -B -i "$WLAN_IFACE" -c /etc/wpa_supplicant/wpa_supplicant.conf >/dev/null 2>&1
  sleep 2
  if udhcpc -i "$WLAN_IFACE" -n -q -t 8; then
    echo -e "nameserver 1.1.1.1\\nnameserver 8.8.8.8" >> /etc/resolv.conf
    if [ -n "$USB_MNT" ]; then
      cp /etc/wpa_supplicant/wpa_supplicant.conf "$USB_MNT/irisos-wifi.conf" 2>/dev/null || true
    fi
    echo ""
    echo "  [✓] Conectado com sucesso ao Wi-Fi '$SSID'!"
    sleep 1
    exit 0
  else
    echo ""
    echo "  [X] Não foi possível obter IP. Verifique a senha e tente novamente."
    sleep 2
  fi
done
""",
    )

    # 6. Gerenciador de Sessão Principal (/sbin/irisos-session) que roda direto no tty1
    write_executable(
        ROOTFS_DIR / "sbin" / "irisos-session",
        """#!/bin/sh
# ==============================================================================
# irisOS TV Appliance Session Launcher (TTY1 Kiosk Manager)
# ==============================================================================
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/root"
export NODE_ENV="production"
export PORT="3000"
export XDG_RUNTIME_DIR="/run/user/0"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

clear
echo ""
echo "  ╔══════════════════════════════════════════════════════════════════╗"
echo "  ║               irisOS 1.0 — Smart TV Operating System             ║"
echo "  ╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Localiza pendrive onde o Live USB está montado
USB_MNT=""
for m in /media/usb /media/sd* /media/mmc* /run/media/*; do
  if [ -d "$m/apks/x86_64" ]; then
    USB_MNT="$m"
    break
  fi
done

# 1. Instalação Offline Instantânea a partir dos pacotes embutidos no pendrive
if ! command -v node >/dev/null 2>&1 || ! command -v cage >/dev/null 2>&1 || { ! command -v cog >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; }; then
  echo "  [irisOS] Carregando interface de TV (Node.js, WPE WebKit Cog, Wayland Cage, FFmpeg)..."
  if [ -n "$USB_MNT" ]; then
    mount -o remount,rw "$USB_MNT" 2>/dev/null || true
    echo "$USB_MNT/apks/x86_64" > /etc/apk/repositories
    apk add --no-network --allow-untrusted nodejs ffmpeg cage cog wpewebkit libwpe libwpebackend-fdo wlr-randr wtype pulseaudio pulseaudio-utils alsa-utils font-noto dbus mesa-dri-gallium wpa_supplicant iw wireless-tools iproute2 eudev libcec >/dev/null 2>&1 || \\
    apk add --no-network --allow-untrusted nodejs ffmpeg cage cog wpewebkit libwpe libwpebackend-fdo wlr-randr wtype pulseaudio pulseaudio-utils font-noto dbus wpa_supplicant iw libcec
  fi
fi

# Inicia serviços base de hardware (DBus, Udev, Áudio)
/etc/init.d/dbus start >/dev/null 2>&1 || true
/etc/init.d/udev start >/dev/null 2>&1 || true
pulseaudio --start >/dev/null 2>&1 || true

# Tenta carregar módulos de Wi-Fi e placas de rede
for mod in iwlwifi rtw88_pci rtw88_usb ath9k ath10k_pci mt76x2u brcmfmac rtl8xxxu; do
  modprobe "$mod" 2>/dev/null || true
done
udevadm trigger 2>/dev/null || true

# Tenta conectar no Wi-Fi caso já exista rede salva ou cabo ethernet plugado
if [ -x /sbin/irisos-wifi ]; then
  /sbin/irisos-wifi >/dev/null 2>&1 &
fi

# 2. Inicia o servidor central do irisTV (EPG 5 dias, DVR, Letras LRCLIB, Wi-Fi, Volume)
if ! pgrep -f "/opt/iristv/server.js" >/dev/null 2>&1; then
  echo "  [irisOS] Iniciando cérebro do sistema (server.js)..."
  cd /opt/iristv
  nohup node /opt/iristv/server.js >/var/log/iristv-server.log 2>&1 &
fi

echo "  [irisOS] Aguardando inicialização da interface..."
for _ in $(seq 1 40); do
  if wget -q -O - http://127.0.0.1:3000/api/os/status >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

# 3. Inicia ponte de Controle Remoto HDMI-CEC em background
if [ -x /opt/iristv/os/cec-remote-bridge.sh ]; then
  /opt/iristv/os/cec-remote-bridge.sh >/dev/null 2>&1 &
fi

# 4. Abre o irisTV em Tela Cheia absoluta (Wayland Cage + WPE WebKit Cog)
printf "\\033[?25l" > /dev/tty1 2>/dev/null || true
while true; do
  export WEBKIT_FORCE_COMPOSITING_MODE=1
  export COG_PLATFORM_FDO_VIEW_FULLSCREEN=1
  export GIO_USE_VFS=local
  if command -v cog >/dev/null 2>&1; then
    dbus-run-session -- cage -s -- cog --platform=fdo "http://127.0.0.1:3000"
  else
    dbus-run-session -- cage -s -- chromium \\
      --kiosk \\
      --no-sandbox \\
      --test-type \\
      --noerrdialogs \\
      --disable-infobars \\
      --no-first-run \\
      --autoplay-policy=no-user-gesture-required \\
      --enable-features=OverlayScrollbar,VaapiVideoDecoder \\
      --load-extension="/opt/iristv/os/tv-nav-extension" \\
      "http://127.0.0.1:3000"
  fi
  sleep 1
done
""",
    )

    write_executable(
        opt_iristv / "os" / "cec-remote-bridge.sh",
        """#!/bin/sh
if ! command -v cec-client >/dev/null 2>&1 || ! command -v wtype >/dev/null 2>&1; then
  exit 0
fi
cec-client -d 1 | while read -r line; do
  case "$line" in
    *"key pressed:"*"up"*)     wtype -k Up ;;
    *"key pressed:"*"down"*)   wtype -k Down ;;
    *"key pressed:"*"left"*)   wtype -k Left ;;
    *"key pressed:"*"right"*)  wtype -k Right ;;
    *"key pressed:"*"select"*|*"key pressed:"*"enter"*) wtype -k Return ;;
    *"key pressed:"*"exit"*|*"key pressed:"*"back"*)    wtype -k Escape ;;
    *"key pressed:"*"play"*|*"key pressed:"*"pause"*)   wtype -k space ;;
    *"key pressed:"*"F2"*|*"key pressed:"*"red"*)       wtype -k F2 ;;
  esac
done
""",
    )

    # 7. Configura /etc/inittab:
    #    - tty1 abre direto o irisOS (Wi-Fi + Interface Gráfica irisTV)
    #    - tty2 abre direto o gerenciador de Wi-Fi (caso o usuário aperte Ctrl+Alt+F2 para trocar de Wi-Fi pelo terminal)
    (ROOTFS_DIR / "etc" / "inittab").write_text(
        "# /etc/inittab — irisOS Smart TV Appliance Init\n"
        "::sysinit:/sbin/openrc sysinit\n"
        "::sysinit:/sbin/openrc boot\n"
        "::wait:/sbin/openrc default\n"
        "# TTY1: Inicia direto no irisOS (Wi-Fi + Tela Cheia irisTV)\n"
        "tty1::respawn:/sbin/irisos-session\n"
        "# TTY2: Atalho rápido para o configurador de Wi-Fi (Ctrl+Alt+F2)\n"
        "tty2::respawn:/sbin/irisos-wifi --force\n"
        "tty3::askfirst:/bin/login\n"
        "::ctrlaltdel:/sbin/reboot\n"
        "::shutdown:/sbin/openrc shutdown\n",
        encoding="utf-8",
    )

    # 8. Cria o marcador .default_boot_services para o initramfs ativar devfs, mdev, hwdrivers e modloop (Wi-Fi/GPU/Som)
    (ROOTFS_DIR / "etc" / ".default_boot_services").write_text("", encoding="utf-8")


def build_apkovl():
    print("\n==> [3/5] Empacotando overlay do sistema (irisTV.apkovl.tar.gz)...")
    if APKOVL_OUT.exists():
        APKOVL_OUT.unlink()

    with tarfile.open(APKOVL_OUT, "w:gz") as tar:
        for sub in [
            "etc/.default_boot_services",
            "etc/os-release",
            "etc/hostname",
            "etc/issue",
            "etc/resolv.conf",
            "etc/inittab",
            "opt/iristv",
            "sbin/irisos-wifi",
            "sbin/irisos-session",
            "usr/share/plymouth/themes/irisos",
        ]:
            full = ROOTFS_DIR / sub
            if full.exists():
                tar.add(full, arcname=sub)

    print(f"  [✓] Overlay criado: {APKOVL_OUT.name} ({APKOVL_OUT.stat().st_size / (1024*1024):.2f} MB)")


def build_stage_from_standard_iso():
    print("\n==> [4/5] Extraindo Bootloaders Reais (UEFI bootx64.efi + BIOS + Drivers Wi-Fi/GPU) para iso_stage/...")
    if ISO_STAGE_DIR.exists():
        shutil.rmtree(ISO_STAGE_DIR)
    ISO_STAGE_DIR.mkdir(parents=True, exist_ok=True)

    standard_iso = CACHE_DIR / "alpine-standard-3.20.3-x86_64.iso"
    # Extrai a ISO oficial diretamente usando libarchive (/usr/bin/tar) nativo do macOS
    subprocess.run(
        ["/usr/bin/tar", "-xf", str(standard_iso), "-C", str(ISO_STAGE_DIR)],
        check=True,
    )
    subprocess.run(["chmod", "-R", "u+w", str(ISO_STAGE_DIR)], check=True)

    # Injeta o irisTV.apkovl.tar.gz na raiz do Live USB / ISO!
    shutil.copy2(APKOVL_OUT, ISO_STAGE_DIR / "irisTV.apkovl.tar.gz")

    # Personaliza o menu GRUB (UEFI) e SYSLINUX (BIOS) para iniciar direto no irisOS 1.0!
    grub_cfg = ISO_STAGE_DIR / "boot" / "grub" / "grub.cfg"
    grub_cfg.write_text(
        'set timeout=1\n'
        'set default=0\n'
        'menuentry "irisOS 1.0 — Smart TV Operating System (Live USB)" {\n'
        '    linux /boot/vmlinuz-lts modules=loop,squashfs,sd-mod,usb-storage pkgs=wpa_supplicant,wireless-tools,iw quiet\n'
        '    initrd /boot/initramfs-lts\n'
        '}\n',
        encoding="utf-8",
    )

    syslinux_cfg = ISO_STAGE_DIR / "boot" / "syslinux" / "syslinux.cfg"
    if syslinux_cfg.exists():
        syslinux_cfg.write_text(
            "TIMEOUT 10\n"
            "PROMPT 0\n"
            "DEFAULT irisos\n\n"
            "LABEL irisos\n"
            "  MENU LABEL irisOS 1.0 (Smart TV Operating System)\n"
            "  KERNEL /boot/vmlinuz-lts\n"
            "  INITRD /boot/initramfs-lts\n"
            "  APPEND modules=loop,squashfs,sd-mod,usb-storage pkgs=wpa_supplicant,wireless-tools,iw quiet\n",
            encoding="utf-8",
        )

    print("\n==> [5/5] Gerando arquivos finais de Sistema Operacional (.ISO e .IMG)...")
    if ISO_OUT.exists():
        ISO_OUT.unlink()
    if IMG_OUT.exists():
        IMG_OUT.unlink()

    subprocess.run(
        [
            "hdiutil",
            "makehybrid",
            "-iso",
            "-joliet",
            "-default-volume-name",
            "IRISOS",
            "-o",
            str(ISO_OUT),
            str(ISO_STAGE_DIR),
        ],
        check=True,
    )
    shutil.copy2(ISO_OUT, IMG_OUT)
    iso_mb = ISO_OUT.stat().st_size / (1024 * 1024)
    print(f"  [✓] ISO Gerada: {ISO_OUT} ({iso_mb:.1f} MB)")
    print(f"  [✓] IMG Gerada: {IMG_OUT} ({iso_mb:.1f} MB)")


def flash_live_usb(disk_id: str = "disk3"):
    print(f"\n==> [LIVE USB] Formatando o pendrive /dev/{disk_id} (FAT32 MBR/UEFI 'IRISOS') e instalando o Sistema...")
    # Segurança: nunca permite formatar disk0 ou disk1 (discos internos do Mac)
    if disk_id in {"disk0", "disk1", "disk2"}:
        raise ValueError(f"Disco {disk_id} bloqueado por segurança!")

    subprocess.run(
        ["diskutil", "eraseDisk", "FAT32", "IRISOS", "MBRFormat", f"/dev/{disk_id}"],
        check=True,
    )

    usb_vol = Path("/Volumes/IRISOS")
    if not usb_vol.exists():
        raise RuntimeError("/Volumes/IRISOS não encontrado após formatação.")

    print("  [→] Copiando Bootloader UEFI (/efi/boot/bootx64.efi), Kernel Linux 6.6 LTS, Drivers Wi-Fi/GPU e irisTV para /Volumes/IRISOS...")
    subprocess.run(["cp", "-R", f"{ISO_STAGE_DIR}/.", str(usb_vol)], check=True)

    print("  [→] Injetando repositório offline completo de pacotes (Node.js, Chromium, Cage, Mesa, Áudio, Wi-Fi)...")
    apks_dest = usb_vol / "apks" / "x86_64"
    apks_dest.mkdir(parents=True, exist_ok=True)
    pkgs_src = CACHE_DIR / "apk_repo" / "packages"
    for apk_file in pkgs_src.glob("*"):
        shutil.copy2(apk_file, apks_dest / apk_file.name)

    print("  [→] Limpando arquivos residuais do macOS (._*) para garantir boot perfeito...")
    subprocess.run(["dot_clean", "-m", str(usb_vol)], check=False)
    subprocess.run(["rm", "-rf", str(usb_vol / "._*")], check=False)
    for hidden in usb_vol.rglob("._*"):
        try: hidden.unlink()
        except: pass

    subprocess.run(["sync"], check=True)
    print("  [✓] Pendrive Live USB 'IRISOS' 100% autossuficiente e pronto para dar boot!")


if __name__ == "__main__":
    build_rootfs()
    build_apkovl()
    build_stage_from_standard_iso()
    if "--flash-usb" in sys.argv:
        idx = sys.argv.index("--flash-usb")
        target_disk = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "disk3"
        flash_live_usb(target_disk)
    print("\n========================================================")
    print("  CONSTRUÇÃO DO SISTEMA OPERACIONAL irisOS CONCLUÍDA!")
    print("========================================================")
