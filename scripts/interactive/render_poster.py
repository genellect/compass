"""Render the same packed camera/scene used by the interactive Hero."""
import bpy, argparse, sys
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--output',required=True)
p.add_argument('--samples',type=int,default=96)
p.add_argument('--width',type=int,default=1920)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=a.samples;scene.cycles.use_denoising=True
scene.render.resolution_x=a.width;scene.render.resolution_y=round(a.width/1.6);scene.render.resolution_percentage=100
scene.frame_set(1)
out=Path(a.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out)
bpy.ops.render.render(write_still=True)
print('HERO_POSTER_COMPLETE',flush=True)
