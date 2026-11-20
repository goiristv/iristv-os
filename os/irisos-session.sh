#!/bin/sh
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/root"
export NODE_ENV="production"
export PORT="3000"
export XDG_RUNTIME_DIR="/run/user/0"
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export WEBKIT_FORCE_SANDBOX=0

# 0. Garante Busybox applets e diretórios essenciais do sistema
if [ -x /bin/busybox ]; then
  /bin/busybox --install -s /bin 2>/dev/null || true
  /bin/busybox --install -s /sbin 2>/dev/null || true
  /bin/busybox mkdir -p /var /var/log /tmp /run /run/user/0 /dev/pts /dev/shm /dev/input /dev/dri /dev/snd 2>/dev/null || true
else
  mkdir -p /var /var/log /tmp /run /run/user/0 /dev/pts /dev/shm /dev/input /dev/dri /dev/snd 2>/dev/null || true
fi

# 1. Virtual filesystems & disable mdev hotplug hijack
mount -t proc proc /proc 2>/dev/null || true
mount -t sysfs sys /sys 2>/dev/null || true
mount -t devtmpfs devtmpfs /dev 2>/dev/null || true
mount -t devpts devpts /dev/pts 2>/dev/null || true
mount -t tmpfs tmpfs /dev/shm 2>/dev/null || true
chmod 1777 /dev/shm /tmp 2>/dev/null || true
chmod 700 "$XDG_RUNTIME_DIR" 2>/dev/null || true
echo "" > /proc/sys/kernel/hotplug 2>/dev/null || true
dmesg -n 1 2>/dev/null || true

# === Otimizações Extremas de Memória e VMM do Kernel ===
[ -e /sys/kernel/mm/transparent_hugepage/enabled ] && echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || true
[ -e /sys/kernel/mm/transparent_hugepage/defrag ] && echo never > /sys/kernel/mm/transparent_hugepage/defrag 2>/dev/null || true

if [ -d /sys/kernel/mm/ksm ]; then
  echo 1 > /sys/kernel/mm/ksm/run 2>/dev/null || true
  echo 1 > /sys/kernel/mm/ksm/use_zero_pages 2>/dev/null || true
  echo 4096 > /sys/kernel/mm/ksm/max_page_sharing 2>/dev/null || true
  echo 256 > /sys/kernel/mm/ksm/pages_to_scan 2>/dev/null || true
  echo 40 > /sys/kernel/mm/ksm/sleep_millisecs 2>/dev/null || true
fi

sysctl -w vm.vfs_cache_pressure=200 2>/dev/null || true
sysctl -w vm.swappiness=100 2>/dev/null || true
sysctl -w vm.page-cluster=0 2>/dev/null || true
sysctl -w vm.dirty_background_ratio=5 2>/dev/null || true
sysctl -w vm.dirty_ratio=10 2>/dev/null || true
sysctl -w vm.min_free_kbytes=4096 2>/dev/null || true
sysctl -w vm.compaction_proactiveness=0 2>/dev/null || true
sysctl -w net.core.rmem_default=65536 2>/dev/null || true
sysctl -w net.core.rmem_max=1048576 2>/dev/null || true
sysctl -w net.core.wmem_default=65536 2>/dev/null || true
sysctl -w net.core.wmem_max=1048576 2>/dev/null || true
sysctl -w net.ipv4.tcp_no_metrics_save=1 2>/dev/null || true

# === Detecção Determinística de RAM Física & Tiering ===
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
[ -z "$TOTAL_RAM_KB" ] && TOTAL_RAM_KB=524288
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))

if [ "$TOTAL_RAM_MB" -lt 192 ]; then
  # Perfil 1: 128 MB RAM (30 FPS @ 720p fixos)
  export IRIS_PERF_TIER="tier1_128mb"
  export IRIS_TARGET_FPS=30
  export WPE_GL_SWAP_INTERVAL=2
  export JSC_gcMaxHeapSize=33554432
  export JSC_useJIT=false
  export JSC_useDFGJIT=false
  export JSC_useFTLJIT=false
  export JSC_useDOMJIT=false
  export WEBKIT_PRESSURE_KILL_THRESHOLD=0.75
  NODE_MEM_ARGS="--max-old-space-size=24 --max-semi-space-size=1"
  mount -o remount,size=48M,noatime /tmp 2>/dev/null || true
  mount -o remount,size=16M,noatime /run 2>/dev/null || true
  mount -o remount,size=8M,noatime /var/log 2>/dev/null || true
