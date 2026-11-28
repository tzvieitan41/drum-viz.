// End-to-end: run the app's detector (drum-track mode) on generated tracks, with and without the network.
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=process.argv[2]||'data/test';
const src=fs.readFileSync('/home/claude/drum-viz._/index.html','utf8').match(/<script id="dsp" type="text\/plain">([\s\S]*?)<\/script>/)[1];
const msgs=[]; const ctx={self:{postMessage:m=>msgs.push(m)},Math,Float32Array,Float64Array,Int16Array,Int8Array,Int32Array,Uint32Array,Object,Array,String,isFinite,Infinity,JSON};
vm.createContext(ctx); vm.runInContext(src,ctx);
const NAMES=['kick','snare','hhC','hhO','tomH','tomM','tomL','ride','crash'];
const groupOf=d=> d===9?8:d;  // crash 2 counts as crash
for(const noModel of [true,false]){
  const tp=new Array(9).fill(0), fn=new Array(9).fill(0), fp=new Array(9).fill(0); let tomTP=0,tomT=0,tomP=0;
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.f32')).sort()){
    const x=new Float32Array(fs.readFileSync(path.join(dir,f)).buffer.slice(0)); const lab=JSON.parse(fs.readFileSync(path.join(dir,f.replace('.f32','.json')))).labels.filter(l=>l[2]>0.08);
    msgs.length=0; ctx.self.onmessage({data:{samples:x,sr:22050,stem:true,noModel}}); const hits=msgs.find(m=>m.type==='done').hits;
    for(let c=0;c<9;c++){
      const T=lab.filter(l=>l[1]===c).map(l=>l[0]), H=hits.filter(h=>groupOf(h.d)===c).map(h=>h.t), used=new Set();
      T.forEach(t=>{ const i=H.findIndex((h,i)=>!used.has(i)&&Math.abs(h-t)<0.03); if(i>=0){used.add(i);tp[c]++;} else fn[c]++; });
      fp[c]+=H.length-used.size;
    }
    const TT=lab.filter(l=>l[1]>=4&&l[1]<=6).map(l=>l[0]), HT=hits.filter(h=>h.d>=4&&h.d<=6).map(h=>h.t), u2=new Set();
    TT.forEach(t=>{ const i=HT.findIndex((h,i)=>!u2.has(i)&&Math.abs(h-t)<0.03); if(i>=0){u2.add(i);tomTP++;} }); tomT+=TT.length; tomP+=HT.length;
  }
  const f1=c=>2*tp[c]/Math.max(1,2*tp[c]+fp[c]+fn[c]);
  const macro=NAMES.reduce((a,_,c)=>a+f1(c),0)/9, totF=2*tp.reduce((a,b)=>a+b,0)/(2*tp.reduce((a,b)=>a+b,0)+fp.reduce((a,b)=>a+b,0)+fn.reduce((a,b)=>a+b,0));
  console.log((noModel?'hand rules':'network  ').padEnd(11),'overall F1',(totF*100).toFixed(1)+'%','| per drum found/correct:',NAMES.map((n,c)=>n+' '+Math.round(tp[c]/Math.max(1,tp[c]+fn[c])*100)+'/'+Math.round(tp[c]/Math.max(1,tp[c]+fp[c])*100)).join('  '),'| any tom',Math.round(tomTP/Math.max(1,tomT)*100)+'/'+Math.round(tomTP/Math.max(1,tomP)*100));
}
