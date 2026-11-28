const {chromium}=require('playwright');
(async()=>{ const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 for(const [w,h,n] of [[667,375,'se'],[844,390,'i14']]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{localStorage.setItem('introSeen','1');}catch(e){} });
  await p.goto('http://localhost:8766/index.html'); await p.setInputFiles('#file','hard112.wav');
  await p.waitForFunction(()=>__drum.hits.length>0&&document.getElementById('overlay').hidden,{timeout:300000});
  await p.click('#playBtn'); await p.waitForTimeout(1700); await p.screenshot({path:`land-${n}.png`});
  const kit=await p.$eval('#kit',e=>{const r=e.getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height);});
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight+1);
  await p.click('#playBtn'); await p.click('#editBtn'); await p.waitForTimeout(200); await p.screenshot({path:`land-edit-${n}.png`});
  console.log(n,'kit box',kit,'| page scrolls',overflow,'| errors',errs.length?errs:'none'); await p.close(); }
 await b.close(); })();
