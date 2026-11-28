'use strict';
var $ = function(id){ return document.getElementById(id); };
var NS = 'http://www.w3.org/2000/svg';
var NAMES = ['תוף בס','סנר','היי-האט סגור','היי-האט פתוח','טום גבוה','טום אמצעי','טום רצפה','רייד','קראש','קראש 2'];
var EL_OF = ['kick','snare','hh','hh','t1','t2','ft','ride','c1','c2'];
// Everything below is in the photo's own pixel coordinates (512 x 286).
var GEOM = {
  c1:{cx:150,cy:44,rx:47,ry:38,cym:1},   hh:{cx:117,cy:127,rx:39,ry:31,cym:1},
  t1:{cx:221,cy:78,rx:29,ry:26},         t2:{cx:285,cy:78,rx:26,ry:27},
  ride:{cx:355,cy:73,rx:50,ry:49,cym:1}, c2:{cx:431,cy:77,rx:47,ry:38,cym:1},
  snare:{cx:197,cy:164,rx:38,ry:35},     kick:{cx:270,cy:157,rx:35,ry:28},
  ft:{cx:350,cy:165,rx:42,ry:35}
};
var ORDER = ['kick','ft','snare','t1','t2','hh','c1','ride','c2'];     // paint order (cymbals on top)
var HITPT = {1:[207,161],2:[138,133],3:[138,133],4:[225,84],5:[282,84],6:[341,170],7:[340,95],8:[160,63],9:[417,97]};
var X_OF  = {1:197,2:117,3:117,4:221,5:285,6:350,7:355,8:150,9:431};
var PREF  = {1:'L',2:'R',3:'R',4:'L',5:'R',6:'R',7:'R',8:'R',9:'R'};
var PRIO  = {1:0,8:1,9:1,4:2,5:2,6:2,7:3,2:4,3:4};
var HANDS = { L:{sh:[214,296], rest:[204,180]}, R:{sh:[304,296], rest:[142,142]} };
var STICK = 84;
var KPEDAL = {x:258, y:214}, HPEDAL = {x:155, y:233, rot:-40};

// ---------------- SVG kit built on the photo ----------------
function buildKit(){
  var svg=$('kit'), h=[];
  h.push('<defs>'+
    '<image id="photo" href="kit.jpg" x="0" y="0" width="512" height="286" preserveAspectRatio="none"/>'+
    '<radialGradient id="gFlash"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'+
    '<radialGradient id="gFlashC"><stop offset="0" stop-color="#fff6d8" stop-opacity="1"/><stop offset=".5" stop-color="#ffe7a3" stop-opacity=".55"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>'+
    '<radialGradient id="gSkin" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e7bb98"/><stop offset=".7" stop-color="#c48d68"/><stop offset="1" stop-color="#94603f"/></radialGradient>'+
    '<radialGradient id="gSleeve" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#2a2f39"/><stop offset="1" stop-color="#0c0e12"/></radialGradient>'+
    '<linearGradient id="gShoe" x1="0" x2="1"><stop offset="0" stop-color="#0b0c0f"/><stop offset=".5" stop-color="#2a2e37"/><stop offset="1" stop-color="#0b0c0f"/></linearGradient>');
  ORDER.forEach(function(id){ var g=GEOM[id];
    h.push('<clipPath id="clip-'+id+'" clipPathUnits="userSpaceOnUse"><ellipse cx="'+g.cx+'" cy="'+g.cy+'" rx="'+(g.rx+1.5)+'" ry="'+(g.ry+1.5)+'"/></clipPath>'); });
  h.push('</defs>');
  h.push('<use href="#photo"/>');
  ORDER.forEach(function(id){ var g=GEOM[id];
    h.push('<g id="p-'+id+'">'+
      (id==='hh' ? '<ellipse id="hhGap" cx="'+(g.cx+1)+'" cy="'+(g.cy+2)+'" rx="'+g.rx+'" ry="'+g.ry+'" fill="#000" opacity="0"/>' : '')+
      '<use href="#photo" class="cp" clip-path="url(#clip-'+id+')"/>'+
      '<ellipse class="fl" cx="'+g.cx+'" cy="'+g.cy+'" rx="'+g.rx+'" ry="'+g.ry+'" fill="url(#'+(g.cym?'gFlashC':'gFlash')+')" opacity="0" style="mix-blend-mode:screen"/>'+
      '<ellipse class="ring" cx="'+g.cx+'" cy="'+g.cy+'" rx="'+g.rx+'" ry="'+g.ry+'" fill="none" stroke="'+(g.cym?'#ffe9a8':'#ffffff')+'" opacity="0"/>'+
    '</g>'); });
  h.push(shoeSVG('footR')+shoeSVG('footL'));
  h.push(handSVG('L')+handSVG('R'));
  svg.innerHTML=h.join('');
  ORDER.forEach(function(id){ var g=GEOM[id], n=$('p-'+id); g.cp=n.querySelector('.cp'); g.fl=n.querySelector('.fl'); g.ring=n.querySelector('.ring'); });
}
function shoeSVG(id){
  return '<g id="'+id+'"><g class="shoe">'+
    '<ellipse cx="2" cy="3" rx="9" ry="19" fill="rgba(0,0,0,.45)"/>'+
    '<path d="M-7 -13 C-7 -21 7 -21 7 -13 L8 10 C8 19 -8 19 -8 10 Z" fill="url(#gShoe)" stroke="#3c414c" stroke-width=".9"/>'+
    '<path d="M-3.5 -9 h7 M-3.5 -5 h7 M-3.5 -1 h7" stroke="#6b7180" stroke-width=".8" stroke-linecap="round"/>'+
    '<path d="M-6 8 C-6 15 6 15 6 8" fill="none" stroke="#4a505c" stroke-width=".8"/></g></g>';
}
function handSVG(k){
  return '<g id="hand'+k+'">'+
    '<line class="shadow" stroke="#000" stroke-width="4" stroke-linecap="round" opacity=".4"/>'+
    '<path class="arm" fill="url(#gSleeve)" stroke="#05060a" stroke-width=".8"/>'+
    '<path class="armHi" fill="none" stroke="#3a404c" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'+
    '<line class="stick" stroke="#cfa66a" stroke-width="3.6" stroke-linecap="round"/>'+
    '<line class="stickHi" stroke="#f2d9a6" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>'+
    '<ellipse class="tip" rx="2.4" ry="2.1" fill="#f3e3c2"/>'+
    '<g class="handG"><ellipse cx="-3" rx="10" ry="8" fill="url(#gSkin)" stroke="#7d4f33" stroke-width=".7"/>'+
    '<path d="M-1 -6.5 q4 -1 6 1.5" fill="none" stroke="#8a5a3c" stroke-width=".7"/>'+
    '<ellipse cx="5" cy="-5" rx="3.6" ry="2.4" fill="#cf9a75" stroke="#7d4f33" stroke-width=".5"/></g></g>';
}

