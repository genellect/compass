"""Create the parent site's nocturnal observatory. Photographic sources: ASSET_CREDITS.md.

Blender --background --python scripts/habitat/create_night.py -- --source DIR --output DIR --master FILE
"""
import argparse, json, math, random, sys
from pathlib import Path
import bpy
from mathutils import Vector, noise

p = argparse.ArgumentParser()
p.add_argument('--source', required=True); p.add_argument('--output', required=True)
p.add_argument('--master', required=True); p.add_argument('--draft', action='store_true')
p.add_argument('--section', default='')
p.add_argument('--data-only', action='store_true')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
src, out = Path(a.source).resolve(), Path(a.output).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s = bpy.context.scene; s.render.engine = 'CYCLES'
s.cycles.samples = 16 if a.draft else 40; s.cycles.use_denoising = True
if a.data_only:s.cycles.samples=1;s.cycles.use_denoising=False
s.cycles.use_adaptive_sampling = True; s.cycles.adaptive_threshold = .035
s.cycles.max_bounces = 6; s.render.threads_mode = 'FIXED'; s.render.threads = 6
s.render.resolution_x = 1280 if a.draft else 1920
s.render.resolution_y = 720 if a.draft else 1080
s.render.resolution_percentage = 100; s.render.image_settings.file_format = 'PNG'
s.view_settings.view_transform = 'AgX'

# A photographed night sky supplies the Milky Way and reflected distant light.
s.world.use_nodes = True; wn = s.world.node_tree.nodes; wl = s.world.node_tree.links
wn.clear(); env = wn.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(str(src / 'night.hdr'))
mapping = wn.new('ShaderNodeMapping'); mapping.inputs['Rotation'].default_value=(.52,0,1.4)
coord = wn.new('ShaderNodeTexCoord'); wl.new(coord.outputs['Generated'], mapping.inputs[0])
wl.new(mapping.outputs[0], env.inputs[0])
bg = wn.new('ShaderNodeBackground'); bg.inputs[1].default_value = .025
wl.new(env.outputs[0], bg.inputs[0]); wo = wn.new('ShaderNodeOutputWorld'); wl.new(bg.outputs[0], wo.inputs[0])
env.image.scale(1024, 512); env.image.filepath_raw = str(out / 'night.hdr'); env.image.file_format = 'HDR'; env.image.save()
# Tone-map the photograph independently of the HDR lighting to contain distant city glare.
s.render.image_settings.file_format='JPEG';s.render.image_settings.quality=90
env.image.save_render(str(out/'sky.jpg'),scene=s);s.render.image_settings.file_format='PNG'
sky=wn.new('ShaderNodeTexEnvironment');sky.image=bpy.data.images.load(str(out/'sky.jpg'));wl.new(mapping.outputs[0],sky.inputs[0])
grade=wn.new('ShaderNodeMixRGB');grade.blend_type='MULTIPLY';grade.inputs[0].default_value=1;grade.inputs[2].default_value=(.13,.23,.4,1);wl.new(sky.outputs[0],grade.inputs[1])
skybg=wn.new('ShaderNodeBackground');skybg.inputs[1].default_value=.15;wl.new(grade.outputs[0],skybg.inputs[0])
ray=wn.new('ShaderNodeLightPath');mix=wn.new('ShaderNodeMixShader');wl.new(ray.outputs['Is Camera Ray'],mix.inputs[0]);wl.new(bg.outputs[0],mix.inputs[1]);wl.new(skybg.outputs[0],mix.inputs[2]);wl.new(mix.outputs[0],wo.inputs[0])