elif [ "$TOTAL_RAM_MB" -lt 384 ]; then
  # Perfil 2: 256 MB RAM (45 FPS @ 720p/900p modulados)
  export IRIS_PERF_TIER="tier2_256mb"
  export IRIS_TARGET_FPS=45
  export WPE_GL_SWAP_INTERVAL=1
  export JSC_gcMaxHeapSize=67108864
  export JSC_useJIT=false
  export JSC_useDFGJIT=false
  export JSC_useFTLJIT=false
  export JSC_useDOMJIT=false
  export WEBKIT_PRESSURE_KILL_THRESHOLD=0.80
  NODE_MEM_ARGS="--max-old-space-size=32 --max-semi-space-size=1"
  mount -o remount,size=64M,noatime /tmp 2>/dev/null || true
  mount -o remount,size=16M,noatime /run 2>/dev/null || true
  mount -o remount,size=8M,noatime /var/log 2>/dev/null || true
else
  # Perfil 3: >= 512 MB RAM (60 FPS VSync @ 1080p cravados)
  export IRIS_PERF_TIER="tier3_512mb_plus"
  export IRIS_TARGET_FPS=60
  export WPE_GL_SWAP_INTERVAL=1
  export WEBKIT_PRESSURE_KILL_THRESHOLD=0.85
  NODE_MEM_ARGS="--max-old-space-size=48 --max-semi-space-size=2"
fi

# Subsistema de Áudio: Roteamento Direto ALSA (dmix) - Zero Daemons em RAM
mkdir -p /etc
cat << 'EOF' > /etc/asound.conf
pcm.!default {
    type plug
    slave.pcm "dmixer"
}

pcm.dmixer {
    type dmix
    ipc_key 1024
    ipc_perm 0666
    slave {
        pcm "hw:0,0"
        period_time 0
        period_size 1024
        buffer_size 4096
        rate 48000
    }
    bindings {
        0 0
        1 1
    }
}

ctl.!default {
    type hw
    card 0
}
EOF

# Redirect all session/daemon console text to log file so tty1 stays 100% clean
mkdir -p /var/log 2>/dev/null || true
exec >/var/log/irisos-session.log 2>&1

boot_mark() {
  up=$(cut -d' ' -f1 /proc/uptime 2>/dev/null || echo "?")
  echo "[irisOS +${up}s] $*"
  if [ -c /dev/hvc0 ]; then
    echo "[irisOS +${up}s] $*" > /dev/hvc0 2>/dev/null || true
  fi
}
boot_mark "switch_root concluido -> iniciando /sbin/irisos-session"

# Hide blinking cursor on tty1 and display Ubuntu-style graphical splash on /dev/fb0
printf "\033[?25l\033[2J\033[H" > /dev/tty1 2>/dev/null || true
if [ -e /dev/fb0 ] && [ -f /etc/fbsplash.ppm ] && [ -x /sbin/fbsplash ]; then
  fbsplash -s /etc/fbsplash.ppm -d /dev/fb0 -i /etc/fbsplash.cfg 2>/dev/null || true
else
  printf "\033[1;36m\n  irisOS Smart TV\033[0m\n  Iniciando sistema...\n\n" > /dev/tty1 2>/dev/null || true
fi

# 2. Local network loopback (immediate)
ifconfig lo 127.0.0.1 up 2>/dev/null || ip link set lo up 2>/dev/null || true
ip addr add 127.0.0.1/8 dev lo 2>/dev/null || true

# 3. Ensure loop block nodes exist & mount modloop-lts + irisusr.img (/usr) in milliseconds
[ -c "/dev/loop-control" ] || mknod -m 660 "/dev/loop-control" c 10 237 2>/dev/null || true
for i in 0 1 2 3 4 5 6 7; do
  [ -b "/dev/loop$i" ] || mknod -m 660 "/dev/loop$i" b 7 "$i" 2>/dev/null || true
done

KVER=$(uname -r)
BOOT_MNT=""
for mnt in /media/* /run/media/*; do
  if [ -f "$mnt/boot/modloop-lts" ] || [ -f "$mnt/boot/irisusr.img" ]; then
    BOOT_MNT="$mnt"
    break
  fi
done

if [ -z "$BOOT_MNT" ]; then
  mkdir -p /media/usb_boot
  for dev in /dev/sd* /dev/vd* /dev/nvme* /dev/mmcblk* /dev/sr*; do
    [ -b "$dev" ] || continue
    if mount -o ro "$dev" /media/usb_boot 2>/dev/null; then
      if [ -f "/media/usb_boot/boot/modloop-lts" ] || [ -f "/media/usb_boot/boot/irisusr.img" ]; then
        BOOT_MNT="/media/usb_boot"
        break
      fi
      umount /media/usb_boot 2>/dev/null || true
    fi
  done
fi

if [ -n "$BOOT_MNT" ]; then
  mount -o remount,rw "$BOOT_MNT" 2>/dev/null || true
fi

if [ ! -d "/.modloop/modules/$KVER" ] && [ -n "$BOOT_MNT" ] && [ -f "$BOOT_MNT/boot/modloop-lts" ]; then
  mkdir -p /.modloop
  mount -o loop,ro "$BOOT_MNT/boot/modloop-lts" /.modloop 2>/dev/null || true
fi

if [ -d "/.modloop/modules/$KVER" ]; then
  if [ ! -L /lib/modules ]; then
    rm -rf /lib/modules
    ln -sf /.modloop/modules /lib/modules
  fi
  modprobe -q loop isofs 2>/dev/null || true
  if [ -d /.modloop/modules/firmware ]; then
    mkdir -p /lib/firmware
    for fw in /.modloop/modules/firmware/*; do
      [ -e "$fw" ] || continue
      base_fw="${fw##*/}"
      [ -e "/lib/firmware/$base_fw" ] || ln -sf "$fw" "/lib/firmware/$base_fw" 2>/dev/null || true
    done
  fi
