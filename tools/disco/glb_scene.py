"""Visible GLB primitives for a still of Earl, with its authored Ovine eye phase."""

import json
import struct
import subprocess
import zlib
from pathlib import Path
import numpy as np


def transform(node):
    if "matrix" in node:
        return np.array(node["matrix"]).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    result = np.eye(4)
    result[:3, :3] = np.array(
        [
            [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
            [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
            [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y],
        ]
    ) * node.get("scale", [1, 1, 1])
    result[:3, 3] = node.get("translation", [0, 0, 0])
    return result


class Scene:
    def __init__(self, source):
        data = Path(source).read_bytes()
        n = struct.unpack_from("<I", data, 12)[0]
        self.gltf = json.loads(data[20 : 20 + n])
        self.binary = memoryview(data)[28 + n :]
        self.tri, self.rgb, self.uv, self.tex = [], [], [], []
        self.eye_tiles = {}
        self.sheet_tiles = {}
        self.eye_frames = {
            img["name"]: img
            for img in self.gltf["images"]
            if img.get("name", "").startswith("Ovine_fire_")
        }
        self.textures, self.texture_ids, self.outlets = [], {}, []
        self.contacts = {}
        self.deck = 0
        for root in self.gltf["scenes"][self.gltf["scene"]]["nodes"]:
            self.visit(root, np.eye(4))
        self.tri, self.rgb, self.uv, self.tex = [
            np.concatenate(values) for values in (self.tri, self.rgb, self.uv, self.tex)
        ]
        normals = np.cross(self.tri[:, 1] - self.tri[:, 0], self.tri[:, 2] - self.tri[:, 0])
        self.normals = normals / np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-10)
        offsets, pixels = [], bytearray()
        for tile_id, tex in enumerate(self.textures):
            h, w, _ = tex.shape
            cutoff = self.sheet_tiles.get(tile_id, 0)
            levels = int(np.log2(min(w,h))) if cutoff else 0
            offsets.append((len(pixels), w, h, tex.shape[2], levels, round(255*cutoff)))
            pixels.extend(tex.tobytes())
            for _ in range(levels):
                h, w, channels = tex.shape
                tex = tex.reshape(h//2,2,w//2,2,channels).mean(axis=(1,3)).round().astype(np.uint8)
                pixels.extend(tex.tobytes())
        self.tiles = np.asarray(offsets, dtype=np.int32)
        self.pixels = np.frombuffer(pixels, dtype=np.uint8)
        if len(self.outlets) != 2 or not self.deck:
            raise ValueError("Expected two exhaust masts and a roof dance floor")

    def view(self, index):
        v = self.gltf["bufferViews"][index]
        start = v.get("byteOffset", 0)
        return self.binary[start : start + v["byteLength"]]

    def accessor(self, index):
        a = self.gltf["accessors"][index]
        dtype = np.dtype({5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[a["componentType"]])
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        stride = self.gltf["bufferViews"][a["bufferView"]].get("byteStride", width * dtype.itemsize)
        return np.ndarray(
            (a["count"], width),
            dtype,
            buffer=self.view(a["bufferView"]),
            offset=a.get("byteOffset", 0),
            strides=(stride, dtype.itemsize),
        )

    def texture(self, info, cutoff=None):
        index = self.gltf["textures"][info["index"]]["source"]
        if index not in self.texture_ids:
            image = self.gltf["images"][index]
            blob = self.view(image["bufferView"])
            # Decode the panel alpha along with the photographed steel. All other maps carry RGB.
            codec = "pam" if cutoff is not None else "ppm"
            raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", "pipe:0",
                                           "-frames:v", "1", "-f", "image2pipe", "-vcodec", codec,
                                           "-pix_fmt", "rgba" if cutoff is not None else "rgb24", "pipe:1"], input=blob)
            tile_id = len(self.textures)
            if cutoff is not None:
                header, pixels = raw.split(b"ENDHDR\n", 1)
                fields = dict(line.split(maxsplit=1) for line in header.splitlines()[1:])
                w, h, channels = (int(fields[k]) for k in (b"WIDTH", b"HEIGHT", b"DEPTH"))
                self.sheet_tiles[tile_id] = cutoff
            else:
                header, dimension, maximum, pixels = raw.split(b"\n", 3)
                assert header == b"P6" and maximum == b"255"
                w, h = map(int, dimension.split())
                channels = 3
            self.texture_ids[index] = tile_id
            self.textures.append(np.frombuffer(pixels, np.uint8).reshape(h, w, channels))
        return self.texture_ids[index]

    def animate_eyes(self, frame):
        # The authored Ovine atlas uses RGB PNG scanlines with filter zero.
        for phase, tile_id in self.eye_tiles.items():
            image = self.eye_frames[f"Ovine_fire_{(frame + phase) % 384:03d}"]
            data = self.view(image["bufferView"])
            n = 8
            chunks = []
            while n < len(data):
                length, kind = struct.unpack_from(">I4s", data, n)
                if kind == b"IDAT":
                    chunks.append(data[n + 8 : n + 8 + length])
                n += length + 12
            offset, w, h = self.tiles[tile_id, :3]
            rows = np.frombuffer(zlib.decompress(b"".join(chunks)), np.uint8).reshape(h, 1 + 3 * w)
            if np.any(rows[:, 0]):
                raise ValueError("Unexpected Ovine PNG scanline encoding")
            self.pixels[offset : offset + 3 * w * h] = rows[:, 1:].ravel()

    def visit(self, index, parent):
        node = self.gltf["nodes"][index]
        world = parent @ transform(node)
        if abs(np.linalg.det(world[:3, :3])) < 1e-8:
            return
        name = node.get("name", "")
        eye = name.startswith("Eye_") and "Ovine_fire_" in name
        component = node.get("extras", {}).get("component")
        if "mesh" in node and (component != "eye_effect" or eye):
            for prim in self.gltf["meshes"][node["mesh"]]["primitives"]:
                pos = self.accessor(prim["attributes"]["POSITION"]) @ world[:3, :3].T + world[:3, 3]
                if name.startswith(('Bus__Front tire ', 'Bus__Rear tire ')) and name.rsplit(' ', 1)[1] in ('1', '-1'):
                    centre = (pos.min(axis=0) + pos.max(axis=0)) / 2
                    centre[1] = pos[:, 1].min()
                    self.contacts[name] = centre
                ind = self.accessor(prim["indices"]).reshape(-1, 3)
                mat = self.gltf["materials"][prim["material"]]
                if mat["name"].startswith("Panel_B-D-074"):
                    self.dj_header = pos[np.unique(ind)]
                pbr = mat.get("pbrMetallicRoughness", {})
                base = np.array(pbr.get("baseColorFactor", [1, 1, 1, 1]), dtype=float)
                base[:3] = np.clip(base[:3], 0, 1) ** (1 / 2.2)
                index = -1
                info = pbr.get("baseColorTexture")
                if mat["name"].startswith("Panel_"):
                    if mat.get("extras", {}).get("display_material") != "panel-skin.json":
                        raise ValueError("Bake the active photographic assembly before rendering")
                    index = self.texture(info, mat["alphaCutoff"])
                elif component in ("rails", "poofer", "ladder"):
                    base = np.array([0.52, 0.51, 0.55, 1])
                elif component == "deck":
                    base = np.array([0.65, 0.62, 0.60, 1])
                elif info is not None and "TEXCOORD_0" in prim["attributes"]:
                    index = self.texture(info)
                    if eye:
                        self.eye_tiles[node["extras"]["phase_frames"]] = index
                uv = (
                    self.accessor(prim["attributes"]["TEXCOORD_0"])[ind]
                    if index >= 0
                    else np.zeros((len(ind), 3, 2))
                )
                self.tri.append(pos[ind])
                self.rgb.append(np.tile(base, (len(ind), 1)))
                self.uv.append(uv)
                self.tex.append(np.full(len(ind), index, np.int32))
                if component == "poofer":
                    self.outlets.append(pos[np.argmax(pos[:, 1])])
                if component == "deck":
                    self.deck = max(self.deck, pos[:, 1].max())
        for child in node.get("children", []):
            self.visit(child, world)