objects = []
def material(name, color, metal=0, rough=.4, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value = (*color, 1)
    n.inputs['Metallic'].default_value = metal; n.inputs['Roughness'].default_value = rough
    n.inputs['Emission Color'].default_value = (*color, 1); n.inputs['Emission Strength'].default_value = emission
    return m
def photographed(name, prefix, metal, rough, normal_strength):
    m = material(name, (.1,.12,.15), metal, rough); nt = m.node_tree
    for channel, slot in [('Diffuse','Base Color'), ('Rough','Roughness'), ('nor_gl','Normal')]:
        image = bpy.data.images.load(str(src / (prefix + '-' + channel + '.jpg')))
        image.scale(768,768); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
        if channel != 'Diffuse': image.colorspace_settings.name = 'Non-Color'
        if channel == 'nor_gl':
            n = nt.nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = normal_strength
            nt.links.new(tex.outputs[0], n.inputs[1]); nt.links.new(n.outputs[0], nt.nodes.get('Principled BSDF').inputs[slot])
        else: nt.links.new(tex.outputs[0], nt.nodes.get('Principled BSDF').inputs[slot])
    return m
stone = photographed('Weathered photographic stone', 'stone', .14, .68, .65)
rock = photographed('Photographic coastal strata', 'rock', .06, .8, 1.1)
alloy = material('Aged champagne alloy', (.25,.15,.065), .83, .28)
obsidian = material('Obsidian architectural edge', (.022,.037,.046), .6, .32)
cyan = material('Horizon light', (.17,.62,.69), 0, .4, 4)
warm = material('Guiding light', (1,.48,.12), 0, .4, 3)
star = material('Far stars', (.6,.76,1), 0, .9, 2)

def finish(o, name, mat):
    o.name = name; o.data.materials.append(mat); objects.append(o); return o
def box(name, xyz, size, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz); o=finish(bpy.context.object,name,mat)
    o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Worn edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def arc(name, center, radius, width, depth, mat, start=-math.pi*.54, end=math.pi*1.54, segments=160):
    # Solid architectural cross-section, unlike a decorative wire ring.
    verts=[]; faces=[]
    for i in range(segments+1):
        angle=start+(end-start)*i/segments
        for dr,dy in [(-width/2,-depth/2),(width/2,-depth/2),(width/2,depth/2),(-width/2,depth/2)]:
            r=radius+dr; verts.append((center[0]+r*math.cos(angle),center[1]+dy,center[2]+r*math.sin(angle)))
    for i in range(segments):
        for j in range(4): faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o);finish(o,name,mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    mod=o.modifiers.new('Soft stone arris','BEVEL');mod.width=min(width*.15,.06);mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def island(name, xyz, scale, seed):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=36,ring_count=18,radius=1,location=xyz)
    o=finish(bpy.context.object,name,rock)
    for v in o.data.vertices:
        co=v.co.copy(); n=noise.fractal(co*3+Vector((seed,seed*.3,0)),1.1,2,3)
        v.co *= 1+n*.26; v.co.z *= .75+noise.noise_vector(co*5)[0]*.18
    o.scale=scale
    for poly in o.data.polygons:poly.use_smooth=True
    return o

# One inhabitable place: a monumental aperture, a water court and the open horizon.
# Human-scale steps, joints and guide lights make its size legible without adding people.
arc('Tidal observatory outer vault',(6,8,6),6.45,1.35,2.5,stone)
arc('Recessed bronze reveal',(6,6.68,6),5.77,.075,.16,alloy)
arc('Inner luminous reveal',(6,8.9,6),5.71,.045,.08,cyan)
arc('Second recessed vault',(6,11,6),6.25,.42,.5,obsidian)
for i in range(23):
    angle=.1+(math.pi-.2)*i/22
    x,z=6+6.45*math.cos(angle),6+6.45*math.sin(angle)
    o=box('Vault construction joint',(x,6.73,z),(.018,.018,1.32),obsidian,.001)
    o.rotation_euler.y=math.pi/2-angle
for i in range(6):
    box('Approach terrace',(6,-4+i*1.55,-.16+i*.048),(4.4-i*.12,1.68,.18),stone)
    for side in [-1,1]:box('Terrace guiding strip',(6+side*(2.16-i*.06),-4+i*1.55,.01+i*.048),(.022,1.45,.025),warm,.002)
