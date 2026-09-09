"""Reproducible COMPASS habitat. Blender 4.5.13: --background --python ... -- --output DIR --master FILE.
Architecture and furniture are authored here. Supporting CC0 materials and foliage
are documented in ASSET_CREDITS.md. Blender Z-up is exported as glTF Y-up.
The build is offline; --source-materials supplies the downloaded authoring assets.
"""
import bpy, math, random, json, argparse, sys
from pathlib import Path
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument('--output', required=True)
args.add_argument('--master', required=True)
args.add_argument('--render', action='store_true')
args.add_argument('--render-section', default='')
args.add_argument('--bake', action='store_true')
args.add_argument('--bake-sections', default='')
args.add_argument('--draft', action='store_true')
args.add_argument('--reuse-bakes', action='store_true')
args.add_argument('--source-materials', required=True)
opt = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(opt.output).resolve(); out.mkdir(parents=True, exist_ok=True)
opt.master = str(Path(opt.master).resolve())
sources = Path(opt.source_materials).resolve()
random.seed(21)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 48
scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.035;scene.cycles.adaptive_min_samples=8
scene.cycles.max_bounces = 6; scene.cycles.diffuse_bounces = 3; scene.cycles.glossy_bounces = 3
scene.cycles.transparent_max_bounces = 4
scene.cycles.use_denoising = True
scene.render.resolution_x = 1920; scene.render.resolution_y = 1080; scene.render.resolution_percentage = 100
if opt.draft:
    scene.cycles.samples=16;scene.render.resolution_percentage=50
scene.world.color = (.12, .12, .12)
scene.view_settings.view_transform = 'AgX'

def material(name, color, metal=0, rough=.4, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m

M={
 'ceramic':material('warm porcelain',(.63,.65,.62),.05,.42),
 'floor':material('honed limestone',(.29,.31,.30),.05,.54),
 'silver':material('brushed titanium',(.40,.43,.45),.92,.34),
 'dark':material('ink graphite',(.016,.031,.047),.45,.36),
 'cyan':material('cool white light',(.55,.83,.90),.05,.32,2),
 'warm':material('warm light',(.95,.76,.49),.05,.4,2),
 'green':material('living leaf',(.06,.25,.13),.02,.65),
 'sage':material('mineral woven fabric',(.26,.30,.28),0,.86),
 'blue':material('blue ceramic',(.035,.17,.32),.45,.25),
 'screen':material('interface glass',(.06,.33,.42),.4,.24,.6),
 'planet':material('distant world',(.025,.20,.30),.05,.7,.2),
 'glass':material('panoramic glazing',(.65,.8,.88),.25,.08),
}
M['glass'].diffuse_color=(.65,.8,.88,.075)
M['glass'].node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.075
M['glass'].surface_render_method='DITHERED'
if (out/'planet.webp').exists():
    t=M['planet'].node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(out/'planet.webp'))
    M['planet'].node_tree.links.new(t.outputs['Color'],M['planet'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

# Original, repeatable surface maps: subtle mineral pores, woven upholstery and
# anisotropic-looking metal grain. The maps survive glTF; Blender-only noise does not.
def surface_map(key, kind):
    n=256; img=bpy.data.images.new(key+' surface',width=n,height=n)
    pixels=[]; base=M[key].diffuse_color[:3]
    rng=random.Random(83)
    for y in range(n):
        row=rng.uniform(-.014,.014)
        for x in range(n):
            noise=rng.uniform(-.025,.025)
            if kind=='metal': noise=row+rng.uniform(-.004,.004)
            if kind=='fabric': noise=.025*math.sin(x*math.pi/2)*math.sin(y*math.pi/2)+noise*.3
            if kind=='stone': noise+=.011*math.sin(x*.2+math.sin(y*.04)*3)
            pixels.extend([max(0,min(1,c+noise)) for c in base]+[1])
    img.pixels.foreach_set(pixels);img.pack()
    nodes=M[key].node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=img
    M[key].node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
for key,kind in [('floor','stone'),('silver','metal'),('sage','fabric')]:surface_map(key,kind)

def scanned_material(key, asset, normal_strength, roughness_scale):
    mat=M[key];nodes=mat.node_tree.nodes;links=mat.node_tree.links;p=nodes.get('Principled BSDF')
    for channel,socket in [('Diffuse','Base Color'),('Rough','Roughness'),('nor_gl','Normal')]:
        tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(sources/(asset+'_'+channel+'.jpg')),check_existing=True)
        tex.image.pack()
        if channel!='Diffuse':tex.image.colorspace_settings.name='Non-Color'
        if channel=='nor_gl':
            normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=normal_strength
            links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs[socket])
        elif channel=='Rough':
            # Multiplied maps are baked to an ordinary texture by the preparation step.
            links.new(tex.outputs['Color'],p.inputs[socket])
        else:links.new(tex.outputs['Color'],p.inputs[socket])
    p.inputs['Metallic'].default_value=0
scanned_material('floor','marble_01',.23,1)
scanned_material('sage','rough_linen',.38,1)

