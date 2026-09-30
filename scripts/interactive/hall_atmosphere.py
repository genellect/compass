"""Blue-hour architectural atmosphere, authored as editable geometry and light."""
import bpy,math,random
from pathlib import Path

def build_atmosphere(scene,architecture,M,box,tube,light):
    world=scene.world;nodes=world.node_tree.nodes;links=world.node_tree.links
    coords=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeMapping')
    links.new(coords.outputs['Generated'],mapping.inputs['Vector']);mapping.inputs['Rotation'].default_value.z=.55
    sky=nodes.new('ShaderNodeTexEnvironment');sky.image=bpy.data.images.load(str(Path('work/hall-materials/kloppenheim_06_puresky_2k.hdr').resolve()))
    links.new(mapping.outputs[0],sky.inputs[0]);links.new(sky.outputs[0],nodes['Background'].inputs[0])
    nodes['Background'].inputs[1].default_value=.42
    glass=bpy.data.materials.new('Low iron architectural glass');glass.use_nodes=True
    bs=glass.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.91,.95,1,1)
    bs.inputs['Roughness'].default_value=.025;bs.inputs['IOR'].default_value=1.45;bs.inputs['Transmission Weight'].default_value=.96
    M['facade glass']=glass
    water=bpy.data.materials.new('Campus reflecting pool');water.use_nodes=True
    bs=water.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.018,.055,.080,1)
    bs.inputs['Metallic'].default_value=.35;bs.inputs['Roughness'].default_value=.09;bs.inputs['IOR'].default_value=1.333
    M['water']=water
    for obj in list(architecture.objects):
        if obj.name.startswith(('Acoustic wall','Timber acoustic fin','Structural pier','Indirect wall wash')) and obj.location.x>0:
            bpy.data.objects.remove(obj,do_unlink=True)
        elif obj.name.startswith(('Acoustic ceiling blade','Recessed ceiling light')):
            bpy.data.objects.remove(obj,do_unlink=True)
    for j in range(12):
        y=-16+j*3.1
        box('Panoramic glazing',(15.15,y,5.2),(.022,3.075,10.1),'facade glass',0)
        box('Window mullion',(15.1,y-1.54,5.2),(.055,.032,10.1),'satin titanium',.008)
    # Broad transverse arches give the canopy a single sculptural gesture.
    for j in range(7):
        y=-14+j*5.0;verts=[];faces=[];points=[]
        for k in range(81):
            x=-15+30*k/80;z=8.1+2.6*math.cos(x/30*math.pi)+j*.04
            points.append((x,y,z))
            verts.extend([(x,y-.32,z-.16),(x,y+.32,z-.16),(x,y+.32,z+.16),(x,y-.32,z+.16)])
        for k in range(80):
            for edge in range(4):
                n=k*4+edge;nextedge=k*4+(edge+1)%4;faces.append((n,nextedge,nextedge+4,n+4))
        mesh=bpy.data.meshes.new('Swept canopy arch');mesh.from_pydata(verts,[],faces);mesh.update()
        rib=bpy.data.objects.new('Swept canopy arch',mesh);architecture.objects.link(rib);mesh.materials.append(M['satin titanium'])
        bevel=rib.modifiers.new('Fabricated edge','BEVEL');bevel.width=.035;bevel.segments=3
        bpy.context.view_layer.objects.active=rib;bpy.ops.object.modifier_apply(modifier=bevel.name)
        for face in mesh.polygons:face.use_smooth=True
        tube('Canopy indirect seam',[(x,y-.35,z-.10) for x,y,z in points],.012,'cyan')
    box('Exterior promenade',(22,0,-.25),(12,90,.3),'mineral stone',.02)
    verts=[];faces=[]
    for j in range(141):
        y=-75+j
        for k in range(57):
            x=28+k*.5;z=-.39+.008*math.sin(x*3.8+y*.7)+.006*math.sin(y*4.1+x*.5)
            verts.append((x,y,z))
    for j in range(140):
        for k in range(56):
            n=j*57+k;faces.append((n,n+1,n+58,n+57))
    mesh=bpy.data.meshes.new('Campus reflecting pool');mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(water)
    pool=bpy.data.objects.new('Campus reflecting pool',mesh);architecture.objects.link(pool)
    for f in mesh.polygons:f.use_smooth=True
    pool.shape_key_add(name='Basis');breeze=pool.shape_key_add(name='Breeze')
    for point in breeze.data:
        x,y,_=point.co;point.co.z=-.39+.008*math.sin(x*3.8+y*.7+math.pi)+.006*math.sin(y*4.1+x*.5+math.pi)
    for frame,value in [(1,0),(121,1),(241,0)]:
        breeze.value=value;breeze.keyframe_insert('value',frame=frame)
    for j in range(18):
        y=-35+j*4.1
        box('Promenade inset light',(18.8,y,-.07),(.045,1.7,.025),'warm',.003)
    # Three designed campus pavilions replace the arbitrary grid of glowing boxes.
    for i,(x,y,w,d,levels) in enumerate([(65,-42,14,25,3),(82,-4,18,31,4),(101,38,16,27,3)]):
        box('Campus pavilion plinth',(x,y,-.2),(w+2,d+2,.5),'mineral stone',.04)
        for floor in range(levels):
            z=floor*3.4
            box('Pavilion floor plate',(x,y,z),(w,d,.17),'white ceramic',.035)
            box('Pavilion service core',(x+w*.26,y,z+1.7),(w*.35,d*.72,3.2),'mineral stone',.03)
            box('Pavilion glazing',(x-w/2+.03,y,z+1.7),(.025,d-.2,3.2),'facade glass',0)
            for bay in range(int(d/1.3)):
                yy=y-d/2+.6+bay*1.3
                box('Pavilion facade mullion',(x-w/2,yy,z+1.7),(.045,.03,3.25),'satin titanium',.005)
                if (bay+floor+i)%4==0:
                    box('Pavilion ceiling light',(x-w/2+2.2,yy,z+3.15),(2.3,.025,.015),'warm',.002)
        box('Pavilion cantilever roof',(x-.8,y,levels*3.4),(w+3,d+2,.24),'white ceramic',.07)
    light('Facade daylight',(20,2,12),(0,5,2),850,15,(.82,.88,1))
    light('Window edge light',(13,-9,5),(4,4,2),500,7,(.86,.92,1))
    for lamp in [o for o in scene.objects if o.type=='LIGHT' and o.name.startswith('Warm ceiling bounce')]:
        lamp.data.energy=850;lamp.location.z=8.4
    for lamp in [o for o in scene.objects if o.type=='LIGHT' and o.name.startswith('Cool ceiling bounce')]:
        lamp.data.energy=220;lamp.location.z=8.4
    light('Warm side wall',(-13,5,5),(0,5,1),650,6,(1,.90,.78))
    # The physical screen reveal and terrace edges carry light into the polished floor.
    tube('Stage indirect wash',[(x,-12.8+1.8*(x/10)**2,1.82) for x in [-10+20*k/80 for k in range(81)]],.018,'warm')
    for row in range(10):
        radius=12.44+row*1.22;z=.14+row*.3
        for start,end in [(-.55,-.07),(.07,.55)]:
            tube('Terrace indirect wash',[(math.sin(t)*radius,-12+math.cos(t)*radius,z) for t in [start+(end-start)*k/40 for k in range(41)]],.006,'warm')
    for lamp in [o for o in scene.objects if o.type=='LIGHT']:
        lamp.visible_glossy=False;lamp.visible_transmission=False
    # Real ceiling luminaires remain visible in reflections; invisible fill sources do not.
    for lamp in [o for o in scene.objects if o.type=='LIGHT' and o.name.startswith('Warm ceiling bounce')]:
        lamp.location.x=0;lamp.location.z=9.1;lamp.rotation_euler=(0,0,0)
        lamp.data.shape='RECTANGLE';lamp.data.size=6;lamp.data.size_y=.16;lamp.data.energy=600
        lamp.visible_glossy=True
        box('Ceiling luminaire',(0,lamp.location.y,9.13),(6,.16,.028),'warm',.005)
