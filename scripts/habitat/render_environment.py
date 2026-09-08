"""Render a linear HDR reflection environment from the original packed habitat.
blender --background master.blend --python render_environment.py -- --output room.hdr
"""
import bpy,sys,argparse,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',required=True)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
scene=bpy.context.scene
for o in bpy.data.objects:
    if o.name.startswith(('Float_Core','Spin_Orbit','Static_brushed titanium')):o.hide_render=True
camera=bpy.data.cameras.new('Reflection panorama');camera.type='PANO';camera.panorama_type='EQUIRECTANGULAR'
obj=bpy.data.objects.new('Reflection panorama',camera);scene.collection.objects.link(obj)
obj.location=(1,-.8,2.6);obj.rotation_euler=(math.pi/2,0,0);scene.camera=obj
for name,x in [('window daylight',0),('indirect ceiling',-4),('foreground fill',4)]:
    bpy.data.objects[name].location.x=x
scene.render.resolution_x=512;scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.cycles.samples=32;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.035;scene.cycles.adaptive_min_samples=8
scene.render.image_settings.file_format='HDR';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(Path(args.output).resolve());bpy.ops.render.render(write_still=True)
print('ENVIRONMENT_COMPLETE',scene.render.filepath)
