"""Bake the new facility only; launch with its editable .blend already loaded.

Existing v3 models and maps remain byte-for-byte unchanged. A separate lightmap
UV atlas transports diffuse indirect radiance; AO retains contact detail while
real-time direct light still receives moving-door shadows.
"""
import argparse,json,math,sys,time
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'habitat'))
from denoise_lightmap import denoise
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--resolution',type=int,default=2048);p.add_argument('--samples',type=int,default=32)
opt=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(opt.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=opt.samples
scene.cycles.max_bounces=5;scene.render.threads_mode='FIXED';scene.render.threads=6
manifest=json.loads((out/'manifest.json').read_text(encoding='utf8'))
report=[]
for coll_name,filename in [('concourse','concourse.glb'),('vision architecture','vision-shell.glb')]:
    began=time.monotonic();coll=bpy.data.collections[coll_name]
    meshes=[o for o in coll.objects if o.type=='MESH' and not o.name.startswith('Door') and all('glazing' not in m.name for m in o.data.materials)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=meshes[0];obj.name='Baked_'+coll_name
    uv0=obj.data.uv_layers[0];uv0.name='UVMap'
    obj.data.uv_layers.new(name='Lightmap');obj.data.uv_layers.active_index=1
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.004);bpy.ops.object.mode_set(mode='OBJECT')
    settings=bpy.data.node_groups.get('glTF Material Output')
    if not settings:
        settings=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');settings.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');settings.nodes.new('NodeGroupInput');settings.nodes.new('NodeGroupOutput')
    ao=bpy.data.images.new(coll_name+' contact occlusion',width=opt.resolution,height=opt.resolution,alpha=False);ao.colorspace_settings.name='Non-Color'
    indirect=bpy.data.images.new(coll_name+' indirect radiance',width=opt.resolution,height=opt.resolution,float_buffer=True,alpha=False)
    pending=[]
    for i,source in enumerate(list(obj.data.materials)):
        mat=source.copy();obj.data.materials[i]=mat;nodes,links=mat.node_tree.nodes,mat.node_tree.links
        baseuv=nodes.new('ShaderNodeUVMap');baseuv.uv_map='UVMap'
        for node in list(nodes):
            if node.type=='TEX_IMAGE':links.new(baseuv.outputs['UV'],node.inputs['Vector'])
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Lightmap'
        tex=nodes.new('ShaderNodeTexImage');tex.image=ao;links.new(uv.outputs['UV'],tex.inputs['Vector']);nodes.active=tex
        occlusion=nodes.new('ShaderNodeAmbientOcclusion');occlusion.inputs['Distance'].default_value=2.2
        emission=nodes.new('ShaderNodeEmission');links.new(occlusion.outputs['Color'],emission.inputs['Color'])
        output=nodes.get('Material Output');original=output.inputs['Surface'].links[0].from_socket;links.new(emission.outputs[0],output.inputs['Surface'])
        group=nodes.new('ShaderNodeGroup');group.node_tree=settings;links.new(tex.outputs['Color'],group.inputs['Occlusion'])
        pending.append((mat,uv,original,output,occlusion,emission))
    scene.cycles.samples=16;bpy.ops.object.bake(type='EMIT',use_clear=True,margin=8,uv_layer='Lightmap');ao.pack()
    for mat,uv,original,output,occlusion,emission in pending:
        nodes,links=mat.node_tree.nodes,mat.node_tree.links;links.new(original,output.inputs['Surface']);nodes.remove(occlusion);nodes.remove(emission)
        tex=nodes.new('ShaderNodeTexImage');tex.image=indirect;links.new(uv.outputs['UV'],tex.inputs['Vector']);nodes.active=tex
    scene.cycles.samples=opt.samples;bpy.ops.object.bake(type='DIFFUSE',pass_filter={'INDIRECT'},use_clear=True,margin=8,uv_layer='Lightmap');denoise(indirect);indirect.pack()
    for mat,uv,*_ in pending:
        shader=mat.node_tree.nodes.get('Principled BSDF');strength=shader.inputs['Emission Strength'];emission=shader.inputs['Emission Color']
        mat['habitat_baked_indirect']=True;mat['habitat_baked_full']=False;mat['habitat_emissive']=[float(c*strength.default_value) for c in emission.default_value[:3]]
        mat.node_tree.links.new(mat.node_tree.nodes.active.outputs['Color'],emission);strength.default_value=1
    obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    # Shell delivery is local to the room, while the saved master stays in world space.
    transform=Matrix.Identity(4)
    if filename.startswith('vision'):
        room=manifest['rooms'][1];transform=Matrix.Translation(Vector((room['origin'][0],-room['origin'][2],0)))@Matrix.Rotation(-room['yaw'],4,'Z')
    saved={o:o.matrix_world.copy() for o in coll.objects if o.parent is None}
    for o,matrix in saved.items():o.matrix_world=transform.inverted()@matrix
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:
        if o.type=='MESH':o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/filename),use_selection=True,export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    for o,matrix in saved.items():o.matrix_world=matrix
    report.append({'file':filename,'seconds':round(time.monotonic()-began,2),'resolution':opt.resolution,'indirectSamples':opt.samples,'aoSamples':16})
    print('BAKED',report[-1],flush=True)
(out/'lighting-report.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(Path(bpy.data.filepath).with_name('compass-explorer-baked.blend')))