// ---------------- state ----------------
var S = {
  ctx:null, buffer:null, src:null, playing:false, startCtx:0, offset:0, duration:0,
  mode:'none', hits:[], bpm:0, syncMs:0, worker:null, mediaNode:null, analyser:null,
  byEl:{}, hands:{L:[],R:[]}, kicks:[], hats:[], ptr:{}, lastHitIdx:-1, seeking:false, fileToken:0,
  clkOff:null, frameMs:16.7, lastTs:0
};
window.__drum = S;

function ensureCtx(){
  if(!S.ctx){
    var AC = window.AudioContext || window.webkitAudioContext;
    try{ S.ctx = new AC({latencyHint:'interactive'}); }catch(e){ S.ctx = new AC(); }
    try{ if(navigator.audioSession) navigator.audioSession.type='playback'; }catch(e){}
  }
  return S.ctx;
}
function setMsg(t){ $('msg').textContent = t||''; }
function overlay(show, text, p){
  $('overlay').hidden=!show; if(text) $('ovText').textContent=text;
  $('ovBar').firstChild.style.width = Math.round((p||0)*100)+'%';
}
function fmt(s){ if(!isFinite(s)||s<0) s=0; var m=Math.floor(s/60), x=Math.floor(s%60); return m+':'+(x<10?'0':'')+x; }

// ---------------- file loading ----------------
$('file').addEventListener('change', function(e){
  var f = e.target.files && e.target.files[0]; if(f) loadFile(f); e.target.value='';
});
function decode(ab){
  return new Promise(function(res,rej){
    try{ var p = S.ctx.decodeAudioData(ab, res, rej); if(p && p.then) p.then(res,rej); }catch(err){ rej(err); }
  });
}
function loadFile(file){
  var token = ++S.fileToken;
  stopAll(); clearTimeline(); setMsg(''); setListen('mix', true);
  S.stem=null; S.rest=null; S.mix44=null; S.sepOk=false; $('listen').hidden=true;
  ensureCtx();
  $('fname').textContent = file.name;
  overlay(true,'טוען את הקובץ…',0.02);
  file.arrayBuffer().then(function(ab){
    if(token!==S.fileToken) return;
    overlay(true,'מפענח שמע…',0.04);
    return decode(ab).then(function(buf){ return buf; }, function(){ return null; });
  }).then(function(buf){
    if(token!==S.fileToken) return;
    if(!buf || buf.duration<0.5){ startLive(file); return; }
    S.mode='buffer'; S.buffer=buf; S.duration=buf.duration; S.offset=0;
    // 1) separate the drums from the rest of the song (AI model, runs on the phone)
    return separateDrums(buf, token).then(function(stem){
      if(token!==S.fileToken) return;
      var src = stem || buf;
      if(stem){ S.stem=stem; S.sepOk=true; $('listen').hidden=false; }
      else setMsg('הפרדת התופים לא הצליחה במכשיר הזה, אז הזיהוי נעשה על השיר המלא (פחות מדויק).');
      // 2) find every hit in the drum track
      overlay(true,'מנתח את השיר…',0.05);
      if(!stem) return toMono(buf).then(function(m){ return runWorker(m.data, m.sr, token, false); });
      // two passes: the drum track (kick, snare, hi-hat stay clean of bass and guitar)
      // and the full song (toms and cymbals, which the separation model partly removes)
      return toMono(stem).then(function(m){ return runWorker(m.data, m.sr, token, true, 0, 0.5); }).then(function(rs){
        if(token!==S.fileToken) return null;
        return toMono(buf).then(function(m){ return runWorker(m.data, m.sr, token, false, 0.5, 0.5); }).then(function(rm){
          return rm && {hits:mergeHits(rs.hits, rm.hits), bpm:rs.bpm||rm.bpm};
        });
      });
    }).then(function(res){
      if(!res || token!==S.fileToken) return;
      S.hits=res.hits; S.bpm=res.bpm; buildTimeline(); overlay(false); enableControls(true); updateInfo();
    });
  }).catch(function(err){
    if(token!==S.fileToken) return;
    overlay(false); setMsg('לא הצלחתי לפתוח את הקובץ: '+(err && err.message || err));
  });
}

