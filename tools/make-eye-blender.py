"""Build and reopen the editable booth and animated-eye assembly.

blender --background --python tools/make-eye-blender.py -- baked.glb Earl.blend
or with the official bpy module: python tools/make-eye-blender.py -- baked.glb Earl.blend
"""
import json
from pathlib import Path
import struct
import re
import sys

import bpy
import numpy as np
from mathutils import Vector


def gltf_document(path):
    with path.open("rb") as stream:
        stream.seek(12)
        size, chunk_type = struct.unpack("<I4s", stream.read(8))
        if chunk_type != b"JSON":
            raise ValueError(f"Missing glTF JSON chunk in {path}")
        return json.loads(stream.read(size))


def camera(name, location, target, lens):
    bpy.ops.object.camera_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    obj.data.lens = lens
    return obj


def populate_scene(source):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 384
    for obj in scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != "BAAABS | Eye cycle"
                for strip in track.strips:
                    strip.extrapolation = "NOTHING"
                    strip.blend_type = "REPLACE"
    scene.frame_set(1)

    # Preserve the native eye study's close-up, lighting and studio world.
    camera("Eyes / front close-up", (-11.5, 0, 6), (-7.14, 0, 5.78), 48)
    for position, energy, size in [((-10, -5, 10), 1800, 7), ((-6, 5, 9), 1200, 5)]:
        bpy.ops.object.light_add(type="AREA", location=position)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector((-6, 0, 4)) - light.location).to_track_quat("-Z", "Y").to_euler()
    world = bpy.data.worlds.new("Eye study studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (.09, .07, .12, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = .5
    scene.world = world

    # The modeled DJ faces the negative-Y (driver) side. Check a nominal eye height
    # here; changing this camera never changes the window or the controller.
    booth_x = -1.110
    camera("DJ / through Earl's closed window", (booth_x, -.58, 2.39), (booth_x, -8, 1.70), 22)
    crowd = camera("DJ / crowd-side elevation", (booth_x - 1.7, -10.9, 2.05),
                   (booth_x, -1.5, 2.35), 35)
    scene.camera = crowd
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"

    notes = bpy.data.texts.new("READ ME · Animated eyes")
    notes.write(
        "BAAABS animated eyes and DJ booth\n\n"
        "Select the crowd or DJ camera to compare the audience and performer sightlines. "
        "The eye-study camera still frames the two shallow spherical caps. "
        "The booth opening crosses the former B-D-047, 048, 050 and 071 facets. "
        "Each removable panel is one flat plate, with the installed perimeter shown in the panel workshop. "
        "The six-sided opening is centered between the two speaker arrays. "
        "Earl's original window frames and sash remain. "
        "Check standing eye height, face visibility and exit clearance on Earl before fabrication.\n\n"
        "Play frames 1–384 at 24 fps for the active Ovine Sauron cycle. "
        "Backdraft, Double crest and Rolling bloom run in sequence. The right eye leads "
        "by 16 frames, a quarter of the 64-frame pulse. Each individual expression, "
        "including Hypnotoad, and the archived five-look show has its own muted NLA track. "
        "Mirror the selection across both eyes when auditioning the other looks. "
        "The caps are approximately 25 inches across and 3.5 inches deep. "
        "Projection requires physical lens, diffuser and warp calibration.\n"
    )
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.type = "MATERIAL"
    bpy.ops.file.pack_all()


def verify(destination, doc):
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    scene = bpy.context.scene
    expected_tracks = {clip["name"] for clip in doc["animations"]}
    tracks = {track.name for obj in scene.objects if obj.animation_data
              for track in obj.animation_data.nla_tracks}
    assert tracks == expected_tracks and "BAAABS | Hypnotoad" in tracks, (tracks, expected_tracks)
    assert scene.camera.name == "DJ / crowd-side elevation"
    assert "DJ / through Earl's closed window" in scene.objects
    assert "Eyes / front close-up" in scene.objects
    # Measure the reopened meshes in world coordinates. Count the actual objects
    # as well as their IDs so a duplicated plate cannot mask an omitted one.
    layout_file = Path(__file__).resolve().parents[1] / 'site/assets/earl-panel-layout.json'
    layout = json.loads(layout_file.read_text())
    expected_ids = {p['id'] for p in layout['pieces']}
    panel_ids = set()
    max_deviation = 0.
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        names = {match.group(1) for mat in obj.data.materials if mat
                 if (match := re.match(r"^Panel_([A-Z]-[A-Z]-\d{3})(?:_|$)", mat.name))}
        if not names:
            continue
        panel_id, = names
        assert panel_id not in panel_ids, ('duplicate panel',panel_id)
        panel_ids.add(panel_id)
        world = np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
        centered = world-world.mean(axis=0)
        normal = np.linalg.svd(centered,full_matrices=False)[2][-1]
        deviation = float(np.max(abs(centered @ normal)))
        assert deviation < 3e-6,(panel_id,deviation)
        max_deviation = max(max_deviation,deviation)
    assert panel_ids == expected_ids and len(panel_ids) == layout['panel_count']
    for tick in (0, 127, 255, 383):
        scene.frame_set(tick + 1)
        for side, phase in (("L", 0), ("R", 16)):
            active = [int(obj.name.rsplit("_", 1)[1]) for obj in scene.objects
                      if obj.name.startswith(f"Eye_{side}_Ovine_fire_") and obj.scale.x > .5]
            assert active == [(tick + phase) % 384], (tick, side, active)

    # Intersect each individual clipped skin in object space with broadside rays.
    # Importers may duplicate vertices; this checks the saved surface directly.
    checked = set()
    rim_sheets = [node["extras"] for node in doc["nodes"]
                  if node.get("extras", {}).get("dj_booth_revision") and "panel_id" in node["extras"]]
    ids = {sheet["panel_id"] for sheet in rim_sheets}
    sources = {source for sheet in rim_sheets for source in sheet["source_panels"]}
    assert {"B-D-047", "B-D-048", "B-D-050", "B-D-071"} <= sources
    for obj in scene.objects:
        if obj.type != "MESH" or obj.get("panel_id") not in ids:
            continue
        checked.add(obj["panel_id"])
        inv = obj.matrix_world.inverted()
        direction = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
        for x in (-1.45, -1.11, -.78):
            for z in (2.07, 2.27, 2.45):
                start = inv @ Vector((x, -3.4, z))
                hit, *_ = obj.ray_cast(start, direction)
                assert not hit, (obj.name, x, z)
    assert checked == ids, checked
    # The center of each saved camera must see through actual glazing all the
    # way across the port, even with the full six-shore assembly in the scene.
    graph = bpy.context.evaluated_depsgraph_get()
    for name, stop_y in (("DJ / through Earl's closed window", -4.0),
                         ("DJ / crowd-side elevation", -.58)):
        view = scene.objects[name]
        start = view.matrix_world.translation.copy()
        direction = view.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        seen = set()
        while (distance := (stop_y - start.y) / direction.y) > 0:
            hit, point, _, face, surface, _ = scene.ray_cast(graph, start, direction, distance=distance)
            if not hit:
                break
            seen.add(surface.data.materials[surface.data.polygons[face].material_index].name)
            start = point + direction * .001
        assert seen == {"Workshop_bus_DJ_Glazing"}, (name, seen)
    new_objects = [o for o in scene.objects if o.name.startswith(("DJ ", "DJ_")) and o.type == "MESH"]
    assert new_objects, "Missing DJ geometry"
    image_files = [image for image in bpy.data.images if image.source == "FILE"]
    assert all(image.packed_file for image in image_files), "Found unpacked model textures"
    print(f"Verified reopened booth model: {len(panel_ids)} panels, {len(tracks)} eye clips, "
          f"{len(new_objects)} DJ meshes, {len(image_files)} packed textures, "
          f"maximum sheet-plane residual {max_deviation*1e6:.3f} micrometres")


if __name__ == "__main__":
    source, destination = [Path(arg).resolve() for arg in sys.argv[sys.argv.index("--") + 1:]]
    doc = gltf_document(source)
    populate_scene(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    verify(destination, doc)
