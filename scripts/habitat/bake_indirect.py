"""Bake Cycles diffuse bounce lighting into the existing UV1 atlas.

Run against the packed master, after rendering the posters. The output is raw GLB;
recompress before delivery. glTF emission is the transport channel for the lightmap;
the Web loader restores the original emission and binds the texture as lightMap.
"""
import bpy, sys, argparse, json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from denoise_lightmap import denoise
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--section',default='');p.add_argument('--samples',type=int,default=32)
p.add_argument('--mode',choices=['indirect','full'],default='indirect')
p.add_argument('--include-architecture',action='store_true',help='Bake room-specific shadows on the shared architectural UV atlas')
p.add_argument('--architecture-resolution',type=int,default=2048)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;poses=json.loads(scene['tour_manifest']);scene.cycles.samples=args.samples
scene.cycles.use_denoising=True
jobs=[]
for key,index in [('architecture',0),('environment',0)]+[(p['id'],i) for i,p in enumerate(poses)]:
    if args.section and key not in args.section.split(','):continue
    if args.include_architecture and key not in ['architecture','environment','top']:
        jobs.append(('architecture-'+key,index,'Architecture'))
    jobs.append((key,index,'Architecture' if key=='architecture' else 'Orbital city' if key=='environment' else key))
for key,index,collection_name in jobs:
    coll=bpy.data.collections[collection_name]
    if key=='environment':
        # The skyline also needs self-shadowing. Give its shared static geometry
        # an atlas while retaining the photographed foliage's material UVs.
        meshes=[o for o in coll.objects if o.type=='MESH']
        for obj in meshes:
            if not obj.data.uv_layers:obj.data.uv_layers.new(name='UVMap')
            else:obj.data.uv_layers[0].name='UVMap'
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:obj.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=meshes[0]
        obj.name='Static_OrbitalCity'
        obj.data.uv_layers.new(name='Lightmap');obj.data.uv_layers.active_index=1
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.003)
        bpy.ops.object.mode_set(mode='OBJECT');obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
        for slot,source in enumerate(list(obj.data.materials)):
            material=source.copy();obj.data.materials[slot]=material
            uv=material.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
            for node in list(material.node_tree.nodes):
                if node.type=='TEX_IMAGE':material.node_tree.links.new(uv.outputs['UV'],node.inputs['Vector'])
    hidden_copies=[]
    # The master contains linked architectural instances for the other rooms.
    # Move the exportable source into the chosen room, temporarily hiding its
    # overlapping instance, so each room receives its own furniture shadows.
    if collection_name=='Architecture' and index:
        for obj in coll.objects:
            for other in scene.objects:
                if other is not obj and other.type=='MESH' and other.data==obj.data and abs(other.location.x-obj.location.x-index*22)<.001:
                    hidden_copies.append((other,other.hide_render));other.hide_render=True
            obj.location.x+=index*22
    original_slots=[]
    for name,dx in [('window daylight',0),('indirect ceiling',-4),('foreground fill',4)]:
        lamp=bpy.data.objects[name];lamp.location.x=index*22+dx
        lamp.rotation_euler=(Vector((index*22,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
    for obj in coll.objects:
        if obj.type!='MESH' or not obj.name.startswith('Static_') or len(obj.data.uv_layers)<2:continue
        resolution=(4096 if key in ['architecture','environment'] else args.architecture_resolution if collection_name=='Architecture' else 2048) if args.mode=='full' else (2048 if collection_name=='Architecture' else 1024)
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
        passes={'DIRECT','INDIRECT'} if args.mode=='full' else {'INDIRECT'}
        bpy.ops.object.bake(type='DIFFUSE',pass_filter=passes,use_clear=True,margin=8,uv_layer=obj.data.uv_layers[1].name)
        denoise(image)
        image.pack()
        for material,tex in pending:
            shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            emission=shader.inputs['Emission Color'];strength=shader.inputs['Emission Strength']
            material['habitat_baked_indirect']=True
            material['habitat_baked_full']=args.mode=='full'
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
    if collection_name=='Architecture' and index:
        for obj in coll.objects:obj.location.x-=index*22
        for obj,hidden in hidden_copies:obj.hide_render=hidden
    print('INDIRECT_EXPORT_COMPLETE',key,flush=True)