fi

# ZRAM Dual-Engine Swap Storage (carregado após modloop-lts montar /lib/modules)
if modprobe -q zram num_devices=1 2>/dev/null; then
  if [ -b /dev/zram0 ]; then
    swapoff /dev/zram0 2>/dev/null || true
    if grep -q lz4 /sys/block/zram0/comp_algorithm 2>/dev/null; then
      echo lz4 > /sys/block/zram0/comp_algorithm 2>/dev/null || true
    fi
    ZRAM_BYTES=$((TOTAL_RAM_KB * 1024))
    [ "$ZRAM_BYTES" -lt 134217728 ] && ZRAM_BYTES=134217728
    echo "$ZRAM_BYTES" > /sys/block/zram0/disksize 2>/dev/null || true
    mkswap /dev/zram0 >/dev/null 2>&1 || true
    swapon -p 100 /dev/zram0 2>/dev/null || true
  fi
fi

if [ ! -x /usr/bin/node ] || { [ ! -x /usr/bin/cog ] && [ ! -x /usr/bin/chromium ]; }; then
  mkdir -p /usr
  if [ -n "$BOOT_MNT" ] && [ -f "$BOOT_MNT/boot/irisusr.img" ]; then
    mount -t iso9660 -o loop,ro "$BOOT_MNT/boot/irisusr.img" /usr 2>/dev/null || \
      mount -o loop,ro "$BOOT_MNT/boot/irisusr.img" /usr 2>/dev/null || true
  else
    for mnt in /media/* /run/media/* /media/usb_boot; do
      if [ -f "$mnt/boot/irisusr.img" ]; then
        mount -t iso9660 -o loop,ro "$mnt/boot/irisusr.img" /usr 2>/dev/null || \
          mount -o loop,ro "$mnt/boot/irisusr.img" /usr 2>/dev/null || true
        [ -x /usr/bin/node ] && break
      fi
    done
  fi
fi

# 4. Start irisTV core server early in background so it warms up in parallel
boot_mark "modloop-lts e irisusr.img (/usr) montados (node=$([ -x /usr/bin/node ] && echo OK || echo FAIL), cog=$([ -x /usr/bin/cog ] && echo OK || echo FAIL), chromium=$([ -x /usr/bin/chromium ] && echo OK || echo FAIL))"
if ! pgrep -f "/opt/iristv/server.js" >/dev/null 2>&1; then
  (
    cd /opt/iristv || exit 1
    while true; do
      node $NODE_MEM_ARGS /opt/iristv/server.js >> /var/log/iristv-server.log 2>&1
      sleep 1
    done
  ) &
fi

# 4b. Inicializa Waydroid container, Widevine L3 DRM e Armazenamento Persistente de .APKs
mkdir -p /opt/iristv/apks /root/.iristv
chmod 777 /opt/iristv/apks 2>/dev/null || true

# Persistência de APKs, Logins e Sessões Android no Pendrive de Boot
if [ -n "$BOOT_MNT" ]; then
  mkdir -p "$BOOT_MNT/irisos-data/waydroid-data" "$BOOT_MNT/irisos-data/apks" "$BOOT_MNT/irisos-data/sessions"
  mount --bind "$BOOT_MNT/irisos-data/apks" /opt/iristv/apks 2>/dev/null || true
  mount --bind "$BOOT_MNT/irisos-data/sessions" /root/.iristv 2>/dev/null || true
  if [ -d /var/lib/waydroid ]; then
    mkdir -p /var/lib/waydroid/data
    mount --bind "$BOOT_MNT/irisos-data/waydroid-data" /var/lib/waydroid/data 2>/dev/null || true
  fi
fi

if [ -x /usr/bin/waydroid ] && [ -f /var/lib/waydroid/waydroid.cfg ]; then
  (
    waydroid container start >> /var/log/waydroid.log 2>&1 &
    # Aguarda contêiner inicializar e aplica suporte a Widevine DRM L3 e otimizações de TV de alta velocidade
    for _i in $(seq 1 15); do
      if waydroid status 2>/dev/null | grep -q "RUNNING"; then
        # Detecta a resolução nativa real da TV/Monitor via DRM para ajuste perfeito em tela cheia
        SCREEN_RES=$(cat /sys/class/drm/card*-*/modes 2>/dev/null | grep -E '^[0-9]+x[0-9]+' | head -n 1)
        SCREEN_W=${SCREEN_RES%x*}
        SCREEN_H=${SCREEN_RES#*x}

        waydroid prop set persist.waydroid.widevine true 2>/dev/null || true
        # multi_windows=false força o Waydroid a rodar em tela cheia unificada ajustada ao Cage
        waydroid prop set persist.waydroid.multi_windows false 2>/dev/null || true
        waydroid prop set persist.waydroid.width_padding 0 2>/dev/null || true
        waydroid prop set persist.waydroid.height_padding 0 2>/dev/null || true
        if [ -n "$SCREEN_W" ] && [ -n "$SCREEN_H" ]; then
          waydroid prop set persist.waydroid.width "$SCREEN_W" 2>/dev/null || true
          waydroid prop set persist.waydroid.height "$SCREEN_H" 2>/dev/null || true
        fi
        waydroid prop set persist.waydroid.suspend false 2>/dev/null || true
        waydroid prop set persist.waydroid.fake_touch false 2>/dev/null || true
        waydroid prop set persist.waydroid.uevent 1 2>/dev/null || true
        waydroid prop set ro.hardware.gralloc gbm 2>/dev/null || true
        waydroid prop set debug.sf.disable_backpressure 1 2>/dev/null || true
        waydroid prop set debug.sf.latch_unsignaled 1 2>/dev/null || true
        waydroid prop set dalvik.vm.dex2oat-filter speed 2>/dev/null || true
        waydroid prop set dalvik.vm.image-dex2oat-filter speed 2>/dev/null || true
        waydroid prop set dalvik.vm.dex2oat-threads 4 2>/dev/null || true

        # Pré-aquece a sessão Android (Zygote & Dalvik VM) para abertura instantânea dos apps
        waydroid session start >> /var/log/waydroid-session.log 2>&1 &

        # Ajuste automático de resolução/densidade de TV, imersão 100% e compilação AOT
        (
          for _j in $(seq 1 12); do
            if waydroid shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
              # Ajusta a resolução e densidade exata da tela da TV (sem barras nem cortes)
              if [ -n "$SCREEN_W" ] && [ -n "$SCREEN_H" ]; then
                waydroid shell wm size "${SCREEN_W}x${SCREEN_H}" >/dev/null 2>&1 || true
                if [ "$SCREEN_W" -ge 3000 ]; then
                  waydroid shell wm density 320 >/dev/null 2>&1 || true
                elif [ "$SCREEN_W" -ge 1600 ]; then
                  waydroid shell wm density 213 >/dev/null 2>&1 || true
                else
                  waydroid shell wm density 160 >/dev/null 2>&1 || true
                fi
              fi
              waydroid shell wm overscan 0,0,0,0 >/dev/null 2>&1 || true
              waydroid shell settings put global policy_control immersive.full=* >/dev/null 2>&1 || true

              # Desativa animações artificiais de transição do Android (-400ms no cold launch)
              waydroid shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
              waydroid shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
              waydroid shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
              for pkg in com.netflix.ninja com.teamsmart.videomanager.tv com.amazon.amazonvideo.livingroom com.disney.disneyplus; do
                if waydroid shell pm list packages 2>/dev/null | grep -q "$pkg"; then
                  waydroid shell cmd package compile -m speed "$pkg" >/dev/null 2>&1 &
                fi
              done
              break
            fi
            sleep 1
          done
        ) &
        break
      fi
      sleep 1
    done
  ) &
