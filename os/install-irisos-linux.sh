#!/usr/bin/env bash
# ==============================================================================
# irisOS — Instalador & Construtor de Appliance Linux para TV (.iso / .img)
# Transforma um Linux mínimo (Debian / Ubuntu / Raspberry Pi OS Lite) em um
# Sistema Operacional de TV real que boota direto no irisTV em tela cheia.
# ==============================================================================
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Erro: execute este instalador como root (sudo ./os/install-irisos-linux.sh)"
  exit 1
fi

IRIS_USER="${IRIS_USER:-iristv}"
IRIS_DIR="/opt/iristv"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [1/6] Instalando dependências do sistema (Wayland Cage Kiosk, Áudio, Rede, FFmpeg, CEC)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  cage \
  wlr-randr \
  wtype \
  chromium \
  chromium-widevine \
  nodejs \
  npm \
  ffmpeg \
  pulseaudio \
  pulseaudio-utils \
  network-manager \
  bluez \
  cec-utils \
  plymouth \
  plymouth-themes \
  seatd \
  dbus-x11 \
  ca-certificates \
  curl

echo "==> [2/6] Criando usuário dedicado '${IRIS_USER}' e copiando arquivos do irisTV para ${IRIS_DIR}..."
if ! id -u "${IRIS_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G video,audio,input,render,netdev,bluetooth,plugdev "${IRIS_USER}"
else
  usermod -aG video,audio,input,render,netdev,bluetooth,plugdev "${IRIS_USER}"
fi

mkdir -p "${IRIS_DIR}"
cp -a "${SRC_DIR}/." "${IRIS_DIR}/"
mkdir -p "${IRIS_DIR}/recordings"
chown -R "${IRIS_USER}:${IRIS_USER}" "${IRIS_DIR}"

echo "==> [3/6] Configurando permissões sem senha (sudoers) para desligar/suspender pelo controle..."
cat >/etc/sudoers.d/iristv-power <<EOF
${IRIS_USER} ALL=(ALL) NOPASSWD: /bin/systemctl poweroff, /bin/systemctl reboot, /bin/systemctl suspend
EOF
chmod 0440 /etc/sudoers.d/iristv-power

echo "==> [4/6] Criando serviço de segundo plano do cérebro do irisTV (iristv-server.service)..."
cat >/etc/systemd/system/iristv-server.service <<EOF
[Unit]
Description=irisTV Core OS Server (EPG, DVR, Lyrics, Hardware Controls)
After=network.target sound.target NetworkManager.service

[Service]
Type=simple
User=${IRIS_USER}
WorkingDirectory=${IRIS_DIR}
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${IRIS_DIR}/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

echo "==> [5/6] Configurando ponte HDMI-CEC (Controle Remoto da própria TV via cabo HDMI)..."
cat >"${IRIS_DIR}/os/cec-remote-bridge.sh" <<'EOF'
#!/usr/bin/env bash
# Escuta comandos HDMI-CEC da TV e envia teclas Wayland para o irisTV
if ! command -v cec-client >/dev/null 2>&1 || ! command -v wtype >/dev/null 2>&1; then
  exit 0
fi

cec-client -d 1 | while read -r line; do
  if [[ "$line" == *"key pressed:"* ]]; then
    case "$line" in
      *"up"*)           wtype -k Up ;;
      *"down"*)         wtype -k Down ;;
      *"left"*)         wtype -k Left ;;
      *"right"*)        wtype -k Right ;;
      *"select"*|*"enter"*) wtype -k Return ;;
      *"exit"*|*"back"*)    wtype -k Escape ;;
      *"play"*|*"pause"*)   wtype -k space ;;
      *"F2"*|*"red"*)       wtype -k F2 ;;
    esac
  fi
done
EOF
chmod +x "${IRIS_DIR}/os/cec-remote-bridge.sh"

echo "==> [6/6] Configurando inicialização direta em Tela Cheia (Kiosk Wayland Cage + Extensão TV Remote)..."
cat >"${IRIS_DIR}/os/start-iristv-session.sh" <<EOF
#!/usr/bin/env bash
# Aguarda o server.js responder em localhost:3000
for _ in {1..30}; do
  if curl -sf http://127.0.0.1:3000/api/os/status >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

# Inicia ponte HDMI-CEC em background
"${IRIS_DIR}/os/cec-remote-bridge.sh" &

# Abre o irisTV em modo Kiosk Wayland (sem área de trabalho, sem bordas, com Spatial Navigation e Widevine DRM)
exec cage -s -- chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --enable-features=OverlayScrollbar,VaapiVideoDecoder \
  --autoplay-policy=no-user-gesture-required \
  --load-extension="${IRIS_DIR}/os/tv-nav-extension" \
  "http://127.0.0.1:3000"
EOF
chmod +x "${IRIS_DIR}/os/start-iristv-session.sh"
chown "${IRIS_USER}:${IRIS_USER}" "${IRIS_DIR}/os/cec-remote-bridge.sh" "${IRIS_DIR}/os/start-iristv-session.sh"

mkdir -p /etc/systemd/system/getty@tty1.service.d
cat >/etc/systemd/system/getty@tty1.service.d/autologin.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${IRIS_USER} --noclear %I \$TERM
EOF

cat >"/home/${IRIS_USER}/.bash_profile" <<EOF
if [[ -z "\${DISPLAY:-}" && -z "\${WAYLAND_DISPLAY:-}" && "\$(tty)" == "/dev/tty1" ]]; then
  exec "${IRIS_DIR}/os/start-iristv-session.sh"
fi
EOF
chown "${IRIS_USER}:${IRIS_USER}" "/home/${IRIS_USER}/.bash_profile"

# Silencia logs de boot no GRUB (quando disponível em PCs x86_64)
if [[ -f /etc/default/grub ]]; then
  sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=0/' /etc/default/grub
  sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash loglevel=0 logo.nologo vt.global_cursor_default=0"/' /etc/default/grub
  update-grub || true
fi

systemctl daemon-reload
systemctl enable iristv-server.service
systemctl restart iristv-server.service

echo "=============================================================================="
echo "irisOS instalado com sucesso!"
echo "No próximo boot, o aparelho ligará diretamente na interface do irisTV."
echo "=============================================================================="

