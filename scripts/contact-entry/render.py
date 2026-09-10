"""CONTACT residence, original procedural architecture. Blender 4.5 LTS.
The web hit areas are projected from the same door geometry and camera as the film.
"""
import bpy, math, argparse, sys, os, random, json
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
p=argparse.ArgumentParser()
p.add_argument('--output',required=True)
p.add_argument('--target',choices=['representative','compass'],default='representative')
p.add_argument('--layout',choices=['desktop','mobile'],default='desktop')
p.add_argument('--still',action='store_true');p.add_argument('--frame',type=int,default=1)
p.add_argument('--preview',action='store_true');p.add_argument('--samples',type=int,default=16)
p.add_argument('--prepare-only',action='store_true',help='Save geometry and projection without baking or rendering')
p.add_argument('--bake-only',action='store_true',help='Save baked scene for rendering in a fresh Blender process')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.output=os.path.abspath(a.output);os.makedirs(a.output,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine=os.environ.get('CONTACT_RENDER_ENGINE','BLENDER_EEVEE_NEXT')
s.cycles.samples=a.samples;s.cycles.use_denoising=True;s.cycles.use_adaptive_sampling=True;s.cycles.adaptive_threshold=.07
s.cycles.max_bounces=6;s.cycles.diffuse_bounces=3;s.cycles.glossy_bounces=3;s.cycles.transmission_bounces=6
s.render.threads_mode='FIXED';s.render.threads=8;s.render.use_persistent_data=False
if hasattr(s,'eevee'):s.eevee.taa_render_samples=a.samples
s.render.resolution_x,s.render.resolution_y=(1280,720) if a.layout=='desktop' else (720,960)
s.render.resolution_percentage=50 if a.preview else 100;s.render.fps=24;s.frame_start=1;s.frame_end=48
s.view_settings.view_transform='AgX';s.view_settings.exposure=-1.1
s.world.use_nodes=True
w=s.world.node_tree;n=w.nodes.new('ShaderNodeTexSky');n.sky_type='NISHITA';n.sun_elevation=math.radians(26);n.sun_rotation=math.radians(145);n.altitude=.2;n.air_density=1.1;n.dust_density=.2;n.ozone_density=1.3
w.links.new(n.outputs['Color'],w.nodes['Background'].inputs['Color']);w.nodes['Background'].inputs['Strength'].default_value=.20

def material(name,c,rough=.5,metal=0,texture=0,stretch=(1,1,1)):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1);nt=m.node_tree;b=nt.nodes.get('Principled BSDF')
 b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 if texture:
  coord=nt.nodes.new('ShaderNodeTexCoord');v=nt.nodes.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=stretch;nt.links.new(coord.outputs['Generated'],v.inputs[0])
  noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=texture;noise.inputs['Detail'].default_value=3;nt.links.new(v.outputs[0],noise.inputs['Vector'])
  lo,hi=(.70,1.12) if 'walnut' in name.lower() else (.94,1.035)
  ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=(*(x*lo for x in c),1);ramp.color_ramp.elements[1].position=.85;ramp.color_ramp.elements[1].color=(*(min(1,x*hi) for x in c),1)
  nt.links.new(noise.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],b.inputs['Base Color'])
  bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.06;bump.inputs['Distance'].default_value=.007;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],b.inputs['Normal'])
 return m
