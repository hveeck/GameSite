import os,math,ctypes,ctypes.util,subprocess,random
import numpy as np
from pathlib import Path
root=Path(__file__).parent.parent/'music';root.mkdir(exist_ok=True)
lib=ctypes.CDLL(ctypes.util.find_library('fluidsynth'))
def api(n,restype,args):
 f=getattr(lib,n);f.restype=restype;f.argtypes=args;return f
P=ctypes.c_void_p; I=ctypes.c_int
new_settings=api('new_fluid_settings',P,[])
setnum=api('fluid_settings_setnum',I,[P,ctypes.c_char_p,ctypes.c_double]);setint=api('fluid_settings_setint',I,[P,ctypes.c_char_p,I]);new_synth=api('new_fluid_synth',P,[P]);sfload=api('fluid_synth_sfload',I,[P,ctypes.c_char_p,I]);program=api('fluid_synth_program_change',I,[P,I,I]);noteon=api('fluid_synth_noteon',I,[P,I,I,I]);noteoff=api('fluid_synth_noteoff',I,[P,I,I]);alloff=api('fluid_synth_all_sounds_off',I,[P,I]);write=api('fluid_synth_write_float',I,[P,I,P,I,I,P,I,I]);del_synth=api('delete_fluid_synth',None,[P]);del_set=api('delete_fluid_settings',None,[P])
rate=22050
s=new_settings();setnum(s,b'synth.sample-rate',rate);setnum(s,b'synth.gain',.23);setint(s,b'synth.reverb.active',1);setint(s,b'synth.chorus.active',1)
fs=new_synth(s);print('SF',sfload(fs,b'/usr/share/sounds/sf2/TimGM6mb.sf2',1))
# Public-domain themes, newly synthesized performances/arrangements. Pitches and harmonies are intentionally simplified.
NOTE={'C':0,'C#':1,'D':2,'Eb':3,'E':4,'F':5,'F#':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11}
def midi(note):
 if isinstance(note,int):return note
 import re
 m=re.match(r'([A-G](?:#|b)?)(\d+)$',note)
 return (int(m.group(2))+1)*12+NOTE[m.group(1)]
