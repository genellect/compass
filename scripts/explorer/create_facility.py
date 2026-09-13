"""Author the complete exploration facility, using the production furniture.

Blender --background --python create_facility.py -- --source DIR --output DIR --master FILE
The navigation floor is exported from the same scene and furniture footprints.
All dimensions are metres. No current production asset is overwritten.
"""
import argparse, json, math, random, sys
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--master', required=True)
parser.add_argument('--materials', required=True)
parser.add_argument('--font', required=True)
opt = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, output, materials = map(lambda p: Path(p).resolve(), [opt.source, opt.output, opt.materials])
output.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 64
scene.cycles.use_denoising = True; scene.cycles.max_bounces = 6
scene.view_settings.view_transform = 'AgX'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.11, .15, .2, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .4
random.seed(20260913)
font=bpy.data.fonts.load(str(Path(opt.font).resolve()))

def material(name, color, roughness=.5, metallic=0, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'stone': material('scanned honed limestone', (.42,.44,.42), .62),
    'wall': material('warm mineral plaster', (.65,.66,.62), .82),
    'metal': material('brushed champagne titanium', (.43,.4,.32), .32, .85),
    'ink': material('charcoal anodized aluminium', (.025,.039,.043), .38, .65),
    'warm': material('2700K indirect architectural light', (.94,.73,.45), .38, 0, 3),
    'cool': material('neutral architectural light', (.61,.79,.83), .38, 0, 2),
    'wood': material('walnut acoustic battens', (.16,.1,.062), .52),
    'glass': material('low iron glazing', (.56,.7,.76), .15, .25),
    'screen': material('fine pitch LED display', (.011,.023,.031), .8, 0, .12),
    'letters': material('backlit architectural lettering', (.78,.86,.8), .3, .3, .45),
}
glass = M['glass'].node_tree.nodes.get('Principled BSDF')
glass.inputs['Alpha'].default_value = .035
glass.inputs['Metallic'].default_value = .04
M['glass'].surface_render_method = 'DITHERED'
for channel, socket in [('Diffuse','Base Color'),('Rough','Roughness'),('nor_gl','Normal')]:
    filename = materials / ('marble_01_' + channel + '.jpg')
    if filename.exists():
        nodes, links = M['stone'].node_tree.nodes, M['stone'].node_tree.links
        t = nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(filename), check_existing=True)
        if channel != 'Diffuse': t.image.colorspace_settings.name = 'Non-Color'
        if channel == 'nor_gl':
            n = nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = .2
            links.new(t.outputs['Color'], n.inputs['Color']); links.new(n.outputs[0], nodes.get('Principled BSDF').inputs[socket])
        else: links.new(t.outputs['Color'], nodes.get('Principled BSDF').inputs[socket])

def collection(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c

current = collection('concourse')

def move_collection(obj):
    for coll in list(obj.users_collection): coll.objects.unlink(obj)
    current.objects.link(obj)

def metric_uv(obj):
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    uv.name='UVMap'
    # Two-metre material repeat; unlike the primitive cube UV this keeps the
    # photographed stone at the same physical scale on every face and floor.
    for polygon in obj.data.polygons:
        axis=max(range(3),key=lambda n:abs(polygon.normal[n]))
        axes=[n for n in range(3) if n!=axis]
        for loop in polygon.loop_indices:
            point=obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(point[axes[0]]/2,point[axes[1]]/2)

def box(name, xyz, size, mat='wall', bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz)
    obj = bpy.context.object; obj.name = name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('manufactured edge radius', 'BEVEL'); modifier.width=bevel; modifier.segments=2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.modifiers.new('weighted surface normals','WEIGHTED_NORMAL')
    obj.data.materials.append(M[mat]); move_collection(obj);metric_uv(obj)
    return obj

def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name); data.from_pydata(vertices, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); current.objects.link(obj); obj.data.materials.append(M[mat]);metric_uv(obj); return obj

def annulus(name, inner, outer, z, thickness, mat, count=128):
    vertices = [(r*math.sin(k*math.tau/count),r*math.cos(k*math.tau/count),h)
                for h in [z-thickness,z] for r in [inner,outer] for k in range(count)]
    faces=[]
    for k in range(count):
        n=(k+1)%count
        faces += [(2*count+k,2*count+n,3*count+n,3*count+k),
                  (k,count+k,count+n,n), (count+k,3*count+k,3*count+n,count+n),
                  (k,n,2*count+n,2*count+k)]
    return mesh(name,vertices,faces,mat)

