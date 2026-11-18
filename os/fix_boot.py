#!/usr/bin/env python3
import subprocess
import tempfile
import os
import shutil
import tarfile
from pathlib import Path

BASE_DIR = Path("/Users/macosx/Downloads/irisoS")
OS_DIR = BASE_DIR / "os"
ROOTFS_DIR = OS_DIR / "rootfs"
ISO_STAGE_DIR = OS_DIR / "iso_stage"
USB_VOL = Path("/Volumes/IRISOS")

print("=== [1/4] Atualizando irisTV.apkovl.tar.gz com sistema completo ===")
APKOVL_OUT = OS_DIR / "irisTV.apkovl.tar.gz"
if APKOVL_OUT.exists():
    APKOVL_OUT.unlink()

# REMOVE .default_boot_services para OpenRC NÃO injetar hwdrivers
def_boot = ROOTFS_DIR / "etc" / ".default_boot_services"
if def_boot.exists():
    def_boot.unlink()
    print("  [✓] Removido etc/.default_boot_services (evita quebra do KMS/framebuffer)")

(ROOTFS_DIR / "var" / "log").mkdir(parents=True, exist_ok=True)

# Filtro para ignorar lib/modules e lib/firmware (ficam no modloop-lts de 154MB)
def filter_tar(tarinfo):
    name = tarinfo.name
    if name.startswith("lib/modules") or name.startswith("lib/firmware"):
        return None
    if name == "etc/.default_boot_services":
        return None
    return tarinfo

folders_to_pack = [
    "bin",
    "sbin",
    "etc",
    "lib",
    "var",
    "opt/iristv",
    "usr/share/plymouth/themes/irisos"
]

with tarfile.open(APKOVL_OUT, "w:gz") as tar:
    for folder in folders_to_pack:
        full = ROOTFS_DIR / folder
        if full.exists() or full.is_symlink():
            tar.add(full, arcname=folder, filter=filter_tar)
            print(f"  + apkovl: {folder}")
        else:
            print(f"  - aviso: {folder} não encontrado")

apkovl_size_mb = APKOVL_OUT.stat().st_size / (1024 * 1024)
print(f"  [✓] apkovl gerado com sucesso: {apkovl_size_mb:.2f} MB")

print("\n=== [2/4] Descompactando e corrigindo initramfs-lts ===")
initrd_src = ISO_STAGE_DIR / "boot" / "initramfs-lts"

