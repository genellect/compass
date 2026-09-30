"""Blender-authored architectural Hero; no AI-generated imagery."""
import bpy, math, random, sys, argparse, json
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument("--output",required=True);p.add_argument("--master",required=True);p.add_argument("--people");p.add_argument("--render",action="store_true");p.add_argument("--draft",action="store_true")
a=p.parse_args(sys.argv[sys.argv.index("--")+1:]);out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
random.seed(46)
bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine="CYCLES";scene.cycles.samples=32 if a.draft else 192;scene.cycles.use_denoising=True
scene.cycles.adaptive_threshold=.015
scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=4
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=65 if a.draft else 100
scene.view_settings.view_transform="AgX";scene.view_settings.exposure=-.3;scene.render.fps=30;scene.frame_end=240
world=bpy.data.worlds.new("Night sky") if not scene.world else scene.world;scene.world=world;world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.025,.048,.09,1);world.node_tree.nodes["Background"].inputs[1].default_value=.3
architecture=bpy.data.collections.new("Architecture");scene.collection.children.link(architecture)
people=bpy.data.collections.new("Students");scene.collection.children.link(people)
M={}
def mat(key,color,metal=0,rough=.45,emission=0):
    m=bpy.data.materials.new(key);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get("Principled BSDF");bs.inputs["Base Color"].default_value=(*color,1)
    bs.inputs["Metallic"].default_value=metal;bs.inputs["Roughness"].default_value=rough
    bs.inputs["Emission Color"].default_value=(*color,1);bs.inputs["Emission Strength"].default_value=emission
    M[key]=m;return m
mat("midnight ceramic",(.022,.041,.063),.05,.48)
mat("satin titanium",(.35,.36,.37),.82,.42)
mat("champagne metal",(.38,.34,.28),.78,.28)
mat("mineral stone",(.075,.082,.089),.16,.28)
mat("ink wool",(.045,.052,.060),0,.84)
mat("white ceramic",(.52,.52,.51),.15,.36)
mat("warm",(.91,.83,.70),0,.4,3.5)
mat("cyan",(.58,.70,.76),0,.3,1.8)
mat("screen",(.009,.015,.021),.05,.55,.35)
mat("glass",(.12,.25,.33),.55,.17)
mat("screen detail",(.38,.86,.90),.15,.3,2.0)
mat('walnut',(.58,.46,.34),0,.48)
mat('paper',(.65,.62,.55),0,.87)
nodes=M['walnut'].node_tree.nodes;links=M['walnut'].node_tree.links;bs=nodes['Principled BSDF']
coords=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=.65;links.new(coords.outputs['UV'],mapping.inputs[0])
for suffix in ['diffuse','normal','roughness']:
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(Path('work/hall-materials/wood-'+suffix+'.jpg').resolve()));links.new(mapping.outputs[0],tex.inputs['Vector'])
    if suffix=='diffuse':links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    elif suffix=='normal':
        tex.image.colorspace_settings.name='Non-Color';normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.3;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
    else:tex.image.colorspace_settings.name='Non-Color';links.new(tex.outputs['Color'],bs.inputs['Roughness'])
# Small true material maps survive glTF. These are numerical surface textures.
for key,kind in [("mineral stone","stone"),("ink wool","fabric"),("satin titanium","metal")]:
    n=256;im=bpy.data.images.new(key+" surface",width=n,height=n);base=M[key].diffuse_color[:3];pixels=[]
    rng=random.Random(7)
    for y in range(n):
        line=rng.uniform(-.024,.024)
        for x in range(n):
            noise=rng.uniform(-.015,.015)
            if kind=="fabric":noise+=.035*math.sin(x*math.pi/2)*math.sin(y*math.pi/2)
            elif kind=="metal":noise=line+rng.uniform(-.004,.004)
            else:noise+=.035*math.sin(x*.03+math.sin(y*.06)*1.3)*math.sin(y*.014)
            pixels.extend([max(.001,c+noise) for c in base]+[1])
    im.pixels.foreach_set(pixels);im.pack()
    nodes=M[key].node_tree.nodes;links=M[key].node_tree.links;t=nodes.new("ShaderNodeTexImage");t.image=im
    links.new(t.outputs["Color"],nodes["Principled BSDF"].inputs["Base Color"])