def export(coll, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in coll.objects:
        if obj.type=='MESH': obj.select_set(True)
    path=output/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',
        export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    tris=sum(len(p.vertices)-2 for obj in coll.objects if obj.type=='MESH' for p in obj.data.polygons)
    return {'file':name+'.glb','bytes':path.stat().st_size,'triangles':tris}

def join_materials(coll):
    # Keep doors as separate leaves. Static architecture shares draw calls by material.
    for material_name in M:
        objects=[o for o in coll.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==M[material_name] and not o.name.startswith('Door')]
        if len(objects)<2: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        objects[0].name=coll.name+'_'+material_name

# Central atrium, annular circulation and three direct galleries.
annulus('atrium structural floor',0,14,-.01,.28,'stone')
annulus('atrium peripheral ceiling',10.5,14,7.4,.22,'wall')
annulus('atrium cove',10.48,10.54,7.14,.025,'warm')
annulus('atrium skylight',0,10.48,7.36,.014,'glass')
for k in range(16):
    a=k*math.tau/16
    rib=box('skylight structural rib',(5.25*math.sin(a),5.25*math.cos(a),7.26),(.045,10.5,.12),'metal',.01);rib.rotation_euler.z=-a
annulus('continuous orbital gallery',25.4,30.6,-.01,.24,'stone')
annulus('gallery ceiling',25.4,30.6,5.2,.2,'wall')
for r in [25.6,30.4]:annulus('continuous indirect gallery light',r,r+.035,4.98,.02,'warm')
for k in range(64):
    a=k*math.tau/64
    if k%8 not in [0,1,7]:
        for r in [25.6,30.4]:
            box('gallery mullion',(r*math.sin(a),r*math.cos(a),2.5),(.08,.08,5),'metal',.012)
    o=box('radial ceiling reveal',(28*math.sin(a),28*math.cos(a),5.0),(.025,4.9,.03),'ink',0)
    o.rotation_euler.z=-a
spokes=[math.pi/2,3*math.pi/4,7*math.pi/4]
for a in spokes:
    for name,z,mat in [('gallery floor',-.12,'stone'),('acoustic gallery ceiling',5.08,'wall')]:
        o=box(name,(20*math.sin(a),20*math.cos(a),z),(4.4,14,.24),mat,.025);o.rotation_euler.z=-a
    for side in [-2.12,2.12]:
        for d in [14,18,22,25]:
            box('slender gallery column',(d*math.sin(a)+side*math.cos(a),d*math.cos(a)-side*math.sin(a),2.48),(.09,.09,5),'metal',.012)
        o=box('gallery slot light',(20*math.sin(a)+side*math.cos(a),20*math.cos(a)-side*math.sin(a),4.9),(.025,14,.025),'cool',0);o.rotation_euler.z=-a
# The arrival is a view through architecture, with no physical web-page screen.
# A few slender columns frame the astronomical photography beyond the glazing.
for x in [-10.5,0,10.5]:
    box('observatory window frame',(x,11.1,3.65),(.08,.18,7.3),'metal',.012)
box('atrium observation glazing',(0,11.12,3.65),(21.2,.014,7.25),'glass',0)
join_materials(current)
assets=[export(current,'concourse')]
rooms=[]; obstacles=[]
names=['top','vision','experience','technology','resources','manifesto','community','founder','contact']
labels=['COMPASS','Vision','Experience','Interactive','Library','Manifesto','Community','Founder','Contact']
furniture_collections=[]

def world(local, origin, yaw):
    x,y,z=local;return [origin[0]+x*math.cos(yaw)+z*math.sin(yaw),y,origin[2]-x*math.sin(yaw)+z*math.cos(yaw)]

for index,key in enumerate(names):
    a=(index-1)*math.pi/4 if index else 0
    origin=[42*math.sin(a),0,42*math.cos(a)] if index else [0,0,0]
    yaw=a+math.pi if index else 0
    shell='concourse.glb'
    if index:
        current=collection(key+' architecture')
        box('room limestone foundation',(0,0,-.15),(22,24,.28),'stone')
        # Blender Y is the opposite of web Z. The north wall contains the entry.
        for x in [-11,11]:
            box('mineral side wall',(x,0,3.2),(.26,24,6.4),'wall',.055)
            box('recessed skirting',(x*.984,0,.1),(.035,23.8,.12),'ink',.008)
            box('indirect ceiling cove',(x*.98,0,6.02),(.035,23.8,.035),'warm',.003)
        for x in [-6.25,6.25]:box('entrance wall',(x,-12,3.2),(9.5,.3,6.4),'wall',.04)
        box('entrance lintel',(0,-12,5.15),(3,.3,2.5),'wall',.035)
        for x in [-1.56,1.56]:box('door bronze jamb',(x,-12,1.95),(.13,.46,3.9),'metal',.014)
        box('door bronze lintel',(0,-12,3.92),(3.25,.46,.12),'metal',.014)
        for side in [-1,1]:
            door=box('Door_'+key+('_left' if side<0 else '_right'),(side*.75,-12,1.9),(1.48,.07,3.8),'glass',.008)
            door['explorer_door']=key;door['side']=side
            # Leaf frame moves with the door, not the surrounding building.
            frame=box('DoorFrame_'+key+str(side),(side*.04,-11.94,1.9),(.045,.05,3.76),'metal',.006)
            frame.parent=door;frame.matrix_parent_inverse=door.matrix_world.inverted()
        box('room nameplate',(0,-12.2,4.4),(4.5,.07,.65),'ink',.018)
        box('ceiling acoustic plane',(0,0,6.36),(22,24,.24),'wall',.03)
        for x in [-8,-4,0,4,8]:
            box('ceiling linear light',(x,0,6.21),(.025,21,.025),'warm',.002)
        for x in [-10.8,-5.4,0,5.4,10.8]:box('panoramic window mullion',(x,12,3.2),(.09,.22,6.4),'metal',.015)
        box('panoramic low iron window',(0,12.02,3.2),(21.8,.018,6.2),'glass',0)
        box('window sill',(0,11.6,.24),(21.8,.7,.46),'stone',.045)
        for n in range(21):box('walnut acoustic wall batten',(-10.82,-8+n*.8,3.15),(.13,.1,5.8),'wood',.012)
        join_materials(current);assets.append(export(current,key+'-shell'));shell=key+'-shell.glb'
        # Arrange the editable master in precisely the same world as the browser.
        for obj in current.objects:
            if obj.parent is not None:continue
            x,y,z=obj.location;point=world([x,z,-y],origin,yaw)
            obj.location=(point[0],-point[2],point[1]);obj.rotation_euler.z-=yaw
    current=collection(key+' furniture')
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source/(key+'.glb')))
    imported=[o for o in bpy.data.objects if o not in before]
    # GLB carries the old light atlas through emission. Restore the actual PBR
    # emitter before baking this building, so furniture cannot light up walls.
    restored=set()
    for obj in imported:
        if obj.type!='MESH':continue
        for material in obj.data.materials:
            if material in restored or not material.get('habitat_baked_indirect'):continue
            restored.add(material);shader=material.node_tree.nodes.get('Principled BSDF')
            for link in list(shader.inputs['Emission Color'].links):material.node_tree.links.remove(link)
            shader.inputs['Emission Color'].default_value=(*material['habitat_emissive'],1)
            shader.inputs['Emission Strength'].default_value=1
    for obj in imported:
        if obj.type!='MESH':continue
        move_collection(obj)
        # Record projected solid surfaces at body height, before placement.
        obj.data.calc_loop_triangles()
        for triangle in obj.data.loop_triangles:
            points=[obj.matrix_world @ obj.data.vertices[v].co for v in triangle.vertices]
            if min(p.z for p in points)>1.85 or max(p.z for p in points)<.09:continue
            projected=[]
            for p in points:
                q=world([p.x,p.z,-p.y],origin,yaw);projected.append([q[0],q[2]])
            obstacles.append(projected)
    # Place complete imported hierarchy under a single transform to retain animation roots.
    parent=bpy.data.objects.new(key+' origin',None);current.objects.link(parent)
    parent.location=(origin[0],-origin[2],0);parent.rotation_euler.z=-yaw
    for obj in imported:
        if obj.parent is None:obj.parent=parent
    furniture_collections.append(current)
    panel=world([0,2.35,-18],origin,yaw) if index else [0,2,-100]
    reading=world([4.8,1.65,3],origin,yaw) if index else [0,1.65,-9]
    door=world([0,1.9,12],origin,yaw) if index else [6,1.65,7]
    rooms.append({'id':key,'label':labels[index],'origin':origin,'yaw':yaw,
        'model':'/habitat/v3/'+key+'.glb','shell':shell,'door':door,'panel':panel,
        'reading':reading,'panelYaw':yaw-math.pi/2 if index else 0,
        'neighbours':(['technology','resources','contact'] if index==0 else [names[1+(index-2)%8],names[1+index%8]] + (['top'] if key in ['technology','resources','contact'] else []))})

