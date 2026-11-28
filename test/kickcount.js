// counts kicks the app finds in the four-on-the-floor stretch of the real song (one kick per beat expected)
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script id="dsp" type="text\/plain">([\s\S]*?)<\/script>/)[1];
const msgs=[]; const ctx={self:{postMessage:m=>msgs.push(m)},Math,Float32Array,Float64Array,Int16Array,Int8Array,Int32Array,Uint32Array,Object,Array,String,isFinite,Infinity};
vm.createContext(ctx); vm.runInContext(src,ctx);
const stem=new Float32Array(fs.readFileSync(__dirname+'/real1-stem.f32').buffer.slice(0));
ctx.self.onmessage({data:{samples:stem.slice(),sr:44100,stem:true}});
const r=msgs.find(m=>m.type==='done'); const k=r.hits.filter(h=>h.d===0&&h.t>=21&&h.t<=33).map(h=>h.t);
const beat=60/r.bpm; const expected=Math.round(12/beat);
// a kick is "on the beat" if it is within 40 ms of the beat grid anchored at the strongest phase
let best=0,ph=0; for(let p=0;p<beat;p+=0.005){ const n=k.filter(t=>{const d=((t-p)%beat+beat)%beat; return Math.min(d,beat-d)<0.04;}).length; if(n>best){best=n;ph=p;} }
console.log('real song 21-33 s: expected ~'+expected+' kicks, app kicks',k.length,'on the beat',best,'off the beat',k.length-best);