with tempfile.TemporaryDirectory() as tmp_dir:
    tmp = Path(tmp_dir)
    subprocess.run(f"gzip -dc '{initrd_src}' | (cd '{tmp}' && cpio -id 2>/dev/null)", shell=True, check=True)
    
    init_file = tmp / "init"
    content = init_file.read_text(encoding="utf-8")
    
    # 1. Habilita --allow-untrusted
    if 'apkflags="--initramfs-diskless-boot --progress"' in content:
        content = content.replace(
            'apkflags="--initramfs-diskless-boot --progress"',
            'apkflags="--initramfs-diskless-boot --progress --allow-untrusted"'
        )
        print("  [✓] apkflags recebeu --allow-untrusted")
        
    # 2. Injeta fallback para garantir /sbin/init e libc
    target = 'if [ ! -x "${sysroot}${KOPT_init}" ]; then'
    fallback = '''# === irisOS Bulletproof Boot Fallback ===
mkdir -p "${sysroot}/var/log" "${sysroot}/tmp" "${sysroot}/run" "${sysroot}/dev" "${sysroot}/dev/pts" "${sysroot}/dev/shm" 2>/dev/null || true

if [ ! -x "${sysroot}${KOPT_init}" ] || [ ! -e "${sysroot}/lib/ld-musl-x86_64.so.1" ]; then
	echo "  [irisOS] Ativando fallback de inicialização (/sbin/init + musl libc)..."
	mkdir -p "${sysroot}/bin" "${sysroot}/sbin" "${sysroot}/lib" "${sysroot}/usr/bin" "${sysroot}/usr/sbin"
	cp -a /bin/* "${sysroot}/bin/" 2>/dev/null || true
	cp -a /sbin/* "${sysroot}/sbin/" 2>/dev/null || true
	cp -a /lib/* "${sysroot}/lib/" 2>/dev/null || true
	chmod -R 755 "${sysroot}/bin" "${sysroot}/sbin" 2>/dev/null || true
	[ ! -e "${sysroot}/sbin/init" ] && ln -sf /bin/busybox "${sysroot}/sbin/init"
	[ ! -e "${sysroot}/bin/sh" ] && ln -sf /bin/busybox "${sysroot}/bin/sh"
	[ ! -e "${sysroot}/lib/ld-musl-x86_64.so.1" ] && [ -e /lib/ld-musl-x86_64.so.1 ] && cp -a /lib/ld-musl* "${sysroot}/lib/" 2>/dev/null || true
	[ ! -e "${sysroot}/lib/libc.musl-x86_64.so.1" ] && [ -e "${sysroot}/lib/ld-musl-x86_64.so.1" ] && ln -sf ld-musl-x86_64.so.1 "${sysroot}/lib/libc.musl-x86_64.so.1" 2>/dev/null || true
fi

if [ ! -x "${sysroot}${KOPT_init}" ]; then'''

    if target in content and "irisOS Bulletproof Boot Fallback" not in content:
        content = content.replace(target, fallback, 1)
        print("  [✓] Injetado bloco de segurança antes do switch_root")
    elif "irisOS Bulletproof Boot Fallback" in content:
        print("  [✓] Bloco de segurança já estava injetado")

    init_file.write_text(content, encoding="utf-8")
    init_file.chmod(0o755)

    print("\n=== [3/4] Reempacotando novo initramfs-lts ===")
    new_initrd = ISO_STAGE_DIR / "boot" / "initramfs-lts"
    subprocess.run(
        f"(cd '{tmp}' && find . | cpio -o -H newc 2>/dev/null | gzip -9) > '{new_initrd}'",
        shell=True,
        check=True
    )
    print(f"  [✓] initramfs-lts regerado em iso_stage: {new_initrd.stat().st_size / (1024*1024):.2f} MB")

# Atualiza iso_stage apkovl
shutil.copy2(APKOVL_OUT, ISO_STAGE_DIR / "irisTV.apkovl.tar.gz")

print("\n=== [4/4] Gravando alterações no pendrive /Volumes/IRISOS ===")
if USB_VOL.exists():
    usb_boot = USB_VOL / "boot"
    usb_boot.mkdir(parents=True, exist_ok=True)
    
    print("  -> Copiando initramfs-lts corrigido...")
    shutil.copy2(new_initrd, usb_boot / "initramfs-lts")
    
    print("  -> Copiando irisTV.apkovl.tar.gz completo...")
    shutil.copy2(APKOVL_OUT, USB_VOL / "irisTV.apkovl.tar.gz")
    
    # Remove arquivos residuais de metadados do macOS (._*) ignorando .Spotlight-V100
    print("  -> Limpando metadados residuais do macOS (._*)...")
    for sub in ["boot", "apks", "efi"]:
        sub_dir = USB_VOL / sub
        if sub_dir.exists():
            subprocess.run(["dot_clean", "-m", str(sub_dir)], check=False, stderr=subprocess.DEVNULL)
    for hidden in USB_VOL.rglob("._*"):
        try: hidden.unlink()
        except: pass
        
    print("  -> Sincronizando buffers de disco (sync)...")
    subprocess.run(["sync"], check=True)
    print("  [✓] Pendrive /Volumes/IRISOS 100% atualizado e seguro!")
else:
    print("  [!] /Volumes/IRISOS não montado no momento. Arquivos salvos em os/iso_stage/.")

print("\n========================================================")
print("  CORREÇÃO DO BOOT LINUX CONCLUÍDA COM SUCESSO!")
print("========================================================")
