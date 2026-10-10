"""Offline molecular cinema. PDB 1BNA coordinates are CC0.

Coordinates are measured; palette, placements and camera are artistic.
Observer motion is not a simulation of biology. Blender 4.5 is authoring only.
"""
import argparse
import math
import os
import sys
from collections import defaultdict
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--variant', type=int, default=0)
parser.add_argument('--mobile', action='store_true')
parser.add_argument('--animate', action='store_true')
parser.add_argument('--draft', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
args.output = os.path.abspath(os.path.join(root_dir, args.output))
os.makedirs(args.output, exist_ok=True)

# The atomic coordinates are used unchanged; water molecules are not rendered.
chains = defaultdict(list)
with open(os.path.join(root_dir, 'scripts/art-data/1BNA.pdb')) as pdb:
    for line in pdb:
        if line.startswith('ATOM') and line[16] in (' ', 'A'):
            chains[line[21]].append((int(line[22:26]), Vector(tuple(float(line[a:b]) for a, b in ((30, 38), (38, 46), (46, 54))))))
points = [point for chain in chains.values() for _, point in chain]
center = sum(points, Vector()) / len(points)
chains = {key: [(residue, (point - center) * 0.085) for residue, point in chain] for key, chain in chains.items()}
print('Measured DNA atoms:', len(points), 'chains:', len(chains), flush=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples = 48 if args.animate or args.draft else 96
scene.eevee.use_raytracing = False
scene.render.resolution_x = 720 if args.mobile else 1120
scene.render.resolution_y = 800 if args.mobile else 640
scene.render.resolution_percentage = 65 if args.draft else 100
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 240
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value = (0.014, 0.025, 0.026, 1)
background.inputs['Strength'].default_value = 0.22

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = 0.68
    shader.inputs['Metallic'].default_value = 0
    noise = mat.node_tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 95
    noise.inputs['Detail'].default_value = 2
    bump = mat.node_tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.24
    bump.inputs['Distance'].default_value = 0.012
    mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat

pearl = material('Soft mineral white', (0.76, 0.74, 0.65))
amber = material('Warm mineral white', (0.70, 0.63, 0.48))
teal = material('Teal structural subunits', (0.075, 0.27, 0.25))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
template = bpy.context.object
base_vertices = [vertex.co.copy() for vertex in template.data.vertices]
base_faces = [tuple(face.vertices) for face in template.data.polygons]
bpy.data.objects.remove(template, do_unlink=True)
vertices, faces, indices = [], [], []
for chain_index, chain in enumerate(chains.values()):
    for residue, point in chain:
        start = len(vertices)
        vertices.extend(tuple(point + vertex * 0.105) for vertex in base_vertices)
        faces.extend(tuple(start + index for index in face) for face in base_faces)
        indices.extend([chain_index] * len(base_faces))
mesh = bpy.data.meshes.new('Measured B-DNA atomic structure')
mesh.from_pydata(vertices, [], faces)
mesh.update()
for mat in (pearl, amber, teal):
    mesh.materials.append(mat)
for face, index in zip(mesh.polygons, indices):
    face.use_smooth, face.material_index = True, index
molecule = bpy.data.objects.new('1BNA atomic structure', mesh)
scene.collection.objects.link(molecule)

backbone = bpy.data.curves.new('DNA bonds by coordinate distance', 'CURVE')
backbone.dimensions = '3D'
backbone.bevel_depth, backbone.bevel_resolution = 0.038, 2
for chain_index, chain in enumerate(chains.values()):
    for index, (residue, point) in enumerate(chain):
        for next_residue, next_point in chain[index + 1:]:
            if abs(next_residue - residue) > 1 or (next_point - point).length > 0.16:
                continue
            spline = backbone.splines.new('POLY')
            spline.points.add(1)
            spline.points[0].co, spline.points[1].co = (*point, 1), (*next_point, 1)
            spline.material_index = chain_index
backbone.materials.append(pearl)
backbone.materials.append(amber)
backbone.materials.append(teal)
trace = bpy.data.objects.new('DNA molecular bonds', backbone)
scene.collection.objects.link(trace)
assembly = bpy.data.objects.new('Molecular landscape', None)
scene.collection.objects.link(assembly)
molecule.parent = trace.parent = assembly
# Artistic placements of the same measured assembly, not experimental relationships.
for index, (location, rotation, size) in enumerate([
    ((-3.1, 1.7, 0.8), (0.5, -0.4, -0.5), 1.05),
    ((3.5, 4.0, 1.1), (-0.5, 0.1, 0.5), 1.2),
    ((-1.1, 7, 3.1), (0.2, -0.4, 0.1), 1.3),
]):
    group = bpy.data.objects.new(f'Distant assembly {index}', None)
    scene.collection.objects.link(group)
    group.location, group.rotation_euler, group.scale = location, rotation, (size,) * 3
    for source in (molecule, trace):
        copy = bpy.data.objects.new(f'{source.name} instance {index}', source.data)
        scene.collection.objects.link(copy)
        copy.parent = group
assembly.rotation_euler = (0.25, -0.65, -0.2) if args.variant != 2 else (0.8, -0.2, 0.5)

def area(name, location, color, power, size):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.color, light.shape, light.size = power, color, 'DISK', size
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()

area('Soft white observation light', (1, -5, 6), (0.9, 1, 0.95), 500, 4)
area('Amber edge light', (-4, 2, 2), (1, 0.52, 0.23), 1100, 3)
area('Teal depth light', (3, 5, -1), (0.27, 0.7, 0.65), 1000, 3)
camera_data = bpy.data.cameras.new('Scientific observation')
camera = bpy.data.objects.new('Scientific observation', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 52
camera_data.dof.use_dof = True
camera_data.dof.aperture_fstop = 3.4
focus = bpy.data.objects.new('Observation focus', None)
scene.collection.objects.link(focus)
camera_data.dof.focus_object = focus
base_camera = Vector([(2.4, -8.7, 4.5), (1.8, -6.4, 3.2), (3.4, -8.0, 2.8)][args.variant])
base_target = Vector((0, 0, -1.3) if args.mobile else (-0.1, 0, -0.8))
if args.mobile:
    base_camera *= 1.12
    base_target.z -= 0.1

def pose(frame):
    phase = (frame - 1) / 240 * math.tau
    camera.location = base_camera + Vector((0.72 * math.sin(phase), 0.42 * math.cos(phase), 0.36 * math.sin(phase + 0.4)))
    target = base_target + Vector((0.18 * math.sin(phase + 0.2), 0, 0.14 * math.sin(phase)))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    focus.location = (0, 0.4 + 0.65 * (1 - math.cos(phase)), 0)

if args.animate:
    for frame in range(1, 242):
        pose(frame)
        camera.keyframe_insert(data_path='location', frame=frame)
        camera.keyframe_insert(data_path='rotation_euler', frame=frame)
        focus.keyframe_insert(data_path='location', frame=frame)
    scene.render.filepath = os.path.join(args.output, 'frame-')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.output, 'molecular-landscape.blend'))
    bpy.ops.render.render(animation=True)
else:
    pose(1)
    scene.render.filepath = os.path.join(args.output, f'variant-{args.variant}{"-mobile" if args.mobile else ""}.png')
    bpy.ops.render.render(write_still=True)