# Reuse the parent's attributed CC0 material library, with physical surface scale.
material_dir=Path('work/hall-materials')
for key,prefix,scale in [('mineral stone','stone',.7),('ink wool','fabric',9),('satin titanium','metal',1.5)]:
    nodes=M[key].node_tree.nodes;links=M[key].node_tree.links;bs=nodes['Principled BSDF']
    coords=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=scale
    links.new(coords.outputs['UV'],mapping.inputs[0])
    for suffix in ['diffuse','normal','roughness']:
        path=material_dir/(prefix+'-'+suffix+'.webp')
        if not path.exists():continue
        tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path.resolve()))
        links.new(mapping.outputs[0],tex.inputs['Vector'])
        if suffix=='diffuse':
            tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(*M[key].diffuse_color[:3],1)
            links.new(tex.outputs['Color'],tint.inputs[1]);links.new(tint.outputs[0],bs.inputs['Base Color'])
        elif suffix=='normal':
            tex.image.colorspace_settings.name='Non-Color';normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.3
            links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
        else:
            tex.image.colorspace_settings.name='Non-Color'
            if key=='mineral stone':
                import numpy as np
                image=tex.image.copy();values=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(values)
                values=values.reshape((-1,4));values[:,1]=.17+values[:,1]*.21;image.pixels.foreach_set(values.ravel());image.pack();tex.image=image
            sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0]);links.new(sep.outputs[1],bs.inputs['Roughness'])

def finish(obj,name,key):
    obj.name=name;obj.data.materials.append(M[key])
    for c in list(obj.users_collection):c.objects.unlink(obj)
    architecture.objects.link(obj);return obj
boxcache={}
def box(name,pos,size,key,bevel=.025):
    k=(*size,key,bevel)
    if k in boxcache:
        obj=bpy.data.objects.new(name,boxcache[k]);architecture.objects.link(obj);obj.location=pos;return obj
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new("Manufactured edge radius","BEVEL");mod.width=min(bevel,min(size)*.4);mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
        for f in o.data.polygons:f.use_smooth=True
        mod=o.modifiers.new("Surface normals","WEIGHTED_NORMAL");bpy.ops.object.modifier_apply(modifier=mod.name)
    finish(o,name,key);boxcache[k]=o.data;return o
tubecache={}
def tube(name,points,r,key):
    origin=Vector(points[0]);relative=[Vector(p)-origin for p in points]
    signature=(tuple(tuple(round(c,5) for c in p) for p in relative),r,key)
    if signature in tubecache:
        o=bpy.data.objects.new(name,tubecache[signature]);architecture.objects.link(o);o.location=origin;return o
    curve=bpy.data.curves.new(name,"CURVE");curve.dimensions="3D";curve.bevel_depth=r;curve.bevel_resolution=3
    s=curve.splines.new("POLY");s.points.add(len(points)-1)
    for q,v in zip(s.points,relative):q.co=(*v,1)
    o=bpy.data.objects.new(name,curve);architecture.objects.link(o);o.data.materials.append(M[key])
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target="MESH");o.select_set(False)
    for f in o.data.polygons:f.use_smooth=True
    o.location=origin;tubecache[signature]=o.data
    return o