current=collection('architectural wayfinding')
def lettering(text,point,yaw,size,max_width):
    bpy.ops.object.text_add(location=(point[0],-point[2],point[1]))
    obj=bpy.context.object;move_collection(obj);obj.name='Lettering_'+text
    obj.data.body=text;obj.data.font=font;obj.data.align_x='CENTER';obj.data.align_y='CENTER';obj.data.size=size
    obj.data.extrude=.018;obj.data.bevel_depth=.002;obj.data.bevel_resolution=1;obj.data.resolution_u=4;obj.data.space_character=1.12
    obj.rotation_euler=(math.pi/2,0,-yaw)
    bpy.context.view_layer.update()
    if obj.dimensions.x>max_width:obj.data.size*=max_width/obj.dimensions.x
    obj.data.materials.append(M['letters']);bpy.ops.object.convert(target='MESH');return obj
lettering('COMPASS',[-5.3,5.85,-11.06],0,.44,7)
for room in rooms[1:]:
    label=lettering(room['label'],world([0,4.42,12.27],room['origin'],room['yaw']),room['yaw'],.48,4.1)
    label['explorer_room_sign']=room['id']
    lettering(room['label'],world([-10.8,4.7,1],room['origin'],room['yaw']),room['yaw']+math.pi/2,.45,7)
