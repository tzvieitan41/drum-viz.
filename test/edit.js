const {chromium}=require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 const ctx=await b.newContext({viewport:{width:375,height:667},deviceScaleFactor:2,acceptDownloads:true}); const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto('http://localhost:8766/index.html'); await p.waitForTimeout(300);
 const introShown=await p.$eval('#intro',e=>!e.hidden); await p.screenshot({path:'shot-intro.png'});
 await p.click('#introOk');
 await p.setInputFiles('#file','hard112.wav'); await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:300000});
 const withX=await p.evaluate(()=>__drum.hits.filter(h=>h.x).length+'/'+__drum.hits.length);
 // go to 5 s, open the editor
 await p.evaluate(()=>{ __drum.offset=5; }); await p.click('#editBtn'); await p.waitForTimeout(200);
 const before=await p.evaluate(()=>{ const t=ED.sel.t; return {t, ds:groupAt(t).map(h=>h.d)}; });
 // mark it as a ride, unmark whatever was first
 await p.click('#drumGrid button[data-d="7"]'); await p.waitForTimeout(100);
 const after=await p.evaluate(t=>groupAt(t).map(h=>h.d),before.t);
 await p.screenshot({path:'shot-edit.png'});
 // add a missing hit
 await p.click('#edNext'); await p.click('#edAdd'); await p.click('#drumGrid button[data-d="5"]');
 const nCorr=await p.$eval('#edCount',e=>e.textContent);
 const [dl]=await Promise.all([p.waitForEvent('download'), p.click('#edShare')]); const fpath=await dl.path(); const data=JSON.parse(fs.readFileSync(fpath,'utf8'));
 // reload same song: corrections re-applied
 await p.reload(); await p.setInputFiles('#file','hard112.wav'); await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:300000});
 const reapplied=await p.evaluate(t=>groupAt(t).map(h=>h.d),before.t); const introAgain=await p.$eval('#intro',e=>!e.hidden);
 console.log('intro first visit',introShown,'| intro after reload',introAgain,'| hits with fingerprint',withX);
 console.log('hit at',before.t.toFixed(3),'was',JSON.stringify(before.ds),'after toggling ride',JSON.stringify(after),'| after reload',JSON.stringify(reapplied));
 console.log('corrections',nCorr,'| exported file:',data.corrections.length,'corrections, fingerprint length',data.corrections[0].x&&data.corrections[0].x.length,', second (added) x',data.corrections[1].x,', size',fs.statSync(fpath).size,'bytes');
 console.log('errors',errs.length?errs:'none'); await b.close(); })();
