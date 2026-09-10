"""Original procedural CONTACT architecture. Blender 4.5 LTS; no external assets.
Run: blender -b -t 8 -P scripts/contact-entry/render.py -- --output DIR --target representative --layout desktop [--still]
"""
import bpy, math, argparse, sys, os, random
from mathutils import Vector, Matrix
args = argparse.ArgumentParser()
args.add_argument('--output', required=True)
args.add_argument('--target', choices=['representative','compass'], default='representative')
args.add_argument('--layout', choices=['desktop','mobile'], default='desktop')
args.add_argument('--still', action='store_true')
args.add_argument('--frame', type=int, default=1)
args.add_argument('--preview', action='store_true')
args.add_argument('--samples', type=int, default=12)
a=args.parse_args(sys.argv[sys.argv.index('--')+1:])
a.output=os.path.abspath(a.output)
os.makedirs(a.output, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine=os.environ.get('CONTACT_RENDER_ENGINE','BLENDER_EEVEE_NEXT')
scene.cycles.samples=16 if a.preview else 24
if hasattr(scene,'eevee'):scene.eevee.taa_render_samples=a.samples
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED'; scene.render.threads=8
scene.render.resolution_x,scene.render.resolution_y=(1280,720) if a.layout=='desktop' else (720,960)
scene.render.resolution_percentage=50 if a.preview else 100
scene.render.fps=24; scene.frame_start=1; scene.frame_end=48
scene.view_settings.view_transform='AgX'
scene.world.color=(.35,.4,.45)
world=scene.world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.83,1,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25

def material(name,color,rough=.45,metal=0,noise=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if noise:
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=noise;n.inputs['Detail'].default_value=2
  b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.14;b.inputs['Distance'].default_value=.045
  m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
 return m
stone=material('Warm honed limestone',(.64,.61,.53),.62,noise=36)
white=material('Ivory plaster',(.82,.83,.78),.7,noise=52)
floor=material('Pale polished stone',(.53,.57,.55),.24,noise=48)
wood=material('Smoked oak',(.21,.115,.065),.38,noise=9)
woodlight=material('Oak end grain',(.37,.24,.13),.38,noise=16)
bronze=material('Brushed champagne metal',(.42,.32,.19),.28,.75)
black=material('Charcoal',(.028,.045,.048),.43)
glass=material('Frosted architectural glass',(.34,.48,.48),.3,.25)
green=material('Garden foliage',(.055,.13,.07),.65)
lightmat=material('Warm light',(.9,.71,.4),.5)
p=lightmat.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(1,.77,.45,1);p.inputs['Emission Strength'].default_value=4

def cube(name,loc,scale,mat,bevel=.025):
 sx,sy,sz=[v*.5 for v in scale]
 mesh=bpy.data.meshes.new(name)
 mesh.from_pydata([(-sx,-sy,-sz),(-sx,-sy,sz),(-sx,sy,-sz),(-sx,sy,sz),(sx,-sy,-sz),(sx,-sy,sz),(sx,sy,-sz),(sx,sy,sz)],[],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])
 mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);o.location=loc
 if mat:o.data.materials.append(mat)
 if bevel:
  mod=o.modifiers.new('Soft crafted edges','BEVEL');mod.width=bevel;mod.segments=3
  o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o

def light(name,loc,power,color,size,target):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def cylinder(name,loc,r,depth,mat):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 bevel=o.modifiers.new('Rounded edge','BEVEL');bevel.width=.025;bevel.segments=3
 return o

# Open sky-office: limestone platforms, glass pavilions, pool and skyline.
navy=material('Midnight anodized metal',(.025,.06,.085),.28,.62)
cyan=material('Ice blue interface',(.14,.68,.84),.25,.45)
p=cyan.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(.13,.65,1,1);p.inputs['Emission Strength'].default_value=2
water=material('Infinity pool water',(.018,.29,.38),.12,.45,noise=3)
clear=material('Clear architectural glazing',(.55,.75,.78),.15,.25)
clear.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.12
clear.surface_render_method='BLENDED'
clear.diffuse_color=(.55,.75,.78,.12)
window=material('Skyline blue glass',(.25,.39,.49),.18,.55)
bookmats=[material('Book '+str(i),c,.55) for i,c in enumerate([(.12,.17,.2),(.66,.55,.36),(.4,.28,.16),(.63,.68,.67),(.15,.34,.32)])]