# Keep only the leaves of Rico Cilliers' CC0 plant; the pot and architecture are ours.
with bpy.data.libraries.load(str(sources/'plant.blend'),link=False) as (available,loaded):
    loaded.objects=['potted_plant_01_leaves','potted_plant_01_stem']
plant_sources=loaded.objects
for obj in plant_sources:
    scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    decimate=obj.modifiers.new('web foliage topology','DECIMATE');decimate.ratio=.38
    bpy.ops.object.modifier_apply(modifier=decimate.name);obj.select_set(False)
    if 'stem' in obj.name:obj.data.materials.clear();obj.data.materials.append(M['green'])
    else:
        leafmat=material('photographed foliage',(.12,.27,.10),0,.6)
        nodes=leafmat.node_tree.nodes;links=leafmat.node_tree.links;p=nodes.get('Principled BSDF')
        for channel,socket in [('diff','Base Color'),('rough','Roughness'),('nor_gl','Normal'),('alpha','Alpha')]:
            tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(sources/'textures'/('potted_plant_01_leaves_'+channel+'_1k.png')),check_existing=True);tex.image.pack()
            if channel!='diff':tex.image.colorspace_settings.name='Non-Color'
            if channel=='nor_gl':
                normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45
                links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],p.inputs[socket])
            else:links.new(tex.outputs['Color'],p.inputs[socket])
        leafmat.surface_render_method='DITHERED';leafmat['habitat_cutout']=True
        obj.data.materials.clear();obj.data.materials.append(leafmat);M['leaves']=leafmat
    for collection in list(obj.users_collection):collection.objects.unlink(obj)
far_plant_sources=[]
for source in plant_sources:
    o=source.copy();o.data=source.data.copy();scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    decimate=o.modifiers.new('distant botanical silhouette','DECIMATE');decimate.ratio=.12
    bpy.ops.object.modifier_apply(modifier=decimate.name);o.select_set(False)
    scene.collection.objects.unlink(o);far_plant_sources.append(o)
with bpy.data.libraries.load(str(sources/'lounge-chair.blend'),link=False) as (available,loaded):
    loaded.objects=['modern_arm_chair_01']
lounge_source=loaded.objects[0]
for mat in lounge_source.data.materials:
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            node.image.filepath=str(sources/'textures'/Path(node.image.filepath.replace('\\','/')).name)
            node.image.reload();node.image.pack()
    M[mat.name]=mat
# Use the precisely upholstered shell with our satin titanium frame.
lounge_source.data.materials[0]=M['silver']
current=None
def finish(o,name,mat):
    o.name=name; o.data.materials.append(M[mat])
    for coll in list(o.users_collection): coll.objects.unlink(o)
    current.objects.link(o)
    return o
def box(name,pos,size,mat='ceramic',bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos); o=bpy.context.object
    o.scale=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('soft machined edge','BEVEL'); b.width=min(bevel,min(size)*.35); b.segments=3
        bpy.ops.object.modifier_apply(modifier=b.name)
        for p in o.data.polygons:p.use_smooth=True
        normals=o.modifiers.new('manufactured surface normals','WEIGHTED_NORMAL');normals.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=normals.name)
    if mat in ['floor','sage']:
        uv=o.data.uv_layers.active
        repeat=1.5 if mat=='floor' else .32
        for polygon in o.data.polygons:
            axis=max(range(3),key=lambda i:abs(polygon.normal[i]));u,v=[i for i in range(3) if i!=axis]
            for loop in polygon.loop_indices:
                co=o.data.vertices[o.data.loops[loop].vertex_index].co
                uv.data[loop].uv=(co[u]/repeat,co[v]/repeat)
    return finish(o,name,mat)
def sphere(name,pos,scale,mat='ceramic'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8 if name=='star' else 64,ring_count=4 if name=='star' else 32,location=pos)
    o=bpy.context.object; o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,mat)
def cylinder(name,pos,r,depth,mat='ceramic',vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128 if r>1 else vertices,radius=r,depth=depth,location=pos)
    o=bpy.context.object
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return finish(o,name,mat)
def ring(name,pos,r,thick,mat='silver',rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=128,minor_segments=12,location=pos,major_radius=r,minor_radius=thick,rotation=rotation)
    o=bpy.context.object
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,mat)
def bar(name,a,b,r=.025,mat='silver'):
    d=Vector(b)-Vector(a); o=cylinder(name,(Vector(a)+Vector(b))/2,r,d.length,mat,8)
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def plant(x,y,s=1):
    cylinder('planter',(x,y,.35*s),.4*s,.7*s,'ceramic')
    cylinder('planter soil',(x,y,.704*s),.35*s,.025*s,'dark')
    angle=random.uniform(0,math.tau)
    for source in far_plant_sources if current.name=='Orbital city' else plant_sources:
        o=source.copy();o.data=source.data.copy();current.objects.link(o)
        o.location=(x,y,.38*s);o.scale=(s,s,s);o.rotation_euler.z=angle
def chair(x,y,a=0):
    o=lounge_source.copy();o.data=lounge_source.data.copy();current.objects.link(o)
    o.location=(x,y,.035);o.rotation_euler.z=a
    return