// ---------------- drum separation (Open-Unmix UMX-HQ drums, MIT, via onnxruntime-web) ----------------
var SEP_SR=44100;
function to44k(buf){
  // stereo at 44.1 kHz, the rate the separation model was trained on
  if(buf.sampleRate===SEP_SR){
    var l=new Float32Array(buf.getChannelData(0)), r=buf.numberOfChannels>1?new Float32Array(buf.getChannelData(1)):l.slice();
    return Promise.resolve({left:l,right:r});
  }
  var OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  var oac=new OAC(2, Math.ceil(buf.duration*SEP_SR), SEP_SR), s=oac.createBufferSource();
  s.buffer=buf; s.connect(oac.destination); s.start(0);
  return new Promise(function(res,rej){
    var done=function(rb){ res({left:new Float32Array(rb.getChannelData(0)), right:new Float32Array(rb.getChannelData(1))}); };
    oac.oncomplete=function(e){ done(e.renderedBuffer); };
    try{ var p=oac.startRendering(); if(p&&p.then) p.then(done,rej); }catch(e){ rej(e); }
  });
}
function songKey(buf){
  var d=buf.getChannelData(0), h=2166136261, step=Math.max(1,Math.floor(d.length/4096));
  for(var i=0;i<d.length;i+=step){ h^=Math.round(d[i]*32767)&0xffff; h=Math.imul(h,16777619); }
  return 'umxhq-v1-'+buf.sampleRate+'-'+buf.length+'-'+(h>>>0);
}
function stemDB(){
  return new Promise(function(res){
    try{ var rq=indexedDB.open('drum-stems',1);
      rq.onupgradeneeded=function(){ rq.result.createObjectStore('stems'); };
      rq.onsuccess=function(){ res(rq.result); }; rq.onerror=function(){ res(null); };
    }catch(e){ res(null); }
  });
}
function stemGet(db,key){ return new Promise(function(res){ if(!db) return res(null);
  try{ var q=db.transaction('stems','readonly').objectStore('stems').get(key); q.onsuccess=function(){ res(q.result||null); }; q.onerror=function(){ res(null); }; }catch(e){ res(null); } }); }
function stemPut(db,key,val){ if(!db) return; try{ db.transaction('stems','readwrite').objectStore('stems').put(val,key); }catch(e){} }
function makeBuffer(left,right,sr){
  var b=S.ctx.createBuffer(2,left.length,sr); b.getChannelData(0).set(left); b.getChannelData(1).set(right); return b;
}
function separateDrums(buf, token){
  if(!window.Worker || !window.WebAssembly) return Promise.resolve(null);
  var key=songKey(buf), dbP=stemDB();
  overlay(true,'מפריד את התופים מהשיר…',0.05);
  return dbP.then(function(db){ return stemGet(db,key).then(function(c){ return {db:db,cached:c}; }); }).then(function(o){
    if(o.cached) return makeBuffer(o.cached.left,o.cached.right,o.cached.sampleRate||SEP_SR);
    return to44k(buf).then(function(mix){
      if(token!==S.fileToken) return null;
      return new Promise(function(res){
        var w; try{ w=new Worker('separator-worker.js'); }catch(e){ return res(null); }
        S.sepWorker=w;
        w.onmessage=function(e){ var m=e.data;
          if(token!==S.fileToken){ w.terminate(); return res(null); }
          if(m.type==='progress') overlay(true, m.progress<0.18?'טוען את מודל ה-AI (פעם ראשונה בלבד)…':'מפריד את התופים מהשיר…', 0.05+0.75*m.progress);
          else if(m.type==='done'){ w.terminate(); S.sepWorker=null; stemPut(o.db,key,{left:m.left,right:m.right,sampleRate:m.sampleRate}); res(makeBuffer(m.left,m.right,m.sampleRate)); }
          else if(m.type==='error'){ w.terminate(); S.sepWorker=null; console.warn('separation failed',m.message); res(null); }
        };
        w.onerror=function(e){ try{w.terminate();}catch(_){} console.warn('separator worker error',e.message); res(null); };
        w.postMessage({id:token,left:mix.left,right:mix.right},[mix.left.buffer,mix.right.buffer]);
      });
    });
  }).catch(function(e){ console.warn('separation unavailable',e); return null; });
}
// kick / snare / hi-hat from the drum track; toms and cymbals from the full song.
// Where the full song hears a tom, a snare or kick the drum track placed at that moment is the same tom.
function mergeHits(stemHits, mixHits){
  var near=function(arr,t,ds){ return arr.some(function(h){ return ds.indexOf(h.d)>=0 && Math.abs(h.t-t)<0.03; }); };
  var toms=mixHits.filter(function(h){ return h.d>=4 && h.d<=6; });
  var out=stemHits.filter(function(h){
    if(h.d>=4) return false;
    if((h.d===1||h.d===0) && near(toms,h.t,[4,5,6]) && !near(mixHits,h.t,[h.d])) return false;
    return true;
  });
  var cyms=mixHits.filter(function(h){ return h.d>=7 && stemHits.some(function(x){ return Math.abs(x.t-h.t)<0.03; }); });
  // the same cymbal heard as a hi-hat in the drum track: keep the full song's reading
  out=out.filter(function(h){ return !((h.d===2||h.d===3) && cyms.some(function(c){ return Math.abs(c.t-h.t)<0.03; })); });
  toms.forEach(function(h){ out.push(h); }); cyms.forEach(function(h){ out.push(h); });
  out.sort(function(a,b){ return a.t-b.t || a.d-b.d; });
  return out;
}
// "no drums" track = song minus the separated drums, built only when first asked for
function restBuffer(){
  if(S.rest) return Promise.resolve(S.rest);
  return to44k(S.buffer).then(function(mix){
    var st=S.stem, n=Math.min(st.length,mix.left.length), L=new Float32Array(n), R=new Float32Array(n), a=st.getChannelData(0), b=st.getChannelData(1);
    for(var i=0;i<n;i++){ L[i]=mix.left[i]-a[i]; R[i]=mix.right[i]-b[i]; }
    S.rest=makeBuffer(L,R,SEP_SR); return S.rest;
  });
}
var LISTEN='mix';
function setListen(mode, silent){
  LISTEN=mode;
  Array.prototype.forEach.call(document.querySelectorAll('#listen button'), function(b){ b.setAttribute('aria-pressed', b.dataset.mode===mode?'true':'false'); });
  if(silent) return;
  var go=function(){ if(S.playing){ var pos=heardPos(performance.now()); killSrc(); S.playing=false; S.offset=pos; play(); } };
  if(mode==='rest' && !S.rest){ restBuffer().then(go); } else go();
}
function playBuffer(){ if(LISTEN==='drums' && S.stem) return S.stem; if(LISTEN==='rest' && S.rest) return S.rest; return S.buffer; }
Array.prototype.forEach.call(document.querySelectorAll('#listen button'), function(b){ b.addEventListener('click', function(){ setListen(b.dataset.mode); }); });

