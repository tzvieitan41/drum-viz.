# Builds a labelled bank of CC0 / public-domain drum one-shots at 22.05 kHz mono.
import subprocess, numpy as np, glob, os, re, pickle
SR=22050
SP='/home/claude/sonic-pi-src/etc/samples/'; DM='/home/claude/smpldsnds/drum-machines/'
C=dict(kick=0,snare=1,hhc=2,hho=3,tomh=4,tomm=5,toml=6,ride=7,crash=8)
def load(p):
    raw=subprocess.run(['ffmpeg','-v','error','-i',p,'-f','f32le','-ac','1','-ar',str(SR),'-'],capture_output=True).stdout
    x=np.frombuffer(raw,np.float32).copy()
    if len(x)<64: return None
    pk=np.abs(x).max(); i0=max(0,int(np.argmax(np.abs(x)>pk*0.02))-10); x=x[i0:]
    return x/(np.abs(x).max()+1e-9)
def length_to(x,db=-35):
    env=np.convolve(np.abs(x),np.ones(220)/220,'same'); idx=np.nonzero(env>10**(db/20))[0]
    return (idx[-1] if len(idx) else 0)/SR
bank=[]  # (source, class, audio)
def add(src,cls,path):
    x=load(path)
    if x is not None: bank.append((src,cls,x))
# Sonic Pi acoustic kit
for f,c in [('drum_bass_hard','kick'),('drum_bass_soft','kick'),('drum_heavy_kick','kick'),('drum_snare_hard','snare'),('drum_snare_soft','snare'),
            ('drum_cymbal_closed','hhc'),('drum_cymbal_pedal','hhc'),('drum_cymbal_open','hho'),('drum_tom_hi_hard','tomh'),('drum_tom_hi_soft','tomh'),
            ('drum_tom_mid_hard','tomm'),('drum_tom_mid_soft','tomm'),('drum_tom_lo_hard','toml'),('drum_tom_lo_soft','toml'),
            ('drum_cymbal_hard','crash'),('drum_cymbal_soft','crash'),('drum_splash_hard','crash'),('drum_splash_soft','crash')]:
    add('sp-acoustic',c,SP+f+'.flac')
# Sonic Pi assorted (electronic + acoustic one-shots from many recordists)
for p in glob.glob(SP+'bd_*.flac')+[SP+'elec_hollow_kick.flac',SP+'elec_soft_kick.flac']: add('sp-misc','kick',p)
for p in glob.glob(SP+'sn_*.flac')+[SP+f+'.flac' for f in ('elec_filt_snare','elec_hi_snare','elec_lo_snare','elec_mid_snare','elec_snare','perc_snap','perc_snap2')]: add('sp-misc','snare',p)
for p in glob.glob(SP+'hat_*.flac')+[SP+'tbd_perc_hat.flac']:
    x=load(p)
    if x is not None: bank.append(('sp-misc','hho' if length_to(x)>0.3 else 'hhc',x))
for p in glob.glob(SP+'ride_*.flac'): add('sp-misc','ride',p)
add('sp-misc','crash',SP+'elec_cymbal.flac'); add('sp-misc','tomm',SP+'elec_fuzz_tom.flac')
# drum machines
def dm(machine,rules):
    for p in sorted(glob.glob(DM+machine+'/**/*.m4a',recursive=True)):
        n=p[len(DM)+len(machine)+1:].lower()
        for pat,c in rules:
            if re.search(pat,n): add(machine,c,p); break
dm('LM-2',[(r'^kick','kick'),(r'^snare|^clap','snare'),(r'^hhclosed','hhc'),(r'^hhopen','hho'),(r'^tom-hh|^tom-h\.','tomh'),(r'^tom-m','tomm'),(r'^tom-l','toml'),(r'^ride','ride'),(r'^crash','crash')])
dm('TR-808',[(r'^kick/','kick'),(r'^snare/|^clap/','snare'),(r'^hihat-close','hhc'),(r'^hihat-open','hho'),(r'^tom-hi','tomh'),(r'^mid-tom','tomm'),(r'^tom-low','toml'),(r'^cymbal/','crash')])
dm('MFB-512',[(r'kick','kick'),(r'snare|clap','snare'),(r'hihat-closed','hhc'),(r'hihat-open','hho'),(r'tom-hi','tomh'),(r'tom-mid','tomm'),(r'tom-low','toml'),(r'cymbal','crash')])
dm('Roland-CR-8000',[(r'kick','kick'),(r'snare|clap','snare'),(r'hihat-closed','hhc'),(r'hihat-open','hho'),(r'tom-high','tomh'),(r'tom-low','toml'),(r'cymbal','crash')])
dm('Sequential-Circuits-Drumtraks',[(r'kick','kick'),(r'snare|clap','snare'),(r'closedhat','hhc'),(r'openhat','hho'),(r'tom01','tomh'),(r'tom02','toml'),(r'ride','ride'),(r'crash','crash')])
from collections import Counter
print(len(bank),'samples'); print(Counter(b[1] for b in bank)); print(Counter(b[0] for b in bank))
pickle.dump([(s,C[c],x) for s,c,x in bank],open('bank.pkl','wb'))
