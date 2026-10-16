"""Shrink the generated moment posters to the size the map actually draws them at.

    python scripts/moments/shrink.py

Higgsfield hands back ~4MB PNGs at 1536x2048; the widest the map ever draws a poster is ~340 CSS
px, so a 1024px-wide JPEG at quality 84 (~150KB) is more than a 2x screen can use. Each PNG in
public/moments/ is converted to <slug>.jpg, the PNG is moved to scripts/moments/originals/ (kept
out of git), and the manifest's `file` is pointed at the JPEG so the map and the generator both
see the new name. Safe to run again: a moment already on a JPEG is left alone.

generate.mjs runs this itself at the end of a run; it is here on its own for a checkout where a
PNG was dropped in by hand.
"""
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "moments"
KEEP = ROOT / "scripts" / "moments" / "originals"
WIDTH = 1024
QUALITY = 84


def main() -> None:
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf8")) if manifest_path.exists() else {}
    KEEP.mkdir(parents=True, exist_ok=True)
    done = 0
    for png in sorted(OUT.glob("*.png")):
        slug = png.stem
        jpg = OUT / f"{slug}.jpg"
        with Image.open(png) as im:
            im = im.convert("RGB")
            if im.width > WIDTH:
                im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
            im.save(jpg, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        shutil.move(str(png), str(KEEP / png.name))
        if slug in manifest:
            manifest[slug]["file"] = f"moments/{slug}.jpg"
        print(f"shrunk {slug}: {png.name} -> {jpg.name} ({jpg.stat().st_size // 1024} KB)")
        done += 1
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", "utf8")
    print(f"{done} shrunk; manifest: {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
