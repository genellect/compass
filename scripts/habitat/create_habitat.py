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
    d=Vector(b)-Vector(a); o=cylinder(name,(Vector(a)+Vector(b))/2,r,d.length,mat,12)
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

common=bpy.data.collections.new('Architecture');scene.collection.children.link(common);current=common
# Human-scale interior, with a continuous aisle between modules. No miniature platform.
box('structural slab',(0,-2,-.17),(22,22,.3),'dark',.02)
for x in range(-10,11,2):
    for y in range(-12,8,2):box('limestone floor tile',(x,y,0),(1.986,1.986,.04),'floor',0)
for x in [-10.7,10.7]:
    box('perimeter bench',(x,1,.38),(.55,12,.7),'ceramic',.08)
    box('skirting shadow gap',(x-.3 if x>0 else x+.3,1,.12),(.018,12,.05),'dark',0)
for x in [-10.5,-7,-3.5,0,3.5,7,10.5]:
    box('slender window mullion',(x,7,2.9),(.09,.22,5.8),'silver',.018)
    box('mullion gasket',(x+.055,6.99,2.9),(.012,.24,5.8),'dark',.003)
box('window lintel',(0,7,5.8),(22,.4,.24),'ceramic')
box('window sill',(0,7,.27),(22,.65,.5),'ceramic')
box('recessed sill illumination',(0,6.65,.52),(21.8,.015,.018),'warm',0)
box('panoramic glazing',(0,7.05,3.1),(21.8,.02,5.25),'glass',0)
# Shallow roof coffers and recessed services provide credible scale and occlusion.
for y in [-10,-6,-2,2,6]:
    for k in range(22):
        x=-10.5+k;z=5.85+.65*math.cos(x/11*math.pi/2)
        panel=box('vaulted ceiling panel',(x,y,z),(1.006,3.97,.13),'ceramic',0)
        panel.rotation_euler.y=.65/11*math.pi/2*math.sin(x/11*math.pi/2)
    for x in [-7,-3,3,7]:
        box('recessed linear luminaire',(x,y,5.75+.65*math.cos(x/11*math.pi/2)),(.024,3.7,.015),'warm',.002)
for x in [-9.8,9.8]:
    for y in [-7,0,6]:box('structural column',(x,y,2.9),(.3,.38,5.8),'ceramic',.08)
