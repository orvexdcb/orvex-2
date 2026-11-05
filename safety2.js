/* ORVEX — المرحلة 2: نسخ احتياطي قابل للاستعادة + سجل تدقيق للفواتير (safety2.js)
   إضافي: يعتمد على نسخة JSON الحالية ويحسّنها (بصمة SHA-256، فحص قبل الاستعادة، نسخة أمان تلقائية قبل أي استعادة،
   نسخ محلية يومية دوّارة). لا يلمس Supabase ولا يضيف جداول. يُحمَّل بعد inventory2.js وقبل server.js. */
(function(){
'use strict';
const IDX='orvex_bk_idx',KEEP_AUTO=3;
const idx=()=>{try{return JSON.parse(localStorage.getItem(IDX)||'[]')}catch(e){return[]}};
const setIdx=a=>{try{localStorage.setItem(IDX,JSON.stringify(a))}catch(e){}};
async function sha(t){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return''}}
const COLS=['products','customers','sales','purchases','suppliers','expenses','returns','closings'];
const counts=d=>{const o={};COLS.forEach(k=>o[k]=Array.isArray(d&&d[k])?d[k].length:0);return o};
const cLine=c=>'منتجات '+c.products+' • فواتير '+c.sales+' • عملاء '+c.customers+' • مشتريات '+c.purchases+' • مرتجعات '+c.returns;

/* ---- فحص نسخة دون تطبيقها ---- */
async function inspect(text){
  let doc;try{doc=JSON.parse(text)}catch(e){return{ok:false,err:'الملف ليس JSON صالحًا'}}
  const isB=doc&&typeof doc.format==='string'&&doc.format.indexOf('ORVEX-backup')===0;
  const data=isB?doc.data:doc;
  if(!data||!Array.isArray(data.products)||!Array.isArray(data.sales))return{ok:false,err:'ليست نسخة ORVEX صالحة (المنتجات/الفواتير مفقودة)'};
  for(const k of ['products','sales','customers','purchases','returns']){
    const a=data[k];if(a===undefined)continue;if(!Array.isArray(a))return{ok:false,err:'الحقل «'+k+'» تالف'};
    const ids=new Set();for(const r of a){if(!r||typeof r!=='object'||!r.id)return{ok:false,err:'سجل بلا معرّف داخل «'+k+'»'};if(ids.has(r.id))return{ok:false,err:'معرّف مكرر داخل «'+k+'»'};ids.add(r.id)}}
  let sum='none';
  if(isB&&doc.sha256){const h=await sha(JSON.stringify(data));if(h&&h!==doc.sha256)return{ok:false,err:'بصمة النسخة لا تطابق محتواها: الملف تالف أو عُدّل'};sum=h?'ok':'none'}
  try{normalize(JSON.parse(JSON.stringify(data)))}catch(e){return{ok:false,err:'تعذّر تحليل بنية النسخة'}}
  return{ok:true,data,doc,sum,counts:counts(data),at:isB?doc.exportedAt:'',ver:isB?doc.format:'بيانات خام'}}

/* ---- نسخ محلية (IndexedDB عبر Store) ---- */
async function snapshot(kind){
  const body=JSON.stringify(db),data=JSON.parse(body);let name;const L=idx();
  if(kind==='auto')name='auto_'+(Math.floor(Date.now()/864e5)%KEEP_AUTO);
  else{const a=L.find(x=>x.name==='pre_a'),b=L.find(x=>x.name==='pre_b');name=!a?'pre_a':!b?'pre_b':(a.t<=b.t?'pre_a':'pre_b')}
  const doc={format:'ORVEX-backup-v2',app:'orvex',kind,exportedAt:new Date().toISOString(),shop:(db.settings||{}).name||'',counts:counts(data),sha256:await sha(body),data};
  await Store.putBackup(name,JSON.stringify(doc));
  setIdx(L.filter(x=>x.name!==name).concat({name,t:doc.exportedAt,kind,c:doc.counts}));return name}
const _s=save;save=function(){_s();autoTick()};
function autoTick(){try{if(typeof Store==='undefined'||!Store.putBackup)return;if(!(db.products.length||db.sales.length))return;
  const k='orvex_auto_bk_t',last=+localStorage.getItem(k)||0;if(Date.now()-last<864e5)return;
  localStorage.setItem(k,String(Date.now()));snapshot('auto').catch(()=>{try{localStorage.setItem(k,'0')}catch(e){}})}catch(e){}}

/* ---- تنزيل نسخة v2 بالبصمة ---- */
downloadBackupFile=async function(){
  if(!isAdmin()||!feat('backup'))return toast('للمدير فقط');
  try{const body=JSON.stringify(db),data=JSON.parse(body);
    const doc={format:'ORVEX-backup-v2',app:'orvex',exportedAt:new Date().toISOString(),shop:(db.settings||{}).name||'',counts:counts(data),sha256:await sha(body),data};
    const blob=new Blob([JSON.stringify(doc)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='ORVEX_backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    orvexLog('backup','','نسخة v2');toast('تم تنزيل نسخة احتياطية ببصمة تحقق')}catch(e){toast('فشل إنشاء النسخة الاحتياطية: '+e.message)}};

/* ---- واجهة الاستعادة: فحص + نسخ محلية + تأكيد كتابي ---- */
const _rm=restoreModal;restoreModal=function(){
  _rm();const a=$('#modal .actions');if(!a)return;
  const L=idx().slice().sort((x,y)=>String(y.t).localeCompare(String(x.t)));
  const cloud=(typeof SB!=='undefined'&&SB&&SB.shop)?'<p class="note" style="font-size:12.5px">⚠ هذا الجهاز مرتبط بالسحابة: الاستعادة ستُرفع عند المزامنة، وقد تحذف من السحابة السجلات غير الموجودة في النسخة. اختبرها أولًا على محل تجريبي.</p>':'';
  a.insertAdjacentHTML('beforebegin',`${cloud}<div id="rs_res" class="muted" style="font-size:13px;margin:6px 0"></div>
  <button class="btn" onclick="bk2Check()">🔍 فحص النسخة دون استعادة</button> <button class="btn" onclick="bk2Now()">💾 حفظ نسخة محلية الآن</button>
  ${L.length?`<label style="margin-top:8px">نسخ محلية على هذا الجهاز</label>`+L.map(x=>`<div class="row"><div class="grow"><div class="t">${x.kind==='pre'?'قبل استعادة':'تلقائية'} — ${esc(fdate(String(x.t).slice(0,10)))}</div><small>${x.c?esc(cLine(x.c)):''}</small></div><div class="end"><button class="btn" onclick="bk2Load('${jsq(x.name)}')">تحميل</button></div></div>`).join(''):''}
  <label style="margin-top:8px">للتأكيد اكتب: استعادة</label><input id="rs_conf" autocomplete="off">`)};
function show(R){const e=$('#rs_res');if(!e)return;
  e.innerHTML=R.ok?`✅ النسخة صالحة (${esc(R.ver)}${R.sum==='ok'?'، البصمة مطابقة':'، بلا بصمة'})<br>${esc(cLine(R.counts))}<br><small>الحالي: ${esc(cLine(counts(db)))}</small>`:'❌ '+esc(R.err)}
window.bk2Check=async function(){const R=await inspect(($('#rs')||{}).value||'');show(R);return R};
window.bk2Now=async function(){try{await snapshot('auto');toast('تم حفظ نسخة محلية')}catch(e){toast('تعذّر الحفظ المحلي')}};
window.bk2Load=async function(name){try{const raw=await Store.getBackup(name,'');if(!raw)return toast('النسخة غير موجودة');$('#rs').value=raw;await window.bk2Check()}catch(e){toast('تعذّر تحميل النسخة')}};
const _dr=doRestore;doRestore=async function(){
  if(!isAdmin()||!feat('backup'))return toast('للمدير فقط');
  const R=await inspect(($('#rs')||{}).value||'');show(R);if(!R.ok)return toast(R.err);
  if((($('#rs_conf')||{}).value||'').trim()!=='استعادة')return toast('اكتب كلمة «استعادة» في خانة التأكيد');
  try{await snapshot('pre')}catch(e){return toast('تعذّر حفظ نسخة أمان قبل الاستعادة؛ أُوقفت العملية')}
  $('#rs').value=JSON.stringify({format:'ORVEX-backup-v1',data:R.data});
  const oc=window.confirm;window.confirm=()=>true;try{_dr()}finally{window.confirm=oc}
  orvexLog('restore','',cLine(counts(db)));
  setTimeout(()=>toast('حُفظت نسخة أمان قبل الاستعادة ويمكن الرجوع إليها من شاشة الاستعادة'),1800)};

/* ---- سجل تدقيق للفواتير: إلغاء/تعديل ---- */
window.orvexAudit=function(s,act,extra){s.log=(s.log||[]).concat(Object.assign({id:uid(),t:new Date().toISOString(),by:(curUser()||{}).name||'',act},extra||{}));if(s.log.length>30)s.log.splice(0,s.log.length-30)};
const _se=saveSaleEdit;saveSaleEdit=function(id){const s=db.sales.find(x=>x.id===id);if(!s)return _se(id);
  const t0=s.total,e0=s.editedAt;_se(id);if(s.editedAt!==e0){orvexAudit(s,'edit',{from:t0,to:s.total});orvexLog('sale_edit',s.no,t0+' ← '+s.total)}};
const _si=showInvoice;showInvoice=function(id,ch){_si(id,ch);if(!isAdmin())return;const s=db.sales.find(x=>x.id===id);if(!s||!(s.log||[]).length)return;
  const a=$('#modal .actions');if(!a)return;const A={void:'إلغاء',edit:'تعديل'};
  a.insertAdjacentHTML('beforebegin',`<div class="no-print" style="font-size:12px;margin-top:8px"><b>سجل العمليات</b>${s.log.map(x=>`<div>${esc(fdate(String(x.t).slice(0,10)))} — ${esc(A[x.act]||x.act)} — ${esc(x.by)}${x.from!==undefined?' ('+x.from+' ← '+x.to+')':''}</div>`).join('')}</div>`)};


/* ---- سجل تدقيق عام (يتزامن عبر جدول records بنوع audit) ---- */
window.orvexLog=function(act,ref,detail){
  try{db.audit=db.audit||[];db.audit.push({id:uid(),t:new Date().toISOString(),by:(curUser()||{}).name||'',act,ref:ref||'',d:detail||''});
    if(db.audit.length>2000&&isAdmin())db.audit.splice(0,db.audit.length-1500);save()}catch(e){}};
const AL={product_delete:'حذف منتج',price_change:'تغيير سعر/تكلفة',sale_void:'إلغاء فاتورة',sale_edit:'تعديل فاتورة',stock_count:'جرد وتسوية',restore:'استعادة نسخة',backup:'تنزيل نسخة',loyalty:'إعدادات الولاء',redeem:'استبدال نقاط',emp_add:'إضافة موظف',emp_edit:'تعديل موظف',payroll_pay:'صرف راتب',payroll_cancel:'إلغاء صرف راتب',asset_add:'إضافة أصل',asset_edit:'تعديل أصل',asset_dispose:'استبعاد أصل',coupon_add:'إضافة قسيمة',coupon_edit:'تعديل قسيمة'};
window.auditModal=function(){if(!isAdmin())return toast('للمدير فقط');
  const q=window.__auq||'',L=(db.audit||[]).slice().reverse().filter(x=>!q||x.act===q).slice(0,100);
  modal('سجل التدقيق',`<select onchange="window.__auq=this.value;auditModal()"><option value="">كل العمليات</option>${Object.keys(AL).map(k=>`<option value="${k}" ${k===q?'selected':''}>${AL[k]}</option>`).join('')}</select>
  <div class="card" style="margin-top:8px">${L.length?L.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(AL[x.act]||x.act)} ${esc(x.ref)}</div><small>${esc(fdate(String(x.t).slice(0,10)))} ${esc(String(x.t).slice(11,16))} — ${esc(x.by)}${x.d?' — '+esc(x.d):''}</small></div></div>`).join(''):'<p class="muted">لا توجد عمليات مسجّلة.</p>'}</div>`)};

window.ORVEX_BK={inspect,counts,snapshot,idx};
})();