function toMono(buf){
  // plain channel average at the file's own rate; the worker resamples with its own filter so results
  // don't depend on each browser's built-in resampler (some roll off the hi-hat band)
  var n=buf.length, ch=buf.numberOfChannels, m=new Float32Array(n);
  if(ch===1) m.set(buf.getChannelData(0));
  else for(var c=0;c<ch;c++){ var d=buf.getChannelData(c); for(var i=0;i<n;i++) m[i]+=d[i]/ch; }
  return Promise.resolve({data:m, sr:buf.sampleRate});
}
function runWorker(samples, sr, token, isStem, p0, pw){
  p0=p0||0; pw=pw||1;
  return new Promise(function(res,rej){
    if(S.worker){ S.worker.terminate(); }
    var url = URL.createObjectURL(new Blob([$('dsp').textContent],{type:'text/javascript'}));
    var w = new Worker(url); S.worker=w;
    w.onmessage=function(e){
      var m=e.data; if(token!==S.fileToken){ w.terminate(); return; }
      if(m.type==='progress') overlay(true,'מנתח את השיר…',0.05+0.95*(p0+pw*m.p));
      else if(m.type==='done'){ w.terminate(); S.worker=null; URL.revokeObjectURL(url); res(m); }
      else if(m.type==='error'){ w.terminate(); S.worker=null; rej(new Error(m.message)); }
    };
    w.onerror=function(e){ rej(new Error(e.message||'worker error')); };
    w.postMessage({samples:samples, sr:sr, stem:!!isStem}, [samples.buffer]);
  });
}

// ---------------- timeline (hands, feet, drums) ----------------
function clearTimeline(){
  S.hits=[]; S.bpm=0; S.byEl={}; Object.keys(GEOM).forEach(function(k){ S.byEl[k]=[]; });
  S.hands={L:[],R:[]}; S.kicks=[]; S.hats=[]; resetPointers(); S.lastHitIdx=-1; showName(-1);
  updateInfo();
}
function buildTimeline(){
  var hits=S.hits; Object.keys(GEOM).forEach(function(k){ S.byEl[k]=[]; });
  S.kicks=[]; S.hats=[];
  hits.forEach(function(h){ S.byEl[EL_OF[h.d]].push(h); if(h.d===0) S.kicks.push(h); if(h.d===2||h.d===3) S.hats.push(h); });
  S.hands=assignHands(hits); resetPointers();
}
function assignHands(hits){
  var L=[],R=[], last={L:-9,R:-9}, tomHand=null, tomT=-9, i=0;
  function push(hand,h){ (hand==='L'?L:R).push({t:h.t,d:h.d}); last[hand]=h.t; if(h.d>=4&&h.d<=6){tomHand=hand;tomT=h.t;} }
  while(i<hits.length){
    var j=i, g=[], t=hits[i].t;
    while(j<hits.length && hits[j].t-t<0.03){ if(hits[j].d!==0) g.push(hits[j]); j++; }
    g.sort(function(a,b){return PRIO[a.d]-PRIO[b.d];});
    if(g.length===1){
      var h=g[0], hand=PREF[h.d];
      if(h.d>=4&&h.d<=6 && t-tomT<0.35 && tomHand) hand = tomHand==='L'?'R':'L';
      else { var other=hand==='L'?'R':'L'; if(t-last[hand]<0.085 && t-last[other]>t-last[hand]) hand=other; }
      push(hand,h);
    } else if(g.length>=2){
      var a=g[0], b=g[1], ha=PREF[a.d], hb=PREF[b.d];
      if(ha===hb){ if(X_OF[a.d]<=X_OF[b.d]){ha='L';hb='R';} else {ha='R';hb='L';} }
      if(b.d===2||b.d===3){ hb='R'; ha='L'; }
      push(ha,a); push(hb,b);
    }
    i=j;
  }
  return {L:L,R:R};
}
function resetPointers(){ S.ptr={}; }
// first index with t > v (binary search when jumping backwards, linear when moving forward)
function adv(key, arr, v){
  var p=S.ptr[key];
  if(p===undefined || p>arr.length || (p>0 && arr[p-1].t>v)){ var l=0,h=arr.length; while(l<h){ var m=(l+h)>>1; if(arr[m].t<=v) l=m+1; else h=m; } p=l; }
  else while(p<arr.length && arr[p].t<=v) p++;
  S.ptr[key]=p; return p;
}