for x in [-6,6]:plant(x,5.3,1.4)
merge_static(common)
bake_occlusion(common,2048)
report={'blender':bpy.app.version_string,'seed':21,'assets':[export(common,'architecture')],'sections':[]}

ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact']
zones=[]
for i,key in enumerate(ids):
    coll=bpy.data.collections.new(key);scene.collection.children.link(coll);current=coll;zones.append(coll)
    if key=='top':
        core(1,0,2.6,1.2)
        desk(-3.8,1.5,2); monitor(-3.8,1.7);chair(-3.8,.1)
        chair(4,-1.8,-.5);chair(5,0,1)
    elif key=='vision':
        for x in [-3,0,3]:chair(x,1.8,math.pi)
        cylinder('observation table',(0,0,.85),1.3,.15)
        cylinder('table pedestal',(0,0,.42),.4,.8,'silver')
        sphere('Float_Horizon',(0,0,2),( .5,.5,.5),'blue')
        ring('Spin_Horizon',(0,0,2),.85,.035,'cyan',(1.1,0,0))
    elif key=='experience':
        for k,(x,y) in enumerate([(-3,-1),(2,-1),(-3,2.2),(2,2.2)]):
            cylinder('exhibition plinth',(x,y,.6),.9,1.2)
            if k==0: sphere('Float_Prototype',(x,y,1.9),(.5,.5,.5),'silver')
            elif k==1:
                for n in range(5):box('archive',(x+(n-2)*.17,y,1.5),(.12,.7,.5),'blue')
            elif k==2: ring('Spin_Workshop',(x,y,1.9),.65,.07,'cyan',(1.2,.3,0))
            else:
                for n in range(3):sphere('network node',(x+math.cos(n*2.1)*.5,y+math.sin(n*2.1)*.5,1.7),(.2,)*3,'sage')
    elif key=='technology':
        core(1,1,2.8,.85)
        for x in [-3.6,4.5]:
            desk(x,-1);monitor(x,-.8);chair(x,-2.3)
        for k in range(3):box('compute tower',(-4+k*.65,3,1.2),(.48,.9,2.4),'dark')
        for k in range(3):
            for z in [.5,1,1.5,2]:box('compute light',(-4+k*.65,2.54,z),(.3,.02,.025),'cyan',0)
    elif key=='resources':
        for x in [-4.5,-1.5,1.5,4.5]:
            for z in [.5,1.4,2.3,3.2]:
                box('bookshelf',(x,3,z),(2.6,.9,.12))
                for n in range(9):
                    h=random.uniform(.42,.72);bx=x-1+n*.25
                    box('bound volume',(bx,3,z+.07+h/2),(.16,.55,h),['blue','sage','ceramic'][n%3],.004)
                    box('spine label',(bx,2.721,z+.19),(.095,.004,.026),'ceramic',0)
                    box('page edge',(bx,3,z+.07+h),(.13,.48,.006),'ceramic',0)
            for dx in [-1.3,1.3]:box('shelf upright',(x+dx,3,1.9),(.1,.9,3.6),'silver',.02)
        desk(1,-1,3.7);chair(0,-2.2);chair(2,-2.2)
        for k in range(3):box('Float_Knowledge'+str(k),(2+k*.3,-.7,2.2+k*.3),(.65,.45,.05),'blue')
    elif key=='manifesto':
        for k in range(3):
            x=k*2.5-2;y=k*1.2
            for dx in [-1.05,1.05]:box('open frame',(x+dx,y,2),(.12,.16,4),'silver')
            box('open frame lintel',(x,y,4),(2.2,.16,.12),'warm')
        ring('Spin_Idea',(1,0,2),1,.08,'ceramic',(1.2,.4,.3))
        sphere('Float_Idea',(1,0,2),(.4,)*3,'cyan')
    elif key=='community':
        cylinder('communal table',(0,0,1.05),2,.18)
        cylinder('communal pedestal',(0,0,.5),.65,1,'silver')
        for k in range(6):
            a=k*math.tau/6;chair(math.cos(a)*2.8,math.sin(a)*2.8,-a+math.pi/2)
        for x in [-4.5,4.5]:plant(x,1.5,1.8)
        for x in [-3,3]:
            bar('pendant',(x,0,6.5),(x,0,4.5),.025)
            sphere('pendant diffuser',(x,0,4.45),(.45,.45,.12),'warm')
    elif key=='founder':
        desk(1,0,4.2);monitor(.4,.2);chair(1,-1.4)
        box('sketchbook',(2,0,1.25),(.8,.6,.06),'blue')
        core(-3,2,1.8,.45)
        box('workshop cabinet',(4.5,2,1.1),(1.7,1.2,2.2))
        for z in [.4,.9,1.4,1.9]:box('cabinet pull',(4.5,1.38,z),(.6,.04,.03),'silver',.01)
        plant(4,-2,1.1)
    else:
        for x in [-2.5,2.5]:
            box('lounge seat',(x,0,.6),(2.6,1.3,.4),'sage',.18)
            box('lounge back',(x,.55,1.2),(2.6,.3,1),'sage',.13)
        cylinder('low table',(0,-1,.55),1,.12,'ceramic')
        cylinder('table base',(0,-1,.25),.3,.5,'silver')
        plant(4,2,1.6)
    merge_static(coll);bake_occlusion(coll,1024);report['assets'].append(export(coll,key))
    # Assemble the master as a continuous horizontal habitat. Export remains local.
    for o in coll.objects:o.location.x+=i*22
    for o in common.objects:
        copy=o.copy();copy.data=o.data;scene.collection.objects.link(copy);copy.location.x+=i*22;copy.hide_render=(i==0)
    report['sections'].append({'id':key,'origin':[i*22,0,0], 'camera':[i*22+5.7,2.65,10], 'target':[i*22,2,-1], 'filmOffset':[-4.32,4.32,-1.728,4.32,-4.32,4.32,-4.32,4.32,-4.32][i]})