# Asymmetric enclosing walls continue beyond the viewport; fine ribs show distance.
for side in [-1,1]:
    for i in range(7):
        x=side*(17+i*.8);y=-6+i*4.7;h=19-i*.7
        box('Observatory buttress',(x,y,h/2),(1.0,1.1,h),stone,.1)
        box('Buttress inner seam',(x-side*.51,y-.3,h/2),(.022,.025,h*.65),alloy,.004)
    box('Low perimeter retaining wall',(side*15,10,.35),(2,48,.8),stone,.1)
island('Foreground rock left',(-13,-5,-.3),(4,4.5,2.4),1)
island('Foreground rock right',(17,3,-.4),(5,6,3.1),4)
for i,(x,y,z,sx,sy,sz) in enumerate([(-20,57,-1,18,8,4),(22,69,-1,22,12,5),(4,88,-1,15,7,2.1),(-40,98,-1,24,9,5)]):
    island('Distant island '+str(i),(x,y,z),(sx,sy,sz),i+9)
# Low, grounded stones in the water catch the same light as the built structure.
for i in range(9):
    rng=random.Random(80+i);side=-1 if i%2 else 1
    island('Tidal stone '+str(i),(side*rng.uniform(9,17),rng.uniform(8,45),-.3),(rng.uniform(.6,2),rng.uniform(1,2.8),rng.uniform(.5,1.1)),i+20)

# Fine distant starlight continues the photographed sky without a decorative planet.
rng=random.Random(281);verts=[];faces=[]
for i in range(240):
    x,y,z=rng.uniform(-150,150),rng.uniform(200,240),rng.uniform(12,105);r=rng.uniform(.018,.064)
    b=len(verts);verts.extend([(x-r,y,z-r),(x+r,y,z-r),(x,y,z+r)]);faces.append((b,b+1,b+2))
mesh=bpy.data.meshes.new('Starlight');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Far starlight',mesh);s.collection.objects.link(o);finish(o,'Far starlight',star)

def area(name, xyz, power, color, size, target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=xyz
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Moonlit vault',(-5,-2,16),2500,(.24,.57,.72),12,(6,8,5))
area('Warm horizon',(5,24,5),3200,(1,.43,.13),10,(6,5,2))
area('Reflected cyan',(7,7,3),1200,(.15,.66,.75),7,(6,-6,0))
area('Foreground bounce',(-12,-7,6),700,(.24,.43,.53),12,(-10,9,2))

# Offline water uses a real filmed frame; WebGL animates its reflection with the video.
water=material('Dark tidal water',(.005,.014,.017),.65,.16);nt=water.node_tree
tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(src/'water-frame.png'))
coord=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=30
nt.links.new(coord.outputs['UV'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],tex.inputs[0])
bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.10
nt.links.new(tex.outputs[0],bump.inputs['Height']);nt.links.new(bump.outputs[0],nt.nodes.get('Principled BSDF').inputs['Normal'])
bpy.ops.mesh.primitive_plane_add(size=1,location=(0,60,-.075));floor=bpy.context.object;floor.name='Poster water'
floor.dimensions=(500,400,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);floor.data.materials.append(water)

bpy.ops.object.select_all(action='DESELECT')
# One draw per material; background architecture does not need independent objects.
merged=[]
groups=[[o for o in objects if o.data.materials[0]==mat] for mat in [stone,rock,alloy,obsidian,cyan,warm,star]]
for group in groups:
    if not group:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();merged.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for obj in merged:obj.select_set(True)
bpy.context.view_layer.objects.active=merged[0]
bpy.ops.export_scene.gltf(filepath=str(out/'observatory.glb'),use_selection=True,export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='JPEG',export_jpeg_quality=82)

