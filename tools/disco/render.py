"""Render public posters and the disco loop from the current baked GLB.

Run python3 tools/disco/render.py after baking the current six-shore model.
Requires NumPy, pycairo, ffmpeg and a C compiler. All rendering runs on the CPU.
"""

import argparse
import ctypes
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

import cairo
import numpy as np

from glb_scene import Scene

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "site/assets"
SOURCE = ASSETS / "models/baaabs-earl-iteration06-six-shores.glb"
FRAMES = 192
FPS = 24


def unit(v):
    return np.array(v) / np.linalg.norm(v)


def dancer_mesh(phase, deck):
    """Five rooftop dancers and a booth DJ as animated presentation figures."""
    triangles, colors = [], []
    palette = (
        (1, 0.24, 0.57),
        (0.25, 0.8, 1),
        (0.95, 0.8, 0.26),
        (0.33, 1, 0.64),
        (0.8, 0.4, 1),
        (0.73, 0.80, 1),
    )
    for j, (x, z) in enumerate(
        [(-4.1, -0.55), (-2.5, 0.6), (-0.9, -0.45), (0.7, 0.6), (2.3, -0.55), (-1.11, 0.43)]
    ):
        p = phase * 4 + j * 1.3
        hip = np.array([x + 0.13 * math.sin(p), deck + 0.77 + 0.065 * (1 + math.sin(p * 2)), z])
        neck = hip + [0.10 * math.sin(p), 0.62, 0]
        joints = [
            ([x - 0.24, deck, z], hip + [-0.15, -0.35, 0.03], hip),
            ([x + 0.23, deck, z], hip + [0.2, -0.38, -0.04], hip),
            (hip, neck),
            (
                neck,
                neck + [-0.35, 0.15 + 0.23 * math.sin(p), 0.05],
                neck + [-0.53, 0.55 + 0.25 * math.sin(p), 0.08],
            ),
            (
                neck,
                neck + [0.32, 0.12 - 0.2 * math.sin(p), -0.05],
                neck + [0.5, 0.5 - 0.25 * math.sin(p), -0.06],
            ),
        ]
        if j == 5:
            # Face the glazing, with hands just above the modeled players.
            hip = np.array([x, 1.71, z])
            neck = hip + [0.04 * math.sin(p), 0.53, 0.04]
            joints = [
                ([x - 0.13, 1.06, z], hip),
                ([x + 0.13, 1.06, z], hip),
                (hip, neck),
                (neck, neck + [-0.24, -0.12, 0.09], [x - 0.20, 1.93, z + 0.33]),
                (neck, neck + [0.24, -0.13, 0.08], [x + 0.17 + 0.04 * math.sin(p), 1.93, z + 0.33]),
            ]
        start = len(triangles)
        for limb in joints:
            for a, b in zip(limb, limb[1:]):
                axis = unit(np.array(b) - a)
                u = unit(np.cross(axis, [0, 0, 1]))
                v = np.cross(axis, u)
                ring = [
                    0.053 * (u * math.cos(k * math.tau / 6) + v * math.sin(k * math.tau / 6))
                    for k in range(6)
                ]
                for k, r in enumerate(ring):
                    s = ring[(k + 1) % 6]
                    triangles.extend([[a + r, a + s, b + r], [a + s, b + s, b + r]])
        head = neck + [0, 0.21, 0]
        for k in range(10):
            ring = [
                np.array([math.cos(i * math.tau / 10), 0, math.sin(i * math.tau / 10)]) * 0.135
                for i in [k, k + 1]
            ]
            for sign in [-1, 1]:
                triangles.append([head + ring[0], head + ring[1], head + [0, 0.17 * sign, 0]])
        colors.extend([(*palette[j], 1)] * (len(triangles) - start))
    return np.asarray(triangles), np.asarray(colors)


