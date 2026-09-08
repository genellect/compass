"""Authoring-only OIDN filter using the library shipped with Blender.

The public app has no denoiser dependency. Cycles' render denoising switch does
not denoise texture bakes, so filter the linear baked radiance before GLB export.
C API: https://github.com/RenderKit/oidn/blob/master/include/OpenImageDenoise/oidn.h
"""
import bpy,ctypes,os
from pathlib import Path
import numpy as np

def denoise(image):
    directory=Path(bpy.app.binary_path).parent/'blender.shared'
    if os.name!='nt':
        raise RuntimeError('Configure the Blender bundled OIDN library path for this authoring OS')
    search=os.add_dll_directory(str(directory))
    library=ctypes.CDLL(str(directory/'OpenImageDenoise.dll'))
    ptr=ctypes.c_void_p;string=ctypes.c_char_p;size=ctypes.c_size_t
    signatures={
        'oidnNewDevice':(ptr,[ctypes.c_int]),
        'oidnSetDeviceInt':(None,[ptr,string,ctypes.c_int]),
        'oidnCommitDevice':(None,[ptr]),'oidnReleaseDevice':(None,[ptr]),
        'oidnNewFilter':(ptr,[ptr,string]),'oidnReleaseFilter':(None,[ptr]),
        'oidnSetSharedFilterImage':(None,[ptr,string,ptr,ctypes.c_int,size,size,size,size,size]),
        'oidnSetFilterBool':(None,[ptr,string,ctypes.c_bool]),
        'oidnCommitFilter':(None,[ptr]),'oidnExecuteFilter':(None,[ptr]),
        'oidnGetDeviceError':(ctypes.c_int,[ptr,ctypes.POINTER(string)]),
    }
    for name,(result,arguments) in signatures.items():
        function=getattr(library,name);function.restype=result;function.argtypes=arguments
    device=library.oidnNewDevice(1);filter_=None
    try:
        library.oidnSetDeviceInt(device,b'numThreads',4);library.oidnCommitDevice(device)
        width,height=image.size
        pixels=np.empty(width*height*4,dtype=np.float32);image.pixels.foreach_get(pixels)
        filtered=pixels.copy()
        filter_=library.oidnNewFilter(device,b'RT')
        for name,data in [(b'color',pixels),(b'output',filtered)]:
            library.oidnSetSharedFilterImage(filter_,name,data.ctypes.data,3,width,height,0,16,width*16)
        library.oidnSetFilterBool(filter_,b'hdr',True)
        library.oidnCommitFilter(filter_);library.oidnExecuteFilter(filter_)
        message=string()
        if library.oidnGetDeviceError(device,ctypes.byref(message)):
            raise RuntimeError(message.value.decode())
        image.pixels.foreach_set(filtered);image.update()
        print('LIGHTMAP_DENOISED',image.name,width,height,flush=True)
    finally:
        if filter_:library.oidnReleaseFilter(filter_)
        library.oidnReleaseDevice(device);search.close()

if __name__=='__main__':
    import argparse,sys
    p=argparse.ArgumentParser();p.add_argument('--directory',required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    for file in Path(args.directory).glob('*.png'):
        image=bpy.data.images.load(str(file.resolve()))
        denoise(image)
        image.filepath_raw=str(file.resolve());image.file_format='PNG';image.save()
        bpy.data.images.remove(image)
