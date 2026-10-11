"""Original hollow lattice artwork. Blender 4.5 authoring, no runtime dependency.

No molecules, scientific data, third-party models or textures are imported.
The cubic framework, face-center connections and spatial color field are the artwork.
--studies renders both shapes and both card cameras before film production.
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
parser.add_argument('--studies', action='store_true')
parser.add_argument('--both-cameras', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
args.output = os.path.abspath(os.path.join(root_dir, args.output))
os.makedirs(args.output, exist_ok=True)


def build(variant, mobile):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples = 24 if args.animate else 64
    scene.eevee.use_raytracing = True
    scene.render.resolution_x = 720 if mobile else 1120
    scene.render.resolution_y = 800 if mobile else 640
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 192
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.world.use_nodes = True
    world = scene.world.node_tree.nodes.get('Background')
    world.inputs['Color'].default_value = (0.035, 0.052, 0.075, 1)
    world.inputs['Strength'].default_value = 0.45

    # One continuous object-space color gradient, not unrelated colored particles.
    material = bpy.data.materials.new('Optical mineral gradient')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 0.38
    shader.inputs['Roughness'].default_value = 0.28
    shader.inputs['Coat Weight'].default_value = 0.12
    shader.inputs['Coat Roughness'].default_value = 0.16
    coordinate = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    colors = [
        (0, (0.015, 0.45, 0.56, 1)),
        (0.26, (0.035, 0.14, 0.70, 1)),
        (0.50, (0.39, 0.08, 0.62, 1)),
        (0.73, (0.76, 0.32, 0.47, 1)),
        (1, (0.85, 0.38, 0.09, 1)),
    ]
    ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
    for index, (position, color) in enumerate(colors):
        element = ramp.color_ramp.elements[0] if index == 0 else ramp.color_ramp.elements.new(position)
        element.position, element.color = position, color
    links.new(coordinate.outputs['Generated'], separate.inputs[0])
    links.new(separate.outputs['X'], ramp.inputs[0])
    links.new(ramp.outputs['Color'], shader.inputs['Base Color'])

    sculpture = bpy.data.objects.new('Hollow connection field', None)
    scene.collection.objects.link(sculpture)
    # Corner and face-center sites of one or two joined cubic unit cells.
    # No curved sheet, random displacement, cell blobs or atom-sized spheres.
    cells = 1 if variant == 0 else 2
    sites = set()
    for cell in range(cells):
        for x in (cell, cell + 1):
            for y in (0, 1):
                for z in (0, 1):
                    sites.add((x, y, z))
        for side in (0, 1):
            sites.add((cell + side, 0.5, 0.5))
            sites.add((cell + 0.5, side, 0.5))
            sites.add((cell + 0.5, 0.5, side))
    sites = sorted(sites)
    edges = []
    for i, a in enumerate(sites):
        for b in sites[i + 1:]:
            distance = sum((a[n] - b[n]) ** 2 for n in range(3))
            corner_a = all(value == int(value) for value in a)
            corner_b = all(value == int(value) for value in b)
            # FCC nearest-neighbor bonds, with cubic edges to make the outer
            # chambers legible. A design interpretation, not an atomic model.
            if abs(distance - 0.5) < 1e-6 or (corner_a and corner_b and distance == 1):
                edges.append((a, b))
    side = 3.0 if cells == 1 else 2.35
    def position(point):
        return Vector(((point[0] - cells / 2) * side, (point[1] - 0.5) * side, (point[2] - 0.5) * side))
    curves = bpy.data.curves.new('Regular cubic and face-center bonds', 'CURVE')
    curves.dimensions = '3D'
    curves.resolution_u = 2
    curves.bevel_depth, curves.bevel_resolution = 0.046, 4
    curves.use_fill_caps = True
    for a, b in edges:
        spline = curves.splines.new('POLY')
        spline.points.add(1)
        spline.points[0].co = (*position(a), 1)
        spline.points[1].co = (*position(b), 1)
    bonds = bpy.data.objects.new('Connected optical lattice', curves)
    scene.collection.objects.link(bonds)
    bonds.parent = sculpture
    curves.materials.append(material)
    # Convert to a single mesh so Generated gradient spans the entire artwork.
    bpy.context.view_layer.objects.active = bonds
    bonds.select_set(True)
    bpy.ops.object.convert(target='MESH')
    bonds = bpy.context.object
    for polygon in bonds.data.polygons:
        polygon.use_smooth = True
    sculpture.rotation_euler = (0.18, -0.20, 0.14)
    sculpture.location = (1.15 if not mobile else 0.0, 0.0, 0.5)

    def light(name, location, color, power, size, target=(0, 0, 0)):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.color, data.shape, data.size = power, color, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    light('Broad clean key', (0, -4, 6), (0.93, 0.97, 1), 650, 5)
    light('White rim through voids', (2, 4, 3), (0.9, 0.95, 1), 600, 3)
    light('Cyan edge', (-4, 0, 2), (0.45, 0.91, 1), 220, 3)
    light('Amber edge', (4, -2, 0), (1, 0.72, 0.47), 260, 3)

    camera_data = bpy.data.cameras.new('Lattice card camera')
    camera = bpy.data.objects.new('Lattice card camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 9.2 if not mobile else 6.9
    camera.location = (5.0, -8.7, 5.1)
    target = Vector((0, 0, 0.0) if not mobile else (0, 0, -0.25))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    # Keep the lower card dark without shallow focus erasing the connections.
    camera_data.dof.use_dof = False
    if mobile:
        sculpture.scale = (0.78,) * 3

    base = sculpture.rotation_euler.copy()
    if args.animate:
        for frame in range(1, 194):
            phase = (frame - 1) / 192 * math.tau
            sculpture.rotation_euler = (base.x + 0.10 * math.sin(phase), base.y + phase, base.z + 0.07 * math.sin(phase))
            sculpture.location.z = 0.5 + 0.05 * math.sin(phase)
            sculpture.keyframe_insert(data_path='rotation_euler', frame=frame)
            sculpture.keyframe_insert(data_path='location', frame=frame)
        scene.frame_set(1)
        scene.render.filepath = os.path.join(args.output, 'frame-')
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.output, 'lattice.blend'))
        bpy.ops.render.render(animation=True)
    else:
        scene.render.filepath = os.path.join(args.output, f'lattice-{variant}{"-mobile" if mobile else ""}.png')
        bpy.ops.render.render(write_still=True)


if args.studies:
    for variant in (0, 1):
        for mobile in (False, True):
            build(variant, mobile)
elif args.both_cameras:
    for mobile in (False, True):
        args.output = os.path.join(os.path.dirname(args.output) if mobile else args.output, 'mobile' if mobile else 'desktop')
        os.makedirs(args.output, exist_ok=True)
        build(args.variant, mobile)
else:
    build(args.variant, args.mobile)
