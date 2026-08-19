from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageColor

EXPECTED = {
    "icon-192.png": (192, 192),
    "icon-512.png": (512, 512),
    "maskable-512.png": (512, 512),
}

BACKGROUND = "#B77914"
MASKABLE_CONTENT_RATIO = 0.66


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert Family PWA icons to true RGBA PNGs and rebuild a safe-zone maskable icon."
    )
    parser.add_argument(
        "--icons-dir",
        default="icons",
        help="Directory containing icon-192.png and icon-512.png (default: icons)",
    )
    return parser.parse_args()


def require_file(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"Required icon not found: {path}")


def save_true_rgba(source_path: Path, expected_size: tuple[int, int]) -> None:
    require_file(source_path)

    with Image.open(source_path) as source:
        source.load()
        if source.size != expected_size:
            raise ValueError(
                f"{source_path.name}: expected {expected_size[0]}x{expected_size[1]}, "
                f"found {source.size[0]}x{source.size[1]}"
            )
        rgba = source.convert("RGBA")

    rgba.save(source_path, format="PNG", optimize=True)


def rebuild_maskable(icon_512: Path, maskable_path: Path) -> None:
    with Image.open(icon_512) as source:
        source.load()
        source = source.convert("RGBA")

    canvas_size = 512
    content_size = round(canvas_size * MASKABLE_CONTENT_RATIO)
    logo = source.resize((content_size, content_size), Image.Resampling.LANCZOS)

    canvas = Image.new(
        "RGBA",
        (canvas_size, canvas_size),
        ImageColor.getcolor(BACKGROUND, "RGBA"),
    )

    offset = (canvas_size - content_size) // 2
    canvas.alpha_composite(logo, (offset, offset))
    canvas.save(maskable_path, format="PNG", optimize=True)


def sync_apple_touch(icon_192: Path, apple_touch: Path) -> None:
    with Image.open(icon_192) as source:
        source.load()
        rgba = source.convert("RGBA")
    rgba.save(apple_touch, format="PNG", optimize=True)


def validate(path: Path, expected_size: tuple[int, int]) -> None:
    require_file(path)

    with Image.open(path) as image:
        image.verify()

    with Image.open(path) as image:
        if image.format != "PNG":
            raise ValueError(f"{path.name}: expected PNG, found {image.format}")
        if image.mode != "RGBA":
            raise ValueError(f"{path.name}: expected RGBA, found {image.mode}")
        if image.size != expected_size:
            raise ValueError(
                f"{path.name}: expected {expected_size[0]}x{expected_size[1]}, "
                f"found {image.size[0]}x{image.size[1]}"
            )

    print(f"[OK] {path}: PNG / RGBA / {expected_size[0]}x{expected_size[1]}")


def main() -> int:
    args = parse_args()
    icons_dir = Path(args.icons_dir).resolve()

    icon_192 = icons_dir / "icon-192.png"
    icon_512 = icons_dir / "icon-512.png"
    maskable_512 = icons_dir / "maskable-512.png"
    apple_touch = icons_dir / "apple-touch-icon.png"

    print(f"Fixing PWA icons in: {icons_dir}")

    save_true_rgba(icon_192, (192, 192))
    save_true_rgba(icon_512, (512, 512))
    rebuild_maskable(icon_512, maskable_512)
    sync_apple_touch(icon_192, apple_touch)

    for name, size in EXPECTED.items():
        validate(icons_dir / name, size)
    validate(apple_touch, (192, 192))

    content_size = round(512 * MASKABLE_CONTENT_RATIO)
    padding = (512 - content_size) // 2
    print(
        f"[OK] maskable safe zone: logo={content_size}x{content_size}, "
        f"padding={padding}px per side, background={BACKGROUND}"
    )
    print("PWA icon conversion completed successfully.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"PWA icon conversion failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
