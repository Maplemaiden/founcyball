"""压缩比分牌 / 结算牌 JPG，减小加载体积。"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "assets" / "ui"
FILES = ["scoreboard-plaque.jpg", "result-plaque.jpg"]


def main() -> None:
    for name in FILES:
        path = ROOT / name
        if not path.exists():
            print("missing", name)
            continue
        before = path.stat().st_size
        im = Image.open(path).convert("RGB")
        # 屏上最多约 420px 宽，留 2x 即可
        max_w = 900 if "scoreboard" in name else 720
        if im.width > max_w:
            h = int(im.height * (max_w / im.width))
            im = im.resize((max_w, h), Image.Resampling.LANCZOS)
        im.save(path, "JPEG", quality=78, optimize=True)
        after = path.stat().st_size
        print(f"{name}: {before} -> {after} ({im.size[0]}x{im.size[1]})")


if __name__ == "__main__":
    main()