# Alternate views of the same world follow the existing HTML reading positions.
ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact']
cameras=[([1,3.0,25],[0,5.2,-8]),([13,3.2,19],[11.5,5.5,-10]),([-2,4.4,24],[2,5.7,-10]),([16,2.2,10],[12.5,4,-10]),([-7,2.8,9],[-2,4,-12]),([13,3.0,2],[11,4.4,-16]),([-8,4.0,-1],[-2,4.9,-22]),([11,3.2,-2],[10,4.3,-22]),([-1,2.5,-8],[0,4,-38])]
poses=[{'id':key,'origin':0,'side':-1 if key in ['vision','technology','manifesto','founder'] else 1,'camera':cameras[i][0],'target':cameras[i][1],'poster':key+'.webp'} for i,key in enumerate(ids)]
manifest={'version':'night-4','fov':54,'reflectionFilm':'reflections.mp4','sections':poses}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);s.collection.objects.link(cam);s.camera=cam
cd.lens=36/(2*math.tan(math.radians(54)/2));cd.sensor_width=36;cd.clip_end=600
s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();render=nodes.new('CompositorNodeRLayers');glare=nodes.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.threshold=3;glare.quality='HIGH';glare.size=6;comp=nodes.new('CompositorNodeComposite');s.node_tree.links.new(render.outputs['Image'],glare.inputs[0]);s.node_tree.links.new(glare.outputs[0],comp.inputs[0])
# RGB data plate: inverse camera distance / water surface / architectural light.
# This lets WebGL animate the authored space with one inexpensive composite pass.
s.view_layers[0].use_pass_z=True;s.view_layers[0].use_pass_object_index=True;floor.pass_index=1
for obj in merged:
    if obj.data.materials[0] in [cyan,warm]:obj.pass_index=2
depth=nodes.new('CompositorNodeMapRange');depth.inputs['From Min'].default_value=4;depth.inputs['From Max'].default_value=100;depth.inputs['To Min'].default_value=1;depth.inputs['To Max'].default_value=0;depth.use_clamp=True
s.node_tree.links.new(render.outputs['Depth'],depth.inputs[0])
water_mask=nodes.new('CompositorNodeIDMask');water_mask.index=1;water_mask.use_antialiasing=True
light_mask=nodes.new('CompositorNodeIDMask');light_mask.index=2;light_mask.use_antialiasing=True
s.node_tree.links.new(render.outputs['IndexOB'],water_mask.inputs[0]);s.node_tree.links.new(render.outputs['IndexOB'],light_mask.inputs[0])
channels=nodes.new('CompositorNodeCombRGBA');s.node_tree.links.new(depth.outputs[0],channels.inputs[0]);s.node_tree.links.new(water_mask.outputs[0],channels.inputs[1]);s.node_tree.links.new(light_mask.outputs[0],channels.inputs[2]);channels.inputs[3].default_value=1
data_out=nodes.new('CompositorNodeOutputFile');data_out.base_path=str(out);data_out.format.file_format='PNG';data_out.format.color_mode='RGB';data_out.format.color_depth='8';s.node_tree.links.new(channels.outputs[0],data_out.inputs[0])
data_out.format.color_management='OVERRIDE';data_out.format.view_settings.view_transform='Raw';data_out.format.view_settings.look='None'
for pose in poses:
    if a.section and pose['id']!=a.section:continue
    c,t=pose['camera'],pose['target'];cam.location=(c[0],-c[2],c[1]);cam.rotation_euler=(Vector((t[0],-t[2],t[1]))-cam.location).to_track_quat('-Z','Y').to_euler()
    data_out.file_slots[0].path=pose['id']+'-map-'
    s.render.filepath=str(out/(pose['id']+'.png'));bpy.ops.render.render(write_still=not a.data_only)
    print('NIGHT_POSTER_COMPLETE',pose['id'],flush=True)
s['night_manifest']=json.dumps(manifest)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.master).resolve()))
