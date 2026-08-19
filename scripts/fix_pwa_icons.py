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
        description="Build clean RGBA PWA icons from the verified Family brand artwork."
    )
    parser.add_argument(
        "--icons-dir",
        default="public/icons",
        help="Output directory for generated PWA icons.",
    )
    parser.add_argument(
        "--source-logo",
        default="public/brand/sila-approved-v4.jpg",
        help="Verified source artwork used to rebuild all PWA icons.",
    )
    return parser.parse_args()


def require_file(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"Required source not found: {path}")


def load_verified_source(path: Path) -> Image.Image:
    require_file(path)
    with Image.open(path) as image:
        image.load()
        rgba = image.convert("RGBA")
    if rgba.width <= 0 or rgba.height <= 0:
        raise ValueError(f"Invalid source artwork dimensions: {rgba.size}")
    print(f"[OK] source artwork: {path} / {rgba.mode} / {rgba.size[0]}x{rgba.size[1]}")
    return rgba


def fit_square(source: Image.Image, size: int) -> Image.Image:
    # The approved artwork is square; this also handles any future non-square source safely.
    side = min(source.size)
    left = (source.width - side) // 2
    top = (source.height - side) // 2
    cropped = source.crop((left, top, left + side, top + side))
    return cropped.resize((size, size), Image.Resampling.LANCZOS)


def save_rgba_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(path, format="PNG", optimize=True)


def rebuild_icons(source_logo: Path, icons_dir: Path) -> None:
    source = load_verified_source(source_logo)

    icon_192 = fit_square(source, 192)
    icon_512 = fit_square(source, 512)

    save_rgba_png(icon_192, icons_dir / "icon-192.png")
    save_rgba_png(icon_512, icons_dir / "icon-512.png")
    save_rgba_png(icon_192, icons_dir / "apple-touch-icon.png")

    canvas_size = 512
    content_size = round(canvas_size * MASKABLE_CONTENT_RATIO)
    safe_logo = fit_square(source, content_size)
    canvas = Image.new(
        "RGBA",
        (canvas_size, canvas_size),
        ImageColor.getcolor(BACKGROUND, "RGBA"),
    )
    offset = (canvas_size - content_size) // 2
    canvas.alpha_composite(safe_logo, (offset, offset))
    save_rgba_png(canvas, icons_dir / "maskable-512.png")


def validate(path: Path, expected_size: tuple[int, int]) -> None:
    require_file(path)

    with Image.open(path) as image:
        image.verify()

    with Image.open(path) as image:
        image.load()
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
    source_logo = Path(args.source_logo).resolve()

    print(f"Rebuilding PWA icons in: {icons_dir}")
    rebuild_icons(source_logo, icons_dir)

    for name, size in EXPECTED.items():
        validate(icons_dir / name, size)
    validate(icons_dir / "apple-touch-icon.png", (192, 192))

    regular = (icons_dir / "icon-512.png").read_bytes()
    maskable = (icons_dir / "maskable-512.png").read_bytes()
    if regular == maskable:
        raise ValueError("maskable-512.png must not be identical to icon-512.png")

    content_size = round(512 * MASKABLE_CONTENT_RATIO)
    padding = (512 - content_size) // 2
    print(
        f"[OK] maskable safe zone: logo={content_size}x{content_size}, "
        f"padding={padding}px per side, background={BACKGROUND}"
    )
    print("PWA icons rebuilt successfully from verified artwork.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"PWA icon conversion failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