fi

# 5. Background network setup (DHCP runs asynchronously without blocking boot)
(
  mkdir -p /etc /etc/wpa_supplicant
  printf "nameserver 1.1.1.1\nnameserver 8.8.8.8\n" > /etc/resolv.conf

  # Auto-load saved Wi-Fi configuration from boot pendrive
  saved_wifi=""
  for wp in "$BOOT_MNT/irisos-wifi.conf" /media/*/irisos-wifi.conf /run/media/*/irisos-wifi.conf; do
    if [ -f "$wp" ]; then
      saved_wifi="$wp"
      cp -f "$wp" /etc/wpa_supplicant/wpa_supplicant.conf
      break
    fi
  done

  # Auto-connect saved Wi-Fi if credentials exist
  if [ -f /etc/wpa_supplicant/wpa_supplicant.conf ]; then
    (
      # Wait briefly for Wi-Fi driver to register
      for _ in $(seq 1 30); do
        wiface=$(for d in /sys/class/net/*; do [ -d "$d/wireless" ] || [ -d "$d/phy80211" ] && basename "$d" && break; done)
        [ -n "$wiface" ] && break
        sleep 0.2
      done
      if [ -n "$wiface" ]; then
        rfkill unblock all 2>/dev/null || true
        ip link set "$wiface" up 2>/dev/null || ifconfig "$wiface" up 2>/dev/null || true
        killall -9 wpa_supplicant 2>/dev/null || true
        rm -rf /var/run/wpa_supplicant
        wpa_supplicant -B -i "$wiface" -c /etc/wpa_supplicant/wpa_supplicant.conf -D nl80211,wext >/dev/null 2>&1
        for _ in $(seq 1 20); do
          if iw dev "$wiface" link 2>/dev/null | grep -q "Connected"; then
            udhcpc -i "$wiface" -n -q -t 5 -T 2 >/dev/null 2>&1 || udhcpc -i "$wiface" -b -q >/dev/null 2>&1 || true
            break
          fi
          sleep 0.5
        done
      fi
    ) &
  fi

  for iface in /sys/class/net/*; do
    [ -e "$iface" ] || continue
    ifname="${iface##*/}"
    if [ "$ifname" != "lo" ]; then
      ifconfig "$ifname" up 2>/dev/null || ip link set "$ifname" up 2>/dev/null || true
      udhcpc -i "$ifname" -b -q 2>/dev/null || true
    fi
  done
) &

# 6. Protect working UEFI simpledrm display (/dev/dri/card0) from KMS GPU driver black screen
mkdir -p /etc/modprobe.d
if [ -e /sys/class/drm/card0 ]; then
  cat << 'EOF' > /etc/modprobe.d/blacklist-gpu.conf
blacklist nouveau
blacklist radeon
blacklist amdgpu
blacklist i915
blacklist xe
EOF
fi

# 7. Fast-batch load USB, Intel/AMD LPSS & Pinctrl, I2C, PS/2, HID, Mouse & Keyboard drivers in ONE modprobe pass
modprobe -a -b -q \
  pinctrl-intel pinctrl-alderlake pinctrl-tigerlake pinctrl-cannonlake pinctrl-icelake pinctrl-sunrisepoint \
  pinctrl-jasperlake pinctrl-meteorlake pinctrl-lynxpoint pinctrl-broxton pinctrl-geminilake pinctrl-amd \
  intel-lpss intel-lpss-pci intel-lpss-acpi \
  i2c-core i2c-dev i2c-i801 i2c-piix4 i2c-designware-core i2c-designware-pci i2c-designware-platform \
  i8042 libps2 serio serio_raw atkbd psmouse \
  usb-common usbcore xhci-hcd xhci-pci xhci-pci-renesas xhci-plat-hcd ehci-hcd ehci-pci ohci-hcd ohci-pci uhci-hcd \
  i2c-hid i2c-hid-acpi hid hid-generic usbhid hid-multitouch hid-logitech hid-logitech-dj hid-logitech-hidpp \
  hid-apple hid-cherry hid-microsoft hid-chicony hid-asus hid-lenovo hid-elan hid-rmi \
  evdev uinput mousedev joydev \
  wmi asus-wmi asus-nb-wmi acer-wmi thinkpad_acpi ideapad-laptop hp-wmi dell-wmi dell-laptop msi-wmi huawei-wmi \
  snd soundcore snd-timer snd-pcm snd-hwdep snd-seq snd-hda-intel snd-hda-codec-realtek snd-hda-codec-hdmi snd-hda-codec-generic \
  snd-intel-dspcfg snd-sof-pci-intel-tgl snd-sof-pci-intel-cnl snd-sof-pci-intel-apl snd-usb-audio snd-dummy \
  virtio virtio_pci virtio_input virtio-gpu drm drm_kms_helper 2>/dev/null || true

# Fast-batch coldplug PCI (except 0x03* GPU) + USB, HID, I2C, Serio, Platform in ONE deduplicated modprobe pass
{
  for pcidev in /sys/bus/pci/devices/*; do
    [ -e "$pcidev/class" ] && [ -e "$pcidev/modalias" ] || continue
    read -r pciclass < "$pcidev/class" 2>/dev/null || continue
    case "$pciclass" in
      0x03*) continue ;;
    esac
    cat "$pcidev/modalias" 2>/dev/null
  done
  cat /sys/bus/usb/devices/*/modalias \
      /sys/bus/hid/devices/*/modalias \
      /sys/bus/i2c/devices/*/modalias \
      /sys/bus/serio/devices/*/modalias \
      /sys/bus/platform/devices/*/modalias 2>/dev/null
} | sort -u | xargs modprobe -a -b -q 2>/dev/null || true

# 8. Ensure REAL character device nodes in /dev/input and /dev/dri (NEVER symlinks to /dev/event*, which seatd rejects!)
sync_real_devnodes() {
  mkdir -p /dev/input /dev/dri /dev/snd
  for dev in /dev/event* /dev/mouse* /dev/mice /dev/js* /dev/ts*; do
    [ -e "$dev" ] || [ -L "$dev" ] || continue
    base="${dev##*/}"
    rm -f "/dev/input/$base" 2>/dev/null || true
    if [ -c "$dev" ] && [ ! -L "$dev" ]; then
      mv -f "$dev" "/dev/input/$base" 2>/dev/null || rm -f "$dev"
    else
      rm -f "$dev" 2>/dev/null || true
    fi
  done
  for dev in /dev/card* /dev/renderD*; do
    [ -e "$dev" ] || [ -L "$dev" ] || continue
    base="${dev##*/}"
    if [ ! -c "/dev/dri/$base" ] && [ -c "$dev" ] && [ ! -L "$dev" ]; then
      mv -f "$dev" "/dev/dri/$base" 2>/dev/null || true
    fi
  done
  for sysdev in /sys/class/input/event* /sys/class/input/mouse* /sys/class/input/mice; do
    [ -e "$sysdev/dev" ] || continue
    name="${sysdev##*/}"
    if [ -L "/dev/input/$name" ] || [ ! -c "/dev/input/$name" ]; then
      rm -f "/dev/input/$name" 2>/dev/null || true
      IFS=: read major minor < "$sysdev/dev"
      mknod -m 666 "/dev/input/$name" c "$major" "$minor" 2>/dev/null || true
      chgrp input "/dev/input/$name" 2>/dev/null || true
    fi
  done
  for sysdev in /sys/class/drm/card[0-9]* /sys/class/drm/renderD*; do
    [ -e "$sysdev/dev" ] || continue
    name="${sysdev##*/}"
    if [ -L "/dev/dri/$name" ] || [ ! -c "/dev/dri/$name" ]; then
      rm -f "/dev/dri/$name" 2>/dev/null || true
      IFS=: read major minor < "$sysdev/dev"
      mknod -m 666 "/dev/dri/$name" c "$major" "$minor" 2>/dev/null || true
      chgrp video "/dev/dri/$name" 2>/dev/null || true
    fi
  done
  for dev in /dev/pcmC* /dev/controlC* /dev/hwC* /dev/timer /dev/seq; do
    [ -e "$dev" ] || [ -L "$dev" ] || continue
    base="${dev##*/}"
    if [ ! -c "/dev/snd/$base" ] && [ -c "$dev" ] && [ ! -L "$dev" ]; then
      mv -f "$dev" "/dev/snd/$base" 2>/dev/null || true
    fi
  done
  for sysdev in /sys/class/sound/*; do
    [ -e "$sysdev/dev" ] || continue
    name="${sysdev##*/}"
    if [ -L "/dev/snd/$name" ] || [ ! -c "/dev/snd/$name" ]; then
      rm -f "/dev/snd/$name" 2>/dev/null || true
      IFS=: read major minor < "$sysdev/dev"
      mknod -m 666 "/dev/snd/$name" c "$major" "$minor" 2>/dev/null || true
      chgrp audio "/dev/snd/$name" 2>/dev/null || true
    fi
  done
  chmod -R 777 /dev/dri /dev/input /dev/snd /dev/bus/usb 2>/dev/null || true
}
sync_real_devnodes
boot_mark "drivers carregados em lote (modprobe -a) e devnodes sincronizados"

