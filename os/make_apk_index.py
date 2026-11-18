#!/usr/bin/env python3
import gzip
import tarfile
from pathlib import Path

REPO_DIR = Path("/Users/macosx/Downloads/irisoS/os/.cache/apk_repo/packages")
INDEX_TAR = REPO_DIR / "APKINDEX.tar.gz"

# Gera o arquivo APKINDEX baseado em cada arquivo .apk
entries = []
for apk_path in sorted(REPO_DIR.glob("*.apk")):
    try:
        with tarfile.open(apk_path, "r:gz") as tar:
            for member in tar.getmembers():
                if member.name == ".PKGINFO":
                    f = tar.extractfile(member)
                    lines = f.read().decode("utf-8", errors="ignore").splitlines()
                    pkginfo = {}
                    deps = []
                    provides = []
                    for line in lines:
                        if not line or line.startswith("#"): continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip()
                            if k == "pkgname": pkginfo["P"] = v
                            elif k == "pkgver": pkginfo["V"] = v
                            elif k == "pkgdesc": pkginfo["T"] = v
                            elif k == "url": pkginfo["U"] = v
                            elif k == "size": pkginfo["I"] = v
                            elif k == "depend": deps.append(v)
                            elif k == "provides": provides.append(v)
                    
                    block = [
                        f"P:{pkginfo.get('P', '')}",
                        f"V:{pkginfo.get('V', '')}",
                        f"T:{pkginfo.get('T', '')}",
                        f"U:{pkginfo.get('U', '')}",
                        f"S:{apk_path.stat().st_size}",
                        f"I:{pkginfo.get('I', '0')}"
                    ]
                    if deps: block.append(f"D:{' '.join(deps)}")
                    if provides: block.append(f"p:{' '.join(provides)}")
                    entries.append("\n".join(block))
                    break
    except Exception as e:
        print(f"Erro ao ler {apk_path.name}: {e}")

index_data = ("\n\n".join(entries) + "\n\n").encode("utf-8")

# Salva APKINDEX
raw_index = REPO_DIR / "APKINDEX"
raw_index.write_bytes(index_data)

# Cria APKINDEX.tar.gz
with tarfile.open(INDEX_TAR, "w:gz") as tar:
    tar.add(raw_index, arcname="APKINDEX")

print(f"APKINDEX gerado com sucesso para {len(entries)} pacotes!")

