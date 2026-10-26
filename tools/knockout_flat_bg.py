"""边缘连通域抠掉近似纯色外底 → 透明 WebP（scipy 加速）。"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]


def knockout_border_bg(im: Image.Image, tol: int = 36) -> Image.Image:
    rgba = np.asarray(im.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    h, w = rgb.shape[:2]

    border = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]],
        axis=0,
    )
    mean = border.mean(axis=0)
    diff = np.max(np.abs(rgb - mean.reshape(1, 1, 3)), axis=2)
    near = diff <= tol

    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool)
    labeled, nlab = ndimage.label(near, structure=structure)
    if nlab == 0:
        return Image.fromarray(rgba, "RGBA")

    edge_labels = set()
    edge_labels.update(labeled[0, :].tolist())
    edge_labels.update(labeled[-1, :].tolist())
    edge_labels.update(labeled[:, 0].tolist())
    edge_labels.update(labeled[:, -1].tolist())
    edge_labels.discard(0)

    kill = np.isin(labeled, list(edge_labels))
    # 硬抠
    rgba[kill, 3] = 0
    # 邻接一圈浅边半透明
    dil = ndimage.binary_dilation(kill, iterations=1)
    fringe = dil & ~kill
    soft = fringe & (diff <= tol + 12)
    rgba[soft, 3] = np.minimum(rgba[soft, 3], 90)

    return Image.fromarray(rgba, "RGBA")


def save_square_icon(im: Image.Image, out: Path, size: int = 128) -> None:
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    pad = 10
    side = max(im.size) + pad * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
    canvas = canvas.resize((size, size), Image.Resampling.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "WEBP", quality=86, method=6)
    print(f"icon {out.name}: corner={canvas.getpixel((0, 0))} bytes={out.stat().st_size}")


def process_docks() -> None:
    src_dir = Path(
        r"C:\Users\yoimi\.cursor\projects\c-Users-yoimi-Desktop-myGame-founcyball\assets"
    )
    dst = ROOT / "assets" / "ui"
    for name in ("dock-train", "dock-roster", "dock-home", "dock-skills", "dock-market"):
        src = src_dir / f"{name}.jpg"
        if not src.exists():
            src = dst / f"{name}.webp"
        im = knockout_border_bg(Image.open(src), tol=46)
        save_square_icon(im, dst / f"{name}.webp", 128)


def process_arenas() -> None:
    ar = ROOT / "assets" / "arenas"
    ids = [
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
    for i in ids:
        src = ar / f"{i}.png"
        if not src.exists():
            src = ar / f"{i}.webp"
        raw = Image.open(src)
        w, h = raw.size
        m = max(w, h)
        if m > 1200:
            sc = 1200 / m
            raw = raw.resize((int(w * sc), int(h * sc)), Image.Resampling.LANCZOS)
        im = knockout_border_bg(raw, tol=28)
        bbox = im.getbbox()
        if bbox:
            x0, y0, x1, y1 = bbox
            pad = 6
            im = im.crop(
                (
                    max(0, x0 - pad),
                    max(0, y0 - pad),
                    min(im.size[0], x1 + pad),
                    min(im.size[1], y1 + pad),
                )
            )
        # 再压长边
        w, h = im.size
        m = max(w, h)
        if m > 900:
            sc = 900 / m
            im = im.resize((int(w * sc), int(h * sc)), Image.Resampling.LANCZOS)
        out = ar / f"{i}.webp"
        im.save(out, "WEBP", quality=82, method=6)
        print(
            f"arena {i}: corner={im.getpixel((0, 0))} kb={out.stat().st_size // 1024} size={im.size}"
        )


if __name__ == "__main__":
    process_docks()
    process_arenas()
