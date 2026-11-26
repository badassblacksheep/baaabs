"""Bake homepage WebGL buffers and the Ovine Sauron atlas from the six-shore model."""
import gzip
import json
from pathlib import Path
import struct
import subprocess
import zlib

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'site/assets/models/earl-survey-fit.glb'
DEST = ROOT / 'site/assets/home-model'
STEP = 2  # 12 fps, 16 seconds, including all three ovine ripple variants.


def texture_tile(data):
    """The authored fire PNGs use RGB scanlines with PNG filter zero."""
    width, height = struct.unpack_from('>II', data, 16)
    chunks = []
    offset = 8
    while offset < len(data):
        size, kind = struct.unpack_from('>I4s', data, offset)
        if kind == b'IDAT':
            chunks.append(data[offset+8:offset+8+size])
        offset += size + 12
    rows = np.frombuffer(zlib.decompress(b''.join(chunks)), np.uint8).reshape(height, 1+width*3)
    assert not rows[:,0].any() and width == height and width % 32 == 0
    return rows[:,1:].reshape(32,height//32,32,width//32,3).mean(axis=(1,3)).astype(np.uint8)


def transform(n):
    if 'matrix' in n:
        return np.array(n['matrix']).reshape(4,4).T
    x,y,z,w = n.get('rotation',(0,0,0,1))
    matrix = np.eye(4)
    matrix[:3,:3] = np.array([
        [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]
    ]) * n.get('scale',(1,1,1))
    matrix[:3,3] = n.get('translation',(0,0,0))
    return matrix


def build():
    data = SOURCE.read_bytes()
    size = struct.unpack_from('<I',data,12)[0]
    doc = json.loads(data[20:20+size])
    raw = memoryview(data)[28+size:]
    DEST.mkdir(exist_ok=True)
    def view(index):
        desc = doc['bufferViews'][index]
        start = desc.get('byteOffset',0)
        return raw[start:start+desc['byteLength']]
    def read(index):
        a = doc['accessors'][index]
        types = {5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
        width = {'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
        return np.frombuffer(view(a['bufferView']),dtype=types[a['componentType']],
                             offset=a.get('byteOffset',0),count=a['count']*width).reshape(-1,width)

    bus_image = next(i for i, image in enumerate(doc['images']) if image.get('name') == 'Earl-atlas')
    assert doc['images'][bus_image]['mimeType'] == 'image/jpeg'
    (DEST / 'earl-photo.jpg').write_bytes(view(doc['images'][bus_image]['bufferView']))
    atlas = []
    for i in range(0,384,STEP):
        img = next(im for im in doc['images'] if im.get('name') == f'Ovine_fire_{i:03d}')
        atlas.append(texture_tile(view(img['bufferView'])))
    pixels = np.array(atlas).reshape(12,16,32,32,3).transpose(0,2,1,3,4).copy()
    subprocess.run(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','512x384',
                    '-i','pipe:0','-frames:v','1','-q:v','2',str(DEST/'ovine.jpg')],
                   input=pixels.tobytes(),check=True)

    groups = {'shell':[], 'details':[]}
    sun = np.array([-.36,.85,.38])
    def visit(index,parent):
        n = doc['nodes'][index]
        name = n.get('name','')
        world = parent @ transform(n)
        # Both sides use the same UV mesh. Sample the authored right-eye phase in the shader.
        textured = name in ('Eye_L_Ovine_fire_00','Eye_R_Ovine_fire_00')
        if textured:
            world = parent
        elif name.startswith('Eye_') and any(word in name for word in ('Sauron','Hypnotoad','Anime','Otaku','Rainbow','_fire_')):
            return
        component = n.get('extras',{}).get('component')
        if 'mesh' in n and (component!='eye_effect' or textured) and abs(np.linalg.det(world[:3,:3]))>1e-9:
            group = groups['shell' if component in ('shell','head','hooves','poofer','deck','rails','eye_effect') or name.startswith('K-') else 'details']
            for p in doc['meshes'][n['mesh']]['primitives']:
                mat = doc['materials'][p['material']]
                # The lightweight shader draws opaque triangles; retain the window frame and clear the glass.
                if mat['name'] == 'Workshop_bus_DJ_Glazing':
                    continue
                pos = read(p['attributes']['POSITION']) @ world[:3,:3].T + world[:3,3]
                indices = read(p['indices']).reshape(-1,3)
                if textured:
                    # Keep the authored dome curvature and UVs at homepage viewing distance.
                    grid = np.arange(len(pos)).reshape(13,81)[::2,::4]
                    a,b,c,d = grid[:-1,:-1],grid[1:,:-1],grid[:-1,1:],grid[1:,1:]
                    indices = np.stack([a,b,c,c,b,d],axis=-1).reshape(-1,3)
                tri = pos[indices]
                normals = np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
                lengths = np.linalg.norm(normals,axis=1)
                keep = lengths>1e-8
                tri,indices,normals = tri[keep],indices[keep],normals[keep]/lengths[keep,None]
                if not len(tri):
                    continue
                color = np.array(mat.get('pbrMetallicRoughness',{}).get('baseColorFactor',[.45,.45,.45,1])[:3])
                light = .39 + .52*np.abs(normals@sun) + .22*np.maximum(normals[:,1],0)
                rgb = np.clip(255*color**.45*light[:,None],0,255).round().astype('u1')
                # 14-byte vertex: mm position, RGB, surface ID, two normalized 16-bit UVs.
                verts = np.zeros((len(tri)*3,14),dtype='u1')
                verts[:,:6] = (tri.reshape(-1,3)*1000).round().astype('<i2').view('u1').reshape(-1,6)
                verts[:,6:9] = rgb.repeat(3,axis=0)
                texture = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture', {})
                bus_photo = 'index' in texture and doc['textures'][texture['index']]['source'] == bus_image
                if textured or bus_photo:
                    uv_key = 'TEXCOORD_' + str(texture.get('texCoord', 0))
                    uv = read(p['attributes'][uv_key])[indices].reshape(-1, 2)
                    verts[:,10:14] = (65535 * uv.clip(0,1)).round().astype('<u2').view('u1').reshape(-1,4)
                    if bus_photo:
                        verts[:,9] = 4
                        verts[:,6:9] = 255  # Earl's photographs already include daylight and shadows.
                    else:
                        verts[:,9] = 1 if '_L_' in name else 2
                elif n.get('extras',{}).get('panel_id') or mat['name'].startswith('Panel_'):
                    if mat.get('extras', {}).get('display_material') != 'panel-skin.json':
                        raise ValueError(f"Missing photographic skin on {name}")
                    # Surface 5 stores unsigned 8.8 fixed-point tile repeats, without wrapping each corner.
                    uv = read(p['attributes']['TEXCOORD_0'])[indices].reshape(-1,2)
                    fixed = (uv * 256).round()
                    if fixed.min() < 0 or fixed.max() > 65535:
                        raise ValueError(f'Panel UVs exceed packed range on {name}')
                    verts[:,10:14] = fixed.astype('<u2').view('u1').reshape(-1,4)
                    # The shared WebGL shader applies the paint factor once, after sampling the steel.
                    verts[:,6:9] = (255 * light.clip(0,1)).round().astype('u1').repeat(3)[:,None]
                    verts[:,9] = 5
                group.append(verts)
        for child in n.get('children',[]):
            visit(child,world)
    for root in doc['scenes'][doc['scene']]['nodes']:
        visit(root,np.eye(4))
    for name,parts in groups.items():
        triangles = np.concatenate(parts).reshape(-1,3,14)
        mesh = bytearray()
        # Each batch fits 16-bit indices even when every triangle has distinct vertices.
        for start in range(0,len(triangles),21000):
            vertices,indices = np.unique(triangles[start:start+21000].reshape(-1,14),axis=0,return_inverse=True)
            mesh.extend(struct.pack('<II',len(vertices),indices.size))
            mesh.extend(vertices.tobytes())
            mesh.extend(indices.astype('<u2').tobytes())
        path = DEST/(name+'.mesh')
        path.write_bytes(gzip.compress(mesh,compresslevel=9,mtime=0))
        print(name,len(triangles),path.stat().st_size)



if __name__ == '__main__':
    build()
