// real song, 21-33 s: the clap/snare falls on every other beat. How are hits on those beats labelled?
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script id="dsp" type="text\/plain">([\s\S]*?)<\/script>/)[1];
const msgs=[]; const ctx={self:{postMessage:m=>msgs.push(m)},Math,Float32Array,Float64Array,Int16Array,Int8Array,Int32Array,Uint32Array,Object,Array,String,isFinite,Infinity};
vm.createContext(ctx); vm.runInContext(src,ctx);
const stem=new Float32Array(fs.readFileSync(__dirname+'/real1-stem.f32').buffer.slice(0));
ctx.self.onmessage({data:{samples:stem.slice(),sr:44100,stem:true}});
const r=msgs.find(m=>m.type==='done'); const beat=60/r.bpm;
const k=r.hits.filter(h=>h.d===0&&h.t>=21&&h.t<=33).map(h=>h.t);
let best=0,ph=0; for(let p=0;p<beat;p+=0.005){ const n=k.filter(t=>{const d=((t-p)%beat+beat)%beat; return Math.min(d,beat-d)<0.04;}).length; if(n>best){best=n;ph=p;} }
const names=['K','S','hc','ho','T1','T2','FT','R','C','C2'];
const res={0:{},1:{}};
for(let b=Math.ceil((21-ph)/beat); ph+b*beat<=33; b++){ const t=ph+b*beat; const here=r.hits.filter(h=>Math.abs(h.t-t)<0.04&&h.d!==0).map(h=>names[h.d]); const lab=here.length?[...new Set(here)].sort().join('+'):'(none)'; const par=b%2; res[par][lab]=(res[par][lab]||0)+1; }
console.log('beats of one parity:',JSON.stringify(res[0]),'\nbeats of the other  :',JSON.stringify(res[1]));
