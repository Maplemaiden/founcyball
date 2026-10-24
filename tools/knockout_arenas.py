"""抠掉球场插画外圈浅色底，输出不规则透明 PNG。"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "assets" / "arenas"
IDS = [
    "dirt",
    "alley",
    "park",
    "county",
    "city",
    "metro",
    "pro",
    "elite",
    "champ",
    "legend",
]


def is_bg(r: int, g: int, b: int) -> bool:
    chroma = max(r, g, b) - min(r, g, b)
    # 近白 / 浅灰工作室（生成图常见 200+ 灰底）
    if min(r, g, b) >= 198 and chroma <= 28:
        return True
    # 奶油米 / 暖米色
    if r >= 235 and g >= 210 and b >= 190 and chroma <= 55:
        return True
    # 浅粉 / 腮红底
    if r >= 220 and g >= 175 and b >= 180 and r >= g - 5 and (r + g + b) >= 590:
        return True
    # 浅绿灰
    if min(r, g, b) >= 190 and abs(r - g) <= 35 and abs(g - b) <= 40 and chroma <= 40:
        return True
    return False


def flood_bg_to_alpha(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    pix = im.load()
    visited = [[False] * w for _ in range(h)]
    seeds = [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (w // 2, h - 1),
        (0, h // 2),
        (w - 1, h // 2),
        (w // 4, 0),
        (3 * w // 4, 0),
        (w // 4, h - 1),
        (3 * w // 4, h - 1),
    ]
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        r, g, b, a = pix[x, y]
        visited[y][x] = True
        if not is_bg(r, g, b):
            continue
        pix[x, y] = (r, g, b, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # 边缘半透明柔化：邻近透明的浅色再抠一层
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a == 0 or not is_bg(r, g, b):
                continue
            near = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and pix[nx, ny][3] == 0:
                    near = True
                    break
            if near:
                pix[x, y] = (r, g, b, 0)
    return im


def content_bbox(im: Image.Image, alpha_min: int = 10):
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
    pad = 8
    return (
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + 1 + pad),
        min(h, maxy + 1 + pad),
    )


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for rid in IDS:
        src = ROOT / f"{rid}.src.jpg"
        if not src.exists():
            alt = ROOT / f"{rid}.jpg"
            src = alt if alt.exists() else src
        if not src.exists():
            print("skip missing", rid)
            continue
        im = Image.open(src)
        out = flood_bg_to_alpha(im)
        out = out.crop(content_bbox(out))
        dest = ROOT / f"{rid}.png"
        out.save(dest, "PNG", optimize=True)
        print("wrote", dest.name, out.size)


if __name__ == "__main__":
    main()