# Re-paint fbsplash in case DRM/fb0 initialized during module load
if [ -e /dev/fb0 ] && [ -f /etc/fbsplash.ppm ]; then
  fbsplash -s /etc/fbsplash.ppm -d /dev/fb0 -i /etc/fbsplash.cfg 2>/dev/null || true
fi

# 9. Wayland & Hardware session daemon (seatd)
adduser root input 2>/dev/null || true
adduser root video 2>/dev/null || true
adduser root audio 2>/dev/null || true

if [ -x /usr/bin/seatd ]; then
  pkill -9 seatd 2>/dev/null || true
  rm -f /run/seatd.sock
  seatd -u root -g video >/var/log/seatd.log 2>&1 &
fi

export LIBSEAT_BACKEND=seatd
export SEATD_SOCK=/run/seatd.sock
export LIBGL_DRIVERS_PATH=/usr/lib/dri:/usr/lib/xorg/modules/dri
export WLR_LIBINPUT_NO_DEVICES=1
export WLR_RENDERER=auto
export XKB_DEFAULT_RULES=evdev
export XKB_DEFAULT_MODEL=pc105
export XKB_DEFAULT_LAYOUT=br
export XDG_SESSION_TYPE=wayland
export XDG_CURRENT_DESKTOP=cage
export XCURSOR_THEME=Adwaita
export XCURSOR_SIZE=24

