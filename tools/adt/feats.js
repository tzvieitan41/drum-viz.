// Runs the app's own detector on every generated track and writes one row per detected event:
// 46 features + 9 labels (which drums were really hit within 30 ms) + the event time.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=process.argv[2], outFile=process.argv[3];
const src=fs.readFileSync('/home/claude/drum-viz._/index.html','utf8').match(/<script id="dsp" type="text\/plain">([\s\S]*?)<\/script>/)[1];
const msgs=[]; const ctx={self:{postMessage:m=>msgs.push(m)},Math,Float32Array,Float64Array,Int16Array,Int8Array,Int32Array,Uint32Array,Object,Array,String,isFinite,Infinity};
vm.createContext(ctx); vm.runInContext(src,ctx);
const FPS=22050/128; const rows=[]; let nf=0, matched=0, truthN=0;
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.f32')).sort()){
  const x=new Float32Array(fs.readFileSync(path.join(dir,f)).buffer.slice(0)); const lab=JSON.parse(fs.readFileSync(path.join(dir,f.replace('.f32','.json')))).labels;
  msgs.length=0; ctx.self.onmessage({data:{samples:x,sr:22050,stem:true,debug:true}});
  const done=msgs.find(m=>m.type==='done'); if(!done||!done.debug){ console.error('fail',f, msgs.find(m=>m.type==='error')); continue; }
  const ev=done.debug.ev; truthN+=lab.length;
  ev.forEach(e=>{ const t=e.t/FPS; const y=new Array(9).fill(0); let any=0;
    lab.forEach(([lt,c,v])=>{ if(Math.abs(lt-t)<0.03 && v>0.08){ y[c]=1; any=1; } });
    matched+=any; rows.push([f, t.toFixed(4), ...e.x.map(v=>+v.toFixed(5)), ...y].join(',')); });
  nf++;
}
fs.writeFileSync(outFile, rows.join('\n')); console.log('files',nf,'events',rows.length,'events matching a real hit',matched,'truth hits',truthN);
