var norm=Core.norm, fmtN=Core.fmtN, num=Core.num, range=Core.range, parseLoad=Core.parseLoad;
/* ---------- Utilidades ---------- */
var S = { st:null, tab:null, view:'home', day:null, week:0, draft:{}, metric:'peso', photos:{}, cmpA:null, cmpB:null, exSel:null, newPhoto:null };
var METRICS = [['peso','Peso','kg'],['cintura','Cintura','cm'],['cadera','Cadera','cm'],['muslo','Muslo','cm'],['brazo','Brazo','cm']];
var $app = document.getElementById('app');

function run(fn){
  var a=[].slice.call(arguments,1);
  var API=window.MOCK_API||window.GAPI;
  return new Promise(function(res,rej){ try{ Promise.resolve(API[fn].apply(null,a)).then(res,rej); }catch(e){ rej(e); } }).catch(function(e){
    if(e&&e.auth&&navigator.onLine&&!window.MOCK_API){ if(S.wo) store('wo',S.wo); toast('Renovando tu sesión de Google…'); setTimeout(function(){ GAPI.signIn(); },600); }
    throw e;
  });
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function toast(msg,err){ document.querySelectorAll('.toast').forEach(function(x){x.remove();}); var t=document.createElement('div'); t.className='toast'+(err?' err':''); t.textContent=msg; document.body.appendChild(t); setTimeout(function(){t.remove();},err?4500:2200); }
function fail(e){ toast((e&&e.message)||String(e),true); }
function store(k,v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k,JSON.stringify(v)); }catch(e){ return null; } }
function dateES(iso){ var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0].slice(2); }
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* ---------- Estado de semanas ---------- */
function curTab(){ return S.st.tabs.filter(function(t){return t.name===S.tab;})[0] || S.st.tabs[S.st.tabs.length-1]; }
function key(tab,n,w){ return tab+'|'+n+'|'+w; }
function weekFilled(day,w){ return day.exercises.length && day.exercises.every(function(e){return e.loads[w] && e.loads[w].t;}); }
function weekAny(day,w){ return day.exercises.some(function(e){return e.loads[w] && e.loads[w].t;}); }
function lastW(day){ var l=-1; for(var w=0;w<day.weeks.length;w++) if(weekAny(day,w)) l=w; return l; }
function finished(tab,day,w){ return S.st.done.indexOf(key(tab.name,day.n,w))>=0; }
/* Un día a medias solo cuenta como "en curso" si guardaste algo hoy y no lo has terminado */
function inProgress(tab,day,w){ return weekAny(day,w) && !weekFilled(day,w) && !finished(tab,day,w) && store('saved|'+key(tab.name,day.n,w))===todayISO(); }
function weekDone(tab,day,w){ return finished(tab,day,w) || (weekAny(day,w) && !inProgress(tab,day,w)); }
function curWeek(tab,day){
  var l=lastW(day); if(l<0) return 0;
  if(!weekDone(tab,day,l)) return l;
  return Math.min(l+1,day.weeks.length-1);
}
/* Rotación: Día 1→5 en la semana 1, luego Día 1→5 en la semana 2… Toca el siguiente al último día entrenado */
function nextDay(tab){
  var days=tab.days.filter(function(d){return d.exercises.length;}).sort(function(a,b){return a.n-b.n;});
  if(!days.length) return null;
  var f=null;
  days.forEach(function(d){ var l=lastW(d); if(l<0) return; if(!f||l>f.w||(l===f.w&&d.n>f.day.n)) f={day:d,w:l}; });
  if(!f) return {day:days[0],week:0,done:false};
  if(inProgress(tab,f.day,f.w)) return {day:f.day,week:f.w,done:false};
  var i=days.indexOf(f.day), nd=days[(i+1)%days.length], w=(i+1<days.length)?f.w:f.w+1;
  if(w>=nd.weeks.length) return {day:nd,week:nd.weeks.length-1,done:true};
  if(weekAny(nd,w)) w=curWeek(tab,nd);
  return {day:nd,week:w,done:false};
}

/* Última vez: semana anterior de esta pestaña o, si no, pestañas anteriores */
/* Última vez: lo más reciente de ese mismo ejercicio (por nombre), primero en este mesociclo
   —incluido otro día de la misma semana— y si no, en los mesociclos anteriores.
   Prefiere un registro con kilos o repeticiones; un "Fallo" suelto solo si no hay nada más. */
/* Última vez de una parte (A o B de una superserie, o el ejercicio entero): busca ese nombre
   también cuando aparece suelto o dentro de otra superserie. */
function lastPart(tab,ex,w,pi){
  var target=norm(Core.partsOf(ex.name)[pi]), myDay=null, noteOnly=null;
  tab.days.forEach(function(d){ if(d.exercises.indexOf(ex)>=0) myDay=d; });
  var pick=function(e,t){ var ps=Core.partsOf(e.name), j=-1; ps.forEach(function(x,k){ if(norm(x)===target) j=k; }); if(j<0) return null; return Core.splitLoad(t,ps.length)[j]; };
  var useful=function(p){ return p&&(p.weight!=null||p.reps.length); };
  var c=[];
  tab.days.forEach(function(d){ d.exercises.forEach(function(e){ e.loads.forEach(function(l,k){ if(!l.t) return; var p=pick(e,l.t); if(!p) return;
    var before=e===ex?k<w:(k<w||(k===w&&myDay&&d.n<myDay.n)); if(before) c.push({k:k,n:d.n,p:p,g:l.g}); }); }); });
  c.sort(function(a,b){ return (a.k-b.k)||(a.n-b.n); });
  for(var i=c.length-1;i>=0;i--){ if(useful(c[i].p)) return c[i]; if(!noteOnly) noteOnly=c[i]; }
  var tabs=S.st.tabs, ti=tabs.indexOf(tab);
  for(var j=ti-1;j>=0;j--){ var best=null;
    tabs[j].days.forEach(function(d){ d.exercises.forEach(function(e){ for(var k=e.loads.length-1;k>=0;k--){ var l=e.loads[k]; if(!l.t) continue; var p=pick(e,l.t); if(!p) continue;
      if(useful(p)){ if(!best||k>best.k) best={k:k,p:p,g:l.g}; break; } if(!noteOnly) noteOnly={p:p,g:l.g}; } }); });
    if(best) return best; }
  return noteOnly;
}
function lastFor(tab,ex,w){
  var nm=norm(ex.name), np=Core.partsOf(ex.name).length, myDay=null, noteOnly=null;
  tab.days.forEach(function(d){ if(d.exercises.indexOf(ex)>=0) myDay=d; });
  var useful=function(t){ return Core.splitLoad(t,np).some(function(p){ return p&&(p.weight!=null||p.reps.length); }); };
  var c=[];
  tab.days.forEach(function(d){ d.exercises.forEach(function(e){ if(norm(e.name)!==nm) return;
    e.loads.forEach(function(l,k){ if(!l.t) return;
      var before=e===ex?k<w:(k<w||(k===w&&myDay&&d.n<myDay.n));
      if(before) c.push({k:k,n:d.n,t:l.t,g:l.g,where:'Semana '+(k+1)+(d!==myDay?' · día '+d.n:'')}); }); }); });
  c.sort(function(a,b){ return (a.k-b.k)||(a.n-b.n); });
  for(var i=c.length-1;i>=0;i--){ if(useful(c[i].t)) return c[i]; if(!noteOnly) noteOnly=c[i]; }
  var tabs=S.st.tabs, ti=tabs.indexOf(tab);
  for(var j=ti-1;j>=0;j--){
    var best=null;
    tabs[j].days.forEach(function(d){ d.exercises.forEach(function(e){ if(norm(e.name)!==nm) return;
      for(var k=e.loads.length-1;k>=0;k--){ var l=e.loads[k]; if(!l.t) continue;
        if(useful(l.t)){ if(!best||k>best.k) best={k:k,t:l.t,g:l.g,where:tabs[j].name}; break; }
        if(!noteOnly) noteOnly={t:l.t,g:l.g,where:tabs[j].name}; } }); });
    if(best) return best;
  }
  return noteOnly;
}




S.pose='frente'; S.newPhotos={}; S.mtab='resumen'; S.pday=null;
var POSES=[['frente','Frente'],['perfil','Perfil'],['espalda','Espalda']];
function pid(m,p){ return (m.photos&&m.photos[p||S.pose])||''; }
var I={
  g:'<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  ck:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cam:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  plus:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  play:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  drag:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>',
  chev:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
};
function sign(d){ return d==null?'–':(d>0?'+':d<0?'−':'±')+fmtN(Math.abs(d)); }
function cap(s){ s=String(s||'').toLowerCase(); return s.charAt(0).toUpperCase()+s.slice(1); }

