"""Bake Cycles diffuse bounce lighting into the existing UV1 atlas.

Run against the packed master, after rendering the posters. The output is raw GLB;
recompress before delivery. glTF emission is the transport channel for the lightmap;
the Web loader restores the original emission and binds the texture as lightMap.
"""
import bpy, sys, argparse, json
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--section',default='');p.add_argument('--samples',type=int,default=32)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;poses=json.loads(scene['tour_manifest']);scene.cycles.samples=args.samples
scene.cycles.use_denoising=True
for key,index in [('architecture',0)]+[(p['id'],i) for i,p in enumerate(poses)]:
    if args.section and key not in args.section.split(','):continue
    coll=bpy.data.collections['Architecture' if key=='architecture' else key]
    original_slots=[]
    for name,dx in [('window daylight',0),('indirect ceiling',-4),('foreground fill',4)]:
        lamp=bpy.data.objects[name];lamp.location.x=index*22+dx
        lamp.rotation_euler=(Vector((index*22,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
    for obj in coll.objects:
        if obj.type!='MESH' or not obj.name.startswith('Static_') or len(obj.data.uv_layers)<2:continue
        resolution=2048 if key=='architecture' else 1024
        image=bpy.data.images.new(key+' indirect radiance',width=resolution,height=resolution,float_buffer=True,alpha=False)
        pending=[]
        original_slots.append((obj,list(obj.data.materials)))
        for slot,source in enumerate(list(obj.data.materials)):
            material=source.copy();obj.data.materials[slot]=material
            nodes=material.node_tree.nodes;links=material.node_tree.links
            tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map=obj.data.uv_layers[1].name;links.new(uv.outputs['UV'],tex.inputs['Vector'])
            pending.append((material,tex))
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.bake(type='DIFFUSE',pass_filter={'INDIRECT'},use_clear=True,margin=8,uv_layer=obj.data.uv_layers[1].name)
        image.pack()
        for material,tex in pending:
            shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            emission=shader.inputs['Emission Color'];strength=shader.inputs['Emission Strength']
            material['habitat_baked_indirect']=True
            material['habitat_emissive']=[float(c*strength.default_value) for c in emission.default_value[:3]]
            material.node_tree.links.new(tex.outputs['Color'],emission);strength.default_value=1
        print('INDIRECT_BAKED',key,resolution,flush=True)
    # Move only for export; retain the authored world placement for later bakes.
    for obj in coll.objects:obj.location.x-=index*22
    bpy.ops.object.select_all(action='DESELECT')
    for obj in coll.objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/(key+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    for obj in coll.objects:obj.location.x+=index*22
    for obj,materials in original_slots:
        for slot,material in enumerate(materials):obj.data.materials[slot]=material
    print('INDIRECT_EXPORT_COMPLETE',key,flush=True)