# Background Wi-Fi drivers & Direct ALSA/DBus daemons (ZERO PulseAudio Daemons)
(
  modprobe -a -b -q cfg80211 mac80211 brcmfmac brcmutil rtw88_8822ce rtw88_pci rtw88_core iwlwifi 2>/dev/null || true
  sync_real_devnodes
  mkdir -p /run/dbus /var/lib/dbus
  dbus-uuidgen --ensure 2>/dev/null || true
  dbus-uuidgen --ensure=/etc/machine-id 2>/dev/null || true
  acpid 2>/dev/null || true
  dbus-daemon --system --fork >/dev/null 2>&1 || true

  # Unmute ALSA Direct dmix outputs
  amixer set Master 85% unmute 2>/dev/null || true
  amixer set PCM 85% unmute 2>/dev/null || true
  amixer set Speaker 85% unmute 2>/dev/null || true
  amixer set Headphone 85% unmute 2>/dev/null || true
) &

# 9b. CPU Governor em performance máxima + ajuste de VM/I/O para zero engasgos
for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
  [ -w "$gov" ] && echo performance > "$gov" 2>/dev/null || true
done
sysctl -w vm.swappiness=10 vm.dirty_background_ratio=5 >/dev/null 2>&1 || true

# 10. Hardware-Accelerated WPE WebKit & Cog Environment Configuration
# /tmp/xdg-cache fica na RAM (tmpfs) para shaders e cache WebKit 50x mais rápidos que FAT32 USB!
mkdir -p /tmp/xdg-cache /tmp/xdg-data /tmp/xdg-config
if [ -n "$BOOT_MNT" ]; then
  mkdir -p "$BOOT_MNT/irisos-data/xdg-data" "$BOOT_MNT/irisos-data/xdg-config"
  mount --bind "$BOOT_MNT/irisos-data/xdg-data" /tmp/xdg-data 2>/dev/null || true
  mount --bind "$BOOT_MNT/irisos-data/xdg-config" /tmp/xdg-config 2>/dev/null || true
