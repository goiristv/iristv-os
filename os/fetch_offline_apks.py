#!/usr/bin/env python3
import urllib.request
import tarfile
import re
import os
import shutil
from pathlib import Path

BASE_URL = "https://dl-cdn.alpinelinux.org/alpine/v3.20"
ARCH = "x86_64"
MAIN_INDEX = f"{BASE_URL}/main/{ARCH}/APKINDEX.tar.gz"
COMMUNITY_INDEX = f"{BASE_URL}/community/{ARCH}/APKINDEX.tar.gz"

CACHE_DIR = Path("/Users/macosx/Downloads/irisoS/os/.cache/apk_repo")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Parse APKINDEX
def fetch_and_parse_index(url, repo_name):
    index_tar = CACHE_DIR / f"APKINDEX_{repo_name}.tar.gz"
    if not index_tar.exists():
        print(f"Baixando APKINDEX {repo_name}...")
        req = urllib.request.Request(url, headers={"User-Agent": "irisOS/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(index_tar, "wb") as f:
            shutil.copyfileobj(resp, f)
    
    packages = {}
    with tarfile.open(index_tar, "r:gz") as tar:
        member = tar.extractfile("APKINDEX")
        content = member.read().decode("utf-8", errors="ignore")
    
    blocks = content.strip().split("\n\n")
    for block in blocks:
        pkg = {}
        for line in block.split("\n"):
            if not line: continue
            k, v = line[0], line[2:]
            if k == 'P': pkg['name'] = v
            elif k == 'V': pkg['version'] = v
            elif k == 'D': pkg['deps'] = v.split()
            elif k == 'p': pkg['provides'] = v.split()
        if 'name' in pkg:
            pkg['repo'] = repo_name
            pkg['file'] = f"{pkg['name']}-{pkg['version']}.apk"
            packages[pkg['name']] = pkg
            # map provides
            for prov in pkg.get('provides', []):
                prov_name = re.split(r'[=<>~]', prov)[0]
                if prov_name not in packages:
                    packages[prov_name] = pkg
    return packages

print("Carregando repositórios...")
main_pkgs = fetch_and_parse_index(MAIN_INDEX, "main")
comm_pkgs = fetch_and_parse_index(COMMUNITY_INDEX, "community")

all_pkgs = {}
all_pkgs.update(main_pkgs)
all_pkgs.update(comm_pkgs)

# Target top-level packages
TARGETS = [
    "nodejs",
    "wpewebkit",
    "cog",
    "libwpe",
    "libwpebackend-fdo",
    "chromium",
    "cage",
    "ffmpeg",
    "wlr-randr",
    "wtype",
    "pulseaudio",
    "pulseaudio-utils",
    "alsa-utils",
    "alsa-lib",
    "font-noto",
    "dbus",
    "mesa-dri-gallium",
    "mesa-va-gallium",
    "libva-intel-driver",
    "wpa_supplicant",
    "wireless-tools",
    "iw",
    "iproute2",
    "udev",
    "eudev",
    "libcec"
]

resolved = set()
to_resolve = list(TARGETS)

while to_resolve:
    target = to_resolve.pop(0)
    # clean version constraints e.g. so:libfoo.so.1 or foo>=1.0
    clean_target = re.split(r'[=<>~]', target)[0]
    
    if clean_target in resolved:
        continue
    
    pkg = all_pkgs.get(clean_target)
    if not pkg:
        # maybe target starts with cmd: or so:
        continue
    
    real_name = pkg['name']
    if real_name in resolved:
        continue
    resolved.add(real_name)
    
    for dep in pkg.get('deps', []):
        clean_dep = re.split(r'[=<>~]', dep)[0]
        if clean_dep.startswith("!"):
            continue
        to_resolve.append(clean_dep)

print(f"Total de pacotes resolvidos com todas as dependências: {len(resolved)}")

DOWNLOAD_DIR = CACHE_DIR / "packages"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Baixa cada um
download_count = 0
for pkg_name in sorted(resolved):
    pkg = all_pkgs[pkg_name]
    apk_file = pkg['file']
    dest = DOWNLOAD_DIR / apk_file
    url = f"{BASE_URL}/{pkg['repo']}/{ARCH}/{apk_file}"
    if not dest.exists():
        print(f"Baixando ({download_count+1}/{len(resolved)}) {apk_file}...")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "irisOS/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(dest, "wb") as f:
                shutil.copyfileobj(resp, f)
        except Exception as e:
            print(f"Erro ao baixar {url}: {e}")
    download_count += 1

print("Todos os pacotes foram baixados com sucesso para o cache!")

