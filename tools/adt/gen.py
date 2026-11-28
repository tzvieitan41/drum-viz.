# Synthesises labelled drum tracks from the sample bank. usage: python3 gen.py OUTDIR N SEED [holdout|train|all]
import numpy as np, pickle, sys, os, json
from scipy.signal import butter, sosfilt, fftconvolve
SR=22050
out, N, seed, mode = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
HOLD={'sp-acoustic','Sequential-Circuits-Drumtraks'}
bank=pickle.load(open('bank.pkl','rb'))
if mode=='train': bank=[b for b in bank if b[0] not in HOLD]
elif mode=='holdout': bank=[b for b in bank if b[0] in HOLD] + [b for b in bank if b[1]==7]  # ride is scarce: allow it in both
rng=np.random.default_rng(seed); os.makedirs(out,exist_ok=True)
by={c:[b for b in bank if b[1]==c] for c in range(9)}
def pick(c,src=None):
    pool=by[c]
    if src and rng.random()<0.6:
        same=[b for b in pool if b[0]==src]
        if same: pool=same
    return pool[rng.integers(len(pool))]
def shift(x,f): # pitch/speed change by resampling
    n=int(len(x)/f); return np.interp(np.arange(n)*f, np.arange(len(x)), x).astype(np.float32)
def eq(x):
    y=x.copy()
    if rng.random()<0.6: y+=rng.uniform(-0.5,0.8)*sosfilt(butter(2,rng.uniform(80,250),'low',fs=SR,output='sos'),x)
    if rng.random()<0.6: y+=rng.uniform(-0.5,0.8)*sosfilt(butter(2,rng.uniform(3000,8000),'high',fs=SR,output='sos'),x)
    return y