def arc(name,r,y,z,start,end,width,depth,key,steps=72):
    verts=[];faces=[]
    for zz in [z-depth,z]:
        for rr in [r-width/2,r+width/2]:
            for i in range(steps+1):
                t=start+(end-start)*i/steps;verts.append((math.sin(t)*rr,y+math.cos(t)*rr,zz))
    n=steps+1
    for i in range(steps):
        faces.extend([(2*n+i,2*n+i+1,3*n+i+1,3*n+i),(i,n+i,n+i+1,i+1),(i,i+1,2*n+i+1,2*n+i),(n+i,3*n+i,3*n+i+1,n+i+1)])
    faces.extend([(0,2*n,3*n,n),(steps,n+steps,3*n+steps,2*n+steps)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);architecture.objects.link(o);o.data.materials.append(M[key]);return o
# Low polished stage and stepped amphitheatre.
box("Reflective foundation",(0,1,-.24),(31,38,.45),"mineral stone",.08)
arc("Curved lecture stage",8,-13,.20,-1.25,1.25,6,.20,"midnight ceramic")
seats=[]
backcache={}
def chair_back(name,pos,rotation,key,inset=False):
    if key not in backcache:
        verts=[];faces=[]
        for j in range(11):
            v=j/10
            for k in range(13):
                u=-1+2*k/12
                verts.append(((.25-.035*(2*v-1)**4)*u,.27+.055*u*u+.045*v*v+(-.035 if inset else 0),.55+.47*v))
        for j in range(10):
            for k in range(12):
                n=j*13+k;faces.append((n,n+13,n+14,n+1))
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
        temp=bpy.data.objects.new(name,mesh);architecture.objects.link(temp);mesh.materials.append(M[key])
        bpy.ops.object.select_all(action='DESELECT');temp.select_set(True);bpy.context.view_layer.objects.active=temp
        solid=temp.modifiers.new('Shell thickness','SOLIDIFY');solid.thickness=.035 if inset else .019;bpy.ops.object.modifier_apply(modifier=solid.name)
        bevel=temp.modifiers.new('Soft manufactured edge','BEVEL');bevel.width=.012;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
        for f in temp.data.polygons:f.use_smooth=True
        backcache[key]=temp.data;bpy.data.objects.remove(temp,do_unlink=True)
    obj=bpy.data.objects.new(name,backcache[key]);architecture.objects.link(obj);obj.location=pos;obj.rotation_euler.z=rotation

# Ten continuous curved rows establish the scale and identity of a lecture theatre.
# Fifteen seats per row, a real central aisle and an irregular half-full audience.
occupied=set(random.Random(107).sample(range(150),75))
for row in range(10):
    radius=13.0+row*1.22;z=.18+row*.30
    arc('Lecture terrace %02d'%row,radius,-12,z,-.70,.70,1.26,.32,'mineral stone')
    for step in range(2):
        box('Aisle tread',(.1,-12+radius-.55+step*.59,z-.15+step*.15),(1.5,.60,.15),'mineral stone',.01)
        box('Recessed step light',(.1,-12+radius-.80+step*.59,z-.012+step*.15),(1.1,.016,.008),'warm',.002)
    for col in range(15):
        offset=(col-7)*.79+(-.84 if col<7 else .84)
        theta=offset/radius
        x=math.sin(theta)*radius;y=-12+math.cos(theta)*radius;ang=-theta
        def point(dx,dy,dz):
            return (x+dx*math.cos(ang)-dy*math.sin(ang),y+dx*math.sin(ang)+dy*math.cos(ang),z+dz)
        top=box('Continuous curved desk',point(0,-.52,.75),(.775,.43,.042),'walnut',.021);top.rotation_euler.z=ang
        for xx in [-.26,.26]:
            leg=box('Desk cantilever',point(xx,-.53,.37),(.026,.09,.72),'satin titanium',.008);leg.rotation_euler.z=ang
        seat=box('Woven seat',point(0,.02,.45),(.52,.45,.095),'ink wool',.04);seat.rotation_euler.z=ang
        chair_back('Ergonomic upholstery',point(0,0,0),ang,'ink wool',True)
        chair_back('Curved metal seat shell',point(0,0,0),ang,'satin titanium')
        for xx in [-.21,.21]:
            tube('Chair leg',[point(xx,.19,.46),point(xx,.23,.055),point(xx,-.16,.055)],.014,'satin titanium')
        if row*15+col in occupied:
            seats.append({'row':row,'col':col,'position':point(0,0,0),'rotation':ang+random.uniform(-.055,.055)})
            if (row+col)%3:
                pad=box('Student notebook',point(.05,-.50,.781),(.20,.26,.010),'paper',.005);pad.rotation_euler.z=ang+random.uniform(-.15,.15)
            else:
                tablet=box('Student tablet',point(.06,-.51,.785),(.25,.18,.012),'screen',.008);tablet.rotation_euler.z=ang
# Side galleries and ribbed structural shell. All geometry is volumetric.

for side in [-1,1]:
    box('Acoustic wall',(side*15.2,1,5.5),(.18,35,11),'ink wool',.02)
    for j in range(70):
        y=-15+j*.5
        box('Timber acoustic fin',(side*15,y,5.4),(.20,.055,10.4),'walnut',.012)
    for j in range(5):
        y=-11+j*6
        box('Structural pier',(side*14.5,y,5.5),(.27,.35,11),'mineral stone',.025)
        box('Indirect wall wash',(side*14.67,y+.25,6),(.018,.055,7),'warm',.003)
# Broad ceiling ellipse framing the learning theatre.

for j in range(17):
    x=-13.6+j*1.7
    beam=box('Acoustic ceiling blade',(x,1,9.3),(.11,34,.6),'walnut',.025)
    if j%3==0:box('Recessed ceiling light',(x+.16,1,9.38),(.025,30,.018),'warm',.004)
box('Ceiling shadow',(0,1,12.1),(31,38,.22),'midnight ceramic',.02)
# Curved stage screen, double-sided thickness and warm metallic reveal.
# A real, panelled front wall closes the room; the screen does not float against the world sky.
for panel in range(22):
    verts=[];faces=[]
    for z in [-.1,11.6]:
        for depth in [0,.20]:
            for k in range(7):
                x=-16+panel*32/22+.02+k*(32/22-.04)/6
                verts.append((x,-14.1+2.2*(x/16)**2-depth,z))
    n=7
    for k in range(6):
        faces.extend([(k,k+1,2*n+k+1,2*n+k),(n+k,3*n+k,3*n+k+1,n+k+1),(2*n+k,2*n+k+1,3*n+k+1,3*n+k),(k,n+k,n+k+1,k+1)])
    faces.extend([(0,2*n,3*n,n),(6,13,27,20)])
    mesh=bpy.data.meshes.new('Curved acoustic panel');mesh.from_pydata(verts,[],faces);mesh.update()
    wall=bpy.data.objects.new('Curved acoustic panel',mesh);architecture.objects.link(wall);mesh.materials.append(M['mineral stone'])
verts=[];faces=[]
for upper in [False,True]:
    for i in range(81):
        x=-13+26*i/80;y=-13.3+1.9*(x/13)**2
        z=9.7-1.5*(abs(x)/13)**1.7 if upper else .65
        verts.append((x,y,z))
for i in range(80):faces.append((i,i+1,i+82,i+81))
mesh=bpy.data.meshes.new("Panoramic screen");mesh.from_pydata(verts,[],faces);mesh.update()
screen=bpy.data.objects.new("Panoramic screen",mesh);architecture.objects.link(screen);screen.data.materials.append(M["screen"])
screen['future_hall_screen']=True
panorama=M['screen'].copy();panorama.name='Immersive screen';screen.data.materials[0]=panorama
bs=panorama.node_tree.nodes['Principled BSDF'];bs.inputs['Emission Color'].default_value=(1,1,1,1);bs.inputs['Emission Strength'].default_value=2.6
tex=panorama.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(Path('work/hall-materials/screen-horizon.png').resolve()))
panorama.node_tree.links.new(tex.outputs[0],bs.inputs['Emission Color'])
uv=mesh.uv_layers.new(name='UVMap')
for face in mesh.polygons:
    for loop in face.loop_indices:
        v=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=((13-v.x)/26,(v.z-.65)/9.05)
