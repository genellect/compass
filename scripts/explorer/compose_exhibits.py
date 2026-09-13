"""Build real, solid typography and exhibition fixtures, independently of v3.

Run with the baked master already open; source copy is extracted from NewHero.
This is original architecture, not a claim of a photographed COMPASS facility.
"""
import argparse, json, math, re, sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--output',required=True);p.add_argument('--font',required=True);p.add_argument('--master',required=True)
o=p.parse_args(sys.argv[sys.argv.index('--')+1:]);repo=Path(o.repo);out=Path(o.output);out.mkdir(parents=True,exist_ok=True)
old=bpy.data.collections.get('Explorer exhibits')
if old:
    for obj in list(old.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(old)
coll=bpy.data.collections.new('Explorer exhibits');bpy.context.scene.collection.children.link(coll)
font=bpy.data.fonts.load(o.font)

def mat(name,color,metal=0,rough=.4,glow=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
    n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=glow;return m
white=mat('ceramic letter enamel',(.88,.9,.85),.12,.3,.08)
graphite=mat('display powder coated aluminium',(.012,.019,.023),.55,.36)
metal=mat('bead blasted aluminium',(.36,.39,.38),.82,.34)
stone=mat('honed structural fascia',(.12,.15,.16),.1,.72)

def collect(obj):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    coll.objects.link(obj);return obj
def box(name,point,size,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(point[0],-point[2],point[1]));obj=collect(bpy.context.object);obj.name=name
    obj.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=obj.modifiers.new('machined edge','BEVEL');bevel.width=.012;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.modifiers.new('weighted normals','WEIGHTED_NORMAL');obj.data.materials.append(material);return obj
def text(body,point,width,height,depth=.035):
    bpy.ops.object.text_add(location=(point[0],-point[2],point[1]));obj=collect(bpy.context.object);obj.name='Exhibit text '+body
    c=obj.data;c.body=body;c.font=font;c.align_x='CENTER';c.align_y='CENTER';c.size=height;c.extrude=depth;c.bevel_depth=.002;c.bevel_resolution=2;c.resolution_u=6
    obj.rotation_euler=(math.pi/2,0,0);bpy.context.view_layer.update()
    if obj.dimensions.x>width:c.size*=width/obj.dimensions.x
    c.materials.append(white);bpy.ops.object.convert(target='MESH');return obj

# The HTML h1 remains the accessible source. No invented slogan is introduced.
source=(repo/'src/components/Hero/NewHero.tsx').read_text(encoding='utf8')
headline=re.search(r'<h1\b[^>]*>([\s\S]*?)</h1>',source).group(1)
words=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',headline)).strip()
first,second=words.split(' Build ',1)
for phrase,y,width,height in [(first,4.65,10.5,1.1),('Build '+second,3.35,12,1.4)]:
    obj=text(phrase,[-1,y,-4.2],width,height,.045);obj['explorer_hero_type']=True
# A slim visible anchor ties the letter installation to the observation window.
box('letter installation structural rail',[-1,2.65,-4.27],[12,.035,.045],metal)
for x in [-6.9,4.9]:box('letter installation suspension',[x,4.95,-4.29],[.016,4.5,.018],metal)
# Grounded wayfinding, visible without starting an automatic tour.
box('atrium wayfinding plinth',[6,1.05,-2.5],[2.8,2.1,.16],graphite)
for name,y in [('Interactive',1.68),('Library',1.15),('Contact',.62)]:
    obj=text(name,[6,y,-2.4],2.4,.26,.006)

# Structural edge and balustrade resolve the unsupported, black floor cut-outs.
for radius in [13.9,25.45,30.55]:
    for k in range(96):
        a=(k+.5)*math.tau/96
        # Keep the three radial galleries and room entrances unobstructed.
        blocked=any(abs(math.atan2(math.sin(a-s),math.cos(a-s)))<.18 for s in [math.pi/2,3*math.pi/4,7*math.pi/4])
        if radius>30 and k%12 in [0,1,11]:blocked=True
        if blocked:continue
        x,z=radius*math.sin(a),radius*math.cos(a)
        for y,h,thickness,name in [(-.32,.64,.12,'structural edge'),(1.04,.035,.035,'balustrade handrail')]:
            b=box(name,[x,y,z],[radius*math.tau/96+.02,h,thickness],stone if y<0 else metal);b.rotation_euler.z=a
        if k%2==0:box('balustrade post',[x,.52,z],[.025,1.04,.025],metal)

# One physical television in the laboratory, rather than nine generic screens.
manifest=json.loads((repo/'public/habitat/explorer/v1/manifest.json').read_text(encoding='utf8'))
room=next(r for r in manifest['rooms'] if r['id']=='technology')
before=set(coll.objects)
box('Interactive television chassis',[0,2.6,-8],[5.82,3.31,.09],graphite)
box('Interactive television pedestal',[0,.61,-8.08],[.11,1.22,.1],metal)
box('Interactive television foot',[0,.035,-8],[1.6,.07,.55],graphite)
for obj in set(coll.objects)-before:
    x,y,z=obj.location;local=Vector((x,z,-y));a=room['yaw'];origin=room['origin']
    pos=(origin[0]+local.x*math.cos(a)+local.z*math.sin(a),local.y,origin[2]-local.x*math.sin(a)+local.z*math.cos(a))
    obj.location=(pos[0],-pos[2],pos[1]);obj.rotation_euler.z+=a
    obj['explorer_exhibit_room']='technology'

# Room-owned reading terminals with a real chassis, thickness and floor support.
# HTML labels use the same local transform in engine.ts; full articles stay on /.
for room in manifest['rooms'][1:]:
    before=set(coll.objects)
    box('room information terminal',[4.8,2.05,-1.065],[3.34,3.65,.12],graphite)
    box('room terminal support',[4.8,.22,-1.09],[.12,.44,.15],metal)
    box('room terminal foot',[4.8,.035,-1],[1.7,.07,.75],metal)
    for obj in set(coll.objects)-before:
        x,y,z=obj.location;local=Vector((x,z,-y));a=room['yaw'];origin=room['origin']
        pos=(origin[0]+local.x*math.cos(a)+local.z*math.sin(a),local.y,origin[2]-local.x*math.sin(a)+local.z*math.cos(a))
        obj.location=(pos[0],-pos[2],pos[1]);obj.rotation_euler.z+=a
        obj['explorer_exhibit_room']=room['id']

# Merge only fixtures sharing a material, keeping the Hero installation separate.
for material in [graphite,metal,stone]:
    objects=[x for x in coll.objects if x.type=='MESH' and not x.get('explorer_exhibit_room') and x.data.materials[0]==material]
    if len(objects)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT')
for obj in coll.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'exhibits.glb'),use_selection=True,export_format='GLB',export_extras=True,export_animations=False)
manifest['exhibits']='exhibits.glb';manifest.pop('environment',None)
hero=manifest['rooms'][0];hero['reading']=[-5,1.65,6];hero['panel']=[4,1.85,-5]
for room in manifest['rooms'][1:]:
    a=room['yaw'];origin=room['origin'];room['panel']=[origin[0]+4.8*math.cos(a)-math.sin(a),2.05,origin[2]-4.8*math.sin(a)-math.cos(a)]
(repo/'public/habitat/explorer/v1/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
camera=bpy.data.objects.get('Reading_top')
if camera:
    camera.location=(-5,-6,1.65);target=Vector((4,5,1.85));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=o.master)
