/* ORVEX — قائمة الدخل الشهرية (reports2.js). للقراءة فقط: تُحسب من الفواتير والمرتجعات والمصروفات والأصول الموجودة
   ولا تخزّن شيئًا. المبالغ قبل الضريبة. تُشارك كنص عبر مشاركة الجهاز أو البريد. */
(function(){
'use strict';
const inM=(d,m)=>String(d||'').slice(0,7)===m;
const sum=(a,f)=>r2(a.reduce((s,x)=>s+num(f(x)),0));
function assetDep(m){
  if(!window.ORVEX_ASSETS)return 0;
  const [y,mo]=m.split('-').map(Number),end=m+'-28',prev=(mo===1?(y-1)+'-12':y+'-'+String(mo-1).padStart(2,'0'))+'-28';
  return r2((db.assets||[]).reduce((s,a)=>{
    const A=window.ORVEX_ASSETS;
    if(String(a.date).slice(0,7)>m)return s;
    if(a.disposed&&a.disposedAt&&String(a.disposedAt).slice(0,7)<m)return s;
    const c1=A.calc(a,end).acc,c0=String(a.date).slice(0,7)===m?0:A.calc(a,prev).acc;
    return s+Math.max(0,c1-c0)},0))}
function pnl(m){
  const S=db.sales.filter(s=>!s.void&&inM(s.date,m)),R=(db.returns||[]).filter(r=>inM(r.date,m)),X=(db.expenses||[]).filter(e=>inM(e.date,m));
  const sales=sum(S,s=>s.net),ret=sum(R,r=>r.net),net=r2(sales-ret),cogs=r2(sum(S,s=>s.cost)-sum(R,r=>r.cost)),gross=r2(net-cogs);
  const pay=sum(X.filter(e=>e.cat==='رواتب'),e=>e.amount),by={};
  X.filter(e=>e.cat!=='رواتب').forEach(e=>by[e.cat]=r2((by[e.cat]||0)+num(e.amount)));
  const other=r2(Object.values(by).reduce((a,b)=>a+b,0)),dep=assetDep(m),dl=window.ORVEX_ASSETS&&ORVEX_ASSETS.disposalPL?ORVEX_ASSETS.disposalPL(m):0,profit=r2(gross-other-pay-dep+dl);
  return{m,count:S.length,sales,ret,net,cogs,gross,by,other,pay,dep,dl,profit,margin:net>0?r2(profit/net*100):0}}
function text(p){
  const c=db.settings.currency||'';
  return [`قائمة الدخل — ${db.settings.name||'ORVEX'} — ${p.m}`,`عدد الفواتير: ${p.count}`,`المبيعات: ${p.sales} ${c}`,`المرتجعات: ${p.ret}`,`صافي المبيعات: ${p.net}`,`تكلفة البضاعة: ${p.cogs}`,`مجمل الربح: ${p.gross}`,
    ...Object.keys(p.by).map(k=>`مصروف ${k}: ${p.by[k]}`),`الرواتب: ${p.pay}`,`الإهلاك: ${p.dep}`,...(p.dl?[`${p.dl>0?'أرباح':'خسائر'} استبعاد الأصول: ${Math.abs(p.dl)}`]:[]),`صافي الربح: ${p.profit} (${p.margin}%)`,'(المبالغ قبل الضريبة)'].join('\n')}
window.pnlOpen=function(m){
  if(!isAdmin())return toast('للمدير فقط');
  m=m||window.__pnm||today().slice(0,7);window.__pnm=m;const p=pnl(m),row=(a,b,bold)=>`<div class="row"><div class="grow">${bold?'<b>'+a+'</b>':a}</div><div class="end">${bold?'<b>'+money(b)+'</b>':money(b)}</div></div>`;
  modal('قائمة الدخل',`<input type="month" value="${esc(m)}" onchange="pnlOpen(this.value)"><div class="card" style="margin-top:8px">
  ${row('المبيعات ('+p.count+' فاتورة)',p.sales)}${row('− المرتجعات',p.ret)}${row('صافي المبيعات',p.net,1)}${row('− تكلفة البضاعة',p.cogs)}${row('مجمل الربح',p.gross,1)}
  ${Object.keys(p.by).map(k=>row('− '+esc(k),p.by[k])).join('')}${row('− الرواتب',p.pay)}${row('− الإهلاك (من الأصول)',p.dep)}${p.dl?row((p.dl>0?'+ أرباح':'− خسائر')+' استبعاد الأصول',Math.abs(p.dl)):''}${row('صافي الربح ('+p.margin+'%)',p.profit,1)}</div>
  <p class="muted" style="font-size:12.5px">المبالغ قبل الضريبة. لا يشمل مشتريات المخزون (تُحتسب تكلفتها عند البيع).</p>
  <div class="actions"><button class="btn primary" onclick="pnlShare()">مشاركة / بريد</button><button class="btn ghost" onclick="closeModal()">إغلاق</button></div>`)};
window.pnlShare=function(){
  const p=pnl(window.__pnm||today().slice(0,7)),t=text(p);
  if(navigator.share){navigator.share({title:'قائمة الدخل '+p.m,text:t}).catch(()=>{})}
  else{const a=document.createElement('a');a.href='mailto:?subject='+encodeURIComponent('قائمة الدخل '+p.m)+'&body='+encodeURIComponent(t);document.body.appendChild(a);a.click();a.remove()}};
const _vp=vParties;vParties=function(){return _vp()+(isAdmin()?`<div class="actions"><button class="btn" onclick="pnlOpen()">📊 قائمة الدخل</button></div>`:'')};
window.ORVEX_PNL={pnl,text};
})();
