const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync('../index.html','utf8').match(/<script id="dsp" type="text\/plain">([\s\S]*?)<\/script>/)[1];
const msgs=[]; const ctx={self:{postMessage:m=>msgs.push(m)},Math,Float32Array,Float64Array,Int16Array,Int8Array,Int32Array,Uint32Array,Object,Array,String,isFinite,Infinity};
vm.createContext(ctx); vm.runInContext(src,ctx);
const stem=new Float32Array(fs.readFileSync('real1-stem.f32').buffer.slice(0));
ctx.self.onmessage({data:{samples:stem.slice(),sr:44100,stem:true,debug:true}});
const done=msgs.find(m=>m.type==='done'); const ev=done.debug.ev, FPS=22050/128;
// reference kicks: strong low-band (<120 Hz) onsets in the clean drum track
const SR=44100, a=stem; let y=0,y2=0; const al=1-Math.exp(-2*Math.PI*110/SR), hop=110, env=[];
const lp=new Float32Array(a.length); for(let i=0;i<a.length;i++){ y+=al*(a[i]-y); y2+=al*(y-y2); lp[i]=y2; }
for(let i=0;i+hop*4<a.length;i+=hop){ let e=0; for(let k=0;k<hop*4;k++) e+=lp[i+k]*lp[i+k]; env.push(Math.log(e+1e-9)); }
const d=env.map((v,i)=>i?Math.max(0,v-env[i-1]):0); const sorted=[...d].sort((x,z)=>x-z); const thr=sorted[Math.floor(sorted.length*0.97)];
const ref=[]; d.forEach((v,i)=>{ if(v>thr && v>=Math.max(...d.slice(Math.max(0,i-8),i+9))) ref.push((i*hop+hop*2)/SR); });
const kicks=done.hits.filter(h=>h.d===0).map(h=>h.t);
console.log('reference low-band onsets',ref.length,'app kicks',kicks.length);
let noEvent=0; const rej=[];
ref.forEach(t=>{ if(kicks.some(k=>Math.abs(k-t)<0.04)) return; const e=ev.find(e=>Math.abs(e.t/FPS-t)<0.04); if(!e) noEvent++; else rej.push(e); });
console.log('missed: no event at all',noEvent,'| event found but not called a kick',rej.length);
const f=x=>x.toFixed(2);
rej.slice(0,14).forEach(e=>console.log(' t',f(e.t/FPS),'r',e.r.map(f).join(' '),'dec',e.dec.map(f).join(' '),'pm',f(e.pm),'pitch',Math.round(e.pitch)));
const ok=ev.filter(e=>kicks.some(k=>Math.abs(k-e.t/FPS)<0.04)).slice(0,5);
console.log('accepted kicks look like:'); ok.forEach(e=>console.log(' t',f(e.t/FPS),'r',e.r.map(f).join(' '),'dec',e.dec.map(f).join(' '),'pm',f(e.pm)));