stone=material('Ivory travertine',(.66,.61,.51),.4,texture=18,stretch=(1,1,5))
plaster=material('Warm mineral plaster',(.78,.76,.69),.75,texture=100)
floor=material('Honed limestone slabs',(.59,.56,.49),.26,texture=36)
oak=material('Oiled walnut grain',(.19,.105,.055),.37,texture=5,stretch=(15,4,.25))
bronze=material('Satin champagne brass',(.42,.31,.16),.28,.75)
black=material('Anodised graphite',(.022,.029,.03),.35,.3)
fabric=material('Woven linen',(.64,.60,.51),.92,texture=180)
leather=material('Warm leather',(.23,.14,.087),.53,texture=70)
white=material('Porcelain',(.78,.8,.76),.24)
green=material('Olive leaves',(.075,.12,.035),.62)
cyan=material('Quiet status light',(.06,.4,.42),.4)
bs=cyan.node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(.07,.55,.48,1);bs.inputs['Emission Strength'].default_value=1.5
led=material('Warm indirect strip',(.95,.78,.45),.4)
bs=led.node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,.8,.5,1);bs.inputs['Emission Strength'].default_value=3
glass=material('Low iron clear glazing',(.92,.97,.98),.06)
glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=1
glass.node_tree.nodes['Principled BSDF'].inputs['IOR'].default_value=1.45
if s.render.engine=='BLENDER_EEVEE_NEXT':
 glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=0
 glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.085
 glass.surface_render_method='BLENDED';glass.diffuse_color=(.92,.97,.98,.085)
water=material('Clear pool water',(.11,.36,.38),.12,.2,texture=5)
water.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.55
if s.render.engine=='BLENDER_EEVEE_NEXT':water.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=0
window=material('Distant silver blue glazing',(.28,.38,.43),.2,.5)

