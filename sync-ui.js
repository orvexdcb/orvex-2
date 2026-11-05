/* ORVEX sync-ui.js: شارة حالة المزامنة (متصل/دون اتصال، عدد العمليات المعلقة، آخر خطأ) + زر «مزامنة الآن».
   لا تغيّر منطق المزامنة؛ تقرأ حالته فقط. تظهر بعد تسجيل دخول محل (SB.shop). */
(function(){
let lastErr='',lastErrT=0,lastOk=0,wasDirty=false;
const S=()=>window.__orvexSync&&window.__orvexSync.SB;
function pending(){
  const sb=S();if(!sb||!sb.shop)return{rows:0,ops:0};
  let rows=0;
  try{const L=window.__orvexSync.last||{};for(const t of window.__orvexSync.COLL){const cur=db[t]||[],l=L[t]||{};
    cur.forEach(r=>{if(r&&r.id&&l[r.id]!==JSON.stringify(r))rows++});
    rows+=Object.keys(l).filter(id=>!cur.some(r=>r.id===id)).length}}catch(e){}
  let ops=0;try{ops=JSON.parse(localStorage.getItem(window.__orvexSync.ifKey())||'[]').length}catch(e){}
  return{rows,ops};
}
const failedN=()=>{try{return window.orvexSyncQ?window.orvexSyncQ.pending():0}catch(e){return 0}};
const confN=()=>{try{return window.orvexSyncMerge?window.orvexSyncMerge.pending().length:0}catch(e){return 0}};
function state(){
  const sb=S();if(!sb||!sb.sess||!sb.shop)return null;
  const p=pending(),on=navigator.onLine!==false,n=p.rows+p.ops,fq=failedN(),cf=confN();
  if(sb.authExpired)return{k:'err',t:'🔴 انتهت الجلسة',n,on,p};
  if(sb.stockConflict)return{k:'err',t:'🔴 تعارض مخزون يحتاج مراجعة',n,on,p};
  if(sb.busy)return{k:'busy',t:'🔄 جارٍ المزامنة…',n,on,p};
  if(!on)return{k:'off',t:'🟠 دون اتصال'+(n?' · '+n+' معلّقة':''),n,on,p};
  if(sb.blocked)return{k:'err',t:'🔴 رفض الخادم بعض البيانات — تحتاج مراجعة'+(n?' · '+n+' معلّقة':''),n,on,p};
  if(sb.dirty||n)return{k:sb.retryCount?'err':'wait',t:(sb.retryCount?'🔴 تعذّرت المزامنة':'🟡 بانتظار المزامنة')+(n?' · '+n+' معلّقة':''),n,on,p};
  if(fq>0)return{k:'err',t:'🔴 '+fq+' عملية فاشلة — راجع السجل',n,on,p};
  if(cf>0)return{k:'wait',t:'🟡 '+cf+' تعارض تعديل للمراجعة',n,on,p};
  return{k:'ok',t:'🟢 متزامن',n,on,p};
}
function badge(){
  let b=document.getElementById('syncBadge');
  if(!b){b=document.createElement('button');b.id='syncBadge';b.type='button';b.onclick=window.syncDetails;document.body.appendChild(b)}
  return b;
}
function paint(){
  const s=state(),b=document.getElementById('syncBadge');
  if(!s){if(b)b.remove();return}
  const el=badge();el.textContent=s.t;el.className='sb-'+s.k;
  const sb=S();if(wasDirty&&!sb.dirty&&!sb.busy)lastOk=Date.now();wasDirty=!!sb.dirty;
}
window.syncDetails=function(){
  const s=state();if(!s)return;const sb=S();
  const fmtT=t=>t?new Date(t).toLocaleTimeString('ar'):'—';
  modal('حالة المزامنة',`<div class="card">
   <div class="row"><div class="grow">الاتصال</div><b>${s.on?'متصل':'دون اتصال'}</b></div>
   <div class="row"><div class="grow">صفوف لم تُرسل بعد</div><b>${s.p.rows}</b></div>
   <div class="row"><div class="grow">عمليات مخزون/رصيد قيد التأكيد</div><b>${s.p.ops}</b></div>
   <div class="row"><div class="grow">محاولات إعادة متتالية</div><b>${sb.retryCount||0}</b></div>
   <div class="row"><div class="grow">آخر مزامنة ناجحة</div><b>${sb.lastSyncAt?fmtT(sb.lastSyncAt):'—'}</b></div>
   <div class="row"><div class="grow">عمليات فاشلة تحتاج مراجعة</div><b>${failedN()}</b></div>
   <div class="row"><div class="grow">تعارضات تعديل للمراجعة</div><b>${confN()}</b></div>
   <div class="row"><div class="grow">آخر خطأ</div><b style="max-width:60%;text-align:left">${esc(sb.stockConflict||lastErr||'لا يوجد')}${lastErr&&!sb.stockConflict?' ('+fmtT(lastErrT)+')':''}</b></div>
  </div>
  ${sb.blocked?'<p class="note">رفض الخادم بعض البيانات نهائيًا فأُوقفت إعادة المحاولة التلقائية. بياناتك محفوظة على هذا الجهاز؛ راجع «العمليات الفاشلة» أدناه.</p>':''}
  ${sb.stockConflict?'<p class="note">أوقف ORVEX إعادة المحاولة التلقائية لأن الخادم اكتشف أن العملية قد تجعل المخزون سالبًا. راجع الكمية والفاتورة في هذا المحل أولًا؛ لا تُحذف العملية المعلّقة تلقائيًا.</p>':''}
  <p class="muted" style="font-size:12.5px">المبيعات المسجّلة على جهاز دون اتصال تبقى محفوظة عليه ولا تظهر على الأجهزة الأخرى إلا بعد المزامنة. لا تُحذف أي عملية محلية قبل تأكيد الخادم.</p>
  <div class="actions"><button class="btn primary" onclick="syncNow()">🔄 ${sb.stockConflict?'إعادة المحاولة بعد التصحيح':'مزامنة الآن'}</button>${window.orvexSyncQ?`<button class="btn" onclick="orvexSyncQ.openLog()">العمليات الفاشلة (${failedN()})</button>`:''}${window.orvexSyncMerge&&window.orvexSyncQ?`<button class="btn" onclick="orvexSyncQ.openConflicts()">التعارضات (${confN()})</button>`:''}<button class="btn" onclick="closeModal()">إغلاق</button></div>`);
};
window.syncNow=async function(){
  const sb=S();if(!sb||!sb.shop)return;
  if(navigator.onLine===false)return toast('لا يوجد اتصال بالإنترنت. ستتم المزامنة تلقائيًا عند عودته.');
  sb.retryCount=0;sb.stockConflict=null;sb.blocked=null;const ok=await window.__orvexSync.push();
  if(ok){try{await window.__orvexSync.pullInc()}catch(e){}toast('تمت المزامنة')}
  closeModal();paint();
};
/* التقاط أخطاء المزامنة المعروضة للمستخدم */
const _t=toast;toast=function(m){if(typeof m==='string'&&m.indexOf('تعذّرت المزامنة')===0){lastErr=m.replace('تعذّرت المزامنة:','').trim();lastErrT=Date.now()}return _t.apply(this,arguments)};
window.addEventListener('online',paint);
window.addEventListener('offline',paint);
setInterval(paint,1500);paint();

const st=document.createElement('style');
st.textContent='#syncBadge{position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:9000;border:0;border-radius:999px;padding:5px 11px;font:600 11.5px/1.2 inherit;font-family:inherit;color:#fff;box-shadow:0 1px 6px #0004;cursor:pointer;opacity:.92}'+
'.sb-ok{background:#1b7f3b}.sb-busy{background:#2c6fb7}.sb-wait{background:#a07a00}.sb-off{background:#b45f06}.sb-err{background:#b3261e}'+
'@media(max-width:700px){#syncBadge{bottom:calc(64px + env(safe-area-inset-bottom,0px))}}';
document.head.appendChild(st);
})();
