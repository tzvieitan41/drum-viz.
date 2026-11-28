// Builds a synthetic song with known drum hits (plus bass + sustained chords as distractors)
// and runs the app's DSP worker code on it. Usage: node synth.js [seed] [--wav out.wav]
const fs = require('fs'), path = require('path'), vm = require('vm');
const SR = 44100;
let seed = +(process.argv[2] || 1);
function rnd(){ seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function noise(){ return rnd()*2-1; }

function makeSong(bpm, bars){
  const beat = 60/bpm, dur = bars*4*beat + 3, n = Math.ceil(dur*SR), x = new Float32Array(n), truth = [];
  const add = (t, fn, len) => { const s=Math.round(t*SR), L=Math.round(len*SR); for(let i=0;i<L&&s+i<n;i++) x[s+i]+=fn(i/SR); };
  // simple one-pole filters for noise colouring
  const kick=(t,v)=>{ truth.push({t,d:0}); add(t,(u)=>{ const f=50+110*Math.exp(-u/0.03); return v*0.9*Math.sin(2*Math.PI*(50*u+110*0.03*(1-Math.exp(-u/0.03))))*Math.exp(-u/0.12)*Math.min(1,u/0.001);},0.6); };
  const snare=(t,v)=>{ truth.push({t,d:1}); let hp=0,pr=0; add(t,(u)=>{ const w=noise(); hp=0.6*(hp+w-pr); pr=w; return v*(0.5*Math.sin(2*Math.PI*190*u)*Math.exp(-u/0.06)+0.55*hp*Math.exp(-u/0.11))*Math.min(1,u/0.0007);},0.5); };
  const hat=(t,v,open)=>{ truth.push({t,d:open?3:2}); let a=0,b=0,c=0; add(t,(u)=>{ const w=noise(); const y=w-2*a+b; b=a; a=w; c=y; return v*0.22*y*Math.exp(-u/(open?0.18:0.025))*Math.min(1,u/0.0005);},open?1.0:0.2); };
  const tom=(t,v,f,d)=>{ truth.push({t,d}); let hp=0,pr=0; add(t,(u)=>{ const w=noise(); hp=0.5*(hp+w-pr); pr=w; const ph=2*Math.PI*f*(u+0.25*0.03*(1-Math.exp(-u/0.03))); return v*(0.7*Math.sin(ph)*Math.exp(-u/0.28)+0.25*Math.sin(1.59*ph)*Math.exp(-u/0.12)+0.35*hp*Math.exp(-u/0.012))*Math.min(1,u/0.0006);},1.2); };
  const crash=(t,v,d)=>{ truth.push({t,d:d||8}); let a=0,b=0; add(t,(u)=>{ const w=noise(); const y=w-a; a=w; return v*0.35*y*Math.exp(-u/1.4)*Math.min(1,u/0.0005);},3); };
  const ride=(t,v)=>{ truth.push({t,d:7}); let a=0; add(t,(u)=>{ const w=noise(); const y=w-a; a=w; return v*(0.10*y+0.08*Math.sin(2*Math.PI*5200*u))*Math.exp(-u/1.1)*Math.min(1,u/0.0005);},2.2); };
  for(let bar=0; bar<bars; bar++){
    const b0 = 0.5 + bar*4*beat, sect = Math.floor(bar/4)%4, j=()=> (rnd()-0.5)*0.004;
    if(bar%4===0) crash(b0+j(),0.9);
    for(let e=0;e<8;e++){ const t=b0+e*beat/2+j();
      if(sect===2) ride(t, e%2?0.6:0.8);
      else if(!(bar%4===0&&e===0)) hat(t, e%2?0.5:0.8, sect===1 && e===7);
    }
    kick(b0+j(),1); kick(b0+2.5*beat+j(),0.9); if(bar%2) kick(b0+1.5*beat+j(),0.75);
    snare(b0+beat+j(),0.9); if(bar%4!==3) snare(b0+3*beat+j(),0.95);
    if(bar%4===3){ // tom fill on last beat
      const f0=b0+3*beat; tom(f0+beat*0.0+j(),0.9,220,4); tom(f0+beat*0.25+j(),0.9,150,5); tom(f0+beat*0.5+j(),0.9,95,6); tom(f0+beat*0.75+j(),0.9,95,6);
    }
  }
  // remove snare audio for fill bars: re-render is simpler -> we instead didn't call... (kept simple: snare on beat 4 still sounds)
  // distractors: bass line (sustained, low) + chord pad (harmonic)
  const notes=[55,55,73.4,65.4];
  for(let bar=0;bar<bars;bar++){ const b0=0.5+bar*4*beat, f=notes[bar%4];
    for(let q=0;q<4;q++){ const t=b0+q*beat; add(t,(u)=>{ let s=0; for(let h=1;h<6;h++) s+=Math.sin(2*Math.PI*f*h*u)/h; return 0.35*s*Math.min(1,u/0.02)*Math.exp(-u/1.5);}, beat*0.95); }
    add(b0,(u)=>{ let s=0; [f*4,f*5,f*6,f*8].forEach(ff=>{ s+=Math.sin(2*Math.PI*ff*u)+0.3*Math.sin(2*Math.PI*ff*2*u); }); return 0.06*s*Math.min(1,u/0.05);}, 4*beat);
  }
  if(process.env.HARD){ for(let bar=0;bar<bars;bar++){ const b0=0.5+bar*4*beat, f=notes[bar%4];
      for(let e=0;e<8;e++){ const t=b0+e*beat/2+0.011; add(t,(u)=>{ let s=0; for(let h=1;h<8;h++) s+=Math.sin(2*Math.PI*f*h*u)*Math.exp(-u*h/0.35)/h; return 0.55*s*Math.min(1,u/0.002);}, beat*0.5); }
      for(const off of [0,1.5,2,3.5]){ const t=b0+off*beat+0.023; add(t,(u)=>{ let s=0; [f*4,f*5,f*6,f*8,f*10].forEach((ff,k)=>{ const uu=u-k*0.006; if(uu>0) s+=Math.sin(2*Math.PI*ff*uu)*Math.exp(-uu/0.5)+0.4*Math.sin(2*Math.PI*ff*2.01*uu)*Math.exp(-uu/0.25); }); return 0.09*s+0.04*noise()*Math.exp(-u/0.01);}, beat*1.2); } } }
  let pk=0; for(const v of x) pk=Math.max(pk,Math.abs(v)); for(let i=0;i<n;i++) x[i]*=0.9/pk;
  truth.sort((a,b)=>a.t-b.t);
  return {x, truth};
}

function loadWorker(){
  const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const src = html.match(/<script id="dsp" type="text\/plain">([\s\S]*?)<\/script>/)[1];
  const msgs=[]; const ctx={ self:{ postMessage:m=>msgs.push(m) }, Math, Float32Array, Float64Array, Int16Array, Int8Array, Int32Array, Uint32Array, Object, Array, String, isFinite, Infinity };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { analyze:(x,sr)=>{ msgs.length=0; ctx.self.onmessage({data:{samples:x, sr}}); return msgs.find(m=>m.type!=='progress'); } };
}

function evaluate(truth, hits, tol=0.03){
  // onset level (any drum): match nearest within tol
  const tt=[]; truth.map(h=>h.t).sort((a,b)=>a-b).forEach(t=>{ if(!tt.length||t-tt[tt.length-1]>0.012) tt.push(t); });
  const ht=[...new Set(hits.map(h=>Math.round(h.t*1000)))].map(v=>v/1000).sort((a,b)=>a-b);
  let used=new Set(), tp=0, errs=[];
  for(const t of tt){ let best=-1,bd=tol; ht.forEach((h,i)=>{ if(!used.has(i)&&Math.abs(h-t)<bd){bd=Math.abs(h-t);best=i;} }); if(best>=0){used.add(best);tp++;errs.push(ht[best]-t);} }
  errs.sort((a,b)=>a-b);
  const mean=errs.reduce((a,b)=>a+b,0)/errs.length, mae=errs.reduce((a,b)=>a+Math.abs(b),0)/errs.length;
  // per-drum class
  const names=['kick','snare','hhC','hhO','tomH','tomM','tomF','ride','crash','crash2'];
  const rows=[];
  for(let d=0; d<10; d++){
    const T=truth.filter(h=>h.d===d || (d===8&&h.d===9)), H=hits.filter(h=>h.d===d || (d===8&&h.d===9)); if(d===9) continue;
    let u=new Set(), ok=0; T.forEach(t=>{ const i=H.findIndex((h,i)=>!u.has(i)&&Math.abs(h.t-t.t)<tol); if(i>=0){u.add(i);ok++;} });
    if(T.length||H.length) rows.push(`${names[d].padEnd(6)} truth ${String(T.length).padStart(3)}  found ${String(H.length).padStart(3)}  recall ${(T.length?ok/T.length*100:0).toFixed(0).padStart(3)}%  precision ${(H.length?ok/H.length*100:0).toFixed(0).padStart(3)}%`);
  }
  return {onsets:tt.length, detected:ht.length, recall:tp/tt.length, precision:tp/ht.length, meanErrMs:mean*1000, maeMs:mae*1000, p95Ms:Math.abs(errs[Math.floor(errs.length*0.95)]||0)*1000, rows};
}

if(require.main===module){
  const bpm=+(process.argv[3]||112);
  const {x,truth}=makeSong(bpm,16);
  const wavIdx=process.argv.indexOf('--wav');
  if(wavIdx>0){ writeWav(process.argv[wavIdx+1], x); fs.writeFileSync(process.argv[wavIdx+1]+'.json', JSON.stringify(truth)); }
  const w=loadWorker(); const t0=Date.now(); const r=w.analyze(x.slice(),SR); const ms=Date.now()-t0;
  if(r.type==='error'){ console.log(r.message); process.exit(1); }
  const ev=evaluate(truth, r.hits);
  console.log(`bpm true ${bpm} est ${r.bpm} | analysis ${ms} ms for ${(x.length/SR).toFixed(1)} s`);
  console.log(`onsets ${ev.onsets} detected ${ev.detected} recall ${(ev.recall*100).toFixed(1)}% precision ${(ev.precision*100).toFixed(1)}%`);
  console.log(`timing error: mean ${ev.meanErrMs.toFixed(2)} ms, mean abs ${ev.maeMs.toFixed(2)} ms, p95 ${ev.p95Ms.toFixed(1)} ms`);
  ev.rows.forEach(r=>console.log('  '+r));
}
function writeWav(file, x){
  const b=Buffer.alloc(44+x.length*2); b.write('RIFF',0); b.writeUInt32LE(36+x.length*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(SR,24); b.writeUInt32LE(SR*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(x.length*2,40);
  for(let i=0;i<x.length;i++) b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x[i]*32767))),44+i*2);
  fs.writeFileSync(file,b);
}
module.exports={makeSong,loadWorker,evaluate,writeWav};