class Renderer:
    def __init__(self, source, work):
        self.scene = Scene(source)
        library = work / ("raster.dylib" if sys.platform == "darwin" else "raster.so")
        subprocess.run(
            [
                "cc",
                "-shared",
                "-fPIC",
                "-O3",
                str(Path(__file__).with_name("raster.c")),
                "-o",
                str(library),
                "-lm",
            ],
            check=True,
        )
        self.raster = ctypes.CDLL(str(library)).raster
        self.raster.argtypes = [
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
        ] + [ctypes.c_void_p] * 6
        self.raster.restype = None

    def frame(self, k, width, height, look):
        scene = self.scene
        disco = look == "disco"
        phase = math.tau * k / FRAMES
        theta = 1.71 + phase if disco else 1.87
        # Dip toward a crowd-height sightline as the orbit reaches the DJ side.
        elevation = 0.22 - 0.255 * ((1 + math.sin(theta)) * 0.5) ** 2 if disco else 0.17
        camera = unit([math.cos(theta), elevation, math.sin(theta)])
        right = unit(np.cross([0, 1, 0], camera))
        up = np.cross(camera, right)
        basis = np.array([right, up, camera]).T
        target = np.array([0.15, 4.12, 0])
        scale = width / (22.9 if disco else 19.55)

        def project(points):
            q = (np.asarray(points) - target) @ basis
            q[..., 0] = width * 0.5 + q[..., 0] * scale
            q[..., 1] = height * (0.57 if disco else 0.52) - q[..., 1] * scale
            return q

        surface = cairo.ImageSurface(cairo.FORMAT_RGB24, width, height)
        c = cairo.Context(surface)
        if look == "pitch":
            c.set_source_rgb(0.62, 0.64, 0.65)
        else:
            c.set_source_rgb(0.052, 0.044, 0.083)
        c.paint()
        if disco:
            self.stage(c, project, width, height, phase)
            scene.animate_eyes(k)
        direction = unit([-0.58, 1, 0.48])
        light = 0.52 + 1.00 * np.abs(scene.normals @ direction) + 0.22 * np.abs(scene.normals[:, 1])
        rgb = scene.rgb.copy()
        rgb[:, :3] *= light[:, None]
        if disco:
            for direction, color in [
                (unit([math.cos(phase), 0.7, math.sin(phase)]), (0.42, 0.05, 0.34)),
                (unit([0.4, 0.7, -1]), (0.03, 0.29, 0.34)),
            ]:
                rgb[:, :3] += (
                    scene.rgb[:, :3] * np.maximum(0, scene.normals @ direction)[:, None] * color
                )
            dancers, dancer_colors = dancer_mesh(phase, scene.deck)
            triangles = np.concatenate((scene.tri, dancers))
            rgb = np.concatenate((rgb, dancer_colors))
            uv = np.concatenate((scene.uv, np.zeros((len(dancers), 3, 2))))
            tex = np.concatenate((scene.tex, np.full(len(dancers), -1, np.int32)))
        else:
            triangles = scene.tri
            uv = scene.uv
            tex = scene.tex
        # Emissive Ovine eye textures and Earl's bus photos carry their own light.
        textured = scene.tex >= 0
        rgb[: len(textured), :3][textured] = scene.rgb[textured, :3]
        surface.flush()
        bgra = np.frombuffer(surface.get_data(), np.uint8)
        depth = np.full((height, width), -np.inf, np.float32)
        arrays = [
            np.ascontiguousarray(project(triangles), np.float32),
            np.ascontiguousarray(rgb, np.float32),
            np.ascontiguousarray(uv, np.float32),
            tex,
            scene.pixels,
            scene.tiles,
        ]
        self.raster(
            width,
            height,
            bgra.ctypes.data,
            depth.ctypes.data,
            len(triangles),
            *(array.ctypes.data for array in arrays),
        )
        surface.mark_dirty()
        if disco:
            self.show(c, project, scene.outlets, scale, width, height, k, phase)
        return surface

    @staticmethod
    def stage(c, project, W, H, phase):
        bg = cairo.LinearGradient(0, 0, 0, H)
        bg.add_color_stop_rgb(0, 0.025, 0.016, 0.065)
        bg.add_color_stop_rgb(1, 0.012, 0.013, 0.022)
        c.set_source(bg)
        c.paint()
        for j, col in enumerate([(1, 0.06, 0.43), (0.15, 0.23, 1), (0.04, 0.8, 0.68)]):
            x = W * (0.2 + j * 0.3)
            end = x + W * 0.22 * math.sin(phase + j * 2)
            g = cairo.LinearGradient(x, 0, end, H * 0.85)
            g.add_color_stop_rgba(0, *col, 0.14)
            g.add_color_stop_rgba(1, *col, 0)
            c.move_to(x - 12, 0)
            c.line_to(x + 12, 0)
            c.line_to(end + W * 0.24, H * 0.88)
            c.line_to(end - W * 0.24, H * 0.88)
            c.close_path()
            c.set_source(g)
            c.fill()
        for v in range(-22, 23, 2):
            for a, b, col in [
                ([-22, -0.05, v], [22, -0.05, v], (0.35, 0.15, 0.65, 0.20)),
                ([v, -0.05, -22], [v, -0.05, 22], (0.15, 0.37, 0.50, 0.16)),
            ]:
                q = project([a, b])
                c.move_to(*q[0, :2])
                c.line_to(*q[1, :2])
                c.set_source_rgba(*col)
                c.set_line_width(0.7)
                c.stroke()

    @staticmethod
    def show(c, project, outlets, scale, W, H, k, phase):
        pulse = max(0, math.sin(phase * 3 - 0.2)) ** 1.4
        for j, tip in enumerate(outlets):
            power = pulse * (0.9 + 0.1 * math.sin(k * 0.7 + j))
            if power < 0.025:
                continue
            q, q2 = project([tip, tip + np.array([0.63 * power, 2.7 * power, 0])])[:, :2]
            glow = cairo.RadialGradient(*q, 0, *q, scale * 1.8 * power)
            glow.add_color_stop_rgba(0, 1, 0.25, 0.03, 0.35)
            glow.add_color_stop_rgba(1, 1, 0.08, 0, 0)
            c.set_source(glow)
            c.arc(*q, scale * 1.8 * power, 0, math.tau)
            c.fill()
            for layer, (col, w) in enumerate(
                [((1, 0.19, 0.015), 0.53), ((1, 0.58, 0.025), 0.33), ((1, 0.93, 0.55), 0.14)]
            ):
                axis = q2 - q
                norm = np.array([-axis[1], axis[0]]) / max(np.linalg.norm(axis), 1)
                radius = scale * w * power
                top = q + axis * (1 - layer * 0.16)
                c.move_to(*q)
                c.curve_to(*(q + axis * 0.15 + norm * radius), *(top + norm * radius * 0.55), *top)
                c.curve_to(*(top - norm * radius * 0.45), *(q + axis * 0.25 - norm * radius), *q)
                c.set_source_rgb(*col)
                c.fill()
        bx, by = W * 0.5, H * 0.085
        c.set_source_rgba(0.6, 0.68, 0.9, 0.7)
        c.set_line_width(0.6)
        c.move_to(bx, 0)
        c.line_to(bx, by - 13)
        c.stroke()
        for row in range(-3, 4):
            for col in range(-3, 4):
                if row * row + col * col > 10:
                    continue
                v = 0.35 + 0.45 * max(0, math.sin(col + phase * 2 + row * 0.5))
                c.rectangle(bx + col * 4, by + row * 4, 3.3, 3.3)
                c.set_source_rgb(v * 0.7, v * 0.8, v)
                c.fill()