for n in range(N):
    dur=rng.uniform(18,26); L=int(dur*SR); y=np.zeros(L+SR*3,np.float32); labels=[]
    bpm=rng.uniform(68,176); beat=60/bpm; st=beat/4; swing=rng.uniform(0,0.12) if rng.random()<0.25 else 0
    src=rng.choice(sorted({b[0] for b in bank}))
    kit={c:pick(c,src) for c in range(9)}; pf={c:rng.uniform(0.93,1.07) for c in range(9)}
    gain={c:rng.uniform(0.5,1.0) for c in range(9)}; gain[2]*=0.6; gain[3]*=0.6; gain[7]*=0.6
    smp={c:shift(kit[c][2],pf[c]) for c in range(9)}
    # pop-production layering: snare stacked with a clap or a second snare, with its own (often large) reverb;
    # kick stacked with a second kick (sub + click)
    def layer(c):
        a=smp[c]; b=shift(pick(c)[2],rng.uniform(0.93,1.07)); n=max(len(a),len(b)); o=np.zeros(n,np.float32)
        o[:len(a)]+=a; off=int(rng.uniform(0,0.006)*SR); o[off:off+len(b)][:max(0,n-off)]+=rng.uniform(0.4,1.0)*b[:max(0,n-off)]
        return o/np.abs(o).max()
    if rng.random()<0.5: smp[1]=layer(1)
    if rng.random()<0.35: smp[0]=layer(0)
    if rng.random()<0.5:
        rt=rng.uniform(0.4,1.8); irl=int(rt*SR); ir=rng.standard_normal(irl)*np.exp(-np.arange(irl)/(rt*SR/6.9)); ir[:int(0.008*SR)]=0
        w=fftconvolve(smp[1],ir); w/=np.abs(w).max()+1e-9; d=np.zeros(len(w),np.float32); d[:len(smp[1])]=smp[1]; smp[1]=(d+rng.uniform(0.15,0.6)*w).astype(np.float32); smp[1]/=np.abs(smp[1]).max()
    hhmode=rng.choice(['8','16','4','ride8','ride4'],p=[0.42,0.2,0.08,0.18,0.12])
    kick_tpl=rng.choice(['four','rock','sync','half'],p=[0.3,0.35,0.25,0.1])
    ghosts=rng.random()<0.3; fill_every=rng.choice([4,8]); openp=rng.uniform(0,0.4)
    hits=[]
    nbars=int(dur/(4*beat))
    for bar in range(nbars):
        b0=0.3+bar*4*beat
        def at(step): return b0+step*st+(swing*st if step%2==1 else 0)
        fill = (bar%fill_every==fill_every-1) and rng.random()<0.8
        last_step = 12 if fill else 16
        # hats / ride
        for s in range(last_step):
            if hhmode=='8' and s%2==0: hits.append((at(s),3 if (s==14 and rng.random()<openp) else 2, rng.uniform(0.5,1.0)*(1 if s%4==0 else 0.8)))
            if hhmode=='16': hits.append((at(s),3 if (s==14 and rng.random()<openp) else 2, rng.uniform(0.4,0.9)*(1 if s%4==0 else 0.7)))
            if hhmode=='4' and s%4==0: hits.append((at(s),2,rng.uniform(0.6,1)))
            if hhmode=='ride8' and s%2==0: hits.append((at(s),7,rng.uniform(0.5,1)))
            if hhmode=='ride4' and s%4==0: hits.append((at(s),7,rng.uniform(0.5,1)))
        # kick
        if kick_tpl=='four': ks=[0,4,8,12]
        elif kick_tpl=='rock': ks=[0,8,10] if rng.random()<0.5 else [0,7,8]
        elif kick_tpl=='half': ks=[0,10]
        else: ks=[0]+[s for s in range(1,16) if rng.random()<0.22]
        for s in ks:
            if s<last_step: hits.append((at(s),0,rng.uniform(0.7,1)))
        # snare
        for s in ([8] if kick_tpl=='half' else [4,12]):
            if s<last_step: hits.append((at(s),1,rng.uniform(0.75,1)))
        if ghosts:
            for s in range(last_step):
                if s not in (4,12) and rng.random()<0.12: hits.append((at(s),1,rng.uniform(0.12,0.3)))
        if fill:
            seq=rng.choice([[1,1,4,4,5,5,6,6],[4,4,5,5,6,6,6,6],[1,1,1,1,6,6,5,4],[1,4,5,6,1,4,5,6]])
            sub=rng.choice([1,2]) # 16ths or 8ths
            for i,s in enumerate(range(12,16) if sub==2 else range(12,16)):
                pass
            for i in range(4 if sub==2 else 8):
                step=12+i*(1 if sub==1 else 2)/ (2 if sub==1 else 1)
                if step>=16: break
                hits.append((at(step) if step==int(step) else b0+step*st, int(seq[i]), rng.uniform(0.6,1)))
        if bar%fill_every==0 and (bar>0 or rng.random()<0.5) and rng.random()<0.85:
            hits.append((b0,8,rng.uniform(0.7,1)))
            if 0 not in ks: hits.append((b0,0,rng.uniform(0.7,1)))
    # render with humanised timing, hi-hat choke
    hits.sort()
    hh_times=[h[0] for h in hits if h[1] in (2,3)]
    for (t,c,v) in hits:
        t+=rng.normal(0,0.004); i=int(t*SR)
        if i<0 or i>=L: continue
        x=smp[c]*v*gain[c]
        if c==3:  # open hat is choked by the next hi-hat
            nxt=[u for u in hh_times if u>t+0.01]
            if nxt:
                m=int((nxt[0]-t)*SR); 
                if m<len(x): x=x.copy(); fl=min(300,len(x)-m); x[m:m+fl]*=np.linspace(1,0,fl); x[m+fl:]=0
        e=min(len(y),i+len(x)); y[i:e]+=x[:e-i]; labels.append((round(t,4),c,round(float(v*gain[c]),3)))
    y=eq(y)
    # room
    if rng.random()<0.7:
        rt=rng.uniform(0.15,0.9); irl=int(rt*SR); ir=rng.standard_normal(irl)*np.exp(-np.arange(irl)/(rt*SR/6.9)); ir[:int(0.005*SR)]=0
        wet=fftconvolve(y,ir)[:len(y)]; wet/= (np.abs(wet).max()+1e-9); y=y/ (np.abs(y).max()+1e-9) + rng.uniform(0.03,0.25)*wet
    # separation-like leakage: a little bass and pad bleed
    t_=np.arange(len(y))/SR
    if rng.random()<0.7:
        lvl=10**(rng.uniform(-34,-20)/20); f0=rng.choice([41.2,49,55,61.7,65.4,73.4,82.4]); note=np.zeros(len(y),np.float32)
        for k in range(int(dur/(beat*2))):
            s0=int((0.3+k*beat*2)*SR); f=f0*rng.choice([1,1.5,2,1.335]); n2=min(len(y)-s0,int(beat*2*SR))
            if n2<=0: break
            tt=np.arange(n2)/SR; note[s0:s0+n2]+=np.sin(2*np.pi*f*tt)*np.minimum(1,tt/0.01)*np.exp(-tt/1.2)
        y=y/(np.abs(y).max()+1e-9)+lvl*note
    if rng.random()<0.4: y+=10**(rng.uniform(-40,-28)/20)*sosfilt(butter(2,[300,3000],'band',fs=SR,output='sos'),rng.standard_normal(len(y)))
    # transient smear like the separation model's 4096-sample window
    if rng.random()<0.5:
        w=np.hanning(int(rng.uniform(0.02,0.06)*SR)); w/=w.sum(); a=rng.uniform(0.2,0.6); y=(1-a)*y+a*np.convolve(y,w,'same')
    # bus compression
    drive=rng.uniform(1,4); y=np.tanh(drive*y/(np.abs(y).max()+1e-9))/np.tanh(drive)
    y=(y/np.abs(y).max()*rng.uniform(0.3,0.95)).astype(np.float32)[:L]
    y.tofile(f'{out}/{n:04d}.f32'); json.dump({'bpm':bpm,'labels':labels},open(f'{out}/{n:04d}.json','w'))
print('done',N)
