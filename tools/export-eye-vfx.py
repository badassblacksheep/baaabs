#!/usr/bin/env python3
"""Reproduce neutral UV loops and paired 16-second VFX motion references.

python3 tools/export-eye-vfx.py OUTPUT_DIRECTORY --size 512
Requires NumPy and ffmpeg. --frames also writes the lossless RGB PNG sequences.
"""
import argparse
import pathlib
import subprocess
import struct
import zlib
from infernal_eyes import FIRE_FRAMES,FIRE_FPS,FIRE_HOLD,OVINE_TILT_DEGREES,fire_field,fire_pixels


def png(pixels,size):
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    rows=b''.join(b'\0'+pixels[y*size*3:(y+1)*size*3] for y in range(size))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b'')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=pathlib.Path)
    parser.add_argument('--size',type=int,default=512)
    parser.add_argument('--frames',action='store_true')
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    for mode in ['Ovine','Sauron']:
        neutral=args.output/f'{mode}-neutral-UV.mp4'
        cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{args.size}x{args.size}',
             '-framerate',str(FIRE_FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','15',
             '-pix_fmt','yuv420p','-movflags','+faststart',str(neutral)]
        field=fire_field(mode,args.size)
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        try:
            for frame in range(FIRE_FRAMES):
                pixels=fire_pixels(field,frame)
                process.stdin.write(pixels.tobytes())
                if args.frames:
                    seq=args.output/(mode+'-frames');seq.mkdir(exist_ok=True)
                    (seq/f'{frame:04}.png').write_bytes(png(pixels.tobytes(),args.size))
            process.stdin.close()
            if process.wait()!=0:raise RuntimeError('ffmpeg failed')
        finally:
            if process.poll() is None:process.kill()
        angle=OVINE_TILT_DEGREES*3.141592653589793/180 if mode=='Ovine' else 0
        # In a front view the outside corners rise. Neutral UV master remains
        # unrotated; physical left/right warp belongs to the projection setup.
        graph=f'[0:v]split=2[l][r];[l]rotate={angle}:fillcolor=black[lc];[r]rotate={-angle}:fillcolor=black[rc];[lc][rc]hstack=inputs=2[v]'
        subprocess.run(['ffmpeg','-v','error','-y','-stream_loop','2','-i',str(neutral),'-t',str(FIRE_HOLD),
                        '-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-preset','slow','-crf','17',
                        '-pix_fmt','yuv420p','-movflags','+faststart',str(args.output/f'{mode}-paired-16s.mp4')],check=True)
        print('Exported',mode,flush=True)


if __name__=='__main__':main()