def box(name,loc,size,mat,bevel=.025):
 x,y,z=[v/2 for v in size];me=bpy.data.meshes.new(name)
 faces=[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)]
 me.from_pydata([(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)],[],[tuple(reversed(face)) for face in faces]);me.update()
 o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.location=loc;o.data.materials.append(mat)
 if bevel:
  b=o.modifiers.new('Crafted arris','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

def cyl(name,loc,r,d,mat,vertices=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 b=o.modifiers.new('Soft edge','BEVEL');b.width=.018;b.segments=3
 for f in o.data.polygons:f.use_smooth=True
 return o

def line(name,start,end,r,mat):
 vec=Vector(end)-Vector(start);o=cyl(name,(Vector(start)+Vector(end))/2,r,vec.length,mat,12);o.rotation_euler=vec.to_track_quat('Z','Y').to_euler();return o

def area(name,loc,target,energy,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

def torus(name,loc,r,t,mat,rotation=(0,0,0)):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=64,minor_segments=10,location=loc,rotation=rotation);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 return o

# A 24 m arrival hall connects two enclosed rooms and an outdoor pool terrace.
box('Continuous residence slab',(0,1,-.2),(34,31,.4),stone,.06)
for x in range(-12,13,2):
 for y in range(-12,13,3):box('Large limestone paving',(x,y,-.015),(1.992,2.992,.10),floor,.012)
# Rooms occupy y=2..12; their door openings are cut into an actual 45 cm wall.
# Continuous facade has three solid piers, lintels, structural returns and ceiling.
for x,width in [(-10.5,1),(-5.5,1.4),(0,4.4),(5.5,1.4),(10.5,1)]:box('Travertine room facade',(x,2,2.9),(width,.45,5.8),stone,.035)
for x in [-8.1,8.1]:
 box('Room sidelight glazing',(x,2,1.85),(3.8,.027,3.6),glass,0)
 box('Sidelight lintel',(x,2,4.73),(3.8,.45,2.15),stone,.025)
 for xx in [x-1.9,x+1.9]:box('Sidelight bronze jamb',(xx,1.94,1.82),(.045,.10,3.65),bronze,.008)
for x in [-3.5,3.5]:box('Solid lintel above entrance',(x,2,4.7),(2.6,.45,2.2),stone,.025)
for x in [-11,0,11]:box('Full depth room partition',(x,7,2.9),(.3,10,5.8),plaster,.02)
box('Rooms solid roof',(0,7,5.88),(22.5,10.5,.22),plaster,.03)
# Foyer gallery: tall side glazing and a coffered ceiling surrounding a skylight.
for x in [-11.8,11.8]:
 box('Gallery ceiling edge',(x,-4.5,6.1),(.4,13.6,.38),plaster,.04)
 box('Soffit indirect lighting',(x*.96,-4.4,5.93),(.028,13.2,.028),led,.005)
 for y in [-10,-4,2]:box('Slender stone column',(x,y,3),(.3,.35,6),stone,.04)
 if x<0:
  for y in [-7,-1]:box('Atrium side glass',(x,y,3),(.028,5.65,5.85),glass,0)
for y in [-10,1.7]:box('Atrium transverse soffit',(0,y,6.1),(24,.65,.38),plaster,.05)
for x in [-8,8]:box('Deep skylight border',(x,-4.3,6.15),(5.3,11.4,.30),plaster,.04)
# Fine overhead fins cast shadows without filling the hall with fixtures.
for y in [-8.3,-6.3,-4.3,-2.3,-.3]:box('Skylight louvre',(0,y,6.4),(10.6,.10,.22),oak,.012)
box('Recessed skylight',(0,-4.3,6.55),(10.5,11.3,.025),glass,0)
# Inside each room, the far wall is a panoramic window; the foyer has a central art niche.
for x in [-8.3,-2.8,2.8,8.3]:
 box('Rear glazing',(x,12,2.9),(5.25,.025,5.7),glass,0)
 for xx in [x-2.66,x+2.66]:box('Rear window mullion',(xx,12,2.9),(.05,.07,5.8),bronze,.008)
box('Recessed gallery artwork',(0,1.758,2.7),(1.35,.04,2.2),oak,.02)
for i in range(8):
 o=box('Bronze relief',(math.sin(i*.7)*.33,1.71,1.87+i*.24),(.63,.055,.045),bronze,.016);o.rotation_euler.y=.45
# Pool is OUTSIDE the hall glazing, leaving an uninterrupted circulation area.
box('Terrace pool basin',(15,2,.01),(5.4,19,.35),stone,.06)
box('Deep teal pool lining',(15,2,.05),(5,18.6,.12),black,.035)
box('Infinity pool water',(15,2,.18),(4.95,18.55,.022),water,.008)
for x in [12.25,17.75]:box('Pool coping',(x,2,.22),(.18,19.2,.13),stone,.03)
for y in [-4,1,6]:
 box('Terrace chaise base',(19,y,.20),(1.1,2.4,.22),oak,.06)
 box('Linen chaise cushion',(19,y,.37),(1,2.25,.19),fabric,.12)
box('Distant blue water horizon',(0,160,-5),(1200,1200,.15),window,0)
# A city at a believable distance; no enormous tower pressed against the window.
random.seed(61)
for i in range(27):
 x=-70+i*5.9;y=55+random.uniform(0,60);h=random.uniform(9,29);ww=random.uniform(2,4.5)
 box('Distant skyline',(x,y,h/2-4),(ww,ww,h),window,.08)
 for z in range(0,int(h),2):box('Facade floor band',(x,y-ww/2-.018,z-3),(ww,.025,.027),white,0)
 if i%6==0:box('Setback tower crown',(x,y,h-1),(ww*.58,ww*.58,4),window,.03)
# The terrace overlooks a second city edge, visible from the oblique arrival view.
for i in range(12):
 x=34+i*5.8;y=15+(i%4)*8;h=13+(i*11%19);ww=3.2+(i%3)*.5
 box('Terrace skyline tower',(x,y,h/2-5),(ww,ww,h),window,.10)
 box('Stepped skyline crown',(x,y,h-3.5),(ww*.58,ww*.58,3),window,.05)
 for z in range(0,int(h),2):
  box('Terrace tower facade band',(x-ww/2-.02,y,z-4),(.025,ww,.05),white,0)
  box('Terrace tower front band',(x,y-ww/2-.02,z-4),(ww,.025,.05),white,0)
# Study: library on the LEFT wall, workstation at the rear, servers in a side alcove.
books=[material('Book binding '+str(i),c,.65) for i,c in enumerate([(.21,.18,.14),(.52,.43,.28),(.65,.61,.51),(.06,.12,.13)])]
box('Library walnut backing',(-10.78,7,2.25),(.13,8,4.5),oak,.018)
for z in [.45,1.2,1.95,2.7,3.45,4.2]:
 box('Deep library shelf',(-10.35,7,z),(.9,8,.065),oak,.012)
 box('Library concealed strip',(-9.91,7,z-.05),(.017,7.9,.018),led,.003)
 for j in range(30):
  height=.34+(j*17%19)/60
  box('Library book',(-10.22,3.2+j*.255,z+.04+height/2),(.44,.13,height),books[j%4],.004)
for y in [3,5,7,9,11]:box('Walnut shelf upright',(-10.36,y,2.28),(.88,.07,4.45),oak,.008)
# Desk is properly placed inside the room, reached after crossing its entrance.
box('Study wool rug',(-5.8,7.5,.055),(6.5,5,.025),fabric,.03)
box('Walnut writing desk',(-5.5,8.4,.79),(3.7,1.35,.12),oak,.04)
for x in [-7,-4]:box('Desk pedestal',(x,8.4,.38),(.18,1.05,.76),black,.02)
for x,angle in [(-6.55,-.14),(-5.5,0),(-4.45,.14)]:
 panel=box('Thin workstation monitor',(x,8.7,1.35),(1,.075,.62),black,.023);panel.rotation_euler.z=angle
 box('Monitor glass',(x,8.658,1.35),(.93,.008,.55),window,.012)
 for j in range(4):box('Quiet screen interface',(x,8.649,1.2+j*.075),(.6,.005,.004),cyan,0)
 box('Monitor stand',(x,8.7,1.01),(.035,.035,.3),bronze,.008)
box('Keyboard',(-5.6,8.04,.88),(.82,.27,.045),black,.012)
box('High performance workstation',(-7.1,8.45,1.17),(.45,.60,.67),black,.04)
for z in [.99,1.19,1.39]:torus('Workstation cooling fan',(-7.1,8.14,z),.063,.01,cyan,(math.pi/2,0,0))
# Server enclosure sits against the room divider, recessed away from the entrance.
for y in [8.8,10.2]:
 box('Server cabinet',(-.75,y,1.35),(.75,1.05,2.6),black,.035)
 for j in range(10):
  box('Server module',(-.75,y-.535,.25+j*.235),(.64,.025,.16),black,.01)
  box('Server activity',(-.97,y-.553,.25+j*.235),(.019,.01,.019),cyan,.002)

def chair(x,y,angle=0):
 objs=[box('Upholstered seat',(x,y,.49),(.72,.73,.16),leather,.1),box('Upholstered back',(x,y+.30,.9),(.72,.12,.80),leather,.08)]
 cyl('Chair stem',(x,y,.24),.045,.45,bronze)
 for dx,dy in [(.28,.28),(-.28,.28),(.28,-.28),(-.28,-.28)]:line('Chair base',(x,y,.16),(x+dx,y+dy,.07),.022,bronze)
 if angle:
  for ob in objs:ob.location=Vector((x,y,0))+Matrix.Rotation(angle,4,'Z')@(ob.location-Vector((x,y,0)));ob.rotation_euler.z=angle
chair(-5.5,7.05)
# Meeting room: closed acoustic side walls, long table, soft chairs and terrace view.
box('Meeting rug',(5.5,7.4,.055),(7.5,6.7,.025),fabric,.03)
box('Solid stone meeting table',(5.4,7.45,.79),(2.2,5.0,.13),stone,.1)
for y in [5.8,9.1]:box('Sculpted meeting table support',(5.4,y,.4),(.75,.58,.78),oak,.08)
for y in [5.65,7.4,9.15]:
 chair(3.75,y,-math.pi/2);chair(7.1,y,math.pi/2)
 box('Flush meeting interface',(5.4,y,.865),(.42,.29,.012),black,.016)
# Restrained architectural ceiling lighting inside each room.
for x in [-5.5,5.5]:
 box('Ceiling recess',(x,7,5.73),(5.9,6.9,.035),oak,.014)
 for xx in [x-2.9,x+2.9]:box('Room cove light',(xx,7,5.68),(.025,6.7,.025),led,.004)
 area('Room indirect light',(x,7,5.5),(x,7,0),950,6,(1,.88,.72))
# A small seating alcove in the arrival gallery is kept well away from circulation.
box('Arrival bench',(-8,-4,.34),(3.5,1.15,.5),oak,.07)
box('Bench linen cushion',(-8,-4,.65),(3.35,1.04,.17),fabric,.09)
cyl('Low bronze table',(-6,-5.3,.31),.55,.05,bronze);cyl('Table stem',(-6,-5.3,.15),.13,.3,black)
# Sculpted olive tree with individual leaves; no low-poly blobs.
random.seed(9)
x,y=-10,-7.5
cyl('Stone planter',(x,y,.35),.58,.7,stone)
line('Olive trunk',(x,y,.5),(x+.12,y,2.8),.065,oak)
leafverts=[];leaffaces=[]
for i in range(18):
 angle=i*2.399;z=1.5+(i%6)*.23;end=Vector((x+math.cos(angle)*.85,y+math.sin(angle)*.7,z+.7))
 line('Olive branch',(x,y,z-.15),end,.018,oak)
 for j in range(16):
  c=end+Vector((random.uniform(-.45,.45),random.uniform(-.4,.4),random.uniform(-.28,.35)));ang=random.random()*math.tau
  u=Vector((math.cos(ang)*.10,math.sin(ang)*.10,.02));v=Vector((-math.sin(ang)*.023,math.cos(ang)*.023,.035));k=len(leafverts)
  leafverts.extend([c-u,c+v,c+u,c-v]);leaffaces.append((k,k+1,k+2,k+3))
me=bpy.data.meshes.new('Olive foliage');me.from_pydata(leafverts,[],leaffaces);me.update();ob=bpy.data.objects.new('Individual olive leaves',me);s.collection.objects.link(ob);ob.data.materials.append(green)
# Real recessed sliding doors close the rooms; the leaves move into wall pockets.
fontpath=os.environ.get('CONTACT_JAPANESE_FONT','C:/Windows/Fonts/YuGothM.ttc')
if not os.path.exists(fontpath):raise RuntimeError('Set CONTACT_JAPANESE_FONT to a licensed Japanese font.')
font=bpy.data.fonts.load(fontpath)
def text(name,body,loc,size,mat):
 d=bpy.data.curves.new(name,'FONT');d.body=body;d.font=font;d.size=size;d.align_x='CENTER';d.align_y='CENTER';d.extrude=.001
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(mat)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
hinges={};centers={'representative':-3.5,'compass':3.5}
for target,x in centers.items():
 for xx in [x-1.28,x+1.28]:
  box('Recessed door jamb',(xx,2,1.8),(.085,.5,3.6),bronze,.012)
  box('Jamb edge illumination',(xx,1.737,1.8),(.012,.014,3.4),led,.003)
 box('Door header track',(x,2,3.6),(2.65,.5,.085),bronze,.01)
 box('Flush stone threshold',(x,2,.043),(2.6,.8,.028),stone,.006)
 # Quiet lettering is mounted onto the solid wall, never a floating HTML card.
 text('Room name '+target,'執務室' if target=='representative' else '会議室',(x,1.752,4.23),.26,black)
 text('Room identity '+target,'Yuto Matsui' if target=='representative' else 'COMPASS',(x,1.75,3.92),.22,black)
 leaves=[]
 for side in [-1,1]:
  h=bpy.data.objects.new(target+' leaf '+str(side),None);s.collection.objects.link(h);h.location=(x+side*.615,2.025,0)
  parts=[box('Clear sliding door',(x+side*.615,2.025,1.8),(1.21,.027,3.47),glass,.006)]
  for xx in [x+side*.02,x+side*1.20]:parts.append(box('Sliding leaf stile',(xx,2.015,1.8),(.025,.042,3.49),bronze,.004))
  for z in [.065,3.535]:parts.append(box('Sliding leaf rail',(x+side*.615,2.015,z),(1.21,.04,.025),bronze,.004))
  for part in parts:part.parent=h;part.matrix_parent_inverse=Matrix.Translation(-h.location)
  leaves.append((h,side,h.location.x))
 hinges[target]=leaves
 # A small real access reader communicates automatic entry without an overlay.
 box('Recessed access reader',(x+1.48,1.749,1.27),(.16,.025,.30),black,.014)
 box('Reader ready light',(x+1.48,1.728,1.32),(.055,.01,.012),cyan,.002)
if font.users==0:bpy.data.fonts.remove(font)
area('Broad skylight',(0,-4,6.2),(0,0,0),1800,9,(.82,.91,1))
area('Terrace daylight',(11,-1,4),(0,3,1),1300,7,(.86,.94,1))
area('Soft arrival bounce',(0,-10,3.8),(0,3,2),800,9,(1,.91,.78))
# Architectural camera with two distinct aspect-ratio framings.
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.sensor_fit='HORIZONTAL';cam.data.lens=18 if a.layout=='desktop' else 22;cam.data.clip_end=900
start=Vector((-5,-12,2.8)) if a.layout=='desktop' else Vector((-3.5,-10,2.85))
look_start=Vector((1,4,2.4)) if a.layout=='desktop' else Vector((.8,3.5,2.7))
x=centers[a.target];end=Vector((x,4.15,1.68));look_end=Vector((-5.4 if x<0 else 5.4,8.4,1.65))
def smooth(t):return t*t*(3-2*t)
for frame in range(1,49):
 t=(frame-1)/47;move=smooth(max(0,min(1,(t-.12)/.88)))
 # Approach on a curve; align with the entrance before crossing the wall.
 pos=start.lerp(end,move);pos.x=start.x+(x-start.x)*smooth(min(1,move*1.6))
 cam.location=pos;look=look_start.lerp(look_end,move);cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler()
 cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_euler',frame=frame)
 for h,side,origin in hinges[a.target]:h.location.x=origin+side*1.25*smooth(min(1,t/.36));h.keyframe_insert('location',frame=frame)
s.frame_set(1);bpy.context.view_layer.update()
# Geometry-derived bounding boxes keep transparent web controls on the doors.
regions={}
for target,x in centers.items():
 pts=[world_to_camera_view(s,cam,Vector((xx,1.72,z))) for xx in [x-1.3,x+1.3] for z in [.04,4.48]]
 regions[target]={'left':round(min(v.x for v in pts)*100,4),'top':round((1-max(v.y for v in pts))*100,4),'width':round((max(v.x for v in pts)-min(v.x for v in pts))*100,4),'height':round((max(v.y for v in pts)-min(v.y for v in pts))*100,4)}
with open(os.path.join(a.output,'projection-'+a.layout+'.json'),'w') as f:json.dump(regions,f,indent=2)
s.frame_set(a.frame)
if s.render.engine=='BLENDER_EEVEE_NEXT' and not a.prepare_only:
 # Baked diffuse light is stable across frames on integrated GPUs.
 s.eevee.use_raytracing=False;s.eevee.use_fast_gi=False
 for name,loc,scale in [('Arrival indirect light',(0,-4,2.8),(11.4,7,2.8)),('Study indirect light',(-5.5,7,2.8),(5.2,4.7,2.7)),('Meeting indirect light',(5.5,7,2.8),(5.2,4.7,2.7))]:
  d=bpy.data.lightprobes.new(name,'VOLUME');d.resolution_x=6;d.resolution_y=6;d.resolution_z=4;d.bake_samples=64
  o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.scale=scale
 bpy.ops.object.lightprobe_cache_bake(subset='ALL')
bpy.ops.wm.save_as_mainfile(compress=True,filepath=os.path.join(a.output,f'{a.target}-{a.layout}.blend'))
if a.prepare_only or a.bake_only:sys.exit(0)
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
if a.still:
 s.render.filepath=os.path.join(a.output,f'lobby-{a.layout}.png' if a.frame==1 else f'{a.target}-{a.layout}-check-{a.frame}.png');bpy.ops.render.render(write_still=True)
else:
 s.render.filepath=os.path.join(a.output,f'{a.target}-{a.layout}-');bpy.ops.render.render(animation=True)
