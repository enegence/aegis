#!/usr/bin/env python3
"""Render the favicons and app icons in web/public from the bird art.

The art is in web/public/brand (plain outlines, fixed colours). Large icons
use the paper bird; browser-tab sizes use the ink bird, because the cream
facets wash out at 16 and 32 pixels. Every icon sits on the blueprint paper
colour, which is also the manifest's background colour.

Needs cairosvg and Pillow:

    python3 -m venv .venv-icons
    .venv-icons/bin/pip install cairosvg pillow
    .venv-icons/bin/python scripts/render-icons.py

Run it again whenever the files in web/public/brand change, then commit the
PNG and ICO files it rewrites.
"""
import io
from pathlib import Path

import cairosvg
from PIL import Image

PUBLIC = Path(__file__).resolve().parent.parent / "web" / "public"
BRAND = PUBLIC / "brand"
GROUND = (0xDD, 0xE8, 0xF4, 255)  # blueprint paper

# (file, width / height of its viewBox)
PAPER_BIRD = ("bird.svg", 2112 / 1905)
INK_BIRD = ("bird-ink.svg", 2094 / 1908)


def icon(art, size, pad):
    """The bird centred on a square of the ground colour, `pad` of the side left clear on each edge."""
    name, aspect = art
    scale = 4 if size < 128 else 2  # draw large, then reduce, for clean edges
    side = size * scale
    width = round(side * (1 - 2 * pad))
    png = cairosvg.svg2png(url=str(BRAND / name), output_width=width, output_height=round(width / aspect))
    bird = Image.open(io.BytesIO(png)).convert("RGBA")
    canvas = Image.new("RGBA", (side, side), GROUND)
    canvas.alpha_composite(bird, ((side - bird.width) // 2, (side - bird.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main():
    icon(PAPER_BIRD, 512, 0.12).save(PUBLIC / "android-chrome-512x512.png", optimize=True)
    icon(PAPER_BIRD, 192, 0.12).save(PUBLIC / "android-chrome-192x192.png", optimize=True)
    icon(PAPER_BIRD, 180, 0.12).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    icon(INK_BIRD, 32, 0.04).save(PUBLIC / "favicon-32x32.png", optimize=True)
    icon(INK_BIRD, 16, 0.02).save(PUBLIC / "favicon-16x16.png", optimize=True)
    frames = [icon(INK_BIRD, size, 0.04 if size > 16 else 0.02) for size in (48, 32, 16)]
    frames[0].save(PUBLIC / "favicon.ico", format="ICO", append_images=frames[1:], sizes=[(48, 48), (32, 32), (16, 16)])
    print("Wrote 6 icon files to", PUBLIC)


if __name__ == "__main__":
    main()
