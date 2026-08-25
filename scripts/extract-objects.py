#!/usr/bin/env python3
"""Cut per-object sprites from the original room painting."""

from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC_PNG = Path("/tmp/room.png")
OUT = ROOT / "public" / "objects"
PREV = Path("/tmp/sprites")

# crop/seeds are fractions of the full 4093×2286 room.
# knock: extra background classes besides teal walls.
SPECS = {
    "tv": dict(
        crop=(0.162, 0.220, 0.370, 0.668),
        seeds=[
            (0.250, 0.325, 0.348, 0.500),
            (0.248, 0.500, 0.348, 0.630),
            (0.190, 0.400, 0.248, 0.505),
        ],
        knock=(),
    ),
    "wardrobe": dict(
        crop=(0.335, 0.088, 0.528, 0.588),
        seeds=[
            (0.365, 0.155, 0.505, 0.545),
            (0.338, 0.210, 0.372, 0.440),
        ],
        knock=(),
    ),
    "poster": dict(
        crop=(0.508, 0.152, 0.572, 0.328),
        seeds=[(0.522, 0.175, 0.560, 0.300)],
        knock=(),
    ),
    "trophy": dict(
        crop=(0.555, 0.100, 0.668, 0.338),
        seeds=[
            (0.575, 0.180, 0.648, 0.315),
            (0.560, 0.112, 0.655, 0.180),
        ],
        knock=(),
    ),
    "window": dict(
        crop=(0.638, 0.110, 0.880, 0.500),
        seeds=[
            (0.668, 0.195, 0.825, 0.455),
            (0.710, 0.145, 0.810, 0.215),
        ],
        knock=(),
    ),
    "laptop": dict(
        crop=(0.575, 0.368, 0.682, 0.545),
        seeds=[(0.598, 0.405, 0.672, 0.515)],
        knock=(),
    ),
    "box": dict(
        crop=(0.428, 0.548, 0.558, 0.775),
        seeds=[(0.448, 0.580, 0.538, 0.730)],
        knock=("rug",),
    ),
    "chair": dict(
        crop=(0.518, 0.528, 0.618, 0.722),
        seeds=[(0.535, 0.555, 0.595, 0.690)],
        knock=("rug",),
    ),
    "desk": dict(
        crop=(0.628, 0.465, 0.758, 0.688),
        seeds=[(0.650, 0.510, 0.735, 0.650)],
        knock=("floor",),
    ),
}


def frac_box(box, W, H):
    x0, y0, x1, y1 = box
    return int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)


def wall_mask(crop):
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    classic = (
        (r < 115)
        & (g > 30)
        & (g < 135)
        & (b > 30)
        & (b < 140)
        & (np.abs(g - b) < 24)
        & (r < g + 2)
    )
    cool_dark = (
        (r < 55)
        & (g < 72)
        & (b < 80)
        & (b >= r - 6)
        & (g >= r - 8)
        & (b <= g + 12)
    )
    muted = (
        (r < 90)
        & (g < 110)
        & (b < 110)
        & (np.abs(g - b) < 28)
        & (r < g + 6)
        & ((g + b) / 2 > r + 6)
    )
    return classic | cool_dark | muted


def rug_mask(crop):
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    red = (r > 155) & (g < 95) & (b < 90)
    blue = (b > 95) & (b > r + 18) & (g < 145)
    return red | blue


def floor_mask(crop):
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    dark = (r < 155) & (g < 115) & (b < 95) & (r >= g - 8)
    muted = (r < 150) & (g < 140) & (b < 145) & (np.abs(r - g) < 35) & (np.abs(g - b) < 40) & (r < 120)
    return dark | muted


def desk_mask(crop):
    r = crop[:, :, 0].astype(np.int16)
    g = crop[:, :, 1].astype(np.int16)
    b = crop[:, :, 2].astype(np.int16)
    return (r > 190) & (g > 115) & (g < 210) & (b < 120) & (r > g)


def keep_seeded(fg, seed):
    h, w = fg.shape
    seen = np.zeros_like(fg)
    out = np.zeros_like(fg)
    ys, xs = np.where(seed)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x] or not fg[y, x]:
            continue
        q = deque([(y, x)])
        seen[y, x] = True
        cells = [(y, x)]
        while q:
            cy, cx = q.popleft()
            for ny, nx in (
                (cy - 1, cx),
                (cy + 1, cx),
                (cy, cx - 1),
                (cy, cx + 1),
            ):
                if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
                    cells.append((ny, nx))
        for cy, cx in cells:
            out[cy, cx] = True
    return out


