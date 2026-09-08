"""Reproducible COMPASS habitat. Blender 4.5.13: --background --python ... -- --output DIR --master FILE.
All geometry/materials are original. Blender Z-up is exported as glTF Y-up.
No network, purchased assets, fonts or external textures are required.
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
args.add_argument('--draft', action='store_true')
args.add_argument('--reuse-bakes', action='store_true')
opt = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(opt.output).resolve(); out.mkdir(parents=True, exist_ok=True)
opt.master = str(Path(opt.master).resolve())
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
    for k in range(15):
        a=k*2.4; h=(.9+k*.075)*s
        start=Vector((x+math.cos(a)*.12*s,y+math.sin(a)*.12*s,h))
        bar('stem',(x,y,.5*s),start,.009*s,'green')
        verts=[];faces=[]
        for j in range(13):
            t=j/12; width=math.sin(math.pi*t)**.8*.18*s
            for side in [-1,0,1]:
                verts.append((start.x+math.cos(a)*t*.85*s+math.sin(a)*width*side,
                    start.y+math.sin(a)*t*.85*s-math.cos(a)*width*side,
                    start.z+math.sin(t*math.pi)*.2*s-t*t*.18*s-abs(side)*.035*s))
        for j in range(12):
            for q in range(2):n=j*3+q;faces.append((n,n+1,n+4,n+3))
        mesh=bpy.data.meshes.new('botanical leaf');mesh.from_pydata(verts,[],faces);mesh.update()
        leaf=bpy.data.objects.new('leaf',mesh);current.objects.link(leaf);leaf.data.materials.append(M['green'])
        for p in mesh.polygons:p.use_smooth=True
        bar('leaf central vein',start,(start.x+math.cos(a)*.7*s,start.y+math.sin(a)*.7*s,start.z-.06*s),.003*s,'sage')
def chair(x,y,a=0):
    def point(dx,dy,z):return (x+dx*math.cos(a)-dy*math.sin(a),y+dx*math.sin(a)+dy*math.cos(a),z)
    seat=box('upholstered seat',(x,y,.51),(.88,.76,.15),'sage',.065);seat.rotation_euler.z=a
    verts=[];faces=[]
    for h in [0,1]:
        for k in range(25):
            arc=(k/24-.5)*2.8
            verts.append(point(math.sin(arc)*(.49+h*.035),math.cos(arc)*(.38+h*.13),.53+h*.53))
    for k in range(24):faces.append((k,k+1,k+26,k+25))
    mesh=bpy.data.meshes.new('curved chair shell');mesh.from_pydata(verts,[],faces);mesh.update()
    back=bpy.data.objects.new('curved backrest',mesh);current.objects.link(back);back.data.materials.append(M['sage'])
    for p in mesh.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=back;back.select_set(True)
    solid=back.modifiers.new('upholstery thickness','SOLIDIFY');solid.thickness=.065;bpy.ops.object.modifier_apply(modifier=solid.name)
    for dx in [-.31,.31]:
        for dy in [-.25,.25]:bar('splayed titanium leg',point(dx,dy,.46),point(dx*1.25,dy*1.25,.035),.018,'silver')
def desk(x,y,w=2.5):
    box('work surface',(x,y,1.13),(w,1.05,.16),'ceramic')
    for dx in [-w*.36,w*.36]:box('desk support',(x+dx,y,.55),(.12,.7,1.1),'silver',.025)
    box('desk shadow reveal',(x,y,1.035),(w-.12,.94,.035),'dark',.01)
def monitor(x,y):
    box('display',(x,y,1.83),(1.15,.12,.72),'dark',.04)
    box('screen',(x,y-.068,1.83),(1.02,.018,.59),'screen',.015)
    bar('display stem',(x,y,1.2),(x,y,1.5),.045)
    for dz in [-.14,0,.14]:box('screen trace',(x-.16,y-.085,1.83+dz),(.52,.01,.015),'cyan',0)
    box('keyboard',(x,y-.32,1.24),(.62,.22,.035),'dark',.01)
    for k in range(5):box('key row',(x,y-.39+k*.036,1.263),(.54,.009,.005),'silver',0)
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
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    return {'file':name+'.glb','bytes':(out/(name+'.glb')).stat().st_size,
        'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in coll.objects if o.type=='MESH'),
        'meshes':sum(o.type=='MESH' for o in coll.objects),'textures':len({n.image.name for o in coll.objects if o.type=='MESH' for m in o.data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image})}

# Architectural revision: a continuous inhabited observatory overlooking an orbital city.
# All dimensions are metres. Furniture remains at human scale; the skyline is not a diorama.
M['facade']=material('deep blue solar glazing',(.12,.20,.25),.48,.24)
M['lit']=material('occupied warm interior',(.55,.40,.24),.1,.6,.65)
M['stone']=material('ivory architectural concrete',(.58,.61,.59),0,.7)
M['soil']=material('planting substrate',(.023,.032,.021),0,1)
for i,color in enumerate([(.10,.16,.19),(.15,.22,.25),(.19,.25,.27)]):
    M['window'+str(i)]=material('solar glazing panel '+str(i),color,.55,.18+i*.05)

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
box('continuous structural slab',(0,-2,-.2),(22,28,.36),'stone',.04)
for x in range(-10,11,2):
    for y in range(-14,12,2):box('honed limestone paving',(x,y,.005),(1.985,1.985,.05),'floor',0)
# A tall glazed facade and open roof ribs establish a generous inhabited scale.
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
# The central aperture exposes space, avoiding a low office ceiling.
for y in [-12,-4,4,11]:
    bar('slender transverse skylight frame',(-10.7,y,9.1),(10.7,y,9.1),.065,'silver')
for x in [-8,8]:
    box('planted window bed',(x,8,.35),(3,2,.65),'stone',.12)
    plant(x,8,1.8)
merge_static(common);bake_occlusion(common,2048)
report={'version':'2','blender':bpy.app.version_string,'seed':21,'assets':[export(common,'architecture')],'sections':[]}

ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact']
zones=[]
for i,key in enumerate(ids):
    coll=bpy.data.collections.new(key);scene.collection.children.link(coll);current=coll;zones.append(coll)
    if key=='top':
        # Entry court visible from outside. The architecture, not an atom icon, is the subject.
        for x in [-4,4]:
            box('entry bench',(x,0,.46),(3,.9,.6),'stone',.12);plant(x,4,1.7)
        cylinder('arrival platform',(0,-3,.08),3.2,.12,'floor')
    elif key=='vision':
        for x in [-3,0,3]:chair(x,3,math.pi)
        cylinder('observation table',(0,1, .72),1.4,.12,'ceramic')
        cylinder('observation pedestal',(0,1,.34),.25,.68,'silver')
        box('open journal',(.2,1,.81),(.6,.4,.035),'sage',.01)
    elif key=='experience':
        for k,(x,y) in enumerate([(-4,-1),(3,-1),(-4,4),(3,4)]):
            desk(x,y,2.4);chair(x,y-1.25)
            if k==0:monitor(x,y+.15)
            elif k==1:
                for n in range(6):box('reference volumes',(x-.6+n*.19,y,1.5),(.14,.6,.55),['sage','blue','ceramic'][n%3],.004)
            elif k==2:
                for n in range(4):box('assembled prototype',(x-.6+n*.3,y,1.3+n*.12),(.22,.45,.15),'silver',.018)
            else:
                for dx in [-.6,.6]:box('collaborative tablet',(x+dx,y,1.28),(.65,.45,.025),'dark',.016)
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
        box('open reference',(.6,-1,1.23),(.8,.55,.03),'ceramic',.01)
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
        box('sketchbook',(2,1,1.25),(.8,.6,.06),'blue')
        for k in range(4):box('prototype component',(-3+k*.3,4,1.2+k*.18),(.24,.45,.15),'silver',.02)
        desk(-2.5,4,2.5)
        box('workshop cabinet',(5,5,1.1),(1.7,1.2,2.2),'ceramic',.06)
        for z in [.4,.9,1.4,1.9]:box('drawer pull',(5,4.38,z),(.6,.04,.03),'silver',.01)
        plant(5,-2,1.7)
    else:
        for x in [-3,3]:
            box('lounge seat',(x,1,.55),(2.8,1.3,.35),'sage',.16)
            box('lounge back',(x,1.55,1.13),(2.8,.3,.9),'sage',.12)
        cylinder('low table',(0,-1,.5),1.1,.12,'ceramic');cylinder('table base',(0,-1,.24),.3,.48,'silver')
        for x in [-5,5]:plant(x,5,2)
    merge_static(coll);bake_occlusion(coll,1024);report['assets'].append(export(coll,key))
    for o in coll.objects:o.location.x+=i*22
    if i:
        for o in common.objects:
            copy=o.copy();copy.data=o.data;scene.collection.objects.link(copy);copy.location.x+=i*22
    if i==0:
        pose={'origin':[0,0,0],'arrival':[42,60,180],'camera':[42,52,165],'exit':[40,18,52],'target':[100,42,-145],'filmOffset':-1.8}
    else:
        pose={'origin':[i*22,0,0],'arrival':[i*22+5.8,3.2,15],'camera':[i*22+5.7,2.9,10],'exit':[i*22+5.4,2.9,8.2],'target':[i*22,3,-3],'filmOffset':[-1.8,4.32,-1.728,4.32,-4.32,4.32,-4.32,4.32,-4.32][i]}
    report['sections'].append({'id':key,**pose})

# Full-scale city. Curved structural floor plates, deep glazing and three depth layers.
current=bpy.data.collections.new('Orbital city');scene.collection.children.link(current)
box('urban ground plane',(88,150,-3.5),(900,700,5),'floor',0)
for x,y,w,d in [(-8,62,28,15),(62,74,30,30),(140,55,20,30),(190,170,40,28)]:
    extrude_outline('landscaped courtyard',rounded_outline(x,y,w,d,4),-.94,.38,'sage')
    extrude_outline('reflecting pool',rounded_outline(x,y,w-2,d-2,3),-.52,.03,'facade')
box('promenade',(88,24,-.12),(230,24,.24),'floor',.03)
for x in range(-12,190,11):
    box('landscape planter',(x,24,.35),(6,4,.7),'stone',.15)
    plant(x,24,2.2)
    merge_static(current)

def tower(cx,cy,width,depth,height,phase):
    levels=round(height/3.6)
    glazing={key:([],[]) for key in ['lit','window0','window1','window2']}
    for level in range(levels):
        z=level*3.6;progress=level/max(1,levels-1)
        taper=1-(.22 if phase==0 else .44)*progress;lean=math.sin(progress*math.pi/2)*width*(.12 if phase==0 else .32)
        w=width*taper;d=depth*taper
        outline=rounded_outline(cx+lean,cy,w,d,min(w,d)*.32)
        extrude_outline('curved concrete floorplate',outline,z,.6,'stone')
        window=rounded_outline(cx+lean,cy,w-1,d-1,min(w-1,d-1)*.32)
        # Glazing is opaque PBR at city scale; interior depth is suggested by recessed bays.
        for k,a in enumerate(window):
            b=window[(k+1)%len(window)];length=math.dist(a,b);bays=max(1,round(length/1.6))
            for bay in range(bays):
                t0=(bay+.025)/bays;t1=(bay+.975)/bays
                ax=a[0]+(b[0]-a[0])*t0;ay=a[1]+(b[1]-a[1])*t0
                bx=a[0]+(b[0]-a[0])*t1;by=a[1]+(b[1]-a[1])*t1
                mat='lit' if (level*31+k*7+bay*13+phase)%19==0 else 'window'+str((k+bay+level//4)%3)
                vertices,faces=glazing[mat];n=len(vertices)
                vertices.extend([(ax,ay,z+.63),(bx,by,z+.63),(bx,by,z+3.54),(ax,ay,z+3.54)]);faces.append((n,n+1,n+2,n+3))
        if level%7==0 and level>0:
            extrude_outline('sky garden terrace',rounded_outline(cx+lean,cy,w+3,d+3,min(w,d)*.32),z-.18,.45,'ceramic')
    extrude_outline('roof crown',rounded_outline(cx+lean,cy,w+1,d+1,min(w,d)*.32),levels*3.6,.5,'ceramic')
    for mat,(vertices,faces) in glazing.items():mesh_object('individual glazed bays',vertices,faces,mat)
    merge_static(current)
    print('CITY_BUILDING_COMPLETE',cx,cy,height,flush=True)

for spec in [(-45,80,32,24,58,0),(22,96,30,23,89,1),(100,110,40,26,116,2),(170,88,32,28,67,0),(244,125,38,30,103,1),(-105,160,38,33,95,2),(0,220,48,32,132,0),(110,240,35,30,155,1),(220,255,48,38,127,2),(330,235,34,28,112,1),(-150,330,48,40,144,0),(70,400,50,42,174,1),(330,420,45,38,163,2)]:tower(*spec)
for a,b in [((22,96,29),(100,110,29)),((100,110,50),(170,88,50)),((170,88,25),(244,125,25)),((0,220,43),(110,240,43))]:
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
lights=[light('window daylight',(0,8,6),2800,(.73,.84,1),12,(0,-2,0)),light('indirect ceiling',(-4,-1,8),1300,(1,.87,.69),7,(0,0,1)),light('foreground fill',(4,-8,5),650,(.75,.86,1),6,(0,0,1))]
current=bpy.data.collections.new('Backdrop for preview renders');scene.collection.children.link(current)
planet=sphere('distant world',(450,2800,750),(950,)*3,'planet');planet.rotation_euler=(math.pi/2,0,.8)
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
