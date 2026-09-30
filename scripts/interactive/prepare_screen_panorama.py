"""Frame a CC0 photographed horizon for the physical panoramic display.

This is an optical crop of a real panorama, not a generated image. The hall,
glass, seating and reflections are authored separately as Blender geometry.
"""
import argparse, sys, bpy
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.render.resolution_x = 3072
scene.render.resolution_y = 906
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
mesh = bpy.data.meshes.new('Photographic crop')
mesh.from_pydata([(-10,-2.95,0),(10,-2.95,0),(10,2.95,0),(-10,2.95,0)], [], [(0,1,2,3)])
obj = bpy.data.objects.new('Photographic crop', mesh)
scene.collection.objects.link(obj)
uv = mesh.uv_layers.new(name='UVMap')
# A wide view across the water and layered hills; no camera tripod/ground plate.
for loop, value in zip(mesh.polygons[0].loop_indices, [(.40,.435),(.85,.435),(.85,.675),(.40,.675)]):
    uv.data[loop].uv = value
mat = bpy.data.materials.new('Photographed horizon')
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes.clear()
image = nodes.new('ShaderNodeTexImage')
image.image = bpy.data.images.load(str(Path(a.source).resolve()))
emission = nodes.new('ShaderNodeEmission')
output = nodes.new('ShaderNodeOutputMaterial')
mat.node_tree.links.new(image.outputs['Color'], emission.inputs['Color'])
mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
mesh.materials.append(mat)
camdata = bpy.data.cameras.new('Photographic framing')
camera = bpy.data.objects.new('Photographic framing', camdata)
scene.collection.objects.link(camera)
camera.location = (0,0,5)
camdata.type = 'ORTHO'
camdata.ortho_scale = 20
scene.camera = camera
scene.render.film_transparent = False
scene.render.filepath = str(Path(a.output).resolve())
Path(a.output).resolve().parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)
print('PHOTOGRAPHIC_SCREEN_PREPARED', flush=True)