// ---------------- audio clock ----------------
// Maps performance.now() to "the AudioContext time the listener is hearing right now".
// Raw readings jitter by a render quantum or more, so the offset is smoothed.
function updateClock(){
  var c=S.ctx; if(!c || c.state!=='running') return;
  var now=performance.now(), heard=c.currentTime-(c.outputLatency||0)-(c.baseLatency||0);
  if(c.getOutputTimestamp){
    try{ var ts=c.getOutputTimestamp();
      if(ts && ts.contextTime>0 && ts.performanceTime>0){
        var h2=ts.contextTime+(now-ts.performanceTime)/1000;
        if(Math.abs(h2-heard)<0.5) heard=h2;
      } }catch(e){}
  }
  var off=heard-now/1000;
  if(S.clkOff===null || Math.abs(off-S.clkOff)>0.08) S.clkOff=off; else S.clkOff+=0.04*(off-S.clkOff);
}
function heardCtxAt(perfMs){ return S.clkOff===null ? S.ctx.currentTime : perfMs/1000+S.clkOff; }
// song position the listener hears at a given performance time
function heardPos(perfMs){
  if(S.mode==='live') return S.media ? S.media.currentTime : 0;
  if(!S.playing) return S.offset;
  var p=heardCtxAt(perfMs)-S.startCtx+S.offset;
  return Math.min(S.duration, Math.max(S.offset>0 && p<S.offset ? S.offset : 0, p));
}

// ---------------- playback ----------------
function enableControls(on){ ['playBtn','stopBtn','seek'].forEach(function(id){ $(id).disabled=!on; }); }
function play(){
  var c=ensureCtx(); if(c.state!=='running') c.resume();
  if(S.mode==='buffer'){
    if(S.offset>=S.duration-0.05) S.offset=0;
    var src=c.createBufferSource(); src.buffer=playBuffer(); src.connect(c.destination);
    S.startCtx=c.currentTime+0.08; src.start(S.startCtx, S.offset);
    src.onended=function(){ if(S.src===src){ S.src=null; S.playing=false; S.offset=S.duration; setPlayIcon(); } };
    S.src=src; S.playing=true; S.clkOff=null;
  } else if(S.mode==='live'){ S.media.play(); S.playing=true; }
  setPlayIcon();
}
function pause(){
  if(S.mode==='buffer'){ var pos=heardPos(performance.now()); killSrc(); S.offset=pos; }
  else if(S.mode==='live' && S.media) S.media.pause();
  S.playing=false; setPlayIcon();
}
function killSrc(){ if(S.src){ var s=S.src; S.src=null; try{s.onended=null; s.stop();}catch(e){} } }
function stopAll(){
  killSrc(); if(S.sepWorker){ try{S.sepWorker.terminate();}catch(e){} S.sepWorker=null; } if(S.media){ try{S.media.pause();}catch(e){} }
  S.playing=false; S.offset=0; if(S.mode==='live'&&S.media) S.media.currentTime=0;
  resetPointers(); setPlayIcon();
}
function seekTo(t){
  t=Math.max(0,Math.min(S.duration||0,t));
  if(S.mode==='buffer'){ var was=S.playing; if(was){ killSrc(); S.playing=false; } S.offset=t; if(was) play(); }
  else if(S.mode==='live'){ S.media.currentTime=t; clearLiveHits(); }
  resetPointers();
}
function setPlayIcon(){ $('icPlay').style.display=S.playing?'none':''; $('icPause').style.display=S.playing?'':'none'; }
$('playBtn').addEventListener('click', function(){ S.playing?pause():play(); });
$('stopBtn').addEventListener('click', function(){ stopAll(); });
var seekEl=$('seek');
seekEl.addEventListener('input', function(){ S.seeking=true; $('tCur').textContent=fmt(seekEl.value/1000*S.duration); paintRange(seekEl); });
seekEl.addEventListener('change', function(){ S.seeking=false; seekTo(seekEl.value/1000*S.duration); });
var syncEl=$('sync');
function setSync(v){ v=Math.max(-200,Math.min(200,Math.round(+v))); S.syncMs=v; syncEl.value=v; $('syncVal').textContent=(v>0?'+':'')+v+' ms'; paintRange(syncEl, true);
  try{ localStorage.setItem('drumSync', String(v)); }catch(e){} }
