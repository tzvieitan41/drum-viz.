const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 const p=await b.newPage({viewport:{width:375,height:667},deviceScaleFactor:2}); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.addInitScript(()=>{ try{localStorage.setItem('introSeen','1');}catch(e){} }); await p.goto('http://localhost:8766/index.html'); await p.setInputFiles('#file','hard112.wav');
 await p.waitForTimeout(1500); await p.screenshot({path:'shot-separating.png'});
 await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:600000});
 await p.click('#playBtn'); await p.waitForTimeout(1500);
 const out=[];
 for(const m of ['drums','rest','mix']){ await p.click(`#listen button[data-mode="${m}"]`); await p.waitForTimeout(1200);
   out.push(m+': '+await p.evaluate(()=>{const s=__drum; return (s.src&&s.src.buffer===s.stem?'stem':s.src&&s.src.buffer===s.rest?'rest':s.src&&s.src.buffer===s.buffer?'mix':'?')+' playing='+s.playing+' pos='+s.offset.toFixed(2);})); }
 await p.screenshot({path:'shot-playing.png'});
 // reload same song: stem should come from cache (fast)
 const t0=Date.now(); await p.reload(); await p.setInputFiles('#file','hard112.wav');
 await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:600000});
 console.log(out.join(' | '),'| second load',((Date.now()-t0)/1000).toFixed(1)+'s','| errors',errs.length?errs:'none'); await b.close();})();
