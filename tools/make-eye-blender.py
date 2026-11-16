"""Blender --background --python tools/make-eye-blender.py -- input.glb output.blend"""
import bpy
import pathlib
import sys
from mathutils import Vector

source, destination = sys.argv[sys.argv.index('--')+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(source).resolve()))
scene=bpy.context.scene
scene.render.fps=24
scene.frame_start=1
scene.frame_end=384
for obj in scene.objects:
    if obj.animation_data:
        obj.animation_data.action=None
        for track in obj.animation_data.nla_tracks:
            track.mute='Eye cycle' not in track.name
            for strip in track.strips:
                strip.extrapolation='NOTHING'
                strip.blend_type='REPLACE'
scene.frame_set(1)
bpy.ops.object.camera_add(location=(-11.5,0,6.0))
camera=bpy.context.object
camera.name='Eyes / front close-up'
camera.rotation_euler=(Vector((-7.14,0,5.78))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=48
scene.camera=camera
for location,power,size in [((-10,-5,10),1800,7),((-6,5,9),1200,5)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((-6,0,4))-light.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Eye study studio');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.07,.12,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
notes=bpy.data.texts.new('READ ME · Animated eyes')
notes.write('BAAABS animated eyes / revision 4\n\nCurrent iteration-06 model, shallow spherical eye caps about 25 inches across and 3.5 inches deep.\nPress Space for frames 1-384 at 24 fps (16 seconds). Ovine Sauron only: Backdraft, Double crest, Rolling bloom. Right eye leads by 16 frames, one quarter of the 64-frame pulse. Only ovine Sauron has the comic 10-degree cant.\nEye cycle is the active NLA track. Individual expressions and the archived 56-second five-look show remain embedded, muted. These are animation studies; production projection requires physical lens, diffuser and warp calibration.\nBAAABS always follows mischief with cute. Infernal effects are comedic and convey no malice. The solo study is the owner-selected temporary active look.\n')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(pathlib.Path(destination).resolve()))
print('EYE_EXPORT',len(scene.objects),'objects',len(bpy.data.actions),'actions',len(bpy.data.images),'packed images')
