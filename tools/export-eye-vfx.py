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
from hypnotoad_eyes import HYPNO_FRAMES, HYPNO_RIGHT_PHASE, hypnotoad_pixels
from infernal_eyes import FIRE_FRAMES,FIRE_FPS,FIRE_HOLD,OVINE_TILT_DEGREES,OVINE_FRAMES,RIGHT_PHASE_FRAMES,fire_field,fire_pixels,ovine_pixels


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
    for mode in ['Ovine','Sauron','Hypnotoad']:
        neutral=args.output/f'{mode}-neutral-UV.mp4'
        cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{args.size}x{args.size}',
             '-framerate',str(FIRE_FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','15',
             '-pix_fmt','yuv420p','-movflags','+faststart',str(neutral)]
        field=None if mode=='Hypnotoad' else fire_field(mode,args.size)
        count=HYPNO_FRAMES if mode=='Hypnotoad' else OVINE_FRAMES if mode=='Ovine' else FIRE_FRAMES
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        try:
            for frame in range(count):
                pixels=hypnotoad_pixels(frame,args.size) if mode=='Hypnotoad' else ovine_pixels(field,frame) if mode=='Ovine' else fire_pixels(field,frame)
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
        shift=HYPNO_RIGHT_PHASE if mode=='Hypnotoad' else RIGHT_PHASE_FRAMES
        duration=8 if mode=='Hypnotoad' else FIRE_HOLD
        split=f'[0:v]split=3[l][r1][r2];[r1]trim=start_frame={shift},setpts=PTS-STARTPTS[tail];[r2]trim=end_frame={shift},setpts=PTS-STARTPTS[head];[tail][head]concat=n=2:v=1:a=0[r];' if mode in ['Ovine','Hypnotoad'] else '[0:v]split=2[l][r];'
        graph=split+f'[l]rotate={angle}:fillcolor=black[lc];[r]rotate={-angle}:fillcolor=black[rc];[lc][rc]hstack=inputs=2[v]'
        subprocess.run(['ffmpeg','-v','error','-y','-stream_loop','0' if mode=='Ovine' else '3' if mode=='Hypnotoad' else '2','-i',str(neutral),'-t',str(duration),
                        '-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-preset','slow','-crf','17',
                        '-pix_fmt','yuv420p','-movflags','+faststart',str(args.output/f'{mode}-paired-{duration}s.mp4')],check=True)
        print('Exported',mode,flush=True)


if __name__=='__main__':main()
