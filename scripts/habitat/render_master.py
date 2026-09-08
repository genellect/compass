"""Render the packed master without regenerating geometry or rebaking lightmaps.
blender --background master.blend --python render_master.py -- --output DIR
"""
import bpy, sys, argparse, json
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--section',default='');p.add_argument('--skip-existing',action='store_true');p.add_argument('--draft',action='store_true')
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;cam=scene.camera
scene.render.resolution_percentage=50 if args.draft else 100
scene.cycles.samples=16 if args.draft else 64
scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.035;scene.cycles.adaptive_min_samples=8
poses=json.loads(scene['tour_manifest'])
for i,pose in enumerate(poses):
    key=pose['id']
    if args.section and args.section!=key:continue
    if args.skip_existing and (out/(key+'.png')).exists():continue
    x=i*22;px,py,pz=pose['camera'];cam.location=(px,-pz,py)
    cam.data.shift_x=pose['filmOffset']/36
    tx,ty,tz=pose['target'];cam.rotation_euler=(Vector((tx,-tz,ty))-cam.location).to_track_quat('-Z','Y').to_euler()
    for name,dx in [('window daylight',0),('indirect ceiling',-4),('foreground fill',4)]:
        light=bpy.data.objects[name];light.location.x=x+dx
        light.rotation_euler=(Vector((x,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(key+'.png'));scene.render.image_settings.file_format='PNG'
    bpy.ops.render.render(write_still=True)
    print('POSTER_COMPLETE',key,flush=True)