syncEl.addEventListener('input', function(){ setSync(syncEl.value); });
$('syncReset').addEventListener('click', function(){ setSync(0); });
try{ var sv=localStorage.getItem('drumSync'); setSync(sv!==null ? +sv : 0); }catch(e){ setSync(0); }
function paintRange(el, centered){
  var p=(el.value-el.min)/(el.max-el.min)*100;
  if(centered){ el.style.setProperty('--a', Math.min(50,p)+'%'); el.style.setProperty('--b', Math.max(50,p)+'%'); }
  else el.style.setProperty('--p', p+'%');
}
function updateInfo(){
  var t=[]; if(S.bpm) t.push('קצב: ⁦'+Math.round(S.bpm)+'⁩'); if(S.mode==='buffer' && S.hits.length) t.push('מכות: ⁦'+S.hits.length+'⁩');
  if(S.mode==='live') t.push('זיהוי חי');
  $('info').textContent=t.join(' · ');
}

// ---------------- tap calibration (finds the real headphone / Bluetooth delay) ----------------
var CAL=null;
$('calBtn').addEventListener('click', startCal);
$('calCancel').addEventListener('click', function(e){ e.stopPropagation(); endCal(); });
function startCal(){
  var c=ensureCtx(); if(c.state!=='running') c.resume();
  if(S.playing) pause();
  var n=16, iv=0.5, t0=c.currentTime+1.0, clicks=[];
  for(var i=0;i<n;i++){
    var t=t0+i*iv, o=c.createOscillator(), g=c.createGain();
    o.type='square'; o.frequency.value = i%4===0 ? 1760 : 1320;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.35,t+0.0015); g.gain.exponentialRampToValueAtTime(0.0008,t+0.05);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+0.06); clicks.push(t);
  }
  CAL={clicks:clicks, taps:[], end:t0+n*iv+0.5, n:n};
  $('cal').hidden=false; $('calCount').textContent='0 / '+n; $('calText').textContent='הקש על המסך בדיוק עם כל צליל';
}
$('cal').addEventListener('pointerdown', function(e){
  if(!CAL) return; e.preventDefault();
  var tp = (e.timeStamp>0 && e.timeStamp<1e11) ? e.timeStamp : performance.now();
  CAL.taps.push(tp); $('calCount').textContent=CAL.taps.length+' / '+CAL.n;
  var p=$('calPulse'); p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
});
window.__calClicks=function(){ return CAL?CAL.clicks.slice():[]; };
function finishCal(){
  var errs=[];
  CAL.taps.forEach(function(tp){
    var hc=heardCtxAt(tp), best=null;
    CAL.clicks.forEach(function(ct,i){ if(i<3) return; var d=hc-ct; if(Math.abs(d)<0.25 && (best===null||Math.abs(d)<Math.abs(best))) best=d; });
    if(best!==null) errs.push(best*1000);
  });
  var txt;
  if(errs.length<6) txt='לא נקלטו מספיק הקשות. נסה שוב.';
  else {
    errs.sort(function(a,b){return a-b;});
    var med=errs[errs.length>>1], dev=errs.map(function(x){return Math.abs(x-med);}).sort(function(a,b){return a-b;})[errs.length>>1];
    if(dev>45) txt='ההקשות לא היו אחידות מספיק. נסה שוב בקצב קבוע.';
    else { setSync(Math.round(med/5)*5); txt='הסנכרון נקבע ל־⁦'+(S.syncMs>0?'+':'')+S.syncMs+' ms⁩'; }
  }
  endCal(); setMsg(txt);
}
function endCal(){ CAL=null; $('cal').hidden=true; }

// ---------------- live fallback (video whose audio can't be decoded) ----------------
function startLive(file){
  var el=$('media'), c=ensureCtx();
  S.mode='live'; S.media=el; S.hits=[]; S.bpm=0; clearTimeline();
  el.src=URL.createObjectURL(file); el.load();
  try{
    if(!S.mediaNode){ S.mediaNode=c.createMediaElementSource(el); S.analyser=c.createAnalyser();
      S.analyser.fftSize=1024; S.analyser.smoothingTimeConstant=0; S.mediaNode.connect(S.analyser); S.analyser.connect(c.destination);
      S.fbuf=new Float32Array(S.analyser.frequencyBinCount); }
  }catch(e){}
  el.onloadedmetadata=function(){ S.duration=el.duration||0; overlay(false); enableControls(true); updateInfo();
    setMsg('לא ניתן היה לפענח את השמע מראש — הזיהוי ייעשה בזמן אמת (פחות מדויק).'); };
  el.onended=function(){ S.playing=false; setPlayIcon(); };
  el.onerror=function(){ overlay(false); setMsg('הקובץ לא נתמך בדפדפן הזה.'); };
  S.live={prev:[0,0,0], mean:[0.05,0.05,0.05], last:[-9,-9,-9]};
}
function clearLiveHits(){ S.hits=[]; buildTimeline(); }
function liveDetect(v){
  if(!S.analyser||!S.playing) return;
  var a=S.analyser, f=S.fbuf; a.getFloatFrequencyData(f);
  var binHz=S.ctx.sampleRate/a.fftSize, bands=[[30,130],[400,5000],[5000,12000]], L=S.live, out=[];
  for(var g=0;g<3;g++){ var s=0; for(var k=Math.ceil(bands[g][0]/binHz);k<=Math.floor(bands[g][1]/binHz)&&k<f.length;k++){ var m=Math.pow(10,f[k]/20); s+=m*m; }
    var lv=Math.log1p(2000*s), fl=Math.max(0,lv-L.prev[g]); L.prev[g]=lv;
    L.mean[g]=0.95*L.mean[g]+0.05*fl;
    if(fl>L.mean[g]*2.4+0.15 && v-L.last[g]>0.09){ L.last[g]=v; out.push({g:g,s:fl}); } }
  var added=false;
  out.forEach(function(o){ var d=o.g===0?0:(o.g===1?1:2); if(o.g===2 && out.some(function(x){return x.g===1;})) return;
    S.hits.push({t:v, d:d, v:Math.min(1,0.3+o.s/3)}); added=true; });
  if(added){ S.hits=S.hits.filter(function(h){return h.t>v-4;}); buildTimeline(); }
}