def ring(name,loc,radius,thick,mat,rotation=(0,0,0)):
 bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=thick,major_segments=72,minor_segments=10,location=loc,rotation=rotation)
 o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o

def sphere(name,loc,r,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o

cube('Floating sky residence foundation',(0,2,-.26),(24,27,.5),white,.15)
cube('Polished limestone platform',(-1,1,-.02),(20,25,.13),floor,.04)
for x in range(-10,12,2):cube('Floor expansion joint',(x,1,.052),(.008,24,.003),stone,0)
for y in range(-10,14,2):cube('Floor expansion joint',(-1,y,.052),(20,.008,.003),stone,0)
# Strong receding architectural ribs, open glass ceiling and panoramic glazing.
for y in [-8,-2,5,12]:
 for x in [-10.5,10.5]:cube('Sculpted structural column',(x,y,3.6),(.25,.35,7.2),white,.08)
 cube('Overhead bridge',(0,y,7.1),(21.3,.3,.3),white,.08)
 cube('Bridge light',(0,y-.18,6.98),(20.5,.025,.025),lightmat,.005)
for x in [-10.5,10.5]:
 cube('Side roof spine',(x,2,7.15),(.35,22,.4),white,.1)
 for y in [-5,1.5,8]:
  cube('Floor to ceiling glass',(x,y,3.4),(.018,6.1,6.7),clear,.0)
  cube('Window foot rail',(x,y,.15),(.065,6.2,.08),bronze,.015)
for x in [-7,-3.5,0,3.5,7]:
 cube('Panorama mullion',(x,12,3.6),(.065,.09,7.2),navy,.018)
 cube('Panoramic glass',(x+1.72,12,3.5),(3.4,.016,7),clear,0)
# Double suspended orbital luminaires define the volume overhead.
for loc,r in [((0,0,6.25),4.4),((0,6.8,6.1),3.0)]:
 ring('Suspended orbital frame',loc,r,.075,bronze)
 ring('Continuous architectural light',(loc[0],loc[1],loc[2]-.08),r,.025,lightmat)
 for angle in [0,2.1,4.2]:cube('Fine suspension',(loc[0]+r*math.cos(angle),loc[1]+r*math.sin(angle),6.72),(.012,.012,.85),bronze,.002)
# Infinity pool opens along the right side of the office.
cube('Pool basin',(7.7,3.5,.02),(4.6,12,.38),navy,.12)
cube('Turquoise pool surface',(7.7,3.5,.23),(4.25,11.6,.035),water,.025)
for x in [5.35,10.05]:cube('Pool rim',(x,3.5,.3),(.15,12.2,.12),white,.045)
for y in [-2.6,9.6]:cube('Pool rim',(7.7,y,.3),(4.7,.15,.12),white,.045)
for j in range(13):
 stripe=cube('Pool light reflection',(7.6,-2+j*.84,.253),(3.8,.013,.004),cyan,.002);stripe.rotation_euler.z=.13
for y in [4,7]:
 cube('Poolside lounger',(4.75,y,.38),(.7,1.8,.16),white,.08)
 back=cube('Lounger tilted back',(4.75,y+.58,.63),(.7,.65,.12),white,.06);back.rotation_euler.x=.5
# Tall sculpted skyline beyond the glass, with setback towers and window ribbons.
random.seed(22)
for i in range(18):
 x=-43+i*5.1;y=40+random.uniform(0,20);h=random.uniform(12,34);w=random.uniform(2.3,3.4)
 cube('Skyline tower',(x,y,h/2-2),(w,w*.85,h),window,.07)
 for z in range(0,int(h),2):cube('Tower facade ribbon',(x,y-w*.43-.018,z-1),(w*.96,.025,.05),white,.005)
 cube('Tower crown',(x,y,h-1.85),(w*.7,w*.6,.3),bronze,.03)
 if i%5==0:
  cube('Skyline spire',(x,y,h+.5),(.08,.08,5),bronze,.01)
  for side in [-1,1]:cube('Tower luminous edge',(x+side*w*.45,y-w*.44,h/2-2),(.035,.03,h*.96),cyan,.003)
# The study opens behind the left entry, with a library wall and powerful workstation.
cube('Library back wall',(-5.5,9,2.45),(8.4,.22,4.9),wood,.03)
for x in [-9.5,-8,-6.5,-5,-3.5,-2]:cube('Library vertical', (x,8.6,2.4),(.075,.7,4.8),bronze,.012)
for z in [.5,1.35,2.2,3.05,3.9,4.7]:
 cube('Library shelf',(-5.6,8.6,z),(8,.7,.055),woodlight,.014)
 cube('Library shelf light',(-5.6,8.22,z-.035),(7.9,.018,.02),lightmat,.003)
 for j in range(42):
  random.seed(int(z*100)+j);height=random.uniform(.32,.65)
  b=cube('Library volume',(-9.35+j*.181,8.42,z+.055+height/2),(.115,.34,height),bookmats[j%5],.006)
  if j%11==0:b.rotation_euler.y=.16
cube('Sculptural workstation desk',(-4.6,5.0,.94),(4.6,1.65,.16),woodlight,.075)
for x in [-6.3,-2.9]:
 leg=cube('Desk sculptural leg',(x,5,.48),(.16,1.35,.9),navy,.04);leg.rotation_euler.y=.1 if x< -4 else -.1
# Three high-resolution displays and visible keyboard/control surface.
for x,angle in [(-5.9,-.2),(-4.6,0),(-3.3,.2)]:
 o=cube('Workstation display',(x,5.45,1.75),(1.25,.09,.79),black,.035);o.rotation_euler.z=angle
 o=cube('Display luminous panel',(x,5.39,1.75),(1.16,.012,.69),navy,.02);o.rotation_euler.z=angle
 for j in range(5):cube('Screen interface',(x-.1,5.376,1.53+j*.1),(.68+(j%2)*.24,.008,.009),cyan,.001)
 cube('Monitor stem',(x,5.45,1.26),(.06,.06,.5),bronze,.015)
cube('Mechanical keyboard',(-4.7,4.6,1.05),(1.1,.38,.045),black,.02)
for i in range(14):
 for j in range(4):cube('Keyboard key',(-5.18+i*.073,4.46+j*.085,1.078),(.055,.065,.012),white,.004)
cube('Workstation mouse',(-3.85,4.58,1.09),(.15,.24,.065),black,.03)
# Glass-sided high performance PC with three illuminated cooling fans and GPUs.
cube('High-end workstation tower',(-6.5,5.05,1.55),(.58,.85,1.05),black,.055)
cube('PC glass side',(-6.19,5.05,1.55),(.016,.73,.91),clear,.015)
for z in [1.25,1.56,1.87]:
 ring('PC RGB fan',(-6.5,4.606,z),.105,.017,cyan,(math.pi/2,0,0))
 cylinder_obj=sphere('PC fan hub',(-6.5,4.60,z),.025,bronze)
for z in [1.35,1.52]:cube('Graphics accelerator',(-6.4,5.05,z),(.34,.65,.065),bronze,.018)
# Server cluster is visible beside the library; each rack has individual modules.
for y in [3.9,5.4,6.9]:
 cube('Server rack enclosure',(-8.85,y,1.6),(1.05,1.1,3.05),navy,.055)
 for j in range(12):
  cube('Rack server',(-8.85,y-.565,.3+j*.23),(.92,.035,.19),black,.012)
  for k in range(3):cube('Server status LED',(-9.22+k*.09,y-.592,.3+j*.23),(.025,.015,.025),cyan,.003)
  cube('Server air vent',(-8.65,y-.59,.3+j*.23),(.35,.012,.012),bronze,.002)
# Personal lounge and ergonomic chair.
for x in [-5.3,-3.8]:
 cube('Lounge seat',(x,2.9,.5),(1.05,1.0,.24),white,.16)
 cube('Lounge back',(x,3.26,.88),(1.05,.2,.8),white,.12)
# Conference pavilion beyond the right door, furnished and connected to the pool.
cube('Meeting table',(1.5,6.4,.95),(2.5,4.5,.15),white,.1)
for y in [4.8,7.8]:cube('Meeting table base',(1.5,y,.5),(.9,.7,.9),navy,.04)
for x in [-.25,3.25]:
 for y in [4.6,6.15,7.7]:
  cube('Executive meeting chair',(x,y,.57),(.75,.75,.14),navy,.08)
  cube('Meeting chair back',(x+(-.31 if x<1 else .31),y,1.02),(.15,.75,.86),navy,.08)
  cylinder('Chair pedestal',(x,y,.28),.06,.55,bronze)
for y in [5,6.7,8.1]:
 cube('Table interface',(1.5,y,1.039),(.75,.55,.018),navy,.02)
 cube('Table interface line',(1.5,y,1.05),(.5,.018,.005),cyan,.001)
# Landscaped terraces soften the futuristic architecture.
for x,y in [(-9.4,-1),(9.8,10),(4,10.5),(-9.8,10)]:
 cylinder('Large planted vessel',(x,y,.5),.6,1,white)
 cylinder('Tree stem',(x,y,1.6),.05,2.3,wood)
 for i in range(9):
  random.seed(i+int(abs(x)*3));o=sphere('Sculpted foliage',(x+random.uniform(-.45,.45),y+random.uniform(-.45,.45),2.2+random.uniform(-.3,.8)),.5,green);o.scale=(1,1,1.6)
# Two transparent room portals in the open hall. Doors slide apart into their frames.
hinges={}
for target,x in [('representative',-3),('compass',2.0)]:
 for xx in [x-1.16,x+1.16]:
  cube('Portal pier',(xx,1,1.95),(.14,.22,3.9),white,.045)
  cube('Portal illuminated edge',(xx, .87,1.95),(.025,.03,3.7),cyan,.005)
 cube('Portal canopy',(x,1,3.95),(2.5,.5,.18),white,.05)
 cube('Portal threshold',(x,1,.09),(2.5,1,.12),bronze,.025)
 leaves=[]
 for side in [-1,1]:
  h=bpy.data.objects.new(target+' sliding leaf '+str(side),None);scene.collection.objects.link(h);h.location=(x+side*.54,1,0)
  leaf=cube('Transparent smart door',(x+side*.54,1,1.96),(1.06,.05,3.72),clear,.018);leaf.parent=h;leaf.matrix_parent_inverse=Matrix.Translation(-h.location)
  for z in [.26,3.67]:
   rail=cube('Door fine rail',(x+side*.54,.963,z),(1.04,.035,.03),bronze,.007);rail.parent=h;rail.matrix_parent_inverse=Matrix.Translation(-h.location)
  line=cube('Door illuminated seam',(x+side*.04,.962,1.95),(.012,.018,3.55),cyan,.002);line.parent=h;line.matrix_parent_inverse=Matrix.Translation(-h.location)
  leaves.append((h,side,h.location.x))
 hinges[target]=leaves
# Daylight crosses the architecture, with a warmer study and cool conference space.
light('Sky softbox',(0,2,13),2400,(.77,.9,1),12,(0,3,0))
light('Study task lighting',(-4.5,4.5,5.5),700,(1,.81,.6),5,(-4.5,5,0))
light('Pool reflected light',(8,-1,4),800,(.5,.85,1),5,(0,5,1))
light('Front fill',(0,-8,5),700,(1,.93,.84),8,(0,5,2))
sun=bpy.data.lights.new('Clear skyline sunlight','SUN');sun.energy=1.1;sun.angle=.09
obj=bpy.data.objects.new('Clear skyline sunlight',sun);scene.collection.objects.link(obj);obj.rotation_euler=(.4,-.6,-.4)
# The labels are physical signage in the render, with matching HTML hit targets.
font_path=os.environ.get('CONTACT_JAPANESE_FONT','C:/Windows/Fonts/YuGothM.ttc')
if not os.path.exists(font_path):raise RuntimeError('Set CONTACT_JAPANESE_FONT to a licensed Japanese font before rendering.')
jp_font=bpy.data.fonts.load(font_path)
def signage(name,body,loc,size,mat):
 data=bpy.data.curves.new(name,'FONT');data.body=body;data.size=size;data.align_x='CENTER';data.align_y='CENTER';data.extrude=.001;data.bevel_depth=.0005
 if jp_font:data.font=jp_font
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(mat)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
 return o
for target,x,jp,en in [('representative',-3,'執務室','Yuto Matsui'),('compass',2,'会議室','COMPASS')]:
 cube('Floating smart signage',(x,.72,4.32),(2.5,.09,.72),navy,.055)
 cube('Signage top light',(x,.66,4.67),(2.25,.02,.015),cyan,.003)
 signage('Room Japanese '+target,jp,(x,.656,4.43),.25,white)
 signage('Room identity '+target,en,(x,.656,4.16),.23,cyan)
 # Touch panel is on a fixed plinth beside the sliding leaves.
 px=x+.8
 cube('Touch access panel',(px,.73,1.5),(.47,.12,.64),navy,.065)
 ring('Access status ring',(px,.657,1.58),.10,.011,cyan,(math.pi/2,0,0))
 cube('Lock symbol body',(px,.64,1.58),(.09,.016,.06),white,.01)
 ring('Lock symbol shackle',(px,.641,1.63),.031,.008,white,(math.pi/2,0,0))
 signage('Touch to enter '+target,'ENTER',(px,.653,1.32),.078,cyan)
 # A selected panel visibly unlocks before its door opens.
 if target==a.target:
  status=signage('Access granted','OPEN',(px,.634,1.58),.063,cyan)
  status.hide_render=True;status.keyframe_insert('hide_render',frame=1);status.keyframe_insert('hide_render',frame=6)
  status.hide_render=False;status.keyframe_insert('hide_render',frame=7)
# Converted text geometry keeps .blend portable without embedding system fonts.
if jp_font and jp_font.users==0:bpy.data.fonts.remove(jp_font)
# Two independently framed cameras, each shared by both branch clips.
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.lens=28 if a.layout=='desktop' else 31;cam.data.sensor_fit='HORIZONTAL';cam.data.clip_end=100
start=Vector((-.5,-12,3.7 if a.layout=='desktop' else 4.8));end=Vector((-3 if a.target=='representative' else 2,3.5,1.8))
look_start=Vector((-.5,4,2.8));look_end=Vector((-4.5 if a.target=='representative' else 1.5,7,1.5))
def smooth(t):return t*t*(3-2*t)
for frame in range(1,49):
 t=(frame-1)/47
 move=smooth(max(0,min(1,(t-.18)/.82)))
 cam.location=start.lerp(end,move);look=look_start.lerp(look_end,move)
 cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler()
 cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_euler',frame=frame)
 for h,side,original_x in hinges[a.target]:
  h.location.x=original_x+side*1.1*smooth(min(1,t/.36));h.keyframe_insert('location',frame=frame)
scene.frame_set(a.frame)
bpy.ops.wm.save_as_mainfile(compress=True,filepath=os.path.join(a.output,f'{a.target}-{a.layout}.blend'))
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
if a.still:
 scene.render.filepath=os.path.join(a.output,f'lobby-{a.layout}.png' if a.frame == 1 else f'{a.target}-{a.layout}-check-{a.frame}.png');bpy.ops.render.render(write_still=True)
else:
 scene.render.filepath=os.path.join(a.output,f'{a.target}-{a.layout}-');bpy.ops.render.render(animation=True)
