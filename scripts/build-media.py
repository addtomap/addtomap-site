#!/usr/bin/env python3
"""build-media.py — derive the light web versions of the site's media from the originals.

    python3 scripts/build-media.py        # (re)builds whatever is missing or older than its source

Originals stay in the repo (JPEG covers are also the og:image for link previews):
  img/<tour>.jpg               → img/<tour>_card.webp   960×504, the 200 px-high card crop (2× density)
                               → img/<tour>_cover.webp  ≤1200 px wide, 3:2, the tour page cover
  img/screen-*_<lang>.jpg      → same name .webp          localized app screenshots
  img/hero_poster_<lang>.jpg   → same name .webp          hero poster
  video/hero_<lang>.mp4        → video/hero_<lang>_s.mp4  400 px wide for phones (the 600 px loop stays for desktop)
Needs Pillow (WebP) and ffmpeg.
"""
import pathlib, re, subprocess
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG, VIDEO = ROOT / "img", ROOT / "video"
COVERS = ["frankfurt", "venice", "barcelona", "rome-ancient", "rome-baroque", "paris-cite", "paris-louvre"]


def stale(src, dst):
    return not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime


def crop_to(im, aspect):
    """Center crop to width/height = aspect."""
    w, h = im.size
    if w / h > aspect:
        nw = round(h * aspect); x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / aspect); y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def webp(im, dst, quality):
    im.convert("RGB").save(dst, "WEBP", quality=quality, method=6)
    print(f"{dst.relative_to(ROOT)}: {im.size[0]}×{im.size[1]}, {dst.stat().st_size // 1024} KB")


for name in COVERS:
    src = IMG / f"{name}.jpg"
    card, cover = IMG / f"{name}_card.webp", IMG / f"{name}_cover.webp"
    if stale(src, card):
        webp(crop_to(Image.open(src), 960 / 504).resize((960, 504), Image.LANCZOS), card, 76)
    if stale(src, cover):
        im = crop_to(Image.open(src), 3 / 2)
        if im.size[0] > 1200:
            im = im.resize((1200, 800), Image.LANCZOS)
        webp(im, cover, 80)

for src in sorted(IMG.glob("*.jpg")):
    if re.fullmatch(r"(screen-(home|tour|map|photo)|hero_poster)_[a-z]{2}\.jpg", src.name):
        dst = src.with_suffix(".webp")
        if stale(src, dst):
            webp(Image.open(src), dst, 80)

for src in sorted(VIDEO.glob("hero_??.mp4")):
    dst = src.with_name(src.stem + "_s.mp4")
    if stale(src, dst):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "scale=400:-2:flags=lanczos", "-an",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "31", "-preset", "slow",
                        "-movflags", "+faststart", str(dst)], check=True)
        print(f"{dst.relative_to(ROOT)}: {dst.stat().st_size // 1024} KB")