fi
export XDG_CACHE_HOME=/tmp/xdg-cache
export XDG_DATA_HOME=/tmp/xdg-data
export XDG_CONFIG_HOME=/tmp/xdg-config
export WEBKIT_CACHE_MODEL=DOCUMENT_VIEWER
export MESA_GLTHREAD=false
export WLR_DRM_NO_MODIFIERS=1
export COG_PLATFORM_FDO_VIEW_FULLSCREEN=1
export COG_PLATFORM_WL_VIEW_FULLSCREEN=1
export GST_VAAPI_ALL_DRIVERS=1
export WEBKIT_GST_HOLE_PUNCH=0
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export WEBKIT_FORCE_SANDBOX=0
export WPE_SHELL_COOKIE_PATH=/root/.iristv/wpe-cookies.txt

# Sem nó DRM renderD128 (simpledrm / llvmpipe), o DMA-BUF renderer e compositing forçado do WebKit 2.44+ crasham WPEWebProcess
if [ ! -e /dev/dri/renderD128 ]; then
  export LIBGL_ALWAYS_SOFTWARE=1
  export GALLIUM_DRIVER=llvmpipe
  export WEBKIT_DISABLE_DMABUF_RENDERER=1
  export WEBKIT_GST_DMABUF_SINK_ENABLED=0
  export WLR_NO_HARDWARE_CURSORS=1
  unset WEBKIT_FORCE_COMPOSITING_MODE
else
  # Com GPU real, ativa cursor de hardware nativo (60/120Hz zero lag)
  export WLR_NO_HARDWARE_CURSORS=0
  export WEBKIT_FORCE_COMPOSITING_MODE=1
  export WEBKIT_GST_DMABUF_SINK_ENABLED=1
fi

# 11. Fast readiness check (usa /api/os/ping em 0.1ms em vez de /api/os/status)
for _ in $(seq 1 80); do
  if [ -S /run/seatd.sock ] && wget -q -O - http://127.0.0.1:3000/api/os/ping >/dev/null 2>&1; then
    break
  fi
  usleep 30000 2>/dev/null || sleep 0.03
done
boot_mark "seatd + API irisTV (127.0.0.1:3000) PRONTOS -> abrindo Cage + WPE WebKit (Cog)"

