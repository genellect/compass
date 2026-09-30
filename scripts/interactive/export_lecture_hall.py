"""Export the actual Blender auditorium with baked irradiance and PBR reflections.
Run with Blender --background <master.blend> --python ... -- --output <asset-dir>.
The editable master is never overwritten by export-only mesh consolidation.
"""
import bpy,sys,math,argparse,json,numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from pack_lightmap import pack_lightmap
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--samples',type=int,default=24);p.add_argument('--resolution',type=int,default=2048)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=a.samples;scene.cycles.use_denoising=True
authored_resolution=(scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'habitat'))
from denoise_lightmap import denoise
# Camera-space environment is rendered from the authored room, not a stock HDRI.
camera=scene.camera;data=bpy.data.cameras.new('Reflection capture');envcam=bpy.data.objects.new('Reflection capture',data);scene.collection.objects.link(envcam)
envcam.location=(0,3,4);envcam.rotation_euler=(math.pi/2,0,0);data.type='PANO';data.panorama_type='EQUIRECTANGULAR'
scene.camera=envcam;scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='HDR';scene.render.filepath=str(out/'room-light.hdr');scene.cycles.samples=16
bpy.ops.render.render(write_still=True)
hidden=[(o,o.hide_render) for o in scene.objects if o.type=='MESH']
for obj,_ in hidden:obj.hide_render=True
scene.render.resolution_x=512;scene.render.resolution_y=256;scene.render.filepath=str(out/'sky.hdr');scene.cycles.samples=4
bpy.ops.render.render(write_still=True)
for obj,value in hidden:obj.hide_render=value
scene.camera=camera;bpy.data.objects.remove(envcam,do_unlink=True);scene.cycles.samples=a.samples
# glTF derives the vertical FOV from the scene's render aspect ratio.
scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage=authored_resolution
print('ROOM_REFLECTION_CAPTURED',flush=True)
# Retain local metre-scale coordinates for the parent's tiled material maps.
seen=set()
for obj in bpy.data.collections['Architecture'].objects:
    if obj.type!='MESH' or obj.data in seen or obj.get('future_hall_screen'):continue
    seen.add(obj.data);mesh=obj.data
    uv=mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
    key=mesh.materials[0].name if mesh.materials else ''
    scale=9 if key=='ink wool' else 1.5 if key=='satin titanium' else .65 if key=='walnut' else .7
    for face in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            co=mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv=(co[axes[0]]*scale,co[axes[1]]*scale)
# Export-compatible material graphs use the same source photographs.
for name in ['mineral stone','ink wool','satin titanium','walnut']:
    m=bpy.data.materials[name];nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    for tex in [n for n in nodes if n.type=='TEX_IMAGE' and n.image and n.image.filepath.endswith(('.webp','.jpg'))]:
        tex.projection='FLAT';links.new(uv.outputs[0],tex.inputs['Vector'])
        if '-normal.' in tex.image.filepath:
            normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.3
            links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
        if '-diffuse.' in tex.image.filepath:
            import numpy as np
            image=tex.image.copy();values=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(values)
            values=values.reshape((-1,4));values[:,:3]*=np.array(m.diffuse_color[:3]) if name!='walnut' else 1;image.pixels.foreach_set(values.ravel());image.pack();tex.image=image
            links.new(tex.outputs['Color'],bs.inputs['Base Color'])
# Merge only static geometry; articulated students retain their authored rigs.
jobs=[
    ('Architecture',[o for o in bpy.data.collections['Architecture'].objects if o.type=='MESH' and not o.data.shape_keys and not o.get('future_hall_screen')]),
    ('Seated students',[o for o in bpy.data.collections['Students'].objects if o.type=='MESH' and not o.parent]),
]
transport=[]
for name,objects in jobs:
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.data=obj.data.copy()
        if not obj.data.uv_layers:obj.data.uv_layers.new(name='UVMap')
        obj.select_set(True)
    active=objects[0];bpy.context.view_layer.objects.active=active;bpy.ops.object.join();active.name='Static '+name
    lightuv=active.data.uv_layers.new(name='Lightmap');active.data.uv_layers.active_index=1
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.002);bpy.ops.object.mode_set(mode='OBJECT')
    active.data.uv_layers.active_index=0;active.data.uv_layers[0].active_render=True
    image=bpy.data.images.new(name+' irradiance',width=a.resolution,height=a.resolution,float_buffer=True,alpha=False)
    pending=[];replacements={}
    for slot,source in enumerate(list(active.data.materials)):
        if source in replacements:
            active.data.materials[slot]=replacements[source];continue
        m=source.copy();replacements[source]=m;active.data.materials[slot]=m
        nodes=m.node_tree.nodes;links=m.node_tree.links;tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Lightmap';links.new(uv.outputs[0],tex.inputs['Vector']);pending.append((m,tex))
    print('BAKING',name,len(active.data.polygons),flush=True)
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},use_clear=True,margin=8,uv_layer='Lightmap')
    denoise(image)
    # PNG glTF textures have bounded values. Preserve irradiance above 1 by
    # storing a normalized atlas and transporting its radiance scale in extras.
    values=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(values)
    values=values.reshape((-1,4));peak=float(np.max(values[:,:3]))
    radiance_scale=2**max(0,math.ceil(math.log2(max(peak,1))))
    values[:,:3]/=radiance_scale;image.pixels.foreach_set(values.ravel())
    for m,_ in pending:m['future_hall_lightmap_scale']=radiance_scale
    image.pack()
    encoded=pack_lightmap(image)
    for m,tex in pending:
        tex.image=encoded
        m['future_hall_lightmap_encoding']='srgb'
    print('IRRADIANCE_RANGE',peak,radiance_scale,flush=True)
    transport.extend(pending)
    print('LIGHTMAP_COMPLETE',name,flush=True)
# Transport is connected only after all bakes, so it cannot add a second source
# of illumination while the next group is being baked.
for m,tex in transport:
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    emission=bs.inputs['Emission Color'];strength=bs.inputs['Emission Strength']
    m['future_hall_baked_full']=True;m['future_hall_emissive']=[float(c*strength.default_value) for c in emission.default_value[:3]]
    m.node_tree.links.new(tex.outputs[0],emission);strength.default_value=1
# Selection excludes lights because the browser reproduces the animated portrait lighting.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'baked-export.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type in ['MESH','ARMATURE','CAMERA']:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'lecture-hall.raw.glb'),use_selection=True,export_format='GLB',export_yup=True,export_cameras=True,export_lights=False,export_extras=True,export_animations=True,export_animation_mode='SCENE',export_frame_step=3,export_force_sampling=True,export_image_format='AUTO',export_optimize_animation_size=True)
print('LECTURE_EXPORT_COMPLETE',flush=True)