def authored_task_chair(x,y,a=0):
    def point(dx,dy,z):return (x+dx*math.cos(a)-dy*math.sin(a),y+dx*math.sin(a)+dy*math.cos(a),z)
    seat=box('upholstered seat',(x,y,.51),(.88,.76,.15),'sage',.065);seat.rotation_euler.z=a
    verts=[];faces=[]
    for h in [0,1]:
        for k in range(25):
            arc=(k/24-.5)*2.8
            verts.append(point(math.sin(arc)*(.49+h*.035),math.cos(arc)*(.38+h*.13),.53+h*.53))
    for k in range(24):faces.append((k,k+1,k+26,k+25))
    mesh=bpy.data.meshes.new('curved chair shell');mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        for loop in face.loop_indices:
            index=mesh.loops[loop].vertex_index;uv.data[loop].uv=(index%25/24*4,index//25*1.65)
    back=bpy.data.objects.new('curved backrest',mesh);current.objects.link(back);back.data.materials.append(M['sage'])
    for p in mesh.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=back;back.select_set(True)
    solid=back.modifiers.new('upholstery thickness','SOLIDIFY');solid.thickness=.065;bpy.ops.object.modifier_apply(modifier=solid.name)
    for dx in [-.31,.31]:
        for dy in [-.25,.25]:bar('splayed titanium leg',point(dx,dy,.46),point(dx*1.25,dy*1.25,.035),.018,'silver')
def desk(x,y,w=2.5):
    box('work surface',(x,y,.77),(w,1.05,.08),'ceramic',.025)
    for dx in [-w*.36,w*.36]:box('desk support',(x+dx,y,.365),(.075,.7,.73),'silver',.018)
    box('desk shadow reveal',(x,y,.719),(w-.12,.94,.022),'dark',.007)
def monitor(x,y):
    box('display',(x,y,1.19),(.98,.06,.46),'dark',.016)
    box('screen',(x,y-.032,1.19),(.94,.012,.42),'screen',.008)
    bar('display stem',(x,y,.81),(x,y,.99),.025)
    for dz in [-.10,0,.10]:box('screen trace',(x-.10,y-.042,1.19+dz),(.46,.008,.009),'cyan',0)
    box('keyboard',(x,y-.32,.84),(.62,.22,.025),'dark',.006)
    for k in range(5):box('key row',(x,y-.39+k*.036,.858),(.54,.009,.004),'silver',0)
def core(x,y,z=2.5,scale=1):
    cylinder('core dais',(x,y,.22),1.8*scale,.35,'dark')
    ring('dais light',(x,y,.42),1.7*scale,.028,'cyan')
    sphere('Float_Core',(x,y,z),(.72*scale,)*3,'silver')
    ring('Spin_OrbitA',(x,y,z),1.2*scale,.022,'silver',(math.pi/2,.35,0))
    ring('Spin_OrbitB',(x,y,z),1.48*scale,.014,'cyan',(.7,-.55,.3))
    for k in range(16):
        a=k*math.tau/16
        bar('precision radial fin',(x+math.cos(a)*.82*scale,y+math.sin(a)*.82*scale,z-.14),(x+math.cos(a)*.82*scale,y+math.sin(a)*.82*scale,z+.14),.015,'silver')
def light(name,pos,power,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
def merge_static(coll):
    # One draw per material, preserving named animated meshes.
    for mat in M.values():
        objs=[o for o in coll.objects if o.type=='MESH' and not o.name.startswith(('Spin_','Float_')) and o.data.materials[0]==mat]
        if not objs:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();objs[0].name='Static_'+mat.name

def bake_occlusion(coll, resolution):
    if opt.reuse_bakes:
        cached=out/(coll.name.lower()+'.glb')
        if not cached.exists():raise RuntimeError('Missing baked model '+str(cached))
        for obj in list(coll.objects):bpy.data.objects.remove(obj,do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=str(cached))
        for obj in list(bpy.context.selected_objects):
            for source in list(obj.users_collection):source.objects.unlink(obj)
            coll.objects.link(obj)
        print('REUSED_BAKED_MODEL',coll.name,flush=True)
        return
    if not opt.bake:return
    if opt.bake_sections and coll.name.lower() not in opt.bake_sections.split(','):return
    meshes=[o for o in coll.objects if o.type=='MESH' and o.name.startswith('Static_') and o.data.materials[0]!=M['glass']]
    if not meshes:return
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=meshes[0];o.name='Static_'+coll.name
    if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
    o.data.uv_layers.new(name='Lightmap');o.data.uv_layers.active_index=len(o.data.uv_layers)-1
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    image=bpy.data.images.new(coll.name+' baked occlusion',width=resolution,height=resolution,alpha=False)
    image.colorspace_settings.name='Non-Color'
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
        group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
        group.nodes.new('NodeGroupInput');group.nodes.new('NodeGroupOutput')
    saved=[]
    for i,original in enumerate(list(o.data.materials)):
        mat=original.copy();o.data.materials[i]=mat;nodes=mat.node_tree.nodes;links=mat.node_tree.links
        # Explicit UV0 keeps the authored surface grain separate from the bake atlas.
        uv0=nodes.new('ShaderNodeUVMap');uv0.uv_map='UVMap'
        for node in list(nodes):
            if node.type=='TEX_IMAGE':links.new(uv0.outputs['UV'],node.inputs['Vector'])
        tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Lightmap';links.new(uv.outputs['UV'],tex.inputs['Vector'])
        ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=1.2;ao.only_local=True
        emission=nodes.new('ShaderNodeEmission');links.new(ao.outputs['Color'],emission.inputs['Color'])
        output=nodes.get('Material Output');source=output.inputs['Surface'].links[0].from_socket
        links.new(emission.outputs[0],output.inputs['Surface'])
        settings=nodes.new('ShaderNodeGroup');settings.node_tree=group;links.new(tex.outputs['Color'],settings.inputs['Occlusion'])
        saved.append((mat,source,output,ao,emission))
    samples=scene.cycles.samples;scene.cycles.samples=16
    bpy.ops.object.bake(type='EMIT',use_clear=True,margin=6,uv_layer='Lightmap')
    scene.cycles.samples=samples;image.pack()
    for mat,source,output,ao,emission in saved:
        mat.node_tree.links.new(source,output.inputs['Surface']);mat.node_tree.nodes.remove(ao);mat.node_tree.nodes.remove(emission)
    o.data.uv_layers.active_index=0;o.data.uv_layers[0].active_render=True
    print('OCCLUSION_BAKED',coll.name,resolution,flush=True)
def export(coll,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    return {'file':name+'.glb','bytes':(out/(name+'.glb')).stat().st_size,
        'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in coll.objects if o.type=='MESH'),
        'meshes':sum(o.type=='MESH' for o in coll.objects),'textures':len({n.image.name for o in coll.objects if o.type=='MESH' for m in o.data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image})}

# Architectural revision: a continuous inhabited observatory overlooking an orbital city.
# All dimensions are metres. Furniture remains at human scale; the skyline is not a diorama.
M['facade']=material('deep blue solar glazing',(.055,.09,.115),.68,.18)
M['lit']=material('occupied warm interior',(.18,.14,.09),.2,.3,.12)
M['stone']=material('ivory architectural concrete',(.58,.61,.59),0,.7)
M['soil']=material('planting substrate',(.023,.032,.021),0,1)
for i,color in enumerate([(.050,.081,.10),(.055,.087,.108),(.058,.090,.112)]):
    M['window'+str(i)]=material('solar glazing panel '+str(i),color,.72,.15+i*.012)
M['ground']=material('distant basalt paving',(.13,.145,.15),0,.78)

def mesh_object(name,verts,faces,mat,smooth=False):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);current.objects.link(o);o.data.materials.append(M[mat])
    for p in mesh.polygons:p.use_smooth=smooth
    return o

def ribbon(name,points,width,depth,mat='ceramic'):
    verts=[];faces=[]
    for x,y,z in points:
        verts.extend([(x-width/2,y,z),(x+width/2,y,z),(x-width/2,y,z-depth),(x+width/2,y,z-depth)])
    for k in range(len(points)-1):
        n=k*4;faces.extend([(n,n+4,n+5,n+1),(n+2,n+3,n+7,n+6),(n,n+2,n+6,n+4),(n+1,n+5,n+7,n+3)])
    return mesh_object(name,verts,faces,mat)

def rounded_outline(cx,cy,w,d,corner,segments=4):
    points=[]
    for x,y,a0 in [(cx+w/2-corner,cy+d/2-corner,0),(cx-w/2+corner,cy+d/2-corner,math.pi/2),(cx-w/2+corner,cy-d/2+corner,math.pi),(cx+w/2-corner,cy-d/2+corner,math.pi*1.5)]:
        for k in range(segments+1):
            a=a0+k/segments*math.pi/2;points.append((x+math.cos(a)*corner,y+math.sin(a)*corner))
    return points

def extrude_outline(name,points,z,depth,mat):
    n=len(points);v=[(x,y,z+h) for h in [0,depth] for x,y in points]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh_object(name,v,f,mat)

common=bpy.data.collections.new('Architecture');scene.collection.children.link(common);current=common
box('continuous structural slab',(0,-5,-.2),(22,34,.36),'stone',.04)
for x in range(-10,11,2):
    for y in range(-20,12,2):box('honed limestone paving',(x,y,.005),(1.992,1.992,.05),'floor',0)
# An inhabited room has a threshold and a back, rather than furniture on an open slab.
# Four-metre side openings lead into a continuous rear circulation gallery.
box('gallery back wall',(0,-11,3.25),(12,.32,6.5),'ceramic',.06)
box('gallery back wall shadow joint',(0,-10.82,.14),(11.8,.035,.10),'dark',0)
box('gallery cove light',(0,-10.78,5.9),(11.8,.035,.025),'warm',0)
box('rear gallery wall',(0,-21,3.25),(22,.35,6.5),'ceramic',.04)
box('rear gallery ceiling',(0,-16,6.5),(22,10,.25),'ceramic',.04)
for x in [-8,8]:
    for dx in [-1.85,1.85]:box('doorway jamb',(x+dx,-11,2.1),(.12,.6,4.2),'silver',.012)
    box('doorway lintel',(x,-11,4.2),(3.82,.6,.12),'silver',.012)
    box('doorway recessed light',(x,-11.32,4.10),(3.5,.025,.02),'warm',0)
for x in [-7,0,7]:
    box('rear gallery ceiling slot',(x,-16,6.34),(.065,8,.025),'warm',0)
# A glazed facade and an enclosed curved roof establish an actual room volume.
for x in [-10.8,-5.4,0,5.4,10.8]:
    box('tapered curtain wall mullion',(x,11,4.6),(.085,.24,9.2),'silver',.016)
    box('glazing pressure cap',(x,10.86,4.6),(.13,.045,9.2),'dark',.004)
box('glazed observatory window',(0,11.04,4.6),(21.8,.014,8.6),'glass',0)
box('window seat',(0,10.4,.37),(21.8,1,.72),'ceramic',.07)
box('window seat shadow reveal',(0,9.87,.12),(21.7,.03,.12),'dark',0)
box('warm sill light',(0,9.85,.68),(21.7,.025,.02),'warm',0)
for x in [-10.7,10.7]:
    # Arched portal follows the longitudinal concourse, open between every area.
    points=[(x,-15+k*.5,8.4+1.6*math.sin(k/54*math.pi)) for k in range(55)]
    ribbon('sweeping roof rib',points,.32,.28)
    for y in [-13,9.5]:bar('branching roof support',(x,y,0),(x,y,8.8),.13,'ceramic')
for x in [-8.5,-6.8,6.8,8.5]:
    points=[(x,-15+k*.5,8.5+1.6*math.sin(k/54*math.pi)) for k in range(55)]
    ribbon('acoustic ceiling strip',points,1.62,.12)
    ribbon('recessed ceiling light',[(a,b,c-.14) for a,b,c in points],.018,.018,'warm')
# A broad, continuous ceiling catches indirect light. Narrow clerestories retain
# a view of space without leaving the room visually open to an empty black sky.
for x,w in [(-8.5,5),(-2.7,5),(3.1,5),(8.7,4.6)]:
    points=[(x,-11+k*.44,6.6+.8*math.sin(k/50*math.pi)) for k in range(51)]
    ribbon('curved acoustic ceiling',points,w,.22)
    ribbon('continuous indirect cove',[(a-w/2+.04,b,c-.26) for a,b,c in points],.025,.025,'warm')
for y in [-12,-4,4,11]:
    bar('slender transverse skylight frame',(-10.7,y,9.1),(10.7,y,9.1),.065,'silver')
for x in [-8,8]:
    box('window lounge bench',(x,8,.46),(3,1.1,.65),'ceramic',.12)
    box('window lounge cushion',(x,8,.83),(2.85,1,.14),'sage',.06)
merge_static(common);bake_occlusion(common,2048)
report={'version':'3','blender':bpy.app.version_string,'seed':21,'assets':[export(common,'architecture')],'sections':[]}

ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact']
zones=[]
for i,key in enumerate(ids):
    coll=bpy.data.collections.new(key);scene.collection.children.link(coll);current=coll;zones.append(coll)
    if key=='top':
        box('atrium end wall',(-10.85,-1,3.3),(.28,20,6.6),'ceramic',.05)
        box('atrium wall recess',(-10.68,-1,2.6),(.04,11,3.5),'dark',.01)
        for y in [-5,-2,1,4]:
            box('recessed display shelf',(-10.28,y,1.4),(.75,2.5,.06),'silver',.01)
            box('recessed display light',(-10.50,y,4.32),(.03,2.5,.02),'warm',0)
        for y in [-9,-6,-3,0,3,6,9]:
            box('wall panel expansion joint',(-10.694,y,3.3),(.008,.009,6.4),'dark',0)
        # A small upper reading deck and its stair make the atrium inhabitable.
        box('upper reading deck',(-7.2,3,2.94),(6.6,12,.22),'ceramic',.04)
        for step in range(16):
            box('folded metal stair tread',(-6.2,-7.5+step*.28,.09+step*.18),(2.0,.285,.055),'silver',.008)
        for x in [-7.18,-5.22]:
            bar('stair stringer',(x,-7.6,.01),(x,-3.1,2.78),.055,'silver')
            bar('stair handrail',(x,-7.6,1.06),(x,-3.1,3.83),.021,'silver')
        for y in [-2,1,4,7,9]:bar('upper deck balustrade',(-3.95,y,3.05),(-3.95,y,4.13),.018,'silver')
        bar('upper deck handrail',(-3.95,-2.8,4.13),(-3.95,8.8,4.13),.025,'silver')
        box('upper deck low-iron glass',(-3.95,3,3.6),(.014,11.5,1.05),'glass',0)
        for y in [0,5]:
            box('mezzanine reading desk',(-8,y,3.8),(1.8,1,.07),'ceramic',.02)
            for x in [-8.65,-7.35]:box('mezzanine desk support',(x,y,3.42),(.05,.65,.7),'silver',.01)
        # Foreground seating, a manufactured central instrument and a distant skyline
        # provide three independent depth cues from an ordinary standing eye height.
        for x,y,a in [(-2,-1,-.4),(-3,2,2.4)]:chair(x,y,a)
        cylinder('low arrival table',(-3,0,.53),.85,.07,'ceramic',64)
        cylinder('low arrival table support',(-3,0,.25),.24,.5,'silver')
        core(1.5,3,2.25,.8)
        plant(6,5,1.55)
        plant(-6,7,1.3)
        box('arrival console',(5,-3,1.05),(1.6,.7,.12),'ceramic',.035)
        box('arrival console support',(5,-3,.49),(.18,.5,.98),'silver',.02)
        box('arrival glass terminal',(5,-3,1.14),(1.1,.48,.035),'dark',.01)
    elif key=='vision':
        for x in [-3,0,3]:chair(x,3,math.pi)
        cylinder('observation table',(0,1, .72),1.4,.12,'ceramic')
        cylinder('observation pedestal',(0,1,.34),.25,.68,'silver')
        box('open journal',(.2,1,.81),(.6,.4,.035),'sage',.01)
        plant(-5,5,1.6)
    elif key=='experience':
        for k,(x,y) in enumerate([(-4,-1),(3,-1),(-4,4),(3,4)]):
            desk(x,y,2.4);chair(x,y-1.25)
            if k==0:monitor(x,y+.15)
            elif k==1:
                for n in range(6):box('reference volumes',(x-.6+n*.19,y,1.1),(.14,.6,.55),['sage','blue','ceramic'][n%3],.004)
            elif k==2:
                for n in range(4):box('assembled prototype',(x-.6+n*.3,y,.9+n*.12),(.22,.45,.15),'silver',.018)
            else:
                for dx in [-.6,.6]:box('collaborative tablet',(x+dx,y,.835),(.65,.45,.025),'dark',.012)
    elif key=='technology':
        for x in [-3.5,3.5]:desk(x,-.5,2.8);monitor(x,-.25);chair(x,-1.8)
        # A manufactured research instrument: concentric machined components, enclosed in glass.
        cylinder('research foundation',(1,4,.3),1.45,.6,'dark')
        for z in [.65,1.1,1.55,2,2.45]:
            cylinder('precision compute stack',(1,4,z),1.05,.18,'silver',64)
            ring('compute status ring',(1,4,z+.1),1.03,.012,'cyan')
        for a in [k*math.tau/8 for k in range(8)]:bar('instrument support',(1+math.cos(a)*1.25,4+math.sin(a)*1.25,.5),(1+math.cos(a)*1.25,4+math.sin(a)*1.25,2.8),.024,'silver')
        for k in range(4):
            box('server cabinet',(-6+k*.72,7,1.4),(.6,.9,2.8),'dark',.035)
            for z in [.45,.9,1.35,1.8,2.25]:box('server vent',(-6+k*.72,6.54,z),(.47,.02,.04),'silver',0)
    elif key=='resources':
        for x in [-5,-1.6,1.8,5.2]:
            for z in [.5,1.35,2.2,3.05]:
                box('library shelf',(x,5,z),(2.8,.85,.095),'ceramic',.015)
                for n in range(10):
                    h=random.uniform(.43,.69);bx=x-1.17+n*.245
                    box('bound volume',(bx,5,z+.055+h/2),(.15,.52,h),['blue','sage','ceramic'][n%3],.003)
                    box('spine detail',(bx,4.735,z+.18),(.09,.005,.022),'ceramic',0)
            for dx in [-1.4,1.4]:box('shelf upright',(x+dx,5,1.8),(.06,.85,3.6),'silver',.01)
        desk(1,-1,4);chair(0,-2.2);chair(2,-2.2)
        box('open reference',(.6,-1,.83),(.8,.55,.03),'ceramic',.01)
    elif key=='manifesto':
        for k in range(4):
            x=-5+k*3.2;y=1+k*.9
            for dx in [-1.1,1.1]:box('gallery portal',(x+dx,y,2.6),(.1,.2,5.2),'silver',.02)
            box('gallery portal lintel',(x,y,5.2),(2.3,.2,.1),'ceramic',.02)
            box('gallery top illumination',(x,y-.12,5.13),(2.1,.018,.018),'warm',0)
        # An open, machined compass frame replaces floating toy spheres.
        ring('Spin_Compass',(.5,1,2.3),1.2,.055,'silver',(math.pi/2,.25,0))
        bar('compass axis',(-.35,1,1.55),(1.35,1,3.05),.035,'ceramic')
    elif key=='community':
        cylinder('communal table',(0,1,.91),2,.16,'ceramic');cylinder('table pedestal',(0,1,.44),.6,.88,'silver')
        for k in range(6):
            a=k*math.tau/6;chair(math.cos(a)*2.7,1+math.sin(a)*2.7,-a+math.pi/2)
        for x in [-5,5]:
            plant(x,3,2.3);bar('pendant suspension',(x,0,9),(x,0,3.4),.015,'silver')
            sphere('opal pendant',(x,0,3.4),(.4,.4,.14),'warm')
    elif key=='founder':
        desk(1,1,4);monitor(.5,1.2);chair(1,-.3)
        box('sketchbook',(2,1,.85),(.8,.6,.06),'blue')
        for k in range(4):box('prototype component',(-3+k*.3,4,.9+k*.18),(.24,.45,.15),'silver',.02)
        desk(-2.5,4,2.5)
        box('workshop cabinet',(5,5,1.1),(1.7,1.2,2.2),'ceramic',.06)
        for z in [.4,.9,1.4,1.9]:box('drawer pull',(5,4.38,z),(.6,.04,.03),'silver',.01)
        plant(5,-2,1.7)
    else:
        for x in [-3,3]:
            box('recessed lounge plinth',(x,1,.19),(2.48,1.05,.38),'dark',.025)
            box('lounge seat',(x,1,.55),(2.8,1.3,.35),'sage',.16)
            box('lounge back',(x,1.55,1.13),(2.8,.3,.9),'sage',.12)
        cylinder('low table',(0,-1,.5),1.1,.12,'ceramic');cylinder('table base',(0,-1,.24),.3,.48,'silver')
        for x in [-5,5]:plant(x,5,2)
    merge_static(coll);bake_occlusion(coll,1024);report['assets'].append(export(coll,key))
    for o in coll.objects:o.location.x+=i*22
    if i:
        for o in common.objects:
            copy=o.copy();copy.data=o.data;scene.collection.objects.link(copy);copy.location.x+=i*22
    cameras=[([6.8,1.8,7.0],[0,2,-3]),([5.5,1.72,4.5],[-2,1.8,-5]),
        ([-5.8,1.75,5],[2,1.15,0]),([4.8,1.72,3],[-2,1.5,-2]),
        ([-6,1.65,0],[2,1.6,-4]),([5.4,1.75,5],[-1,2,0]),
        ([-5,1.65,4],[1,1.25,0]),([4.8,1.65,4.5],[-1,1.2,-1]),
        ([-4,1.7,5],[3,1.8,-6])]
    eye,target=cameras[i]
    pose={'origin':[i*22,0,0],'arrival':[i*22-8,1.72,11.8],
        'camera':[i*22+eye[0],eye[1],eye[2]],'exit':[i*22+8,1.72,11.8],
        'corridor':[i*22+11,1.72,16],
        'target':[i*22+target[0],target[1],target[2]],
        'filmOffset':[-1.8,3.6,-1.8,3.6,-3.6,3.6,-3.6,3.6,-3.6][i]}
    report['sections'].append({'id':key,**pose})

# Full-scale city. Curved structural floor plates, deep glazing and three depth layers.
current=bpy.data.collections.new('Orbital city');scene.collection.children.link(current)
box('urban ground plane',(88,150,-3.5),(900,700,5),'ground',0)
for x,y,w,d in [(-8,62,28,15),(62,74,30,30),(140,55,20,30),(190,170,40,28)]:
    extrude_outline('landscaped courtyard',rounded_outline(x,y,w,d,4),-.94,.38,'sage')
    extrude_outline('reflecting pool',rounded_outline(x,y,w-2,d-2,3),-.52,.03,'facade')
box('promenade',(88,24,-.12),(230,24,.24),'ground',.03)
for x in range(-12,190,11):
    box('landscape planter',(x,24,.35),(6,4,.7),'stone',.15)
    plant(x,24,2.2)
    merge_static(current)

def window_material(x,y,z):
    # A deterministic spatial hash avoids the conspicuous diagonal bands produced
    # by a linear modulo pattern. Most bays are unlit, as in an occupied city.
    value=(int(round(x*10))*73856093 ^ int(round(y*10))*19349663 ^ int(round(z*10))*83492791)&0xffffffff
    value^=value>>16;value=(value*2246822519)&0xffffffff;value^=value>>13
    return 'lit' if value%47==0 else 'window'+str((value>>8)%3)

def tower(cx,cy,width,depth,height,phase):
    cy+=180
    levels=round(height/3.6)
    glazing={key:([],[]) for key in ['lit','window0','window1','window2']}
    for level in range(levels):
        z=level*3.6;progress=level/max(1,levels-1)
        taper=1-[.025,.18,.28][phase]*progress;lean=math.sin(progress*math.pi/2)*width*[0,.12,.2][phase]
        w=width*taper;d=depth*taper
        corner=min(w,d)*[.06,.2,.46][phase]
        outline=rounded_outline(cx+lean,cy,w,d,corner)
        extrude_outline('slender structural floorplate',outline,z,.22,'facade')
        window=rounded_outline(cx+lean,cy,w-.18,d-.18,corner-.09)
        # Glazing is opaque PBR at city scale; interior depth is suggested by recessed bays.
        for k,a in enumerate(window):
            b=window[(k+1)%len(window)];length=math.dist(a,b);bays=max(1,round(length/1.6))
            for bay in range(bays):
                t0=(bay+.025)/bays;t1=(bay+.975)/bays
                ax=a[0]+(b[0]-a[0])*t0;ay=a[1]+(b[1]-a[1])*t0
                bx=a[0]+(b[0]-a[0])*t1;by=a[1]+(b[1]-a[1])*t1
                mat=window_material((ax+bx)/2,(ay+by)/2,z+1.90)
                vertices,faces=glazing[mat];n=len(vertices)
                vertices.extend([(ax,ay,z+.24),(bx,by,z+.24),(bx,by,z+3.56),(ax,ay,z+3.56)]);faces.append((n,n+1,n+2,n+3))
        if level%13==0 and level>0:
            extrude_outline('sky garden terrace',rounded_outline(cx+lean,cy,w+1.2,d+1.2,min(w,d)*.32),z-.18,.24,'stone')
    extrude_outline('roof crown',rounded_outline(cx+lean,cy,w+.2,d+.2,corner),levels*3.6,.3,'silver')
    for mat,(vertices,faces) in glazing.items():mesh_object('individual glazed bays',vertices,faces,mat)
    merge_static(current)
    print('CITY_BUILDING_COMPLETE',cx,cy,height,flush=True)

for spec in [(-45,80,32,24,58,0),(22,96,30,23,89,1),(100,110,40,26,116,2),(170,88,32,28,67,0),(244,125,38,30,103,1),(-105,160,38,33,95,2),(0,220,48,32,132,0),(110,240,35,30,155,1),(220,255,48,38,127,2),(330,235,34,28,112,1),(-150,330,48,40,144,0),(70,400,50,42,174,1),(330,420,45,38,163,2)]:tower(*spec)
for a,b in [((22,96,29),(100,110,29)),((100,110,50),(170,88,50)),((170,88,25),(244,125,25)),((0,220,43),(110,240,43))]:
    a=(a[0],a[1]+180,a[2]);b=(b[0],b[1]+180,b[2])
    # Bridges include structural deck, railings, translucent canopy and suspension.
    d=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
    o=box('inhabited skybridge',mid,(d.length,5,.65),'stone',.12);o.rotation_euler.z=math.atan2(d.y,d.x)
    normal=Vector((-d.y,d.x,0)).normalized()*2.1
    for side in [-1,1]:
        aa=Vector(a)+normal*side;bb=Vector(b)+normal*side
        bar('bridge parapet',aa+Vector((0,0,1.1)),bb+Vector((0,0,1.1)),.055,'silver')
        bar('bridge interior light',aa+Vector((0,0,.1)),bb+Vector((0,0,.1)),.025,'warm')
# Distant transport guideways cross the landscape without suggesting free-flight controls.
for y,z in [(160,9),(320,18)]:
    pts=[(-220+k*12,y+math.sin(k/50*math.pi)*40,z+math.sin(k/50*math.pi)*7) for k in range(51)]
    for a,b in zip(pts,pts[1:]):bar('elevated transit rail',a,b,.18,'silver')
    for k in range(0,51,5):bar('transit pier',(pts[k][0],pts[k][1],-1),pts[k],.35,'stone')
merge_static(current);report['assets'].append(export(current,'environment'))

world=scene.world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.046,.075,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.32
camdata=bpy.data.cameras.new('Tour camera');cam=bpy.data.objects.new('Tour camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
camdata.lens=26;camdata.clip_end=5000
sun_data=bpy.data.lights.new('Solar key','SUN');sun_data.energy=2.4;sun_data.angle=.06;sun_data.color=(.95,.97,1)
sun_obj=bpy.data.objects.new('Solar key',sun_data);scene.collection.objects.link(sun_obj)
sun_obj.rotation_euler=Vector((.6,.6,-1)).to_track_quat('-Z','Y').to_euler()
lights=[light('window daylight',(0,8,6),1800,(.73,.84,1),12,(0,-2,0)),light('indirect ceiling',(-4,-1,6),450,(1,.87,.69),7,(0,0,1)),light('foreground fill',(4,-8,5),200,(.75,.86,1),6,(0,0,1))]
current=bpy.data.collections.new('Backdrop for preview renders');scene.collection.children.link(current)
planet=sphere('distant world',(-250,2200,260),(380,)*3,'planet');planet.rotation_euler=(math.pi/2,0,.8)
for i in range(180):sphere('star',(random.uniform(-1600,1900),random.uniform(2900,3300),random.uniform(200,1600)),(.25,)*3,'cyan')
merge_static(current)
scene['tour_manifest']=json.dumps(report['sections'])
Path(opt.master).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=opt.master)
for i,pose in enumerate(report['sections']):
    key=pose['id'];x,y,z=pose['camera'];cam.location=(x,-z,y)
    x,y,z=pose['target'];cam.rotation_euler=(Vector((x,-z,y))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.shift_x=pose['filmOffset']/36
    for j,o in enumerate(lights):
        o.location.x=[0,-4,4][j]+i*22;o.rotation_euler=(Vector((i*22,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
    if opt.render and (not opt.render_section or opt.render_section==key):
        scene.render.filepath=str(out/(key+'.png'));scene.render.image_settings.file_format='PNG';bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=opt.master)
(out/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('HABITAT_COMPLETE',json.dumps(report),flush=True)