def erode(mask, n=1):
    out = mask.copy()
    for _ in range(n):
        nxt = out.copy()
        nxt[1:, :] &= out[:-1, :]
        nxt[:-1, :] &= out[1:, :]
        nxt[:, 1:] &= out[:, :-1]
        nxt[:, :-1] &= out[:, 1:]
        out = nxt
    return out


def dilate(mask, n=1):
    out = mask.copy()
    for _ in range(n):
        nxt = out.copy()
        nxt[1:, :] |= out[:-1, :]
        nxt[:-1, :] |= out[1:, :]
        nxt[:, 1:] |= out[:, :-1]
        nxt[:, :-1] |= out[:, 1:]
        out = nxt
    return out


def checkerboard(size, cell=16):
    w, h = size
    img = Image.new("RGB", size, (210, 210, 210))
    d = ImageDraw.Draw(img)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(175, 175, 175))
    return img


def extract_one(rgba, spec):
    H, W = rgba.shape[:2]
    rgb = rgba[:, :, :3]
    X0, Y0, X1, Y1 = frac_box(spec["crop"], W, H)
    crop = rgb[Y0:Y1, X0:X1]
    ch, cw = crop.shape[:2]
    seed = np.zeros((ch, cw), dtype=bool)
    for sb in spec["seeds"]:
        sx0, sy0, sx1, sy1 = frac_box(sb, W, H)
        lx0, ly0 = max(0, sx0 - X0), max(0, sy0 - Y0)
        lx1, ly1 = min(cw, sx1 - X0), min(ch, sy1 - Y0)
        if lx1 > lx0 and ly1 > ly0:
            seed[ly0:ly1, lx0:lx1] = True
    bg = wall_mask(crop)
    knock = spec.get("knock") or ()
    if "rug" in knock:
        bg |= rug_mask(crop)
    if "floor" in knock:
        bg |= floor_mask(crop)
    if "desk" in knock:
        bg |= desk_mask(crop)
    sat = crop.max(axis=2).astype(np.int16) - crop.min(axis=2).astype(np.int16)
    start = seed & ~bg
    if int(start.sum()) < 80:
        start = seed & (sat > 28)
    raw = ~bg
    opened = erode(raw, 2)
    start2 = start & opened
    if int(start2.sum()) < 40:
        start2 = start
        opened = raw
    kept = keep_seeded(opened, start2)
    fg = dilate(kept, 3) & raw
    if int(fg.sum()) < 80:
        fg = keep_seeded(raw, start)
    fg = dilate(fg, 1)
    alpha = np.zeros((ch, cw), np.uint8)
    alpha[fg] = 255
    layer = rgba[Y0:Y1, X0:X1].copy()
    layer[:, :, 3] = alpha
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return None, None
    pad = 12
    minx, maxx = max(0, int(xs.min()) - pad), min(cw - 1, int(xs.max()) + pad)
    miny, maxy = max(0, int(ys.min()) - pad), min(ch - 1, int(ys.max()) + pad)
    tight = layer[miny : maxy + 1, minx : maxx + 1]
    meta = dict(
        x=round((X0 + minx) / W * 100, 3),
        y=round((Y0 + miny) / H * 100, 3),
        w=round(tight.shape[1] / W * 100, 3),
        h=round(tight.shape[0] / H * 100, 3),
    )
    return Image.fromarray(tight), meta


def main():
    rgba = np.array(Image.open(SRC_PNG).convert("RGBA"))
    OUT.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)
    for name, spec in SPECS.items():
        img, meta = extract_one(rgba, spec)
        if img is None:
            print(name, "EMPTY")
            continue
        prev = checkerboard(img.size)
        prev.paste(img, mask=img.split()[-1])
        prev.thumbnail((560, 560))
        prev.save(PREV / f"{name}.jpg", quality=85)
        dest = OUT / f"{name}.webp"
        img.save(dest, "WEBP", quality=90, method=4)
        spec["_meta"] = meta
        print(
            f"{name:10} {img.size[0]:4}x{img.size[1]:<4}  "
            f"{meta['x']:6},{meta['y']:6}  {meta['w']:6}x{meta['h']:<6}  "
            f"{dest.stat().st_size}b"
        )
    print("LAYOUT")
    for name, spec in SPECS.items():
        m = spec.get("_meta")
        if m:
            print(f".hit-{name} {{ --sx: {m['x']}; --sy: {m['y']}; --sw: {m['w']}; --sh: {m['h']}; }}")


if __name__ == "__main__":
    main()