def make(name, melody, chords, bpm=92, bars=32, programs=(0,48,19), keyshift=0, martial=False):
 beat=60/bpm;events=[];maxbeat=bars*4
 def evt(start,dur,pitch,vel,ch):
  if start>=maxbeat:return
  start=max(0,start);dur=min(dur,maxbeat-start)
  if dur<=0:return
  events.append((start*beat,1,ch,midi(pitch)+keyshift,vel));events.append(((start+dur)*beat,0,ch,midi(pitch)+keyshift,vel))
 # melody given as note,length pairs; repeat, vary octave and velocity
 template=[];t=0
 for pitch,dur in melody:
  template.append((t,pitch,dur));t+=dur
 for rep in range(math.ceil(maxbeat/t)):
  for b,p,d in template:
   at=rep*t+b
   if at>=maxbeat:continue
   if p is not None:
    vel=(83 if martial else 69)+((rep%3)*4)
    evt(at,d*.92,p,vel,0)
    if rep%4==3 and not martial:evt(at+.08,min(.85,d*.7),midi(p)-12,38,1)
 # harmonic progression: 4 beats per chord, root in octave 3, poly low strings
 for bar in range(bars):
  chord=chords[bar%len(chords)]
  root=midi(chord[0]);quality=chord[1]
  third=4 if quality=='maj' else 3; fifth=7
  for st,p,v in [(0,root,56),(0,root+third,37),(0,root+fifth,37)]:evt(bar*4+st,3.9,p,v,1)
  if martial:
   for st in [0,2]:evt(bar*4+st,.8,root-12,65,2)
   for st in [1,3]:evt(bar*4+st,.25,42,40,9) # cymbal / percussion channel
  else:
   for st,p in [(0,root-12),(1,root),(2,root+third),(3,root+fifth)]:evt(bar*4+st,.82,p,47,2)
 # SF programs: piano/strings/organ for peace; horn/strings/brass for war
 for ch,pr in enumerate(programs):program(fs,ch,pr)
 program(fs,9,0)
 total=int((maxbeat*beat+1.4)*rate);out=np.empty(total,dtype=np.float32);chunk=2048;events.sort(key=lambda x:(x[0],x[1]));pos=0;ei=0
 while pos<total:
  nxt=min(total,pos+chunk);target=nxt/rate
  # events need sample accuracy; render in segments ending at event times
  while ei<len(events) and int(events[ei][0]*rate)<nxt:
   stop=max(pos,int(events[ei][0]*rate));stop=min(stop,nxt)
   if stop>pos:
    l=np.zeros(stop-pos,dtype=np.float32);r=np.zeros(stop-pos,dtype=np.float32)
    write(fs,len(l),l.ctypes.data,0,1,r.ctypes.data,0,1);out[pos:stop]=(l+r)*.5;pos=stop
   at,kind,ch,p,v=events[ei];(noteon(fs,ch,p,v) if kind else noteoff(fs,ch,p));ei+=1
  if nxt>pos:
   l=np.zeros(nxt-pos,dtype=np.float32);r=np.zeros(nxt-pos,dtype=np.float32)
   write(fs,len(l),l.ctypes.data,0,1,r.ctypes.data,0,1);out[pos:nxt]=(l+r)*.5;pos=nxt
 # polish with short fade
 fade=min(rate*2,len(out)//10);out[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)
 out*=.7
 # moderate integrated level, avoid clipping
 peak=max(np.max(np.abs(out)),.01);out=np.clip(out*min(1.0,.7/peak),-1,1)
 p=root/name
 proc=subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-f','f32le','-ar',str(rate),'-ac','1','-i','pipe:0','-c:a','libvorbis','-qscale:a','3',str(p)],input=out.astype('<f4').tobytes(),capture_output=True)
 if proc.returncode:raise RuntimeError(proc.stderr.decode())
 print(name,round(len(out)/rate,1),'s',round(p.stat().st_size/1024),'KB')
 for ch in range(16):alloff(fs,ch)
# accurate excerpt of Beethoven Ode to Joy theme; C major shift transposition of D major theme
ode=[('E4',1),('E4',1),('F4',1),('G4',1),('G4',1),('F4',1),('E4',1),('D4',1),('C4',1),('C4',1),('D4',1),('E4',1),('E4',1.5),('D4',.5),('D4',2),('E4',1),('E4',1),('F4',1),('G4',1),('G4',1),('F4',1),('E4',1),('D4',1),('C4',1),('C4',1),('D4',1),('E4',1),('D4',1.5),('C4',.5),('C4',2)]
yankee=[('C5',1),('C5',1),('D5',1),('E5',1),('C5',1),('E5',1),('D5',2),('G4',1),('C5',1),('C5',1),('D5',1),('E5',1),('C5',1),('B4',1),('G4',1),('C5',1),('C5',1),('D5',1),('E5',1),('F5',1),('E5',1),('D5',1),('C5',1),('B4',1),('G4',1),('A4',1),('B4',1),('C5',2),('C5',2)]
# Bach prelude harmonic arpeggiation, original underlying triadic pattern; familiar flowing mood
bach=[]
for rootp in [('C4','E4','G4','C5','E5'),('C4','D4','A4','D5','F5'),('B3','D4','G4','D5','F5'),('C4','E4','G4','C5','E5'),('A3','C4','E4','A4','C5'),('D4','F4','A4','D5','F5'),('G3','D4','G4','B4','D5'),('C4','E4','G4','C5','E5')]:
 for x in [0,1,2,3,4,3,2,1]:bach.append((rootp[x],.5))
# American traditional, simplified melodic phrases
johnny=[('A4',.75),('A4',.25),('A4',1),('C5',1),('E5',1),('C5',1),('E5',1),('C5',1),('A4',1),('G4',.5),('A4',.5),('C5',1),('B4',1),('A4',1),('G4',1),('E4',1),('G4',1),('A4',2)]
battle=[('G4',.5),('G4',.5),('G4',.5),('E4',.5),('G4',1),('C5',1),('C5',1),('C5',1),('B4',1),('A4',1),('G4',.5),('G4',.5),('G4',.5),('E4',.5),('G4',1),('C5',1),('D5',1),('E5',1),('D5',1),('C5',2)]
mozart=[('G4',.5),('D5',.5),('G4',.5),('D5',.5),('G4',.5),('D5',.5),('G4',.5),('B4',.5),('D5',1),('C5',1),('A4',1),('C5',1),('A4',1),('C5',1),('A4',.5),('F#4',.5),('A4',1),('D5',2)]
make('peace_ode_to_joy.ogg',ode,[('C3','maj'),('G2','maj'),('F2','maj'),('C3','maj')],bpm=81,bars=48,programs=(40,48,0))
make('peace_bach_prelude.ogg',bach,[('C3','maj'),('A2','min'),('G2','maj'),('C3','maj'),('A2','min'),('D3','min'),('G2','maj'),('C3','maj')],bpm=87,bars=48,programs=(0,48,10))
make('peace_yankee_doodle.ogg',yankee,[('C3','maj'),('G2','maj'),('C3','maj'),('F2','maj'),('C3','maj'),('G2','maj'),('C3','maj')],bpm=100,bars=44,programs=(73,48,0))
make('war_johnny_comes_marching.ogg',johnny,[('A2','min'),('E3','maj'),('A2','min'),('G2','maj'),('F2','maj'),('E3','maj')],bpm=116,bars=52,programs=(60,48,56),martial=True)
make('war_battle_hymn.ogg',battle,[('C3','maj'),('F2','maj'),('C3','maj'),('G2','maj'),('C3','maj')],bpm=108,bars=48,programs=(56,48,60),martial=True)
make('war_mozart_serenade.ogg',mozart,[('G2','maj'),('D3','maj'),('G2','maj'),('C3','maj'),('D3','maj')],bpm=120,bars=48,programs=(48,40,56),martial=True)
# Short bespoke transition cues, not recognizable modern music
make('cue_war_declaration.ogg',[('G4',.5),('G4',.5),('Eb4',.5),('C4',2),('G3',1),('C4',1),('Eb4',1),('G4',2)],[('C3','min'),('G2','maj')],bpm=105,bars=3,programs=(56,48,57),martial=True)
make('cue_peace_treaty.ogg',[('G4',1),('C5',1),('E5',1),('G5',2),('E5',1),('C5',2)],[('C3','maj'),('F2','maj')],bpm=88,bars=3,programs=(73,48,0))
# American peacetime melodies — newly synthesized, simplified public-domain themes.
# Shenandoah: traditional American folk melody (19th century).
shenandoah=[('C4',1.5),('E4',.5),('G4',2),('A4',1),('G4',1),('E4',2),('D4',1),('E4',1),('G4',2),('E4',1.5),('D4',.5),('C4',3),('G3',1),('C4',2),('D4',1),('E4',1),('G4',2),('A4',1),('G4',1),('E4',2),('D4',1),('C4',3)]
# America the Beautiful: Samuel A. Ward's public-domain hymn tune "Materna" (1882).
america=[('C4',1),('C4',1),('E4',1),('G4',1),('G4',1),('E4',1),('D4',1),('C4',1),('E4',1),('F4',1),('G4',2),('A4',1),('G4',1),('E4',2),('G4',1),('G4',1),('A4',1),('C5',1),('C5',1),('A4',1),('G4',1),('E4',1),('F4',1),('E4',1),('D4',1),('C4',3)]
make('peace_shenandoah.ogg',shenandoah,[('C3','maj'),('F2','maj'),('C3','maj'),('A2','min'),('D3','min'),('G2','maj')],bpm=74,bars=52,programs=(73,48,0))
make('peace_america_beautiful.ogg',america,[('C3','maj'),('G2','maj'),('A2','min'),('F2','maj'),('C3','maj'),('G2','maj')],bpm=80,bars=50,programs=(40,48,0))
del_synth(fs);del_set(s)
