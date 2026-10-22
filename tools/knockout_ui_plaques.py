"""抠掉比分牌 / 结算牌外圈背景，输出透明 PNG。

结算牌板面几乎和夜景一样黑，不能按「够黑就抠」。
做法：先识别金色描边当墙，从边缘洪水填充墙外区域为透明。
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "assets" / "ui"


def lum(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def sat(r: int, g: int, b: int) -> int:
    return max(r, g, b) - min(r, g, b)


def is_goldish(r: int, g: int, b: int) -> bool:
    L = lum(r, g, b)
    S = sat(r, g, b)
    if r >= 85 and g >= 55 and r >= b - 5 and S >= 22 and L >= 50:
        return True
    if L >= 110 and S >= 18 and r >= g - 5 and r >= b:
        return True
    # 比分牌左右蓝/红条也当「墙」，防止从侧面漏进中心黑窗
    if b > r + 25 and b > g + 10 and L > 40:
        return True
    if r > g + 25 and r > b + 15 and L > 45:
        return True
    return False


def is_green_panel(r: int, g: int, b: int) -> bool:
    """比分牌深绿板面（有绿偏色），不是灰棋盘。"""
    L = lum(r, g, b)
    S = sat(r, g, b)
    return g >= r + 4 and g >= b + 2 and L >= 28 and S >= 8


def build_wall_mask(im: Image.Image, dilate: int = 2) -> Image.Image:
    w, h = im.size
    px = im.load()
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if is_goldish(r, g, b) or is_green_panel(r, g, b):
                mp[x, y] = 255
    if dilate > 0:
        for _ in range(dilate):
            mask = mask.filter(ImageFilter.MaxFilter(3))
    return mask


def flood_outside_walls(im: Image.Image, wall: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    pix = im.load()
    wp = wall.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        if wp[x, y] >= 128:
            continue
        r, g, b, _a = pix[x, y]
        pix[x, y] = (r, g, b, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def keep_largest_opaque(im: Image.Image, alpha_min: int = 40) -> Image.Image:
    w, h = im.size
    pix = im.load()
    seen = [[False] * w for _ in range(h)]
    best: list[tuple[int, int]] = []

    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or pix[x0, y0][3] < alpha_min:
                continue
            comp: list[tuple[int, int]] = []
            q: deque[tuple[int, int]] = deque([(x0, y0)])
            seen[y0][x0] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or seen[ny][nx]:
                        continue
                    if pix[nx, ny][3] < alpha_min:
                        continue
                    seen[ny][nx] = True
                    q.append((nx, ny))
            if len(comp) > len(best):
                best = comp

    keep = set(best)
    for y in range(h):
        for x in range(w):
            if (x, y) not in keep and pix[x, y][3] > 0:
                r, g, b, _a = pix[x, y]
                pix[x, y] = (r, g, b, 0)
    return im


def feather_edge(im: Image.Image, radius: int = 1) -> Image.Image:
    w, h = im.size
    pix = im.load()
    src = im.copy().load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            clear = 0
            total = 0
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    nx, ny = x + dx, y + dy
                    total += 1
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or src[nx, ny][3] < 20:
                        clear += 1
            if clear:
                factor = 1 - 0.5 * (clear / total)
                pix[x, y] = (r, g, b, max(0, int(a * factor)))
    return im


def tight_crop(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def process(name: str, dilate: int = 2) -> None:
    src = ROOT / f"{name}.jpg"
    out = ROOT / f"{name}.png"
    rgb = Image.open(src).convert("RGB")
    wall = build_wall_mask(rgb, dilate=dilate)
    im = flood_outside_walls(rgb, wall)
    im = keep_largest_opaque(im)
    im = feather_edge(im, 1)
    im = tight_crop(im, 6)
    im.save(out, "PNG", optimize=True)
    px = im.load()
    w, h = im.size
    a0 = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    print(f"OK {out.name} {im.size} bytes={out.stat().st_size} transparent={a0} ({a0 / (w * h):.1%})")


def main() -> None:
    process("scoreboard-plaque", dilate=2)
    process("result-plaque", dilate=3)


if __name__ == "__main__":
    main()
