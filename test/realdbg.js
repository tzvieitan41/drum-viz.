// Run the app on a real song and dump per-event features of the drum-track pass
const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage(); await p.goto('http://localhost:8766/index.html');
 await p.exposeFunction('__dump',(x)=>fs.writeFileSync('real1-debug.json',x));
 await p.addInitScript(()=>{ const W=window.Worker; window.Worker=function(u,o){ const w=new W(u,o); const pm=w.postMessage.bind(w); w.postMessage=function(m,t){ if(m&&m.samples) m.debug=true; return pm(m,t); }; w.addEventListener('message',e=>{ if(e.data&&e.data.type==='done'&&e.data.debug) window.__dbg=(window.__dbg||[]).concat([{stem:false,ev:e.data.debug.ev}]); }); return w; }; });
 await p.setInputFiles('#file','real1.wav'); await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:600000});
 const r=await p.evaluate(()=>({hits:__drum.hits,bpm:__drum.bpm,sep:__drum.sepOk,dbg:window.__dbg}));
 fs.writeFileSync('real1-out.json',JSON.stringify(r));
 const c={}; r.hits.forEach(h=>c[h.d]=(c[h.d]||0)+1); console.log('bpm',r.bpm,'sep',r.sep,'hits',r.hits.length,'by drum',JSON.stringify(c),'passes',r.dbg&&r.dbg.length);
 await b.close(); })();
