"""Resolution-independent Hypnotoad eye study, redrawn for the shallow caps.

Reference: https://tenor.com/view/futurama-hypnotoad-hypnotize-gif-3480789
The original has morphing horizontal black pupils, red/orange/gold contour
bands and a mustard-yellow field, with different shapes on the two eyes.
There is no rotating spiral. No television frames or audio are distributed.
"""
import numpy as np

HYPNO_FRAMES = 48
HYPNO_FPS = 24
HYPNO_SIZE = 512
HYPNO_RIGHT_PHASE = 12


def hypnotoad_pixels(frame, size=HYPNO_SIZE):
    """Render directly at the requested resolution, including 1024+ VFX masters."""
    t = (frame % HYPNO_FRAMES) / HYPNO_FRAMES
    phase = 2 * np.pi * t
    y, x = np.mgrid[:size, :size].astype(float)
    x = (x + .5) * 2 / size - 1
    y = 1 - (y + .5) * 2 / size
    radius = np.hypot(x, y)
    # Fast, rubbery pupil deformation plus a slower expansion/contraction.
    px = x - .018 * np.sin(phase * 5)
    py = y + .015 * np.sin(phase * 4)
    width = .48 + .035 * np.sin(phase * 2)
    height = .19 + .055 * np.sin(phase * 3 + .4)
    angle = np.arctan2(py / height, px / width)
    lobes = (1 + .20 * np.sin(phase * 3) * np.cos(3 * angle - np.pi / 2)
             + .075 * np.sin(phase * 5 + .6) * np.cos(2 * angle))
    distance = (np.hypot(px / width, py / height) - lobes) * height
    # The warm flat field and concentric contour colors are essential to the
    # original; avoid iris fibers, catchlights, flames or a rainbow spiral.
    field = np.array([173., 145., 18.])
    pixels = np.broadcast_to(field, (*x.shape, 3)).copy()
    halo = np.exp(-np.maximum(distance, 0)**2 / .12**2)
    pixels += halo[..., None] * np.array([44., 31., -5.])
    rings = [(.125 + .012 * np.sin(phase * 3), [240., 186., 23.], .028),
             (.089, [255., 215., 51.], .016),
             (.048, [246., 67., 7.], .008),
             (0., [4., 3., 2.], .003)]
    for threshold, color, softness in rings:
        blend = np.clip((threshold - distance) / softness + .5, 0, 1)
        blend = blend * blend * (3 - 2 * blend)
        pixels = pixels * (1 - blend[..., None]) + np.array(color) * blend[..., None]
    # Thin ink outline around the shell, as in the drawn eye silhouette.
    rim = np.clip((.985 - radius) * size / 2, 0, 1)
    pixels = pixels * rim[..., None] + np.array([11., 8., 3.]) * (1 - rim[..., None])
    pixels[radius > 1] = 0
    return np.rint(np.clip(pixels, 0, 255)).astype(np.uint8)
