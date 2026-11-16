/* ORVEX syncq.js — المرحلة 6 (بند 18): سجل العمليات الفاشلة، عزل الأعطال، ومراجعة التعارضات.
   لماذا: كان فشل سجل واحد في مجموعة يوقف مزامنة كل المجموعات التي بعدها، ويُعاد المحاولة إلى ما لا نهاية دون أثر يراه المستخدم.
   ماذا يفعل:
   - يصنّف الخطأ: انقطاع شبكة (حالة لا عطل)، خطأ خادم مؤقت، رفض نهائي (4xx)، تعارض مخزون، انتهاء جلسة.
   - يسجّل الأعطال في سجل دائم لكل متجر على الجهاز (حد 100 سجل) مع نسخة من السجل المرفوض، ويتيح إعادة المحاولة والتجاهل والتنزيل.
   - لا يحذف شيئًا من بيانات الجهاز: السجل المرفوض يبقى محليًا ونسخته في السجل.
   يعتمد على window.__orvexSync (server.js). يُحمَّل بعد server.js وsync-merge.js. */
(function(root){
'use strict';
const NET=/Failed to fetch|NetworkError|Load failed|لا يوجد اتصال/i;
const isNetwork=e=>!!(e&&(e.network===true||(!e.status&&NET.test(String(e.message||'')))));
const isStock=e=>/ORVEX_STOCK_CONFLICT/i.test(String(e&&e.message||''));
const isAuth=e=>!!(e&&(e.status===401||/انتهت جلسة/.test(String(e.message||''))));
const isPermanent=e=>!!(e&&typeof e.status==='number'&&e.status>=400&&e.status<500&&[401,408,425,429].indexOf(e.status)<0);
const LABELS={products:'المنتجات',customers:'العملاء',sales:'المبيعات',bundles:'الحزم',suppliers:'الموردون',purchases:'المشتريات',expenses:'المصروفات',payments:'الدفعات',returns:'المرتجعات',closings:'إغلاق الصندوق',audit:'سجل التدقيق',employees:'الموظفون',payroll:'الرواتب',attendance:'الحضور',leaves:'الإجازات',advances:'السلف',empPay:'مدفوعات الموظفين',assets:'الأصول',coupons:'القسائم',quotes:'عروض الأسعار',warehouses:'المخازن',transfers:'التحويلات',stocktakes:'الجرد',approvals:'الموافقات',journals:'القيود',coa:'دليل الحسابات',bankAccts:'الحسابات البنكية',bankRecs:'التسويات البنكية',loyTx:'حركات الولاء',boms:'قوائم المكونات',prodOrders:'أوامر الإنتاج',repScheds:'جداول التقارير',repRuns:'تشغيلات التقارير',preturns:'مرتجعات الشراء',settings:'الإعدادات','products/customers':'المنتجات والعملاء'};
const label=t=>LABELS[t]||String(t||'');
const MAXN=100,MAXROW=20000;
/* منطق نقي (يُختبر بلا متصفح): يضيف/يحدّث إدخالًا في قائمة */
function addEntry(list,o,now){
  now=now||Date.now();
  const msg=String(o.error&&o.error.message||o.error||'خطأ غير معروف').slice(0,300),http=o.error&&o.error.status||0;
  const same=list.find(x=>(x.status==='open'||x.status==='retrying')&&x.t===o.t&&x.kind===o.kind&&String(x.rid||'')===String(o.id||''));
  if(same){same.attempts=(same.attempts||1)+1;same.error=msg;same.http=http;same.at=now;same.status='open';if(o.row!==undefined)same.row=clip(o.row);return same}
  const e={id:now.toString(36)+Math.random().toString(36).slice(2,7),t:o.t,kind:o.kind,rid:o.id||'',dl:o.dl||'',status:'open',error:msg,http,attempts:1,first:now,at:now};
  if(o.row!==undefined)e.row=clip(o.row);
  list.push(e);
  /* حد الحجم: نُسقط الأقدم من المنتهية أولًا، ولا نُسقط مفتوحًا إلا عند الضرورة */
  while(list.length>MAXN){let i=list.findIndex(x=>x.status==='resolved'||x.status==='dismissed');if(i<0)i=0;list.splice(i,1)}
  return e;
}
function clip(r){try{const s=JSON.stringify(r);return s.length>MAXROW?{_truncated:true,id:r&&r.id,size:s.length}:JSON.parse(s)}catch(e){return null}}
const open=l=>l.filter(x=>x.status==='open'||x.status==='retrying');
const api={isNetwork,isStock,isAuth,isPermanent,label,addEntry,open,clip};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

/* ========= طبقة المتصفح ========= */
const S=()=>root.__orvexSync,SBx=()=>S()&&S().SB;
const shop=()=>{const s=SBx();return s&&s.shop||''};
const FK=()=>(typeof KEY!=='undefined'?KEY:'orvex')+'_syncfail_'+shop();
const read=()=>{if(!shop())return[];try{return JSON.parse(localStorage.getItem(FK())||'[]')}catch(e){return[]}};
const write=l=>{if(!shop())return;try{localStorage.setItem(FK(),JSON.stringify(l))}catch(e){/* ممتلئ: نُسقط اللقطات ونبقي الأخطاء */try{localStorage.setItem(FK(),JSON.stringify(l.map(x=>Object.assign({},x,{row:undefined}))))}catch(_){}}};
const E=s=>typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const Q=s=>typeof jsq==='function'?jsq(s):String(s).replace(/[^\w-]/g,'');
const T=m=>{if(typeof toast==='function')toast(m)};
let warnedAt=0;
function record(o){if(!shop())return null;const l=read(),e=addEntry(l,o);write(l);return e}
function quarantine(o){
  const e=record({t:o.t,id:o.id,row:o.row,dl:o.dl,kind:o.kind||'row',error:o.error});
  /* تنبيه واحد لا يتكرر أكثر من مرة كل 30 ثانية */
  if(Date.now()-warnedAt>30000){warnedAt=Date.now();T('تعذّر رفع سجل من «'+label(o.t)+'» وحُفظ في سجل المزامنة. افتح حالة المزامنة للمراجعة.')}
  return e;
}
/* تُستدعى من server.js: هل يُعزل هذا الخطأ (يُسجَّل وتستمر بقية المجموعات) أم يُعاد رميه؟ */
function isolate(e,t){
  if(isNetwork(e)||isStock(e)||isAuth(e))return false;
  record({t,kind:'collection',error:e});return true;
}
function onSuccess(){
  const l=read();let ch=false;
  l.forEach(x=>{if(x.status==='retrying'||(x.status==='open'&&x.kind!=='row'&&x.kind!=='op')){x.status='resolved';x.at=Date.now();ch=true}});
  if(ch)write(l);
}
const list=()=>read();
const pending=()=>open(read()).length;
function retry(id){
  const l=read(),e=l.find(x=>x.id===id);if(!e)return false;
  const s=S();
  if(e.kind==='row'&&e.rid){const L=s.last[e.t];if(L)delete L[e.rid]}          /* يُعامل الصف كغير مرسل فيدخل الدفعة التالية */
  if(e.kind==='op'&&e.row&&s.inflightAdd)s.inflightAdd(e.t,e.dl,Math.random().toString(36).slice(2)+Date.now().toString(36),[e.row]);
  e.status='retrying';write(l);
  const sb=SBx();sb.changeSeq=(sb.changeSeq||0)+1;sb.dirty=true;sb.blocked=null;sb.retryCount=0;
  return s.push();
}
function retryAll(){const l=read();let any=false;open(l).forEach(e=>{if(e.kind==='row'&&e.rid){const L=S().last[e.t];if(L)delete L[e.rid]}else if(e.kind==='op'&&e.row&&S().inflightAdd)S().inflightAdd(e.t,e.dl,Math.random().toString(36).slice(2)+Date.now().toString(36),[e.row]);e.status='retrying';any=true});write(l);
  const sb=SBx();sb.changeSeq=(sb.changeSeq||0)+1;sb.dirty=true;sb.blocked=null;sb.retryCount=0;return any?S().push():Promise.resolve(true)}
function dismiss(id){const l=read(),e=l.find(x=>x.id===id);if(!e)return false;e.status='dismissed';e.at=Date.now();write(l);return true}
function exportJson(){return JSON.stringify({format:'ORVEX-sync-failures-v1',shop:shop(),at:new Date().toISOString(),entries:read()},null,1)}
function download(){
  try{const b=new Blob([exportJson()],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='ORVEX_sync_failures.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}catch(e){T('تعذّر تجهيز الملف: '+e.message)}
}
const ago=t=>{try{return new Date(t).toLocaleString('ar')}catch(e){return''}};
function openLog(){
  const L=open(read()).sort((a,b)=>b.at-a.at);
  const kindT={row:'سجل مرفوض',collection:'مجموعة تعذّرت',op:'عملية مخزون/رصيد مرفوضة'};
  const body=L.length?L.map(e=>{const r=e.row&&!e.row._truncated?(e.row.data||e.row):null,nm=r&&(r.no||r.name||r.title||'')||'';
    return`<div class="card"><div class="row"><div class="grow"><b>${E(label(e.t))}</b> · ${E(kindT[e.kind]||e.kind)}</div><span class="muted" style="font-size:12px">${E(ago(e.at))}</span></div>
     ${e.rid?`<div class="muted" style="font-size:12.5px">المعرّف: ${E(e.rid)}${nm?' · '+E(nm):''}</div>`:''}
     <div style="font-size:13px;margin:4px 0">${E(e.error)}${e.http?' (HTTP '+e.http+')':''} · محاولات: ${e.attempts}</div>
     <div class="actions"><button class="btn" onclick="orvexSyncQ.retryUI('${Q(e.id)}')">إعادة المحاولة</button>${e.kind==='row'||e.kind==='op'?`<button class="btn" onclick="orvexSyncQ.dismissUI('${Q(e.id)}')">تجاهل</button>`:''}</div></div>`}).join(''):'<p class="muted">لا توجد عمليات فاشلة.</p>';
  if(typeof modal==='function')modal('العمليات الفاشلة',body+(L.length?`<p class="note">السجلات المرفوضة تبقى محفوظة على هذا الجهاز ونسخة منها في هذا السجل، ولا تُحذف تلقائيًا. «تجاهل» يترك السجل محليًا دون رفعه.</p>`:'')+`<div class="actions">${L.length?'<button class="btn primary" onclick="orvexSyncQ.retryAllUI()">إعادة محاولة الكل</button>':''}<button class="btn" onclick="orvexSyncQ.download()">تنزيل السجل</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`);
}
async function retryUI(id){const ok=await retry(id);T(ok?'تمت إعادة المحاولة':'ما زالت المزامنة تتعذّر');openLog()}
async function retryAllUI(){const ok=await retryAll();T(ok?'تمت إعادة المحاولة':'ما زالت المزامنة تتعذّر');openLog()}
function dismissUI(id){if(typeof confirm==='function'&&!confirm('سيبقى هذا السجل على هذا الجهاز فقط ولن يُرفع إلى الخادم ولن يراه غيرك. هل تتجاهله؟'))return;dismiss(id);openLog()}

/* ---- مراجعة تعارضات التعديل (من sync-merge.js) ---- */
const M=()=>root.orvexSyncMerge;
const val=v=>{if(v===undefined)return'—';if(v===null)return'(فارغ)';if(typeof v==='object'){try{return JSON.stringify(v).slice(0,80)}catch(e){return'…'}}return String(v).slice(0,80)};
function openConflicts(){
  const m=M();if(!m)return;const L=m.pending();
  const body=L.length?L.map(e=>{
    const head=`<div class="row"><div class="grow"><b>${E(label(e.t))}</b> · ${E(e.id)}</div><span class="muted" style="font-size:12px">${E(ago(e.at))}</span></div>`;
    if(e.kind==='remote_deleted')return`<div class="card">${head}<div style="font-size:13px">حُذف هذا السجل من جهاز آخر وما زالت نسختك موجودة هنا.</div><div class="actions"><button class="btn" onclick="orvexSyncQ.resolveUI('${Q(e.rid)}','keepMine')">إبقاؤه</button><button class="btn danger" onclick="orvexSyncQ.resolveUI('${Q(e.rid)}','deleteLocal')">حذفه هنا أيضًا</button></div></div>`;
    return`<div class="card">${head}${(e.fields||[]).map(f=>`<div style="font-size:13px;margin:3px 0"><span class="muted">${E(f.path)}:</span> قيمتك <b>${E(val(f.local))}</b> · قيمة الجهاز الآخر <b>${E(val(f.remote))}</b></div>`).join('')}<div class="actions"><button class="btn" onclick="orvexSyncQ.resolveUI('${Q(e.rid)}','keepMine')">إبقاء قيمتي</button><button class="btn" onclick="orvexSyncQ.resolveUI('${Q(e.rid)}','useTheirs')">اعتماد قيمة الجهاز الآخر</button></div></div>`}).join(''):'<p class="muted">لا توجد تعارضات تنتظر المراجعة.</p>';
  if(typeof modal==='function')modal('تعارضات التعديل',body+'<p class="note">عند تعديل الحقل نفسه على جهازين، اعتُمدت قيمتك تلقائيًا وحُفظت القيمة الأخرى هنا لتختار.</p><div class="actions"><button class="btn" onclick="closeModal()">إغلاق</button></div>');
}
function resolveUI(rid,action){const m=M();if(!m)return;const r=m.resolve(rid,action);if(!r.ok)T(r.err||'تعذّرت المعالجة');else T('تم');openConflicts()}

root.orvexSyncQ=Object.assign({},api,{isolate,record,quarantine,onSuccess,list,pending,retry,retryAll,dismiss,exportJson,download,openLog,openConflicts,retryUI,retryAllUI,dismissUI,resolveUI});
})(typeof window!=='undefined'?window:globalThis);