// ---------------- rendering ----------------
function ease(u){ u=Math.max(0,Math.min(1,u)); return u*u*(3-2*u); }
function lerp(a,b,u){ return [a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u]; }
function handPose(k, v){
  var arr=S.hands[k], H=HANDS[k], i=adv('h'+k, arr, v), prev=i>0?arr[i-1]:null, next=i<arr.length?arr[i]:null;
  var fromT = prev?prev.t:-99, prevPt = prev?HITPT[prev.d]:H.rest;
  function base(t){ var dt=t-fromT; if(!prev||dt>=0.9) return H.rest; if(dt<0.5) return prevPt; return lerp(prevPt,H.rest,ease((dt-0.5)/0.4)); }
  var pos, h, hover=0.45;
  if(next){
    var ms=Math.max(fromT+0.03, next.t-0.25);
    pos = v<ms ? base(v) : lerp(base(ms), HITPT[next.d], ease((v-ms)/(next.t-ms)));
    var gap=next.t-fromT;
    if(gap<0.45){ var amp=Math.max(0.3,Math.min(1,gap/0.3)); h=amp*Math.sin(Math.PI*Math.max(0,Math.min(1,(v-fromT)/gap))); }
    else { var ws=next.t-0.3; if(v<ws) h=hover*Math.min(1,(v-fromT)/0.12);
      else { var u=(v-ws)/0.3; h = u<0.5 ? hover+(1-hover)*Math.sin(Math.PI*u) : Math.sin(Math.PI*u); } }
  } else { pos=base(v); h=hover*Math.min(1,(v-fromT)/0.12); }
  return {pos:pos, h:Math.max(0,h)};
}
function drawHand(k, pose){
  var g=$('hand'+k), sh=HANDS[k].sh, tip=pose.pos, dx=tip[0]-sh[0], dy=tip[1]-sh[1], dist=Math.hypot(dx,dy)||1, ux=dx/dist, uy=dy/dist;
  var gl=Math.max(22, dist-STICK), grip=[sh[0]+ux*gl, sh[1]+uy*gl];
  // a raised stick is foreshortened toward the hand and its tip sits higher above its shadow
  var f=1-0.3*pose.h, ptip=[grip[0]+(tip[0]-grip[0])*f, grip[1]+(tip[1]-grip[1])*f+pose.h*3];
  var butt=[grip[0]-ux*11, grip[1]-uy*11];
  // tapered sleeve from the shoulder (wide) to the wrist (narrow)
  var nx=-uy, ny=ux, w0=8.5, w1=5, wr=[grip[0]-ux*6, grip[1]-uy*6];
  g.querySelector('.arm').setAttribute('d','M'+(sh[0]+nx*w0)+' '+(sh[1]+ny*w0)+' L'+(wr[0]+nx*w1)+' '+(wr[1]+ny*w1)+
    ' A'+w1+' '+w1+' 0 0 1 '+(wr[0]-nx*w1)+' '+(wr[1]-ny*w1)+' L'+(sh[0]-nx*w0)+' '+(sh[1]-ny*w0)+
    ' A'+w0+' '+w0+' 0 0 1 '+(sh[0]+nx*w0)+' '+(sh[1]+ny*w0)+'Z');
  g.querySelector('.armHi').setAttribute('d','M'+(sh[0]+nx*w0*0.45)+' '+(sh[1]+ny*w0*0.45)+' L'+(wr[0]+nx*w1*0.45)+' '+(wr[1]+ny*w1*0.45));
  setLine(g.querySelector('.shadow'), [grip[0]+3,grip[1]+5], [tip[0]+2+pose.h*5,tip[1]+3+pose.h*8]);
  g.querySelector('.shadow').setAttribute('opacity', 0.45-0.25*pose.h);
  setLine(g.querySelector('.stick'), butt, ptip);
  setLine(g.querySelector('.stickHi'), [butt[0]-0.8,butt[1]-0.6], [ptip[0]-0.8,ptip[1]-0.6]);
  var t=g.querySelector('.tip'); t.setAttribute('cx',ptip[0]); t.setAttribute('cy',ptip[1]);
  g.querySelector('.handG').setAttribute('transform','translate('+grip[0]+' '+grip[1]+') rotate('+(Math.atan2(uy,ux)*180/Math.PI)+')');
}
function setLine(el,a,b){ el.setAttribute('x1',a[0]); el.setAttribute('y1',a[1]); el.setAttribute('x2',b[0]); el.setAttribute('y2',b[1]); }
function kickPress(v){
  var arr=S.kicks, i=adv('kick',arr,v), p=0;
  if(i<arr.length){ var dt=arr[i].t-v; if(dt<0.07) p=Math.max(p,1-dt/0.07); }
  if(i>0){ var da=v-arr[i-1].t; if(da<0.13) p=Math.max(p,1-da/0.13); }
  return ease(p);
}
function hatClosed(v){
  var arr=S.hats, i=adv('hat',arr,v), last=i>0?arr[i-1]:null, next=i<arr.length?arr[i]:null;
  var open = last && last.d===3, p=open?0:1;
  if(next){ var dt=next.t-v;
    if(open && next.d===2 && dt<0.06) p=1-dt/0.06;
    else if(!open && next.d===3 && dt<0.06) p=dt/0.06; }
  return p;
}
function showName(d){
  var s=$('drumName').firstChild;
  if(d<0){ s.className='empty'; s.textContent='—'; return; }
  s.textContent=NAMES[d]; s.className=''; void s.offsetWidth; s.className='pop';
}
function about(g,s,dx,dy){ return 'translate('+(g.cx+(dx||0))+' '+(g.cy+(dy||0))+') scale('+s+') translate('+(-g.cx)+' '+(-g.cy)+')'; }
function render(v){
  var hatOpen=1-hatClosed(v);
  ORDER.forEach(function(id){
    var g=GEOM[id], arr=S.byEl[id]||[], i=adv('e'+id,arr,v), last=i>0?arr[i-1]:null, age=last?v-last.t:99;
    var dur=g.cym?0.75:0.4, a=age/dur, tr='', s=last?last.v:0;
    if(last && a<1 && age>=0){
      g.fl.setAttribute('opacity', (g.cym?0.75:0.65)*s*Math.exp(-age/(g.cym?0.2:0.08)));
      g.ring.setAttribute('rx', g.rx*(1+0.5*a)); g.ring.setAttribute('ry', g.ry*(1+0.5*a));
      g.ring.setAttribute('opacity', Math.max(0,s*(1-a)*0.85)); g.ring.setAttribute('stroke-width', 0.6+3*s*(1-a));
      if(g.cym){ var wob=0.06*s*Math.exp(-age*4.5);
        tr='rotate('+(wob*40*Math.sin(age*30))+' '+g.cx+' '+g.cy+') '+about(g,1+wob*0.5*Math.cos(age*36)); }
      else tr=about(g, 1+0.035*s*Math.exp(-age/0.05));
    } else { g.fl.setAttribute('opacity',0); g.ring.setAttribute('opacity',0); }
    if(id==='hh'){ tr=(hatOpen>0.01?'translate('+(-2*hatOpen)+' '+(-5*hatOpen)+') ':'')+tr; $('hhGap').setAttribute('opacity',0.55*hatOpen); }
    if(tr) g.cp.setAttribute('transform',tr); else g.cp.removeAttribute('transform');
  });
  // feet: right on the kick pedal, left on the hi-hat pedal (down = closed)
  var kp=kickPress(v), closed=1-hatOpen;
  $('footR').setAttribute('transform','translate('+KPEDAL.x+' '+(KPEDAL.y-3.5*kp)+') scale(1 '+(1-0.09*kp)+')');
  $('footL').setAttribute('transform','translate('+HPEDAL.x+' '+HPEDAL.y+') rotate('+HPEDAL.rot+') translate(0 '+(-3*closed)+') scale(1 '+(1-0.07*closed)+')');
  drawHand('L', handPose('L',v)); drawHand('R', handPose('R',v));
  var gi=adv('all',S.hits,v)-1;
  if(gi!==S.lastHitIdx){ S.lastHitIdx=gi; if(gi>=0 && v-S.hits[gi].t<1.0){
      var t=S.hits[gi].t, best=S.hits[gi];
      for(var j=gi;j>=0&&t-S.hits[j].t<0.03;j--) if(S.hits[j].d!==2 && (best.d===2||best.d===0)) best=S.hits[j];
      showName(best.d); } }
}
function loop(ts){
  requestAnimationFrame(loop);
  if(S.lastTs){ var d=ts-S.lastTs; if(d>4&&d<50) S.frameMs+=0.1*(d-S.frameMs); } S.lastTs=ts;
  updateClock();
  if(CAL && S.ctx && S.ctx.currentTime>CAL.end) finishCal();
  // what we draw now appears on screen about one frame later, so draw for that moment
  var shown=performance.now()+S.frameMs, pos=heardPos(shown), v;
  if(S.mode==='live'){ v=pos; liveDetect(v); }
  else v=pos - S.syncMs/1000;
  if(!S.seeking && S.duration){ seekEl.value=Math.round(pos/S.duration*1000); paintRange(seekEl); $('tCur').textContent=fmt(pos); }
  $('tDur').textContent=fmt(S.duration);
  render(v);
}

buildKit(); clearTimeline(); paintRange(seekEl); requestAnimationFrame(loop);
document.addEventListener('visibilitychange', function(){ if(!document.hidden && S.ctx && S.playing && S.ctx.state!=='running') S.ctx.resume(); });
if('serviceWorker' in navigator && /^https?:/.test(location.protocol)){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}
