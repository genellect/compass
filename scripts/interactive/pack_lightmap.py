"""Store linear Cycles irradiance in a glTF sRGB texture without losing dark detail."""
import bpy
import numpy as np

def pack_lightmap(image):
    values = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(values)
    values = values.reshape((-1, 4))
    linear = np.maximum(values[:, :3], 0)
    values[:, :3] = np.where(linear <= .0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - .055)
    encoded = bpy.data.images.new(image.name + ' sRGB transport', width=image.size[0], height=image.size[1], alpha=False)
    # Values are already encoded: Non-Color prevents another conversion on export.
    encoded.colorspace_settings.name = 'Non-Color'
    encoded.pixels.foreach_set(values.ravel())
    encoded.pack()
    return encoded