assets.append(export(current,'signs'))

# Conservative body-radius expansion on the Blender-derived walkable floor.
size=.5; radius=.3
def inside_triangle(x,z,tri):
    signs=[]
    for n in range(3):
        a,b=tri[n],tri[(n+1)%3];signs.append((x-b[0])*(a[1]-b[1])-(a[0]-b[0])*(z-b[1]))
    return not (min(signs)<-1e-5 and max(signs)>1e-5)
def segment_distance(x,z,a,b):
    dx,dz=b[0]-a[0],b[1]-a[1];denom=dx*dx+dz*dz
    t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/denom)) if denom else 0
    return math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
blocked=set()
for tri in obstacles:
    minx,maxx=min(p[0] for p in tri),max(p[0] for p in tri)
    minz,maxz=min(p[1] for p in tri),max(p[1] for p in tri)
    area=abs((tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[2][0]-tri[0][0])*(tri[1][1]-tri[0][1]))
    for ix in range(math.floor((minx-radius)/size),math.ceil((maxx+radius)/size)+1):
        for iz in range(math.floor((minz-radius)/size),math.ceil((maxz+radius)/size)+1):
            x,z=ix*size,iz*size
            if (area>1e-5 and inside_triangle(x,z,tri)) or min(segment_distance(x,z,tri[n],tri[(n+1)%3]) for n in range(3))<radius:blocked.add((ix,iz))

def floor(x,z):
    r=math.hypot(x,z)
    if r<13.65 or 25.75<r<30.2:return True
    for a in spokes:
        along=x*math.sin(a)+z*math.cos(a);across=x*math.cos(a)-z*math.sin(a)
        if 12<along<28 and abs(across)<1.85:return True
    for room in rooms[1:]:
        dx,dz=x-room['origin'][0],z-room['origin'][2];a=room['yaw']
        lx=dx*math.cos(a)-dz*math.sin(a);lz=dx*math.sin(a)+dz*math.cos(a)
        if abs(lx)<10.55 and -11.0<lz<11.55:return True
        if abs(lx)<1.08 and 11.0<=lz<=12.5:return True
    return False
cells=[]
for ix in range(-112,113):
    for iz in range(-112,113):
        if (ix,iz) not in blocked and floor(ix*size,iz*size):cells.append([ix,iz])
(output/'navigation.json').write_text(json.dumps({'cellSize':size,'cells':cells},separators=(',',':'))+'\n')
current=collection('Navigation mesh')
vertices=[];faces=[]
for ix,iz in cells:
    x,z=ix*size,iz*size;n=len(vertices)
    vertices.extend([(x-size/2,-z-size/2,.02),(x+size/2,-z-size/2,.02),(x+size/2,-z+size/2,.02),(x-size/2,-z+size/2,.02)])
    faces.append((n,n+1,n+2,n+3))
nav=mesh('walkable body clearance',vertices,faces,'cool');nav.hide_render=True
nav.display_type='WIRE';nav.hide_set(True)

for room in rooms:
    location=room['reading'];bpy.ops.object.camera_add(location=(location[0],-location[2],location[1]))
    camera=bpy.context.object;camera.name='Reading_'+room['id']
    target=Vector((room['panel'][0],-room['panel'][2],room['panel'][1]))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=34
    if room['id']=='top':scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=(room['origin'][0],-room['origin'][2],5.8))
    lamp=bpy.context.object;lamp.name='Indirect_'+room['id'];lamp.data.energy=1700;lamp.data.shape='DISK';lamp.data.size=12
bpy.ops.object.light_add(type='SUN',location=(0,0,30));sun=bpy.context.object
sun.rotation_euler=(.35,-.45,-.4);sun.data.energy=1.5;sun.data.angle=.12
report={'version':'1','blender':bpy.app.version_string,'architecture':'concourse.glb','signs':'signs.glb',
    'environment':'/habitat/v3/environment.glb','lighting':'/habitat/v3/room.hdr',
    'nav':'navigation.json','rooms':rooms,'assets':assets}
(output/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
Path(opt.master).resolve().parent.mkdir(parents=True,exist_ok=True)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(Path(opt.master).resolve()))
print('EXPLORER COMPLETE',len(cells),'navigation cells',len(obstacles),'collision faces')