/* ---------- Objetivos (1 subir, -1 bajar, 0 mantener) ---------- */
var GOALS={
  def:{name:'Definición',desc:'Perder grasa conservando músculo',note:'La cintura es el mejor indicador de grasa: debería bajar, igual que el peso, la cadera y el muslo. El brazo debería mantenerse. Ritmo ideal: −0,5 a −1 % del peso por semana.',peso:-1,cintura:-1,cadera:-1,muslo:-1,brazo:0,rate:[-1,-0.5]},
  vol:{name:'Volumen',desc:'Ganar músculo con la mínima grasa',note:'Peso, brazo y muslo deberían subir; la cintura, mantenerse (si sube, estás ganando grasa). Ritmo ideal: +0,25 a +0,5 % por semana.',peso:1,cintura:0,cadera:0,muslo:1,brazo:1,rate:[0.25,0.5]},
  rec:{name:'Recomposición',desc:'Perder grasa y ganar músculo a la vez',note:'Peso estable, cintura a la baja, brazo y muslo al alza. Ritmo ideal: entre −0,25 y +0,25 % por semana.',peso:0,cintura:-1,cadera:0,muslo:1,brazo:1,rate:[-0.25,0.25]},
  man:{name:'Mantenimiento',desc:'Conservar lo conseguido',note:'Todo debería moverse poco: ±0,5 cm en perímetros y ±0,25 % de peso por semana.',peso:0,cintura:0,cadera:0,muslo:0,brazo:0,rate:[-0.25,0.25]}
};
var DIRTXT={'1':'subir','-1':'bajar','0':'mantener'};
function judge(k,d,G){
  if(!G||d==null) return '';
  var dir=G[k], thr=k==='peso'?0.2:0.3;
  if(dir===0) return Math.abs(d)<=0.5?'good':'bad';
  if(Math.abs(d)<thr) return '';
  return (d*dir>0)?'good':'bad';
}
function rateOf(pw){ if(pw.length<2) return null; var a=pw[pw.length-2], b=pw[pw.length-1], dd=(new Date(b.date)-new Date(a.date))/86400000; return dd>0?(b.peso-a.peso)/a.peso*100/(dd/7):null; }
function rateTxt(r,G){
  if(r==null) return '';
  var v=(r>0?'+':r<0?'−':'')+fmtN(Math.abs(Math.round(r*100)/100))+' %/sem';
  if(!G) return 'Ritmo <b>'+v+'</b>';
  var lo=G.rate[0], hi=G.rate[1], rng=(lo>0?'+':lo<0?'−':'')+fmtN(Math.abs(lo))+' a '+(hi>0?'+':hi<0?'−':'')+fmtN(Math.abs(hi))+' %';
  if(r>=lo&&r<=hi) return 'Ritmo <b>'+v+'</b> · <span class="good">en el rango ideal ('+rng+')</span>';
  var fast=G.peso<0?r<lo:G.peso>0?r>hi:true;
  return 'Ritmo <b>'+v+'</b> · <span class="bad">'+(G.peso===0?'fuera del rango':fast?'demasiado rápido':'más lento de lo ideal')+' ('+rng+')</span>';
}
var JC={good:'#8BE09A',bad:'#F2B25C','':'#4FE0C8'};