# A shared, full-scale campus beyond the rooms gives the tour a destination and
# parallax at several depths. This collection is exported once, never per room.
current=bpy.data.collections.new('Campus environment');scene.collection.children.link(current)
box('campus foundation',(88,43,-5),(244,76,2),'dark',.2)
def terrace(cx,cy,r,z,width,angle0=-2.65,angle1=-.5):
    verts=[];faces=[];steps=96
    for k in range(steps+1):
        a=angle0+(angle1-angle0)*k/steps
        for radius,height in [(r-width/2,z),(r+width/2,z),(r-width/2,z-.45),(r+width/2,z-.45)]:
            verts.append((cx+math.cos(a)*radius,cy+math.sin(a)*radius,height))
    for k in range(steps):
        n=k*4
        faces.extend([(n,n+4,n+5,n+1),(n+2,n+3,n+7,n+6),(n,n+2,n+6,n+4),(n+1,n+5,n+7,n+3)])
    mesh=bpy.data.meshes.new('sweeping terrace');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('continuous inhabited terrace',mesh);current.objects.link(obj);obj.data.materials.append(M['ceramic'])
    for k in range(0,steps,4):
        a=angle0+(angle1-angle0)*k/steps;b=angle0+(angle1-angle0)*(k+4)/steps
        for dz,rad,material_key in [(1.05,r-width/2,'silver'),(.06,r-width/2,'warm')]:
            bar('terrace balustrade',(cx+math.cos(a)*rad,cy+math.sin(a)*rad,z+dz),(cx+math.cos(b)*rad,cy+math.sin(b)*rad,z+dz),.035,material_key)
        if k%12==0:
            px=cx+math.cos(a)*r;py=cy+math.sin(a)*r
            bar('terrace pier',(px,py,-4),(px,py,z-.45),.22,'ceramic')
for cx in [-12,65,142,219]:
    for level in range(4):terrace(cx,75,44-level*2.3,-1+level*5.3,5)
    # Cantilevered research tower with sun fins and luminous occupied floors.
    box('research pavilion',(cx,60,10),(19,13,28),'dark',.9)
    for z in range(-2,25,4):
        box('pavilion floor',(cx,60,z),(21,15,.48),'ceramic',.2)
        box('pavilion glazing band',(cx,53.46,z+1.7),(18,.06,2.5),'blue',0)
        box('interior ceiling light',(cx,53.40,z+2.8),(16,.03,.055),'warm',0)
    for dx in range(-8,9,2):box('vertical solar fin',(cx+dx,53,11),(.1,.65,26),'silver',.02)
    merge_static(current)
for cx in [-12,32,76,120,164,208]:
    # Tall structural ribs, tapering visually above the open landscape.
    points=[(cx,16+t*58,-3+math.sin(t*math.pi)*35) for t in [k/32 for k in range(33)]]
    for a,b in zip(points,points[1:]):bar('campus structural arch',a,b,.32,'ceramic')
    for k in [8,16,24]:
        p=points[k];bar('suspension rod',p,(p[0],p[1],-2),.032,'silver')
    merge_static(current)
box('foreground garden terrace',(88,17,-1.3),(236,12,.65),'floor',.1)
for x in range(-20,221,8):
    box('landscape bed',(x,20,-.75),(5,4,.5),'sage',.15)
    plant(x,20,2.1)
    merge_static(current)
merge_static(current);report['assets'].append(export(current,'environment'))

world=scene.world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.1,.17,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.15
camdata=bpy.data.cameras.new('Tour camera');cam=bpy.data.objects.new('Tour camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
camdata.lens=26;camdata.shift_x=-.12
lights=[light('window daylight',(0,6,4.5),2800,(.73,.84,1),8,(0,-2,0)),light('indirect ceiling',(-4,-1,5.6),1100,(1,.87,.69),5,(0,0,1)),light('foreground fill',(4,-8,4.5),450,(.75,.86,1),5,(0,0,1))]
current=bpy.data.collections.new('Backdrop for preview renders');scene.collection.children.link(current)
planet=sphere('distant planet',(88,550,-310),(390,)*3,'planet')
for i in range(360):
    sphere('star',(random.uniform(-600,800),random.uniform(950,1100),random.uniform(0,450)),(.2,)*3,'cyan')
# Keep the distant planet separate; there is one shared environment, not overlapping globes.
planet.name='Float_DistantWorld'
merge_static(current)
Path(opt.master).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=opt.master)
(out/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for i,key in enumerate(ids):
    x=i*22;cam.location=(x+5.7,-10,2.65);cam.rotation_euler=(Vector((x,1,2))-cam.location).to_track_quat('-Z','Y').to_euler()
    camdata.shift_x=[-.12,.12,-.048,.12,-.12,.12,-.12,.12,-.12][i]
    for j,o in enumerate(lights):o.location.x=[0,-4,4][j]+x;o.rotation_euler=(Vector((x,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
    if opt.render and (not opt.render_section or opt.render_section==key):
        scene.render.filepath=str(out/(key+'.png'));scene.render.image_settings.file_format='PNG';bpy.ops.render.render(write_still=True)
Path(opt.master).parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=opt.master)
(out/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('HABITAT_COMPLETE',json.dumps(report))
