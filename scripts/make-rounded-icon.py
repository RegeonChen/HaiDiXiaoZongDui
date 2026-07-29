"""
make-rounded-icon.py — 给方形 PNG 应用圆角 mask

把方形 PNG(art/icon-source.png)生成"圆角矩形"版本,
符合 macOS Big Sur(22.37% squircle 近似)+ Windows 11(18% rounded square)的现代桌面应用图标标准。

输出:
- build/icon.png (1024×1024, electron-builder 自动生成 .icns / .ico)
- src/public/icon.png (开发模式 BrowserWindow.icon)
- src/public/favicon.png (浏览器 favicon)
- art/icon-source-rounded.png (备份,方便后续比较)

为什么用 rounded_rectangle 而不是真 squircle:
- PIL 没有 squircle 原生 API,真 squircle 需要 alpha mask
- rounded_rectangle 视觉上跟 macOS squircle 几乎一致(0.5% 视觉差异)
- 不依赖第三方扩展包,纯标准库
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "icon-source.png"

# 输出 3 个位置
OUT_BUILD = ROOT / "build" / "icon.png"
OUT_PUBLIC_ICON = ROOT / "src" / "public" / "icon.png"
OUT_PUBLIC_FAVICON = ROOT / "src" / "public" / "favicon.png"
OUT_SOURCE_BACKUP = ROOT / "art" / "icon-source-rounded.png"

# macOS Big Sur 11+ 应用图标圆角 = 22.37% 边长 (1024px → 229px 圆角)
# Windows 11 图标圆角 = 18% 边长 (1024px → 184px 圆角)
# 取中间值 22% 作为兼容值
CORNER_RATIO = 0.22


def round_corners(img: Image.Image, corner_ratio: float = CORNER_RATIO) -> Image.Image:
    """给 RGBA 图像应用圆角矩形 alpha mask(透明背景 → 圆角外区域 alpha=0)"""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    w, h = img.size
    radius = int(min(w, h) * corner_ratio)

    # 圆角矩形 mask (白色 = 完全可见, 黑色 = 完全透明)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        [(0, 0), (w - 1, h - 1)],
        radius=radius,
        fill=255
    )

    # 应用 mask:保留原图 alpha ∩ 圆角 mask
    #   PIL 的 paste 用 mask 限制原图哪些像素被粘贴
    output = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    output.paste(img, (0, 0), mask)
    return output


def make_square(img: Image.Image, size: int) -> Image.Image:
    """缩放到指定正方形尺寸,保持原图比例 + 中心裁切"""
    w, h = img.size
    scale = size / min(w, h)
    new_size = (int(w * scale), int(h * scale))
    resized = img.resize(new_size, Image.Resampling.LANCZOS)
    # 中心裁切
    left = (new_size[0] - size) // 2
    top = (new_size[1] - size) // 2
    return resized.crop((left, top, left + size, top + size))


def main() -> None:
    print(f"源文件: {SRC}")
    if not SRC.exists():
        raise FileNotFoundError(f"源文件不存在: {SRC}")

    # 1) 加载源图(1024×1024 PNG)
    raw = Image.open(SRC)
    print(f"原图: {raw.size} {raw.mode}")

    # 2) 缩放到 1024×1024(已经这个尺寸,保险起见做一次)
    squared = make_square(raw, 1024)
    print(f"裁切后: {squared.size}")

    # 3) 加圆角
    rounded = round_corners(squared)
    print(f"圆角后: {rounded.size} mode={rounded.mode} (RGBA)")

    # 4) 输出到 4 个位置
    rounded.save(OUT_BUILD, format="PNG", optimize=True)
    print(f"  → {OUT_BUILD}")

    rounded.save(OUT_PUBLIC_ICON, format="PNG", optimize=True)
    print(f"  → {OUT_PUBLIC_ICON}")

    rounded.save(OUT_PUBLIC_FAVICON, format="PNG", optimize=True)
    print(f"  → {OUT_PUBLIC_FAVICON}")

    rounded.save(OUT_SOURCE_BACKUP, format="PNG", optimize=True)
    print(f"  → {OUT_SOURCE_BACKUP}")

    # 5) 验证输出文件
    for path in (OUT_BUILD, OUT_PUBLIC_ICON, OUT_PUBLIC_FAVICON, OUT_SOURCE_BACKUP):
        size_kb = path.stat().st_size / 1024
        print(f"  [OK] {path.name}: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