/* ---------- Gráficas ---------- */
function spark(vals,col,W,H){
  if(vals.length<2) return '';
  var mn=Math.min.apply(null,vals), mx=Math.max.apply(null,vals); if(mn===mx){mn-=1;mx+=1;}
  var p=4, X=function(i){return p+(W-2*p)*i/(vals.length-1);}, Y=function(v){return p+(H-2*p)*(1-(v-mn)/(mx-mn));};
  var d=vals.map(function(v,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);}).join(' '), id='g'+Math.random().toString(36).slice(2,7);
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+col+'" stop-opacity=".22"/><stop offset="1" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs>'+
    '<path d="'+d+' L'+X(vals.length-1)+' '+H+' L'+X(0)+' '+H+' Z" fill="url(#'+id+')"/><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
}
function lineChart(pts){
  if(pts.length<2) return '<div class="empty sm" style="padding:20px 0">Con dos registros o más verás aquí la evolución.</div>';
  var W=340,H=190,pl=34,pr=16,pt=14,pb=26, ys=pts.map(function(p){return p.y;}), mn=Math.min.apply(null,ys), mx=Math.max.apply(null,ys);
  if(mn===mx){mn-=1;mx+=1;} var pad=(mx-mn)*.18; mn-=pad; mx+=pad;
  var X=function(i){return pl+(W-pl-pr)*(i/(pts.length-1));}, Y=function(v){return pt+(H-pt-pb)*(1-(v-mn)/(mx-mn));};
  var path=pts.map(function(p,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(p.y).toFixed(1);}).join(' '), g='';
  [mn+pad,(mn+mx)/2,mx-pad].forEach(function(v){ g+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="rgba(255,255,255,.06)"/><text x="'+(pl-7)+'" y="'+(Y(v)+4)+'" text-anchor="end" font-size="10.5" fill="#8D9599" font-family="Barlow, sans-serif">'+fmtN(Math.round(v*10)/10)+'</text>'; });
  var dots=pts.map(function(p,i){ var l=i===pts.length-1; return '<circle cx="'+X(i)+'" cy="'+Y(p.y)+'" r="'+(l?5.5:3.5)+'" fill="'+(p.g?'#8BE09A':l?'#F2F4F3':'#4FE0C8')+'" stroke="#1E2225" stroke-width="2"/>'; }).join('');
  var step=Math.ceil(pts.length/6), lab=pts.map(function(p,i){ return (i%step===0||i===pts.length-1)?'<text x="'+X(i)+'" y="'+(H-7)+'" text-anchor="middle" font-size="10.5" fill="#8D9599" font-family="Barlow, sans-serif">'+esc(p.x)+'</text>':''; }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Evolución"><defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4FE0C8" stop-opacity=".2"/><stop offset="1" stop-color="#4FE0C8" stop-opacity="0"/></linearGradient></defs>'+g+
    '<path d="'+path+' L'+X(pts.length-1)+' '+(H-pb)+' L'+pl+' '+(H-pb)+' Z" fill="url(#ga)"/><path d="'+path+'" fill="none" stroke="#4FE0C8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+dots+lab+'</svg>';
}
function tape(cur,prev,first,vals){
  var mn=Math.min.apply(null,vals), mx=Math.max.apply(null,vals), span=Math.max(10,(mx-mn)+6);
  var lo=Math.floor((mn+mx)/2-span/2), hi=lo+Math.ceil(span), W=320,H=66,ty=24,th=30, X=function(v){return 8+(W-16)*(v-lo)/(hi-lo);};
  var s='<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true"><rect x="0" y="'+ty+'" width="'+W+'" height="'+th+'" rx="4" fill="#F5C542"/>';
  for(var v=lo; v<=hi+1e-6; v+=0.5){
    var x=X(v), wh=Math.abs(v-Math.round(v))<1e-6, f=wh&&Math.round(v)%5===0;
    s+='<line x1="'+x+'" y1="'+ty+'" x2="'+x+'" y2="'+(ty+(f?14:wh?10:5))+'" stroke="#2A2000" stroke-width="'+(f?1.6:1)+'" opacity="'+(wh?.85:.5)+'"/>';
    if(wh&&(hi-lo<=14||f||Math.round(v)%2===0)) s+='<text x="'+x+'" y="'+(ty+th-5)+'" text-anchor="middle" font-size="9.5" fill="#2A2000" font-family="Barlow, sans-serif" font-weight="600">'+Math.round(v)+'</text>';
  }
  if(first!=null&&first!==cur){ var fx=X(first); s+='<rect x="'+Math.min(fx,X(cur))+'" y="'+(ty+th+4)+'" width="'+Math.abs(X(cur)-fx)+'" height="4" rx="2" fill="#4FE0C8" opacity=".6"/><circle cx="'+fx+'" cy="'+(ty+th+6)+'" r="3.5" fill="#16191B" stroke="#4FE0C8" stroke-width="1.5"/>'; }
  if(prev!=null&&prev!==cur){ var px=X(prev); s+='<path d="M'+(px-5)+' 12 L'+(px+5)+' 12 L'+px+' 21 Z" fill="none" stroke="#8D9599" stroke-width="1.5" stroke-linejoin="round"/>'; }
  var cx=X(cur); s+='<line x1="'+cx+'" y1="'+(ty-3)+'" x2="'+cx+'" y2="'+(ty+th)+'" stroke="#16191B" stroke-width="2.5"/><path d="M'+(cx-7)+' 8 L'+(cx+7)+' 8 L'+cx+' 21 Z" fill="#F2F4F3"/>';
  return s+'</svg>';
}

/* ---------- Cola sin conexión ---------- */
function isNet(e){ var m=String((e&&e.message)||e); return !navigator.onLine||/network|conexi|connection|timeout|failed to fetch|load failed|HTTP 0/i.test(m); }
function applyQueue(){
  (store('queue')||[]).forEach(function(q){ S.st.tabs.forEach(function(t){ if(t.name!==q.tab) return; t.days.forEach(function(d){ d.weeks.forEach(function(wk,wi){ if(wk.col!==q.col) return;
    d.exercises.forEach(function(e){ if(e.row===q.row) e.loads[wi]={t:q.text,g:q.green,pend:true}; }); }); }); }); });
}
var flushing=false;
function flushQueue(){
  if(flushing||!(store('queue')||[]).length) return; flushing=true; var n=0;
  var next=function(){ var it=(store('queue')||[])[0];
    if(!it){ flushing=false; if(n){ toast(n===1?'1 ejercicio pendiente subido':n+' ejercicios pendientes subidos'); run('getState').then(function(st){ S.st=st; applyQueue(); if(!S.wo) render(); }).catch(function(){}); } return; }
    run('saveExercise',it).then(function(){ var r=store('queue')||[]; r.shift(); store('queue',r); n++; next(); })
      .catch(function(e){ flushing=false; if(!isNet(e)&&!e.auth){ var r=store('queue')||[]; r.shift(); store('queue',r); fail(e); } });
  }; next();
}
window.addEventListener('online',function(){ if(S.st) flushQueue(); });

/* ---------- Arranque ---------- */
var CFG=window.APP_CONFIG||{};
function adopt(st,fromCache){
  S.st=st;
  if(!S.tab||!st.tabs.some(function(t){return t.name===S.tab;})) S.tab=st.tabs.length?st.tabs[st.tabs.length-1].name:null;
  var dr=store('drafts2'); if(dr) S.draft=dr;
  applyQueue();
  document.getElementById('nav').hidden=false;
  var wo=store('wo'); if(wo&&!S.wo){ store('wo',null); S.view='home'; render(); var c=curTab(); if(c&&c.days.some(function(d){return d.n===wo.n;})) openWorkout(wo.n,wo.w,wo.i); return; }
  if(S.wo) renderWorkout(); else render();
}
function refresh(){
  return run('getState').then(function(st){
    if(st.needsSetup){ S.st=st; renderSetup(st.setupWhy); return; }
    var c=JSON.parse(JSON.stringify(st)); store('st_cache',c);
    adopt(st); flushQueue();
  });
}
function load(){
  if(window.MOCK_API){ return refresh(); }
  if(!CFG.CLIENT_ID){ $app.innerHTML='<div class="empty" style="margin-top:24vh"><h3>Falta configurar Google</h3><p>La app aún no tiene sus claves de Google.</p></div>'; return; }
  var cache=store('st_cache');
  if(cache&&cache.tabs&&cache.tabs.length) adopt(cache,true);
  if(GAPI.token()){
    var first=!store('email');
    (first?GAPI.whoami():Promise.resolve()).then(refresh).catch(function(e){
      if(e&&e.auth) return;
      if(cache) toast(isNet(e)?'Sin conexión: mostrando tus datos guardados':'No he podido actualizar: '+(e.message||e),true);
      else $app.innerHTML='<div class="empty" style="margin-top:24vh"><h3>No he podido leer tus datos</h3><p>'+esc(e.message||e)+'</p><button class="btn" onclick="location.reload()">Reintentar</button></div>';
    });
    return;
  }
  if(GAPI.signedInBefore()){
    if(navigator.onLine&&!sessionStorage.getItem('reauth')){ sessionStorage.setItem('reauth','1'); GAPI.signIn(); return; }
    if(!cache) renderWelcome(); else toast('Sin conexión: mostrando tus datos guardados');
    return;
  }
  renderWelcome();
}
function renderWelcome(){
  document.getElementById('nav').hidden=true;
  $app.innerHTML='<div class="welcome"><img class="wl-logo" src="icons/logo.png" alt="¡Entrena Cabesa!">'+
    '<p class="mu">Apunta tu entreno en segundos y sigue tu progreso. Tus datos se quedan en tu Google Drive: la app solo ve la hoja que elijas.</p>'+
    '<button class="btn" id="gin">'+I.g+'Entrar con Google</button><a class="xs mu" href="privacidad.html" style="display:block;text-align:center;margin-top:16px">Privacidad</a></div>';
  document.getElementById('gin').onclick=function(){ GAPI.signIn({prompt:'select_account'}); };
}
function renderSetup(why){
  document.getElementById('nav').hidden=true;
  $app.innerHTML='<div class="welcome"><h1>Elige tu hoja</h1><p class="mu">'+(why?esc(why)+' ':'')+'Selecciona la hoja de Google donde tu entrenador te pone la rutina. La app solo tendrá acceso a esa hoja.</p>'+
    '<button class="btn" id="pick">Elegir mi hoja de entreno</button><p class="xs mu" style="margin-top:14px">Si es una hoja compartida contigo, búscala en "Compartido conmigo".</p></div>';
  document.getElementById('pick').onclick=function(){ var b=this; b.disabled=true; b.textContent='Abriendo Google…';
    run('pickSheet').then(function(r){ toast('Hoja conectada: '+r.name); $app.innerHTML='<div class="loading">Leyendo tu hoja…</div>'; return refresh(); })
      .catch(function(e){ if(e.message!=='CANCEL') fail(e); b.disabled=false; b.textContent='Elegir mi hoja de entreno'; }); };
}
function render(){
  document.querySelectorAll('.nav button').forEach(function(b){ b.classList.toggle('on',b.dataset.v===S.view); });
  ({home:renderHome,progress:renderProgress,measures:renderMeasures})[S.view]();
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav button').forEach(function(b){ b.onclick=function(){ S.view=b.dataset.v; render(); }; });

/* =================== HOY =================== */
function renderHome(){
  if(!S.st.tabs.length){ $app.innerHTML='<div class="empty" style="margin-top:24vh"><h3>No encuentro la rutina</h3><p>La app busca bloques que empiecen por "DÍA 1 - …" con una fila de EJERCICIOS debajo.</p></div>'; return; }
  var tab=curTab(), nx=nextDay(tab), sel=S.homeDay?tab.days.filter(function(d){return d.n===S.homeDay;})[0]:null;
  var day=sel||(nx&&nx.day)||tab.days[0], w=sel?(nx&&!nx.done&&nx.day===sel?nx.week:curWeek(tab,sel)):(nx?nx.week:0);
  var isToday=nx&&nx.day===day&&!nx.done;
  var date=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
  var opts=S.st.tabs.map(function(t){return '<option'+(t.name===tab.name?' selected':'')+'>'+esc(t.name)+'</option>';}).reverse().join('');
  var h='<div class="hh"><h1>Hoy</h1><span class="xs mu">'+cap(date)+'</span></div><select class="meso" id="tabsel" aria-label="Mesociclo">'+opts+'</select>';
  var rw=nx?nx.week:0;
  h+='<div class="strip">'+tab.days.map(function(d){
    var st=(nx&&nx.day===d&&!nx.done)?'now':weekDone(tab,d,rw)?'done':'';
    return '<button class="'+st+'" data-day="'+d.n+'" style="'+(d===day&&st!=='now'?'outline:1.5px solid var(--mu2);outline-offset:-1.5px':'')+'"><span class="c">'+(st==='done'?I.cks:d.n)+'</span><span class="l">'+esc(d.name.toLowerCase())+'</span></button>';
  }).join('')+'</div>';
  var total=0, done=0; tab.days.forEach(function(d){ if(!d.exercises.length) return; total+=d.weeks.length; for(var i=0;i<d.weeks.length;i++) if(weekAny(d,i)) done++; });
  h+='<div class="wk"><span>Semana '+(rw+1)+' de '+(day.weeks.length||'?')+'</span><span>'+done+' de '+total+' sesiones del mesociclo</span></div>';

  h+='<div class="today"><span class="num" aria-hidden="true">'+String(day.n).padStart(2,'0')+'</span><div class="k">'+(isToday?'Lo que toca hoy':nx&&nx.done?'Mesociclo completado':'Día '+day.n+' · semana '+(w+1))+'</div>'+
     '<h2>'+esc(day.name)+'</h2><div class="meta">'+day.exercises.length+' ejercicios · '+day.exercises.reduce(function(a,e){return a+(parseInt(e.series,10)||0);},0)+' series</div></div>';
  h+='<ul class="exlist">'+day.exercises.map(function(e,i){
    var sv=e.loads[w]&&e.loads[w].t, l=lastFor(tab,e,w);
    var ld=sv?'<span class="ld"><b>'+esc(e.loads[w].t)+'</b> hoy</span>':l?'<span class="ld">Última: <b>'+esc(l.t)+'</b>'+(l.g?' <span class="ok">· subir peso</span>':'')+'</span>':'';
    return '<li class="'+(sv?'sv':'')+'"><span class="i">'+(sv?I.cks:i+1)+'</span><span class="nm">'+esc(e.name.toLowerCase())+ld+'</span><span class="tg">'+esc(e.series)+'×'+esc(e.reps)+'</span></li>';
  }).join('')+'</ul>';
  h+='<div class="rot-h"><h3>Rotación</h3><span>cada barra, una semana</span></div><div class="rot">'+tab.days.map(function(d){
    var cw=curWeek(tab,d), isNow=nx&&nx.day===d&&!nx.done, ok=nx&&!nx.done&&!isNow&&weekDone(tab,d,rw);
    var bars=d.weeks.map(function(x,k){ var g=d.exercises.some(function(e){return e.loads[k]&&e.loads[k].g;}), f=weekAny(d,k), full=weekFilled(d,k);
      return '<i class="'+(f?(g?'g':'f'):'')+(f&&!full?' p':'')+'" title="Semana '+(k+1)+'"></i>'; }).join('');
    var cnt=0; for(var k=0;k<d.weeks.length;k++) if(weekAny(d,k)) cnt++;
    return '<button class="rd'+(isNow?' now':'')+'" data-day="'+d.n+'"><span class="dn">'+d.n+'</span><span class="mid"><span class="nm">'+esc(d.name.toLowerCase())+'</span><span class="bars">'+bars+'</span></span>'+
      '<span class="rs">'+(isNow?'<em class="hoy">Hoy</em>':ok?'<em class="ok">Hecho</em>':'<em>S'+(cw+1)+'</em>')+'<small>'+cnt+'/'+d.weeks.length+'</small></span></button>';
  }).join('')+'</div><p class="xs mu" style="margin:8px 2px 0">Relleno: semana con datos en tu hoja · verde: alguna marca · rayado: semana a medias.</p>';
  var ms=S.st.measures, lm=ms[ms.length-1];
  if(lm){ var nr=nextRev(), dd=nr.days;
    h+='<button class="minirow" id="tomeas"><span><span class="xs mu">Revisión de medidas · '+nr.date.toLocaleDateString('es-ES',{day:'numeric',month:'short'})+'</span><br><b>'+(dd>0?'En '+dd+' días':dd===0?'Hoy':'Pendiente')+'</b></span><span class="mu">'+I.chev+'</span></button>'; }
  h+='<div class="foot">'+(store('email')?esc(store('email'))+' · ':'')+'<button id="chsheet" class="lnk">Cambiar hoja</button> · <button id="logout" class="lnk">Cerrar sesión</button><br>Mi Entreno '+(window.APP_VERSION||'')+'</div>';
  h+='<div style="height:84px"></div>';
  if(day.exercises.length) h+='<button class="go" id="start">'+I.play+(weekAny(day,w)&&!weekDone(tab,day,w)?'Continuar entreno':isToday?'Vamos al lío':'Abrir día '+day.n)+'</button>';
  $app.innerHTML=h;
  document.getElementById('tabsel').onchange=function(){ S.tab=this.value; S.homeDay=null; render(); };
  $app.querySelectorAll('[data-day]').forEach(function(b){ b.onclick=function(){ var n=+b.dataset.day; S.homeDay=(nx&&nx.day.n===n)?null:n; renderHome(); }; });
  var cs=document.getElementById('chsheet'); if(cs) cs.onclick=function(){ renderSetup(); };
  var lo=document.getElementById('logout'); if(lo) lo.onclick=function(){ if(confirm('¿Cerrar sesión en este iPhone? Tus datos siguen en tu Google.')){ GAPI.signOut(); location.reload(); } };
  var tm=document.getElementById('tomeas'); if(tm) tm.onclick=function(){ S.view='measures'; render(); };
  var st=document.getElementById('start'); if(st) st.onclick=function(){ var first=0; for(var i=0;i<day.exercises.length;i++){ if(!(day.exercises[i].loads[w]&&day.exercises[i].loads[w].t)){ first=i; break; } if(i===day.exercises.length-1) first=day.exercises.length; } openWorkout(day.n,w,first); };
}

/* =================== MODO ENTRENO =================== */
/* Superseries: "A + B" en el nombre = dos ejercicios. En la celda se escriben separados por " / ":
   "110 kg - 11-10 / 40 kg - 12-12" (primero A, luego B). */
var partsOf=Core.partsOf, splitLoad=Core.splitLoad, partText=Core.partText, draftText=Core.draftText;
function stepOf(u){ return u==='kg'||!u?2.5:1; }
function dkey(tab,day,w,ex){ return tab.name+'|'+day.n+'|'+w+'|'+ex.row; }
function getDraft(tab,day,w,ex){
  var k=dkey(tab,day,w,ex); if(S.draft[k]) return S.draft[k];
  var names=partsOf(ex.name), n=names.length, curT=ex.loads[w]&&ex.loads[w].t, cur=curT?splitLoad(curT,n):null;
  var lasts=names.map(function(x,i){ return lastPart(tab,ex,w,i); }), lp=lasts.map(function(x){ return x&&x.p; }), rg=range(ex.reps), ns=parseInt(ex.series,10)||3;
  var parts=names.map(function(nm,i){
    var src=(cur&&cur[i])||(lp&&lp[i])||null, cnt=Math.max(ns,cur&&cur[i]?cur[i].reps.length:0), sets=[];
    for(var j=0;j<cnt;j++) sets.push(src&&src.reps[j]!=null?src.reps[j]:(rg?rg.lo:8));
    var own=cur&&cur[i];
    var p={name:nm,w:src?src.weight:null,unit:src?src.unit:'kg',prefix:own?own.prefix:'',note:own?own.suffix:'',sets:sets,sug:0};
    if(!cur&&lasts[i]&&lasts[i].g&&lp[i]&&lp[i].weight!=null){ p.sug=p.unit==='kg'?(lp[i].weight>=20?2.5:1):1; p.w=lp[i].weight+p.sug; if(rg) p.sets=p.sets.map(function(){return rg.lo;}); }
    return p;
  });
  var d={parts:parts,g:!!(ex.loads[w]&&ex.loads[w].g),gAuto:!curT,edit:!curT};
  S.draft[k]=d; return d;
}
function saveDrafts(){ store('drafts2',S.draft); }
function autoGreen(ex,d){ var rg=range(ex.reps), ns=parseInt(ex.series,10)||1; if(!rg) return false;
  return d.parts.every(function(p){ return p.sets.length>=ns && p.sets.every(function(r){return r>=rg.hi;}); }); }
function openWorkout(n,w,i){ S.wo={n:n,w:w,i:i||0,dir:''}; document.getElementById('nav').hidden=true; renderWorkout(); }
function closeWorkout(){ S.wo=null; store('wo',null); document.getElementById('layer').innerHTML=''; document.getElementById('nav').hidden=false; render(); }
function woCtx(){ var tab=curTab(), day=tab.days.filter(function(d){return d.n===S.wo.n;})[0]; return {tab:tab,day:day,w:S.wo.w}; }

function renderWorkout(){
  var c=woCtx(), tab=c.tab, day=c.day, w=c.w, N=day.exercises.length, i=Math.min(S.wo.i,N), L=document.getElementById('layer');
  var segs=day.exercises.map(function(e,k){ var l=e.loads[w], dr=S.draft[dkey(tab,day,w,e)]; return '<i class="'+(k===i?'c':l&&l.t?(l.g?'g':'d'):dr&&dr.skipped?'s':'')+'"></i>'; }).join('');
  var top='<div class="wo-top"><button class="ib" id="wx" aria-label="Salir del entreno">'+I.x+'</button><div class="segs">'+segs+'</div><span class="wo-cnt">'+(i<N?(i+1)+'/'+N:'Fin')+'</span></div>';
  var body='', bot='';
  if(i>=N){
    var sv=day.exercises.filter(function(e){return e.loads[w]&&e.loads[w].t;}).length, gr=day.exercises.filter(function(e){return e.loads[w]&&e.loads[w].g;}).length;
    var fk='fin|'+key(tab.name,day.n,w), fin=store(fk)||{};
    body='<div class="fin"><div class="wo-k">Día '+day.n+' · semana '+(w+1)+'</div><h2>'+(sv===N?'¡Día completo!':'Casi está')+'</h2><p class="mu sm" style="margin:0">'+(sv===N?'Todo guardado en tu hoja. Hoy te has ganado el descanso.':(N-sv)+(N-sv===1?' ejercicio sin apuntar':' ejercicios sin apuntar')+' (saltados o pendientes). Puedes volver atrás o terminar igualmente.')+'</p>'+
      '<div class="fstats"><div><b class="n">'+sv+'/'+N+'</b><span>ejercicios</span></div><div><b class="n" style="color:var(--ok)">'+gr+'</b><span>marcas en verde</span></div><div><b class="n">'+(w+1)+'</b><span>semana</span></div></div>'+
      (tab.cardio?'<button class="chk'+(fin.c?' on':'')+'" data-x="c"><span class="bx">'+(fin.c?I.cks:'')+'</span><span><b>Cardio</b><br><span class="sm mu">'+esc(cap(tab.cardio))+'</span></span></button>':'')+
      (tab.abs.length?'<button class="chk'+(fin.a?' on':'')+'" data-x="a"><span class="bx">'+(fin.a?I.cks:'')+'</span><span style="flex:1"><b>Abdomen</b> <span class="sm mu">· 3 días por semana</span><div class="abl">'+tab.abs.map(function(a){return '<div><span>'+esc(cap(a.name))+'</span><span>'+esc(a.dose)+'</span></div>';}).join('')+'</div></span></button>':'')+'</div>';
    bot='<div class="wo-bot"><div class="bb"><button class="btn sec" id="wprev" aria-label="Anterior">'+I.back+'</button><button class="btn ok" id="wfin">'+(finished(tab,day,w)?'Día terminado':'Terminar día')+'</button></div></div>';
    L.innerHTML='<div class="wo">'+top+'<div class="wo-body '+S.wo.dir+'" id="wb">'+body+'</div>'+bot+'</div>';
    bindWorkoutCommon(N);
    L.querySelectorAll('[data-x]').forEach(function(b){ b.onclick=function(){ fin[b.dataset.x]=!fin[b.dataset.x]; store(fk,fin); S.wo.dir=''; renderWorkout(); }; });
    document.getElementById('wfin').onclick=function(){ var b=this; b.disabled=true; b.textContent='Guardando…';
      run('finishDay',{tab:tab.name,dayN:day.n,dayName:day.name,week:w,cardio:!!fin.c,abs:!!fin.a}).then(function(){ var k=key(tab.name,day.n,w); if(S.st.done.indexOf(k)<0) S.st.done.push(k); S.homeDay=null; toast('Día '+day.n+' terminado. ¡Qué arte!'); closeWorkout(); })
      .catch(function(e){ fail(e); b.disabled=false; b.textContent='Terminar día'; }); };
    return;
  }
  var ex=day.exercises[i], d=getDraft(tab,day,w,ex), saved=ex.loads[w]&&ex.loads[w].t, last=lastFor(tab,ex,w), rg=range(ex.reps), sup=d.parts.length>1;
  if(d.gAuto) d.g=autoGreen(ex,d);
  var lastParts=d.parts.map(function(x,k){ return lastPart(tab,ex,w,k); });
  body=(sup?'<div style="height:6px"></div>':'<h2 class="wo-name c">'+esc(ex.name)+'</h2>')+
    '<div class="tags">'+(sup?'<span class="tag su">Superserie</span>':'')+'<span class="tag">'+esc(ex.series||'?')+' series</span><span class="tag">'+esc(ex.reps)+' reps</span>'+(ex.rir?'<span class="tag">RIR '+esc(ex.rir)+'</span>':'')+(ex.tec?'<span class="tag t">'+esc(cap(ex.tec))+'</span>':'')+'</div>';
  if(saved&&!d.edit){
    var sp=splitLoad(ex.loads[w].t,d.parts.length);
    body+='<div class="saved'+(ex.loads[w].g?' g':'')+'"><div class="ck">'+I.ck+'</div><div class="mu sm">Guardado en tu hoja</div>'+
      d.parts.map(function(p,k){ return '<div class="v">'+(sup?'<span class="ab">'+'AB'[k]+'</span>':'')+esc(sp[k]?sp[k].raw:'–')+'</div>'; }).join('')+
      (ex.loads[w].pend?'<div class="p">Pendiente de subir, sin conexión</div>':'')+(ex.loads[w].g?'<div class="sm" style="color:var(--ok);font-weight:600;margin-top:4px">Marca conseguida · celda en verde</div>':'')+
      '<button class="btn sec" id="wedit" style="margin-top:16px">Editar</button></div>';
    bot='<div class="wo-bot"><div class="bb"><button class="btn sec" id="wprev" aria-label="Anterior"'+(i?'':' disabled')+'>'+I.back+'</button><button class="btn" id="wnext">'+(i===N-1?'Terminar':'Siguiente ejercicio')+'</button></div></div>';
  } else {
    body+=d.parts.map(function(p,k){
      var lq=lastParts[k], lp=lq&&lq.p;
      return '<div class="part c">'+
        '<div class="phr"><div class="pn">'+(sup?'<span class="ab">'+'AB'[k]+'</span>':'')+(sup?esc(cap(p.name)):'')+'</div>'+
          (p.note||p.showNote?'':'<button class="nlink" data-p="'+k+'" data-nb="1">+ Nota</button>')+'<div class="lastl">'+(lp&&(lp.reps.length||lp.weight!=null)?'Última: <b>'+(lp.weight!=null?fmtN(lp.weight)+' '+lp.unit+(lp.reps.length?' · ':''):'')+lp.reps.join('-')+'</b>'+(lq.g?' <span class="up">↑</span>':''):lp&&lp.raw?'Última: <b>'+esc(lp.raw)+'</b>':'Sin registro anterior')+'</div></div>'+
        '<div class="wtc"><button class="sb2" data-p="'+k+'" data-wd="-'+stepOf(p.unit)+'">−'+fmtN(stepOf(p.unit))+'</button><label class="wv"><input data-p="'+k+'" class="wi" inputmode="decimal" value="'+(p.w!=null?fmtN(p.w):'')+'" placeholder="–" aria-label="Kilos"><span>'+esc(p.unit||'kg')+(p.sug?' · <em>+'+fmtN(p.sug)+' por tu marca</em>':'')+'</span></label><button class="sb2" data-p="'+k+'" data-wd="'+stepOf(p.unit)+'">+'+fmtN(stepOf(p.unit))+'</button></div>'+
        '<div class="cols">'+p.sets.map(function(r,j){ return '<div class="col'+(rg&&r>=rg.hi?' top':'')+'"><span class="sl">S'+(j+1)+'</span><button data-p="'+k+'" data-s="'+j+'" data-r="1" aria-label="Más">+</button><b>'+r+'</b><button data-p="'+k+'" data-s="'+j+'" data-r="-1" aria-label="Menos">−</button></div>'; }).join('')+
          '<div class="col ed"><span class="sl">Series</span><button data-p="'+k+'" data-add="1" aria-label="Añadir serie">+</button><b>'+p.sets.length+'</b><button data-p="'+k+'" data-del="1" aria-label="Quitar serie"'+(p.sets.length>1?'':' disabled')+'>−</button></div></div>'+
        (p.note||p.showNote?'<input class="notein" data-p="'+k+'" data-note="1" value="'+esc(p.note)+'" placeholder="Nota (fallo, por lado…)">':'')+'</div>';
    }).join('');

    var txt=draftText(d);
    bot='<div class="wo-bot"><div class="pv"><span class="pvt"><span>Se escribirá</span><b>'+(txt?esc(txt):'–')+'</b></span><button class="mk'+(d.g?' on':'')+'" id="wg" role="switch" aria-checked="'+d.g+'">'+(d.g?I.cks:'')+'Marca</button></div><div class="bb three"><button class="btn sec" id="wprev" aria-label="Anterior"'+(i?'':' disabled')+'>'+I.back+'</button><button class="btn sec skip" id="wskip">Saltar</button><button class="btn" id="wsave"'+(txt?'':' disabled')+'>Guardar'+(i<N-1?' y siguiente':'')+'</button></div></div>';
  }
  L.innerHTML='<div class="wo">'+top+'<div class="wo-body '+S.wo.dir+'" id="wb">'+body+'</div>'+bot+'</div>';
  S.wo.dir='';
  bindWorkoutCommon(N);
  var re=function(){ var y=document.getElementById('wb').scrollTop; saveDrafts(); renderWorkout(); document.getElementById('wb').scrollTop=y; };
  var q=function(id){ return document.getElementById(id); }, P=function(el){ return d.parts[+el.dataset.p]; };
  if(q('wedit')) q('wedit').onclick=function(){ d.edit=true; re(); };
  if(q('wnext')) q('wnext').onclick=function(){ go(1); };
  L.querySelectorAll('[data-wd]').forEach(function(b){ b.onclick=function(){ var p=P(b); p.w=Math.max(0,(p.w||0)+(+b.dataset.wd)); p.sug=0; re(); }; });
  L.querySelectorAll('input.wi').forEach(function(inp){ inp.onchange=function(){ var p=P(inp); p.w=num(inp.value); p.sug=0; re(); }; });
  L.querySelectorAll('[data-r]').forEach(function(b){ b.onclick=function(){ var p=P(b), j=+b.dataset.s; p.sets[j]=Math.max(0,p.sets[j]+(+b.dataset.r)); re(); }; });
  L.querySelectorAll('[data-add]').forEach(function(b){ b.onclick=function(){ var p=P(b); p.sets.push(p.sets.length?p.sets[p.sets.length-1]:(rg?rg.lo:8)); re(); }; });
  L.querySelectorAll('[data-del]').forEach(function(b){ b.onclick=function(){ P(b).sets.pop(); re(); }; });
  L.querySelectorAll('[data-nb]').forEach(function(b){ b.onclick=function(){ P(b).showNote=true; re(); }; });
  L.querySelectorAll('[data-note]').forEach(function(inp){ inp.onchange=function(){ P(inp).note=inp.value.trim(); re(); }; });
  if(q('wg')) q('wg').onclick=function(){ d.gAuto=false; d.g=!d.g; re(); };
  var write=function(txt,green,b,label){
    var wk=day.weeks[w], pay={tab:tab.name,gid:tab.sheetId,row:ex.row,col:wk.col,text:txt,green:green,wasGreen:!!(ex.loads[w]&&ex.loads[w].g),baseBg:ex.baseBg};
    if(b){ b.disabled=true; b.textContent='Guardando…'; }
    var ok=function(pend){ ex.loads[w]={t:txt,g:green,pend:pend}; d.edit=false; store('saved|'+key(tab.name,day.n,w),todayISO()); saveDrafts(); toast(pend?'Sin cobertura: se subirá cuando vuelva':label); go(1); };
    run('saveExercise',pay).then(function(){ ok(false); }).catch(function(e){
      if(isNet(e)||e.auth){ var qq=(store('queue')||[]).filter(function(x){return !(x.tab===pay.tab&&x.row===pay.row&&x.col===pay.col);}); qq.push(pay); store('queue',qq); ok(true); }
      else { fail(e); if(b){ b.disabled=false; b.textContent=label; } }
    });
  };
  if(q('wskip')) q('wskip').onclick=function(){
    var close=sheet('<h2>Saltar ejercicio</h2><p class="mu sm" style="margin:6px 0 14px">Puedes saltarlo sin apuntar nada o dejar el motivo en tu hoja para que lo vea tu entrenador.</p>'+
      '<button class="opt" data-sk=""><b>Saltar sin apuntar nada</b><span>La celda se queda vacía</span></button>'+
      ['Molestia muscular','Molestias articulares','Máquina ocupada','Sin tiempo'].map(function(r){ return '<button class="opt" data-sk="'+esc(r)+'"><b>'+esc(r)+'</b><span>Se escribirá «'+esc(r)+'» en tu hoja</span></button>'; }).join('')+
      '<div class="fld" style="margin-top:4px"><label for="skr">Otro motivo</label><input id="skr" placeholder="Escribe el motivo" style="font-family:var(--body);font-size:18px;font-weight:600"></div>'+
      '<button class="btn" id="sko" style="margin-top:10px">Apuntar motivo y seguir</button>');
    document.querySelectorAll('[data-sk]').forEach(function(b){ b.onclick=function(){ var r=b.dataset.sk; close();
      if(!r){ d.skipped=true; saveDrafts(); toast('Ejercicio saltado. Otro día será'); go(1); } else write(r,false,null,'Motivo guardado en tu hoja'); }; });
    document.getElementById('sko').onclick=function(){ var r=document.getElementById('skr').value.trim(); if(!r) return toast('Escribe el motivo',true); close(); write(r,false,null,'Motivo guardado en tu hoja'); };
  };
  if(q('wsave')) q('wsave').onclick=function(){ write(draftText(d),d.g,this,d.g?'¡Ole! Marca conseguida · celda en verde':'Guardado en tu hoja'); };

}
function go(step){ var N=woCtx().day.exercises.length; S.wo.i=Math.max(0,Math.min(N,S.wo.i+step)); S.wo.dir=step>0?'slide-l':'slide-r'; renderWorkout(); document.getElementById('wb').scrollTop=0; }
function bindWorkoutCommon(N){
  document.getElementById('wx').onclick=closeWorkout;
  var p=document.getElementById('wprev'); if(p) p.onclick=function(){ go(-1); };
}

/* =================== PROGRESO =================== */
function allExercises(){
  var map={};
  S.st.tabs.forEach(function(t,ti){ t.days.forEach(function(d){ d.exercises.forEach(function(e){
    var names=partsOf(e.name);
    names.forEach(function(nm,pi){ var k=norm(nm); if(!map[k]) map[k]={name:nm,entries:[]};
      e.loads.forEach(function(l,wi){ if(!l.t) return; var p=splitLoad(l.t,names.length)[pi]; if(p) map[k].entries.push({tab:t.name,ti:ti,w:wi,t:p.raw,g:l.g,p:p}); }); });
  }); }); });
  return map;
}
function renderProgress(){
  var tab=curTab(), map=allExercises();
  if(S.pday==null) S.pday=tab.days.length?tab.days[0].n:0;
  var day=tab.days.filter(function(d){return d.n===S.pday;})[0]||tab.days[0];
  var h='<div class="ph"><div><div class="sub">Tus cargas, ejercicio a ejercicio</div><h1>Progreso</h1></div></div>';
  h+='<div class="chips">'+tab.days.map(function(d){return '<button class="chip'+(d===day?' on':'')+'" data-pd="'+d.n+'">'+d.n+' · '+esc(d.name.toLowerCase())+'</button>';}).join('')+'</div><div class="plist">';
  var pn=[]; day.exercises.forEach(function(e){ partsOf(e.name).forEach(function(nm){ pn.push({name:nm}); }); });
  pn.forEach(function(e){
    var m=map[norm(e.name)], en=m?m.entries.filter(function(x){return x.p&&x.p.weight!=null;}):[], last=en[en.length-1], first=en[0], gr=m?m.entries.filter(function(x){return x.g;}).length:0;
    h+='<button class="prow" data-ex="'+esc(norm(e.name))+'"><span class="nm">'+esc(e.name.toLowerCase())+'<span>'+(en.length?(en.length>1?sign(last.p.weight-first.p.weight)+' kg desde el inicio':'1 registro'):'Sin registros')+(gr?' · <span style="color:var(--ok)">'+gr+' marcas</span>':'')+'</span></span>'+
      '<span>'+spark(en.map(function(x){return x.p.weight;}),'#4FE0C8',92,34)+'</span><span class="v">'+(last?fmtN(last.p.weight):'–')+'<small>kg</small></span></button>';
  });
  h+='</div>';
  $app.innerHTML=h;
  $app.querySelectorAll('[data-pd]').forEach(function(b){ b.onclick=function(){ S.pday=+b.dataset.pd; renderProgress(); }; });
  $app.querySelectorAll('[data-ex]').forEach(function(b){ b.onclick=function(){ openExercise(map[b.dataset.ex]); }; });
}
function openExercise(ex){
  if(!ex||!ex.entries.length) return toast('Aún no hay registros de este ejercicio');
  var multi=S.st.tabs.length>1, pts=ex.entries.filter(function(e){return e.p&&e.p.weight!=null;}).map(function(e){return {x:(multi?'M'+(e.ti+1)+' ':'')+'S'+(e.w+1),y:e.p.weight,g:e.g};});
  var best=null; ex.entries.forEach(function(e){ if(e.p&&e.p.weight!=null&&(!best||e.p.weight>best.p.weight)) best=e; });
  var gr=ex.entries.filter(function(e){return e.g;}).length;
  sheet('<h2 style="text-transform:uppercase;font-size:30px;line-height:1">'+esc(ex.name)+'</h2>'+
    '<div class="kp" style="margin-top:16px"><div><b class="n">'+(best?fmtN(best.p.weight):'–')+'</b><span>kg máximo</span></div><div><b class="n">'+(pts.length>1?sign(pts[pts.length-1].y-pts[0].y):'–')+'</b><span>kg desde el inicio</span></div><div><b class="n" style="color:var(--ok)">'+gr+'</b><span>marcas</span></div></div>'+
    '<div class="card" style="padding:14px 10px">'+lineChart(pts)+'</div>'+
    '<div class="card hist">'+ex.entries.slice().reverse().map(function(e){ return '<div><span class="mu">'+esc(e.tab)+' · S'+(e.w+1)+'</span><span>'+(e.g?'<span class="gd"></span>':'')+'<b>'+esc(e.t)+'</b></span></div>'; }).join('')+'</div>');
}

/* =================== CUERPO =================== */
/* Próxima revisión: la que elijas tú o, si no, 14 días después de la última */
function nextRev(){
  var ms=S.st.measures, last=ms[ms.length-1]; if(!last) return null;
  var custom=S.st.nextRev&&S.st.nextRev>last.date?S.st.nextRev:null, d;
  if(custom) d=new Date(custom+'T12:00:00'); else { d=new Date(last.date+'T12:00:00'); d.setDate(d.getDate()+14); }
  var days=Math.round((d-new Date(todayISO()+'T12:00:00'))/86400000);
  var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  return {date:d,iso:iso,days:days,custom:!!custom};
}
function openNextRev(){
  var nr=nextRev();
  var close=sheet('<h2>Próxima revisión</h2><p class="mu sm" style="margin:6px 0 14px">Elige el día que te venga bien. Si no eliges ninguno, se calcula a 14 días de tu última revisión.</p>'+
    '<label class="fdate"><span class="mu sm">Fecha</span><input type="date" id="nrd" value="'+nr.iso+'" min="'+todayISO()+'"></label>'+
    '<div class="chips" style="margin:12px -20px 16px">'+[[7,'En 1 semana'],[14,'En 2 semanas'],[21,'En 3'],[28,'En 4']].map(function(n){return '<button class="chip" data-plus="'+n[0]+'">'+n[1]+(n[0]>14?' semanas':'')+'</button>';}).join('')+'</div>'+
    '<button class="btn" id="nrs">Guardar fecha</button>'+(nr.custom?'<button class="btn sec" id="nrr" style="margin-top:8px">Volver a cada 14 días</button>':''));
  var last=S.st.measures[S.st.measures.length-1];
  document.querySelectorAll('[data-plus]').forEach(function(b){ b.onclick=function(){ var d=new Date(todayISO()+'T12:00:00'); d.setDate(d.getDate()+(+b.dataset.plus)); document.getElementById('nrd').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }; });
  var save=function(v){ var old=S.st.nextRev; S.st.nextRev=v; close(); renderMeasures();
    run('setNextRev',v).then(function(){ toast(v?'Próxima revisión: '+dateES(v):'Vuelve a ser cada 14 días'); }).catch(function(e){ S.st.nextRev=old; renderMeasures(); fail(e); }); };
  document.getElementById('nrs').onclick=function(){ var v=document.getElementById('nrd').value; if(!v) return toast('Elige una fecha',true); if(v<=last.date) return toast('La fecha tiene que ser posterior a tu última revisión',true); save(v); };
  if(document.getElementById('nrr')) document.getElementById('nrr').onclick=function(){ save(''); };
}
function series(k){ return S.st.measures.filter(function(m){return m[k]!=null;}); }
function photoURL(id){ if(S.photos[id]) return Promise.resolve(S.photos[id]); return run('getPhoto',id).then(function(u){ S.photos[id]=u; return u; }); }
function shrink(file){ return new Promise(function(res,rej){ var img=new Image(), u=URL.createObjectURL(file);
  img.onload=function(){ var s=Math.min(1,1400/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg',.85)); };
  img.onerror=function(){ rej(new Error('No he podido leer la foto.')); }; img.src=u; }); }
/* Silueta neutra hecha de cápsulas; puntos de medida a la altura real de cada perímetro */
var BODY={brazo:{y:112,x:52,side:'l',ly:78},cintura:{y:150,x:100,side:'r',ly:118},cadera:{y:186,x:100,side:'l',ly:208},muslo:{y:232,x:117,side:'r',ly:252}};
function bodySVG(G){
  var f='#272C30', s='<svg viewBox="0 0 200 360" aria-hidden="true">'+
    '<circle cx="100" cy="30" r="19" fill="'+f+'"/><rect x="92" y="46" width="16" height="14" rx="5" fill="'+f+'"/>'+
    '<path d="M62 64 Q100 54 138 64 L134 120 Q130 140 124 150 Q127 168 132 186 L68 186 Q73 168 76 150 Q70 140 66 120 Z" fill="'+f+'"/>'+
    '<line x1="60" y1="72" x2="48" y2="178" stroke="'+f+'" stroke-width="19" stroke-linecap="round"/><line x1="140" y1="72" x2="152" y2="178" stroke="'+f+'" stroke-width="19" stroke-linecap="round"/>'+
    '<path d="M68 184 L99 184 L96 336 L76 336 Q70 260 68 184 Z" fill="'+f+'"/><path d="M101 184 L132 184 Q130 260 124 336 L104 336 Z" fill="'+f+'"/>';
  var ring=function(cx,cy,rx,col){ return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="4.5" fill="none" stroke="'+col+'" stroke-width="2" stroke-dasharray="3 2.5"/>'; };
  Object.keys(BODY).forEach(function(k){
    var b=BODY[k], sr=series(k), col=sr.length>1?JC[judge(k,sr[sr.length-1][k]-sr[sr.length-2][k],G)]:'#4FE0C8';
    var rx=k==='brazo'?12:k==='muslo'?17:k==='cintura'?27:33;
    s+=ring(b.x,b.y,rx,col);
    var ex=b.side==='l'?-40:240, sx=b.side==='l'?b.x-rx:b.x+rx;
    var mx=b.side==='l'?Math.min(sx-14,36):Math.max(sx+14,164);
    s+='<polyline points="'+sx+','+b.y+' '+mx+','+b.y+' '+(b.side==='l'?mx-16:mx+16)+','+b.ly+' '+ex+','+b.ly+'" fill="none" stroke="'+col+'" stroke-width="1" opacity=".5"/><circle cx="'+sx+'" cy="'+b.y+'" r="2.5" fill="'+col+'"/>';
  });
  return s+'</svg>';
}
function renderMeasures(){
  var ms=S.st.measures, G=GOALS[S.st.goal]||null;
  var h='<div class="ph"><div><div class="sub">Peso, medidas y fotos</div><h1>Cuerpo</h1></div><button class="pill acc" id="newrev">'+I.plus+'Revisión</button></div>';
  h+='<div class="seg">'+[['resumen','Resumen'],['fotos','Fotos'],['historial','Historial']].map(function(t){return '<button class="'+(S.mtab===t[0]?'on':'')+'" data-mt="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</div>';
  if(!ms.length){
    h+='<div class="empty"><h3>Tu primera revisión</h3><p>Apunta peso, perímetros y tres fotos. Cada dos semanas verás de un vistazo cómo cambia tu cuerpo.</p><button class="btn" id="newrev2" style="margin-top:10px">Hacer la primera revisión</button></div>';
    $app.innerHTML=h; bindMeasuresCommon(); return;
  }
  var last=ms[ms.length-1];
  if(S.mtab==='resumen'){
    var pw=series('peso');
    if(pw.length){
      var cur=pw[pw.length-1], prev=pw[pw.length-2], first=pw[0], dP=prev?cur.peso-prev.peso:null, dF=pw.length>1?cur.peso-first.peso:null;
      h+='<div class="wcap">Peso corporal · '+dateES(cur.date)+'</div><div class="wblock"><div class="big">'+fmtN(cur.peso)+'<small>kg</small></div><div class="side">'+
        '<span class="dch '+judge('peso',dP,G)+'">'+sign(dP)+' · anterior</span><span class="dch '+judge('peso',dF,G)+'">'+sign(dF)+' · inicio</span></div></div>'+
        (pw.length>1?'<div class="wsp">'+spark(pw.map(function(m){return m.peso;}),JC[judge('peso',dP,G)],340,54)+'</div>':'')+
        '<div class="rate">'+(rateTxt(rateOf(pw),G)||'&nbsp;')+'</div>';
    }
    h+='<div class="body" id="body">'+bodySVG(G);
    Object.keys(BODY).forEach(function(k){
      var b=BODY[k], sr=series(k), m=METRICS.filter(function(x){return x[0]===k;})[0];
      var c=sr.length?sr[sr.length-1][k]:null, p=sr.length>1?sr[sr.length-2][k]:null, d=p!=null?c-p:null, j=judge(k,d,G);
      h+='<button class="lab '+b.side+' '+j+'" data-k="'+k+'" style="top:'+(b.ly/360*100)+'%"><span class="t">'+m[1]+(G?' <span class="ar">'+({'1':'↑','-1':'↓','0':'='})[G[k]]+'</span>':'')+'</span><span class="v">'+(c!=null?fmtN(c):'–')+'<small>cm</small></span><span class="d">'+(d!=null?sign(d)+' cm':'primera')+'</span></button>';
    });
    h+='</div>';
    var nr=nextRev(), dd=nr.days;
    h+='<button class="due" id="nextrev" style="width:100%;text-align:left"><span><span class="xs mu">Próxima revisión · '+(nr.custom?'elegida por ti':'cada 14 días')+'</span><br><b>'+nr.date.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})+'</b></span><span class="pill'+(dd<=0?' acc':'')+'">'+(dd>0?'en '+dd+' días':dd===0?'hoy':'pendiente')+'</span></button><p class="xs mu" style="margin:-4px 4px 12px">Toca la fecha para elegir otro día.</p>'+
      '<button class="goalb" id="goal"><span><span class="xs mu">Objetivo</span><br><b>'+(G?G.name:'Elige tu fase')+'</b><br><span class="xs mu">'+(G?'Colorea cada cambio: verde a favor, ámbar en contra':'Para saber si cada cambio va a favor o en contra')+'</span></span><span class="mu">'+I.chev+'</span></button>';
  } else if(S.mtab==='fotos'){
    var withPh=ms.filter(function(m){return pid(m);});
    h+='<div class="seg" style="margin-bottom:14px">'+POSES.map(function(x){return '<button class="'+(S.pose===x[0]?'on':'')+'" data-pose="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>';
    if(withPh.length>=2){
      if(!S.cmpA||!withPh.some(function(m){return m.row===S.cmpA;})) S.cmpA=withPh[0].row;
      if(!S.cmpB||!withPh.some(function(m){return m.row===S.cmpB;})) S.cmpB=withPh[withPh.length-1].row;
      h+='<div class="cmp" id="cmp"><img class="b" id="ib" alt="Después"><img class="a" id="ia" alt="Antes"><div class="hd" id="hd"><span class="kn">'+I.drag+'</span></div><span class="tg l" id="tl"></span><span class="tg r" id="tr"></span></div><div class="diffs" id="diffs"></div>'+
        '<p class="xs mu" style="margin:12px 0 0">Toca una miniatura para usarla como “después”; mantén pulsado para usarla como “antes”.</p>';
    } else h+='<div class="card mu sm">'+(withPh.length?'Ya tienes una foto de '+S.pose+'. Con la de la próxima revisión podrás compararlas deslizando el dedo.':'En cada revisión añade fotos de frente, perfil y espalda. Aquí las compararás deslizando el dedo.')+'</div>';
    h+='<div class="film">'+ms.slice().reverse().map(function(m){ var id=pid(m);
      return '<button data-ph="'+m.row+'" class="'+(withPh.length>=2&&m.row===S.cmpB?'on':withPh.length>=2&&m.row===S.cmpA?'a1':'')+'"><div class="ph2'+(id?' has':'')+'" data-pid="'+esc(id)+'">'+(id?'':I.plus)+'</div>'+dateES(m.date).slice(0,5)+'</button>'; }).join('')+'</div><input type="file" accept="image/*" id="phx" hidden>';
  } else {
    h+='<div class="card" style="padding:16px"><table class="tbl"><thead><tr><th>Fecha</th>'+METRICS.map(function(m){return '<th>'+m[1]+'</th>';}).join('')+'</tr></thead><tbody>'+
      ms.slice().reverse().map(function(m,i,arr){ var pv=arr[i+1]; return '<tr><td>'+dateES(m.date)+'</td>'+METRICS.map(function(x){ var j=pv&&m[x[0]]!=null&&pv[x[0]]!=null?judge(x[0],m[x[0]]-pv[x[0]],G):''; return '<td style="color:'+(j==='good'?'var(--ok)':j==='bad'?'var(--warn)':'inherit')+'">'+fmtN(m[x[0]])+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'+
      '<p class="xs mu">En verde, los cambios a favor de tu objetivo; en ámbar, en contra.</p>';
  }
  $app.innerHTML=h; bindMeasuresCommon();
}
function bindMeasuresCommon(){
  var q=function(id){return document.getElementById(id);};
  q('newrev').onclick=openRevision; if(q('newrev2')) q('newrev2').onclick=openRevision;
  $app.querySelectorAll('[data-mt]').forEach(function(b){ b.onclick=function(){ S.mtab=b.dataset.mt; renderMeasures(); }; });
  $app.querySelectorAll('[data-k]').forEach(function(b){ b.onclick=function(){ openMetric(b.dataset.k); }; });
  if(q('goal')) q('goal').onclick=openGoal;
  if(q('nextrev')) q('nextrev').onclick=openNextRev;
  $app.querySelectorAll('[data-pose]').forEach(function(b){ b.onclick=function(){ S.pose=b.dataset.pose; S.cmpA=S.cmpB=null; renderMeasures(); }; });
  $app.querySelectorAll('.ph2[data-pid]').forEach(function(el){ var id=el.dataset.pid; if(id) photoURL(id).then(function(u){ el.innerHTML='<img src="'+u+'" alt="">'; }).catch(function(){}); });
  var target=null, phx=q('phx'), lp=null;
  $app.querySelectorAll('[data-ph]').forEach(function(b){
    var m=S.st.measures.filter(function(x){return x.row===+b.dataset.ph;})[0];
    b.addEventListener('touchstart',function(){ lp=setTimeout(function(){ lp='long'; if(pid(m)){ S.cmpA=m.row; renderMeasures(); } },450); },{passive:true});
    b.addEventListener('touchend',function(){ if(lp!=='long') clearTimeout(lp); });
    b.onclick=function(){ if(lp==='long'){ lp=null; return; } if(pid(m)){ S.cmpB=m.row; renderMeasures(); } else { target=m; phx.click(); } };
  });
  if(phx) phx.onchange=function(){ if(!this.files[0]||!target) return; toast('Subiendo foto…');
    shrink(this.files[0]).then(function(u){ return run('setMeasurePhoto',target.row,S.pose,u,target.date); }).then(function(ms){ S.st.measures=ms; renderMeasures(); toast('Foto añadida'); }).catch(fail); };
  if(q('cmp')) setupCompare();
}
function setupCompare(){
  var ms=S.st.measures, A=ms.filter(function(m){return m.row===S.cmpA;})[0], B=ms.filter(function(m){return m.row===S.cmpB;})[0], G=GOALS[S.st.goal]||null;
  document.getElementById('tl').textContent='Antes · '+dateES(A.date); document.getElementById('tr').textContent='Después · '+dateES(B.date);
  photoURL(pid(A)).then(function(u){ document.getElementById('ia').src=u; }).catch(fail);
  photoURL(pid(B)).then(function(u){ document.getElementById('ib').src=u; }).catch(fail);
  document.getElementById('diffs').innerHTML=METRICS.map(function(m){ var d=A[m[0]]!=null&&B[m[0]]!=null?B[m[0]]-A[m[0]]:null; return '<div class="'+judge(m[0],d,G)+'"><b>'+sign(d)+'</b>'+m[1]+'</div>'; }).join('');
  var box=document.getElementById('cmp'), ia=document.getElementById('ia'), hd=document.getElementById('hd'), on=false;
  var set=function(x){ var r=box.getBoundingClientRect(), p=Math.min(100,Math.max(0,(x-r.left)/r.width*100)); ia.style.clipPath='inset(0 '+(100-p)+'% 0 0)'; hd.style.left=p+'%'; };
  box.addEventListener('pointerdown',function(e){ on=true; box.setPointerCapture(e.pointerId); set(e.clientX); });
  box.addEventListener('pointermove',function(e){ if(on) set(e.clientX); });
  box.addEventListener('pointerup',function(){ on=false; });
}

/* ---------- Hojas ---------- */
function sheet(html,onClose){
  var L=document.getElementById('layer');
  L.innerHTML='<div class="sbg" id="sbg"><div class="sheet" role="dialog"><div class="grab"></div><div class="row sb" style="margin-bottom:4px"><span></span><button class="ib" id="sx" aria-label="Cerrar">'+I.x+'</button></div>'+html+'</div></div>';
  document.body.style.overflow='hidden';
  var close=function(){ L.innerHTML=''; document.body.style.overflow=''; if(onClose) onClose(); };
  document.getElementById('sx').onclick=close;
  document.getElementById('sbg').onclick=function(e){ if(e.target.id==='sbg') close(); };
  return close;
}
function openGoal(){
  var close=sheet('<h2>Tu objetivo</h2><p class="mu sm" style="margin:6px 0 16px">Decide qué significa “ir bien” en cada medida. Lo puedes cambiar cuando cambies de fase.</p>'+
    Object.keys(GOALS).map(function(k){ var g=GOALS[k]; return '<button class="opt'+(S.st.goal===k?' on':'')+'" data-g="'+k+'"><b>'+g.name+'</b><span>'+g.desc+'. '+g.note+'</span></button>'; }).join('')+
    (S.st.goal?'<button class="btn sec" data-g="" style="margin-top:6px">Quitar objetivo</button>':''));
  document.querySelectorAll('[data-g]').forEach(function(b){ b.onclick=function(){ var g=b.dataset.g, old=S.st.goal; S.st.goal=g; close(); renderMeasures();
    run('setGoal',g).then(function(){ toast(g?'Objetivo: '+GOALS[g].name:'Objetivo quitado'); }).catch(function(e){ S.st.goal=old; renderMeasures(); fail(e); }); }; });
}
function openMetric(k){
  var m=METRICS.filter(function(x){return x[0]===k;})[0], sr=series(k), G=GOALS[S.st.goal]||null;
  if(!sr.length) return toast('Aún no hay datos de '+m[1].toLowerCase());
  var c=sr[sr.length-1], p=sr[sr.length-2], f=sr[0];
  sheet('<div class="xs mu">'+(G?'Objetivo: '+DIRTXT[G[k]]:'Perímetro')+'</div><h2>'+m[1]+'</h2>'+
    '<div class="wblock" style="margin-top:12px"><div class="big">'+fmtN(c[k])+'<small>cm</small></div><div class="side"><span class="dch '+(p?judge(k,c[k]-p[k],G):'')+'">'+(p?sign(c[k]-p[k]):'–')+' vs anterior</span><span class="dch '+(sr.length>1?judge(k,c[k]-f[k],G):'')+'">'+(sr.length>1?sign(c[k]-f[k]):'–')+' desde inicio</span></div></div>'+
    '<div class="tape" style="margin:16px 0 4px">'+tape(c[k],p?p[k]:null,sr.length>1?f[k]:null,sr.map(function(x){return x[k];}))+'</div>'+
    '<div class="legend"><span><i style="background:#F2F4F3"></i>Ahora</span><span><i style="border:1.5px solid #8D9599"></i>Anterior</span><span><i style="background:#4FE0C8"></i>Desde el inicio</span></div>'+
    '<div class="card" style="margin-top:16px;padding:14px 10px">'+lineChart(sr.map(function(x){return {x:dateES(x.date).slice(0,5),y:x[k]};}))+'</div>'+
    '<div class="card hist">'+sr.slice().reverse().map(function(x,i,arr){ var nx=arr[i+1], d=nx?x[k]-nx[k]:null; return '<div><span class="mu">'+dateES(x.date)+'</span><span><b>'+fmtN(x[k])+' cm</b>'+(d!=null?' <span class="dch '+judge(k,d,G)+'" style="margin-left:6px">'+sign(d)+'</span>':'')+'</span></div>'; }).join('')+'</div>');
}
function openRevision(){
  var ms=S.st.measures, last=ms[ms.length-1]||{}, F={};
  var draw=function(){
    var close=sheet('<h2>Nueva revisión</h2><p class="mu sm" style="margin:6px 0 0">En gris, tus medidas de la revisión anterior.</p>'+
      '<label class="fdate"><span class="mu sm">Fecha</span><input type="date" id="fd" value="'+(F.date||todayISO())+'"></label>'+
      '<div class="fld" style="margin-bottom:8px"><label for="f_peso">Peso (kg)</label><input id="f_peso" inputmode="decimal" value="'+(F.peso!=null?fmtN(F.peso):'')+'" placeholder="'+(last.peso!=null?fmtN(last.peso):'–')+'"></div>'+
      '<div class="fgrid">'+METRICS.slice(1).map(function(m){ return '<div class="fld"><label for="f_'+m[0]+'">'+m[1]+' (cm)</label><input id="f_'+m[0]+'" inputmode="decimal" value="'+(F[m[0]]!=null?fmtN(F[m[0]]):'')+'" placeholder="'+(last[m[0]]!=null?fmtN(last[m[0]]):'–')+'"></div>'; }).join('')+'</div>'+
      '<div class="row sb" style="margin:22px 0 0"><b style="font-family:var(--cond);font-size:22px">Fotos</b><span class="xs mu">misma luz, ropa y distancia</span></div>'+
      '<div class="poses">'+POSES.map(function(x){ var u=S.newPhotos[x[0]]; return '<label class="pose" for="fp_'+x[0]+'"><span class="ph2">'+(u?'<img src="'+u+'" alt="">':I.cam)+'</span><b>'+x[1]+'</b></label><input type="file" accept="image/*" id="fp_'+x[0]+'" data-pose="'+x[0]+'" hidden>'; }).join('')+'</div>'+
      '<button class="btn" id="msave">Guardar revisión</button>');
    var grab=function(){ F.date=document.getElementById('fd').value; METRICS.forEach(function(m){ F[m[0]]=num(document.getElementById('f_'+m[0]).value); }); };
    document.querySelectorAll('input[type=file][data-pose]').forEach(function(inp){ inp.onchange=function(){ if(!this.files[0]) return; var p=this.dataset.pose; grab(); shrink(this.files[0]).then(function(u){ S.newPhotos[p]=u; draw(); }).catch(fail); }; });
    document.getElementById('msave').onclick=function(){
      grab(); var b=this, hasPh=POSES.some(function(x){return S.newPhotos[x[0]];}), m={date:F.date||todayISO(),photos:S.newPhotos};
      METRICS.forEach(function(x){ m[x[0]]=F[x[0]]; });
      if(METRICS.every(function(x){return m[x[0]]==null;})&&!hasPh) return toast('Apunta al menos una medida o una foto',true);
      b.disabled=true; b.textContent='Guardando…';
      run('saveMeasure',m).then(function(r){ S.st.measures=r; S.newPhotos={}; close(); S.mtab='resumen'; toast('Revisión guardada. ¡Vamos!'); renderMeasures(); })
        .catch(function(e){ fail(e); b.disabled=false; b.textContent='Guardar revisión'; });
    };
  };
  draw();
}

load();
