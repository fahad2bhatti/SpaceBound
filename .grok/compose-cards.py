#!/usr/bin/env python3
"""SPACEBOUND share cards from public-domain NASA photography.

Image generation is unavailable in this session. The plates are a graded
STS night launch (KSC-00pp1804, Endeavour) with Apollo 11's Moon
(as11-44-6667) and Cassini Saturn (PIA06077). Title glyphs are drawn,
not generated.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

LAUNCH = "/workspace/.grok/nasa/launch-large.jpg"
MOON = "/workspace/.grok/nasa/moon.jpg"
SATURN = "/workspace/.grok/nasa/saturn.jpg"
FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf"

VOID = np.array([7, 9, 13], dtype=np.float32)
ICE = (142, 207, 255, 255)
FROST = (231, 238, 246, 255)
BURN = (232, 137, 58, 255)


def load_rgb(path: str) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def grade_launch(arr: np.ndarray) -> np.ndarray:
    """Gentle cool-shadow grade. Keep the white stack and orange plume intact."""
    lum = arr.mean(axis=2, keepdims=True)
    out = (arr - 4.0) * 1.05 + 3.0
    shadow = np.clip((30.0 - lum) / 30.0, 0.0, 1.0)
    out[..., 2] += shadow[..., 0] * 7.0
    return np.clip(out, 0, 255)


def vignette(arr: np.ndarray, strength: float = 0.45) -> np.ndarray:
    h, w = arr.shape[:2]
    y = np.linspace(-1, 1, h)[:, None]
    x = np.linspace(-1, 1, w)[None, :]
    d = np.clip(np.sqrt(x * x * 0.85 + y * y * 1.05), 0, 1)
    mask = 1.0 - strength * np.clip(d - 0.35, 0, 1) ** 1.4
    return np.clip(arr * mask[..., None], 0, 255)


def sky_tile(launch: np.ndarray, width: int, height: int) -> np.ndarray:
    band = launch[:48].copy()
    band = np.clip(band * 0.55 + VOID * 0.45, 0, 255)
    tile = np.resize(band, (height, band.shape[1], 3))
    img = Image.fromarray(tile.astype(np.uint8), "RGB").resize(
        (width, height), Image.Resampling.BILINEAR
    )
    img = img.filter(ImageFilter.GaussianBlur(radius=1.2))
    return np.asarray(img, dtype=np.float32)


def paste(canvas: np.ndarray, sprite: np.ndarray, x: int, y: int) -> None:
    h, w = sprite.shape[:2]
    H, W = canvas.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    sx0, sy0 = x0 - x, y0 - y
    canvas[y0:y1, x0:x1] = sprite[sy0 : sy0 + (y1 - y0), sx0 : sx0 + (x1 - x0)]


def place_launch(
    canvas: np.ndarray,
    launch: np.ndarray,
    scale: float,
    x: int,
    y: int,
    fade_left: int = 0,
    fade_top: int = 0,
    fade_right: int = 0,
) -> None:
    h, w = launch.shape[:2]
    sw, sh = int(round(w * scale)), int(round(h * scale))
    sprite = np.asarray(
        Image.fromarray(launch.astype(np.uint8), "RGB").resize(
            (sw, sh), Image.Resampling.LANCZOS
        ),
        dtype=np.float32,
    )
    alpha = np.ones((sh, sw), dtype=np.float32)
    if fade_left > 0:
        n = min(fade_left, sw)
        alpha[:, :n] *= np.linspace(0.0, 1.0, n, dtype=np.float32)[None, :]
    if fade_right > 0:
        n = min(fade_right, sw)
        alpha[:, sw - n :] *= np.linspace(1.0, 0.0, n, dtype=np.float32)[None, :]
    if fade_top > 0:
        n = min(fade_top, sh)
        alpha[:n, :] *= np.linspace(0.0, 1.0, n, dtype=np.float32)[:, None]

    H, W = canvas.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + sw), min(H, y + sh)
    if x0 >= x1 or y0 >= y1:
        return
    sx0, sy0 = x0 - x, y0 - y
    sx1, sy1 = sx0 + (x1 - x0), sy0 + (y1 - y0)
    src = sprite[sy0:sy1, sx0:sx1]
    a = alpha[sy0:sy1, sx0:sx1][..., None]
    dst = canvas[y0:y1, x0:x1]
    canvas[y0:y1, x0:x1] = src * a + dst * (1.0 - a)


def moon_sprite(diameter: int) -> Image.Image:
    moon = load_rgb(MOON)
    lum = moon.mean(axis=2)
    h, w = lum.shape
    work = lum.copy()
    work[:, int(w * 0.78) :] = 0
    ys, xs = np.where(work > 28)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = side * 0.48
    crop = moon[
        int(cy - half) : int(cy + half),
        int(cx - half) : int(cx + half),
    ]
    img = Image.fromarray(crop.astype(np.uint8), "RGB").resize(
        (diameter, diameter), Image.Resampling.LANCZOS
    )
    mask = Image.new("L", (diameter, diameter), 0)
    ImageDraw.Draw(mask).ellipse((1, 1, diameter - 2, diameter - 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.4))
    rgba = img.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def saturn_sprite(width: int) -> Image.Image:
    sat = load_rgb(SATURN)
    lum = sat.max(axis=2)
    alpha = np.clip((lum - 5.0) / 22.0, 0, 1)
    ys, xs = np.where(alpha > 0.12)
    pad = 4
    y0, y1 = max(0, int(ys.min()) - pad), min(sat.shape[0], int(ys.max()) + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(sat.shape[1], int(xs.max()) + pad)
    crop = sat[y0:y1, x0:x1]
    a = (alpha[y0:y1, x0:x1] * 255).astype(np.uint8)
    rgba = np.dstack([crop.astype(np.uint8), a])
    img = Image.fromarray(rgba, "RGBA")
    height = max(1, int(round(img.height * (width / img.width))))
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    # Soften the key so the rings do not sparkle like a sticker.
    r, g, b, al = img.split()
    al = al.filter(ImageFilter.GaussianBlur(radius=0.6))
    return Image.merge("RGBA", (r, g, b, al))


def composite_rgba(base: np.ndarray, sprite: Image.Image, x: int, y: int, opacity: float = 1.0) -> np.ndarray:
    img = Image.fromarray(base.astype(np.uint8), "RGB").convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    if opacity < 1:
        sprite = sprite.copy()
        a = sprite.getchannel("A").point(lambda p: int(p * opacity))
        sprite.putalpha(a)
    layer.paste(sprite, (int(x), int(y)), sprite)
    out = Image.alpha_composite(img, layer)
    return np.asarray(out.convert("RGB"), dtype=np.float32)


def text_width(text: str, font: ImageFont.FreeTypeFont, tracking: float) -> float:
    return sum(font.getlength(ch) + tracking for ch in text) - tracking


def draw_tracked(base: Image.Image, text: str, font, xy, fill, tracking: float) -> None:
    draw = ImageDraw.Draw(base)
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + tracking


def title_block(
    canvas: np.ndarray,
    lines: list[tuple[str, int]],
    center: tuple[int, int],
    tracking_ratio: float = 0.045,
) -> tuple[int, int, int, int]:
    """Draw a centered stacked lockup. Returns the ink bounding box."""
    fonts = []
    widths = []
    heights = []
    trackings = []
    for text, size in lines:
        font = ImageFont.truetype(FONT_PATH, size)
        tracking = size * tracking_ratio
        fonts.append(font)
        trackings.append(tracking)
        widths.append(text_width(text, font, tracking))
        heights.append(font.getbbox(text)[3] - font.getbbox(text)[1])

    gap = int(max(heights) * 0.22)
    rule_h = max(4, int(max(s for _, s in lines) * 0.045))
    block_h = sum(heights) + gap + rule_h + gap
    block_w = max(widths)
    cx, cy = center
    top = int(cy - block_h / 2)

    layer = Image.new("RGBA", (canvas.shape[1], canvas.shape[0]), (0, 0, 0, 0))
    y = top
    ink_box = [canvas.shape[1], canvas.shape[0], 0, 0]
    for i, ((text, _size), font, width, height, tracking) in enumerate(
        zip(lines, fonts, widths, heights, trackings)
    ):
        x = int(cx - width / 2)
        # Ice-blue rim, then frost fill.
        for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
            draw_tracked(layer, text, font, (x + dx, y + dy), ICE, tracking)
        draw_tracked(layer, text, font, (x, y), FROST, tracking)
        ink_box[0] = min(ink_box[0], x - 4)
        ink_box[1] = min(ink_box[1], y - 4)
        ink_box[2] = max(ink_box[2], int(x + width) + 4)
        ink_box[3] = max(ink_box[3], y + height + 6)
        y += height
        if i == 0:
            y += gap
            rule_w = int(block_w * 0.34)
            rx0 = int(cx - rule_w / 2)
            ry = y
            ImageDraw.Draw(layer).rectangle(
                (rx0, ry, rx0 + rule_w, ry + rule_h),
                fill=BURN,
            )
            y += rule_h + gap

    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    alpha = layer.getchannel("A")
    shadow.putalpha(alpha.point(lambda p: min(255, int(p * 0.85))))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=16))
    base = Image.fromarray(canvas.astype(np.uint8), "RGB").convert("RGBA")
    base = Image.alpha_composite(base, shadow)
    base = Image.alpha_composite(base, layer)
    canvas[:] = np.asarray(base.convert("RGB"), dtype=np.float32)
    return tuple(ink_box)  # type: ignore[return-value]


def build_og(launch: np.ndarray) -> Image.Image:
    W, H = 2400, 1260
    canvas = sky_tile(launch, W, H)
    # Shuttle nose (orig y ~540) sits below the lockup with a clear gap.
    scale = 1.42
    x = int(round(W / 2 - 975 * scale))
    y = int(round(690 - 540 * scale))
    place_launch(canvas, launch, scale, x, y)
    canvas = vignette(canvas, 0.28)

    moon = moon_sprite(168)
    saturn = saturn_sprite(300)
    canvas = composite_rgba(canvas, saturn, 128, 64, opacity=0.95)
    canvas = composite_rgba(canvas, moon, W - 168 - 140, 72, opacity=0.96)

    box = title_block(
        canvas,
        [("SPACEBOUND", 200), ("BEYOND EARTH", 176)],
        (W // 2, 430),
        tracking_ratio=0.055,
    )
    print("og ink", box, "canvas", W, H)
    return Image.fromarray(canvas.astype(np.uint8), "RGB")


def build_banner(launch: np.ndarray) -> Image.Image:
    # 50:11. Lockup stays in the left half, entirely above the midline.
    W, H = 3600, 792
    canvas = sky_tile(launch, W, H)
    scale = 0.86
    x = int(round(2480 - 975 * scale))
    y = int(round(470 - 560 * scale))
    place_launch(
        canvas,
        launch,
        scale,
        x,
        y,
        fade_left=520,
        fade_top=80,
        fade_right=80,
    )
    canvas = vignette(canvas, 0.22)

    moon = moon_sprite(96)
    saturn = saturn_sprite(168)
    canvas = composite_rgba(canvas, moon, int(W * 0.70), 36, opacity=0.95)
    canvas = composite_rgba(canvas, saturn, int(W * 0.80), 46, opacity=0.92)

    box = title_block(
        canvas,
        [("SPACEBOUND", 118), ("BEYOND EARTH", 100)],
        (int(W * 0.255), int(H * 0.30)),
        tracking_ratio=0.045,
    )
    print(
        "banner ink",
        box,
        "canvas",
        W,
        H,
        "midline",
        H // 2,
        "left_half",
        W // 2,
        "bottom_fifth",
        int(H * 0.8),
    )
    return Image.fromarray(canvas.astype(np.uint8), "RGB")


def main() -> None:
    launch = grade_launch(load_rgb(LAUNCH))
    og = build_og(launch)
    banner = build_banner(launch)
    og.save("/workspace/.grok/og-preview.jpg", quality=90)
    banner.save("/workspace/.grok/banner-preview.jpg", quality=90)
    print("wrote previews", og.size, banner.size)


if __name__ == "__main__":
    main()