for upper in [False,True]:
    tube("Screen reveal",[(x,-13.32+1.9*(x/13)**2,9.73-1.5*(abs(x)/13)**1.7 if upper else .62) for x in [-13+26*i/80 for i in range(81)]],.025,"champagne metal")
# The real photographed horizon is a display material. HTML is the Hero title.
box("Lectern",(7,-9,.78),(1.1,.7,1.5),"midnight ceramic",.08)
box("Lectern inset",(7,-8.635,1.03),(.83,.018,.50),"screen",.014)
def light(name,pos,target,power,size,color):
    data=bpy.data.lights.new(name,"AREA");data.energy=power;data.shape="DISK";data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat("-Z","Y").to_euler()
light("Screen softbox",(2,-10.7,6),(0,5,3),1100,10,(1,.88,.72))
for y in [-5,3,11]:
    light("Warm ceiling bounce",(-5,y,10),(0,y,1),900,7,(1,.93,.84))
    light("Cool ceiling bounce",(7,y,10),(0,y,1),700,6,(.82,.89,1))
light("Foreground portrait key",(-6,13,8),(1,10,4),500,5,(1,.92,.85))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from hall_atmosphere import build_atmosphere
build_atmosphere(scene,architecture,M,box,tube,light)
# Human production is kept separate so detailed rigs remain editable.
if a.people:
    with bpy.data.libraries.load(str(Path(a.people).resolve()),link=False) as (src,dst):dst.collections=["Student masters"]
    masters=dst.collections[0];scene.collection.children.link(masters)
    templates=[o for o in masters.objects if o.type=="ARMATURE"]
    frozen={}
    for template in templates:
        parts=[]
        bpy.context.view_layer.update()
        for source in template.children_recursive:
            if source.type!='MESH':continue
            mesh=bpy.data.meshes.new_from_object(source.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            temp=bpy.data.objects.new('Distance template',mesh);people.objects.link(temp)
            bpy.ops.object.select_all(action='DESELECT');temp.select_set(True);bpy.context.view_layer.objects.active=temp
            dec=temp.modifiers.new('Distance topology','DECIMATE');dec.ratio=.38;bpy.ops.object.modifier_apply(modifier=dec.name)
            parts.append((temp.data,template.matrix_world.inverted()@source.matrix_world));bpy.data.objects.remove(temp,do_unlink=True)
        frozen[template]=parts
    print('DISTANCE_TEMPLATES_READY',len(templates),flush=True)
    near_ids={i for i,s in enumerate(seats) if s['row']>=8 and s['col']>=7}
    near_ids=set(sorted(near_ids,reverse=True)[:8])
    for i,seat in enumerate(seats):
        template=templates[i%len(templates)];mapping={}
        if i not in near_ids:
            from mathutils import Matrix
            transform=Matrix.Translation(Vector(seat['position'])+Vector((0,0,template.location.z)))@Matrix.Rotation(seat['rotation'],4,'Z')
            for j,(mesh,local) in enumerate(frozen[template]):
                new=bpy.data.objects.new('Seated student %02d part %d'%(i,j),mesh);people.objects.link(new);new.matrix_world=transform@local
            continue
        source=[template]+list(template.children_recursive)
        for old in source:
            new=old.copy()
            if old.type=="ARMATURE":new.data=old.data.copy()
            elif old.type=="MESH":new.data=old.data.copy()
            people.objects.link(new);mapping[old]=new
        for old,new in mapping.items():
            if old.parent in mapping:new.parent=mapping[old.parent]
            for mod in new.modifiers:
                if mod.type=="ARMATURE" and mod.object in mapping:mod.object=mapping[mod.object]
        rig=mapping[template];rig.location=Vector(seat["position"])+Vector((0,0,template.location.z));rig.rotation_euler.z=seat["rotation"];rig.name="Student %02d"%i
    # A lecturer stands beside the screen and gestures towards the audience.
    template=templates[0];mapping={}
    for old in [template]+list(template.children_recursive):
        new=old.copy();new.data=old.data.copy();people.objects.link(new);mapping[old]=new
    for old,new in mapping.items():
        if old.parent in mapping:new.parent=mapping[old.parent]
        for mod in new.modifiers:
            if mod.type=='ARMATURE' and mod.object in mapping:mod.object=mapping[mod.object]
    rig=mapping[template];rig.name='Lecturer';rig.animation_data_clear();rig.location=(5,-8.9,.25);rig.rotation_euler.z=math.pi
    for bone in rig.pose.bones:bone.matrix_basis.identity()
    from mathutils import Matrix
    def point_bone(name,direction):
        bpy.context.view_layer.update();b=rig.pose.bones.get(name)
        if not b:return
        delta=(b.tail-b.head).normalized().rotation_difference(Vector(direction).normalized())
        b.matrix=Matrix.Translation(b.head)@(delta@b.matrix.to_quaternion()).to_matrix().to_4x4()
    point_bone('upperarm_l',(.12,-.1,-1));point_bone('lowerarm_l',(0,-.1,-1))
    point_bone('upperarm_r',(-.4,-.3,-.5));point_bone('lowerarm_r',(-.4,-1,.15))
    for o in list(masters.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.collections.remove(masters)
# Camera points slightly left of the stage, leaving the living hall on the right.
cam_data=bpy.data.cameras.new("HeroCamera");cam=bpy.data.objects.new("HeroCamera",cam_data);scene.collection.objects.link(cam)
cam.location=(-9.2,15.0,5.1);look=Vector((4,-7,3.6));cam.rotation_euler=(look-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.lens=24;cam_data.sensor_width=36;cam_data.clip_end=250;scene.camera=cam
cam_data.dof.use_dof=True;cam_data.dof.focus_distance=17;cam_data.dof.aperture_fstop=2.0;cam_data.dof.aperture_blades=9
scene["future_hall_inventory"]=json.dumps({"seats":150,"students":len(seats) if a.people else 0,"source":"Blender geometry","no_generated_images":True})
scene.frame_set(1)
seen=set()
for obj in architecture.objects:
    if obj.type!='MESH' or obj.data in seen or obj.get('future_hall_screen'):continue
    seen.add(obj.data);mesh=obj.data
    uv=mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            co=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(co[axes[0]],co[axes[1]])
for image in bpy.data.images:
    if image.source=="FILE":image.pack()
Path(a.master).resolve().parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.master).resolve()),compress=True)
if a.render:
    scene.render.filepath=str(out/"poster-source.png");bpy.ops.render.render(write_still=True)
print("BLENDER_LECTURE_HALL_COMPLETE",len(seats),flush=True)