save_logs_to_usb() {
  local target_mnt=""
  if [ -n "$BOOT_MNT" ] && [ -d "$BOOT_MNT" ]; then
    mount -o remount,rw "$BOOT_MNT" 2>/dev/null || true
    if mkdir -p "$BOOT_MNT/irisos-logs" 2>/dev/null; then
      target_mnt="$BOOT_MNT"
    fi
  fi
  if [ -z "$target_mnt" ]; then
    for m in /media/* /run/media/*; do
      if [ -f "$m/boot/irisusr.img" ] || [ -f "$m/boot/modloop-lts" ]; then
        mount -o remount,rw "$m" 2>/dev/null || true
        if mkdir -p "$m/irisos-logs" 2>/dev/null; then
          target_mnt="$m"
          break
        fi
      fi
    done
  fi
  if [ -z "$target_mnt" ]; then
    mkdir -p /media/usb_logs 2>/dev/null || true
    for dev in /dev/sd* /dev/nvme* /dev/mmcblk*; do
      [ -b "$dev" ] || continue
      if mount -o rw "$dev" /media/usb_logs 2>/dev/null; then
        if [ -f "/media/usb_logs/boot/irisusr.img" ]; then
          mkdir -p /media/usb_logs/irisos-logs 2>/dev/null && target_mnt="/media/usb_logs" && break
        fi
        umount /media/usb_logs 2>/dev/null || true
      fi
    done
  fi
  if [ -n "$target_mnt" ]; then
    cp -f /var/log/irisos-session.log /var/log/cog.log /var/log/iristv-server.log /var/log/seatd.log "$target_mnt/irisos-logs/" 2>/dev/null || true
    {
      echo "=== MOUNT ==="
      mount 2>&1
      echo "=== FREE ==="
      free -m 2>&1
      echo "=== PS ==="
      ps w 2>&1 || ps 2>&1
      echo "=== DRI / SHM / BWRAP / SCHEMAS ==="
      ls -la /dev/dri /dev/shm /usr/bin/bwrap /usr/share/glib-2.0/schemas/gschemas.compiled 2>&1
      echo "=== DMESG TAIL ==="
      dmesg | tail -n 100 2>&1
    } > "$target_mnt/irisos-logs/system-state.txt" 2>/dev/null || true
    sync
  fi
}

save_logs_to_usb

(
  for _ in $(seq 1 15); do
    sleep 2
    save_logs_to_usb
  done
) &

# 12. Launch Wayland Cage + WPE WebKit Cog TV Interface in pure Kiosk mode (with fallback to Chromium)
while true; do
  sync_real_devnodes
  if [ -x /usr/bin/cog ]; then
    export COG_PLATFORM_WL_VIEW_FULLSCREEN=1
    boot_mark "Iniciando cage com cog (--platform=wl)..."
    env WLR_LIBINPUT_NO_DEVICES=1 LIBSEAT_BACKEND=seatd cage -s -d -- cog \
      --platform=wl \
      "http://127.0.0.1:3000" >/var/log/cog.log 2>&1
    rc=$?
    boot_mark "cage (cog) encerrou com codigo $rc"
    save_logs_to_usb
    echo "[irisOS] Cage (cog) encerrou com codigo $rc. Ultimos logs:" > /dev/tty1 2>/dev/null || true
    tail -n 10 /var/log/cog.log > /dev/tty1 2>/dev/null || true
  else
    boot_mark "Iniciando cage com chromium..."
    env WLR_LIBINPUT_NO_DEVICES=1 LIBSEAT_BACKEND=seatd cage -s -d -- chromium \
      --ozone-platform=wayland \
      --enable-features=OverlayScrollbar,UseOzonePlatform \
      --disable-features=Translate,PasswordManager,PasswordManagerOnboarding,AutofillServerCommunication,HardwareMediaKeyHandling,GlobalMediaControls,AudioServiceSandbox \
      --kiosk \
      --password-store=basic \
      --disable-save-password-bubble \
      --disable-translate \
      --disable-notifications \
      --disable-session-crashed-bubble \
      --disable-component-update \
      --check-for-update-interval=31536000 \
      --simulate-outdated-no-au="Tue, 31 Dec 2099 23:59:59 GMT" \
      --window-position=0,0 \
      --window-size=1920,1080 \
      --no-sandbox \
      --test-type \
      --noerrdialogs \
      --disable-infobars \
      --no-first-run \
      --no-default-browser-check \
      --fast-start \
      --disable-sync \
      --disable-default-apps \
      --disable-background-networking \
      --autoplay-policy=no-user-gesture-required \
      --enable-gpu-rasterization \
      --enable-zero-copy \
      --ignore-gpu-blocklist \
      --enable-accelerated-2d-canvas \
      --enable-quic \
      --enable-parallel-downloading \
      --disable-renderer-backgrounding \
      --disk-cache-dir=/tmp/chromium-cache \
      --disk-cache-size=268435456 \
      --load-extension="/opt/iristv/os/tv-nav-extension" \
      "http://127.0.0.1:3000" >/var/log/chromium.log 2>&1
    rc=$?
    boot_mark "cage (chromium) encerrou com codigo $rc"
    echo "[irisOS] Cage (chromium) encerrou com codigo $rc. Ultimos logs:" > /dev/tty1 2>/dev/null || true
    tail -n 10 /var/log/chromium.log > /dev/tty1 2>/dev/null || true
  fi
  sleep 1
done