def jpeg(surface, path, width):
    surface.flush()
    subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgra",
            "-s",
            f"{surface.get_width()}x{surface.get_height()}",
            "-i",
            "pipe:0",
            "-vf",
            f"scale={width}:-1:flags=lanczos",
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(path),
        ],
        input=surface.get_data(),
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--assets", type=Path, default=ASSETS)
    parser.add_argument("--stills-only", action="store_true")
    args = parser.parse_args()
    out = args.assets / "disco/earl-geodesic"
    out.mkdir(parents=True, exist_ok=True)
    (args.assets / "home-model").mkdir(exist_ok=True)
    (args.assets / "images/earl").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        renderer = Renderer(args.source, Path(tmp))
        studio = renderer.frame(0, 1800, 1014, "studio")
        jpeg(studio, args.assets / "images/earl/earl-front-x-hero.jpg", 1350)
        jpeg(studio, args.assets / "home-model/poster.jpg", 520)
        # Supersample narrow rails and mast edges for the full-width Pitch hero.
        pitch = renderer.frame(0, 7680, 4448, "pitch")
        jpeg(pitch, args.assets / "images/earl/earl-symmetric.jpg", 820)
        for width in (1600, 2560, 3840):
            jpeg(pitch, args.assets / f"images/earl/earl-pitch-{width}.jpg", width)
        renderer.frame(0, 1280, 720, "disco").write_to_png(str(out / "poster.png"))
        if args.stills_only:
            return
        video = out / "baaabs-disco.mp4"
        with subprocess.Popen(
            [
                "ffmpeg",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "bgra",
                "-s",
                "1280x720",
                "-framerate",
                str(FPS),
                "-i",
                "pipe:0",
                "-an",
                "-c:v",
                "libx264",
                "-threads",
                "3",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "22",
                "-movflags",
                "+faststart",
                str(video),
            ],
            stdin=subprocess.PIPE,
        ) as encoder:
            for k in range(FRAMES):
                frame = renderer.frame(k, 1280, 720, "disco")
                encoder.stdin.write(frame.get_data())
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError("Turntable encode failed")
        (out / "provenance.json").write_text(
            json.dumps(
                {
                    "source": "site/assets/models/" + args.source.name,
                    "source_sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
                    "frames": FRAMES,
                    "fps": FPS,
                    "eye_clip": "First 8 seconds of the authored Ovine Sauron show at 24 fps",
                    "renderer": "tools/disco/render.py",
                    "presentation": [
                        "orbit camera",
                        "five rooftop dancers",
                        "DJ at the booth",
                        "disco lighting",
                        "two mast-tip flame effects",
                    ],
                },
                indent=2,
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
