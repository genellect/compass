"""Original kinetic sculpture. Run with Blender 4.5, not a runtime dependency.

blender --background --python scripts/render-cytellect-art.py -- --output .review/art --variant 0
Add --animate and --mobile to render the seamless six-second camera-specific loop.
No imported models, textures, fonts, datasets, or reference-site assets are used.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--variant', type=int, default=0)
parser.add_argument('--mobile', action='store_true')
parser.add_argument('--animate', action='store_true')
parser.add_argument('--eevee', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.output = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', args.output))
os.makedirs(args.output, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24 if args.animate else 48
scene.cycles.use_denoising = True
if args.eevee:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = True
try:
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX'
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type != 'CPU'
    if any(device.use for device in preferences.devices):
        scene.cycles.device = 'GPU'
except Exception:
    pass
scene.render.resolution_x = 720 if args.mobile else 1120
scene.render.resolution_y = 800 if args.mobile else 640
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 144
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.world.color = (0.015, 0.021, 0.04)
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value = (0.055, 0.08, 0.14, 1)
background.inputs['Strength'].default_value = 0.3

def metal(name, color, roughness=0.24):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = 0.83
    shader.inputs['Roughness'].default_value = roughness
    return material

silver = metal('Cool porcelain silver', (0.56, 0.67, 0.81))
blue = metal('Ultramarine reflections', (0.11, 0.27, 0.61), 0.22)
pearl = metal('Pale violet silver', (0.48, 0.46, 0.64), 0.26)
root = bpy.data.objects.new('Kinetic architecture', None)
scene.collection.objects.link(root)
ribbons = []
# Each ribbon is a continuous broad curved sheet, with a real edge and polished bevel.
# Radius, pitch, and longitudinal curvature deliberately vary: not concentric rings.
for index in range(17):
    vertices, faces = [], []
    count = 120
    fraction = index / 16
    for step in range(count + 1):
        u = step / count
        angle = -0.25 + u * math.pi * 1.68
        radius = 1.48 + fraction * 0.67 + 0.22 * math.sin(angle * 1.3 + fraction)
        for edge in (-1, 1):
            r = radius + edge * 0.16
            x = math.cos(angle) * r
            z = math.sin(angle) * r * 0.9
            y = (fraction - 0.5) * 2.8 + 0.38 * math.sin(angle * 1.4 + fraction * 1.7)
            y += edge * 0.06 * math.sin(angle)
            vertices.append((x, y, z))
    for step in range(count):
        base = step * 2
        faces.append((base, base + 1, base + 3, base + 2))
    mesh = bpy.data.meshes.new(f'Ribbon {index:02d}')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ribbon = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(ribbon)
    ribbon.parent = root
    ribbon.data.materials.append(blue if index % 6 == 0 else pearl if index % 6 == 1 else silver)
    for face in mesh.polygons:
        face.use_smooth = True
    solid = ribbon.modifiers.new('Precision edge', 'SOLIDIFY')
    solid.thickness = 0.027
    bevel = ribbon.modifiers.new('Rounded highlight', 'BEVEL')
    bevel.width, bevel.segments = 0.022, 3
    ribbons.append(ribbon)

def area(name, location, color, power, size, target=(0, 0, 0)):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.color, light.shape, light.size = power, color, 'DISK', size
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj

area('Large studio key', (1, -4, 6), (0.84, 0.92, 1), 1500, 5)
area('Violet side reflection', (-4, 1, 2), (0.58, 0.48, 1), 1150, 3)
area('Blue inner reflection', (3, 4, 0.5), (0.25, 0.52, 1), 1650, 4)
area('White edge reflection', (-1, 3, -2), (0.85, 0.94, 1), 900, 3)

camera_data = bpy.data.cameras.new('Composed view')
camera = bpy.data.objects.new('Composed view', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 6.6 if args.mobile else 7.2
camera.location = (6.4, -8, 4.5) if args.variant == 1 else (5.8, -8.8, 2.8)
if args.variant == 2:
    camera.location = (4.8, -7.6, 5.8)
target = Vector((-0.25, 0, -0.3) if args.mobile else (-1.5, 0, -0.1))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
if args.variant == 2:
    camera_data.ortho_scale = 6.25 if args.mobile else 6.7

def pose(frame):
    phase = (frame - 1) / 144 * math.tau
    root.rotation_euler.x = 0.12 + 0.11 * math.sin(phase)
    root.rotation_euler.y = -0.12 + 0.19 * math.sin(phase + 0.3)
    root.rotation_euler.z = (-0.3 if args.variant == 2 else -0.18) + 0.07 * math.cos(phase)
    root.location.z = 0.38 if args.mobile else 0.1
    for index, ribbon in enumerate(ribbons):
        fraction = index / 16
        ribbon.rotation_euler.y = 0.1 * math.sin(phase + fraction * 2.8)
        ribbon.location.y = 0.16 * math.sin(phase + fraction * 2.3)
        ribbon.rotation_euler.z = 0.06 * math.sin(phase + fraction * 1.7)

if args.animate:
    for frame in range(1, 146):
        pose(frame)
        root.keyframe_insert(data_path='rotation_euler', frame=frame)
        root.keyframe_insert(data_path='location', frame=frame)
        for ribbon in ribbons:
            ribbon.keyframe_insert(data_path='rotation_euler', frame=frame)
            ribbon.keyframe_insert(data_path='location', frame=frame)
    for obj in [root, *ribbons]:
        for curve in obj.animation_data.action.layers[0].strips[0].channelbag(obj.animation_data.action_slot).fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
    scene.render.filepath = os.path.join(args.output, 'frame-')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.output, 'kinetic-architecture.blend'))
    bpy.ops.render.render(animation=True)
else:
    pose(1)
    scene.render.filepath = os.path.join(args.output, f'variant-{args.variant}{"-mobile" if args.mobile else ""}.png')
    bpy.ops.render.render(write_still=True)
