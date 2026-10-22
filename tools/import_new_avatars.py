"""把生成的名宿大头抠白边、圆形化，输出 png + webp（与现有头像一致）。"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "avatars"
REF = OUT / "ref"

# GenerateImage 输出目录（Cursor 项目 assets）
SRC_DIR = Path(r"C:\Users\yoimi\.cursor\projects\c-Users-yoimi-Desktop-myGame-founcyball\assets")

IDS = {
    "shuiye": "shuiye-ref.jpg",
    "shengkaxi": "shengkaxi-ref.jpg",
    "qizu": "qizu-ref.jpg",
    "xiaoluo": "xiaoluo-ref.jpg",
    "xiaobai": "xiaobai-ref.jpg",
}


def flood_white_to_alpha(im: Image.Image, thr: int = 242, soft: int = 18) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    pix = im.load()
    visited = [[False] * w for _ in range(h)]
    stack = [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (w // 2, h - 1),
        (0, h // 2),
        (w - 1, h // 2),
    ]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        r, g, b, _a = pix[x, y]
        if min(r, g, b) < thr - soft:
            continue
        visited[y][x] = True
        m = min(r, g, b)
        alpha = 0 if m >= thr else int(255 * (thr - m) / soft)
        if alpha < 250:
            pix[x, y] = (r, g, b, alpha)
            stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def content_bbox(im: Image.Image, alpha_min: int = 8):
    w, h = im.size
    pix = im.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if pix[x, y][3] > alpha_min:
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    if maxx < 0:
        return (0, 0, w, h)
    return (minx, miny, maxx + 1, maxy + 1)


def circularize(im: Image.Image) -> Image.Image:
    bbox = content_bbox(im)
    cropped = im.crop(bbox)
    cw, ch = cropped.size
    side = int(max(cw, ch) * 1.02)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)

    mask = Image.new("L", (side, side), 0)
    mp = mask.load()
    cx = cy = (side - 1) / 2.0
    rad = side / 2.0 - 1.0
    soft = max(1.5, side * 0.012)
    for y in range(side):
        for x in range(side):
            d = math.hypot(x - cx, y - cy)
            if d <= rad - soft:
                mp[x, y] = 255
            elif d >= rad + soft:
                mp[x, y] = 0
            else:
                mp[x, y] = int(255 * (rad + soft - d) / (2 * soft))

    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(canvas, (0, 0))
    px = out.load()
    for y in range(side):
        for x in range(side):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, int(a * mp[x, y] / 255))
    return out.resize((512, 512), Image.Resampling.LANCZOS)


def main() -> None:
    REF.mkdir(parents=True, exist_ok=True)
    for pid, fname in IDS.items():
        src = SRC_DIR / fname
        if not src.exists():
            # 也试 png
            alt = SRC_DIR / fname.replace(".jpg", ".png")
            if alt.exists():
                src = alt
            else:
                print("missing", src)
                continue
        # 备份原图到 ref
        ref_path = REF / f"{pid}.jpg"
        shutil.copy2(src, ref_path)

        im = flood_white_to_alpha(Image.open(src))
        im = circularize(im)
        png = OUT / f"{pid}.png"
        webp = OUT / f"{pid}.webp"
        im.save(png, "PNG", optimize=True)
        small = im.resize((256, 256), Image.Resampling.LANCZOS)
        small.save(webp, "WEBP", quality=78, method=6)
        print(f"OK {pid} png={png.stat().st_size/1024:.1f}KB webp={webp.stat().st_size/1024:.1f}KB")


if __name__ == "__main__":
    main()
