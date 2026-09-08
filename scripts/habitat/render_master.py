"""Render the packed master without regenerating geometry or rebaking lightmaps.
blender --background master.blend --python render_master.py -- --output DIR
"""
import bpy, sys, argparse
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--section',default='');p.add_argument('--skip-existing',action='store_true')
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;cam=scene.camera
scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.035;scene.cycles.adaptive_min_samples=8
ids=['top','vision','experience','technology','resources','manifesto','community','founder','contact']
for i,key in enumerate(ids):
    if args.section and args.section!=key:continue
    if args.skip_existing and (out/(key+'.png')).exists():continue
    x=i*22;cam.location=(x+5.7,-10,2.65)
    cam.data.shift_x=[-.12,.12,-.048,.12,-.12,.12,-.12,.12,-.12][i]
    cam.rotation_euler=(Vector((x,1,2))-cam.location).to_track_quat('-Z','Y').to_euler()
    for name,dx in [('window daylight',0),('indirect ceiling',-4),('foreground fill',4)]:
        light=bpy.data.objects[name];light.location.x=x+dx
        light.rotation_euler=(Vector((x,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(key+'.png'));scene.render.image_settings.file_format='PNG'
    bpy.ops.render.render(write_still=True)
    print('POSTER_COMPLETE',key,flush=True)
