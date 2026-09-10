"""Render a baked .blend in a fresh GPU context. Blender -b scene.blend -P this.py -- OUTPUT_DIR KEY"""
import bpy, os, sys
output, key = sys.argv[sys.argv.index('--') + 1:]
scene = bpy.context.scene
# Color denoising removes stochastic shadow grain while retaining the authored geometry.
scene.use_nodes = True
nodes = scene.node_tree.nodes
nodes.clear()
layers = nodes.new('CompositorNodeRLayers')
denoise = nodes.new('CompositorNodeDenoise')
composite = nodes.new('CompositorNodeComposite')
scene.node_tree.links.new(layers.outputs['Image'], denoise.inputs['Image'])
scene.node_tree.links.new(denoise.outputs['Image'], composite.inputs['Image'])
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = os.path.join(os.path.abspath(output), key + '-')
bpy.ops.render.render(animation=True)
