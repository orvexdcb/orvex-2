/* ORVEX — المرحلة 2: الرقابة المالية (finance2.js)
   1) إغلاق الصندوق: رصيد فعلي مقابل المتوقع + عجز/زيادة بسبب، إغلاق لكل مستخدم، قفل بعد الاعتماد (تعديله بصلاحية close_edit وسبب).
   2) قفل الفترات وحماية السجلات المالية المغلقة (إلغاء/حذف/تعديل) مع أثر تدقيقي.
   3) موافقات المدير على إلغاء الفواتير وحذف المصروفات (تُفعَّل من إعدادات الرقابة).
   4) سجل التدقيق بالقيم قبل/بعد + تسجيل المرتجعات والإغلاقات.
   إضافي فقط: لا ترحيل Supabase. المجموعة الجديدة approvals تُزامَن عبر records. يُحمَّل بعد closings.js/inventory3.js وقبل server.js. */
(function(){
'use strict';
const lcs=s=>String(s==null?'':s).trim().toLowerCase();
const ensure=()=>{if(!Array.isArray(db.approvals))db.approvals=[];if(!Array.isArray(db.closings))db.closings=[];return db};
const who=()=>(typeof curUser==='function'&&(curUser()||{}).name)||'';
const adm=()=>typeof isAdmin==='function'&&!!isAdmin();
const log=(a,r,d,ba)=>{try{if(window.orvexLog)window.orvexLog(a,r,d,ba)}catch(e){}};
const val=id=>((document.getElementById(id)||{}).value||'');

/* ===== 1) سجل التدقيق: قيم قبل/بعد ===== */
if(typeof window.orvexLog==='function'){const _l=window.orvexLog;window.orvexLog=function(act,ref,detail,ba){_l(act,ref,detail);
  if(ba&&db.audit&&db.audit.length){const e=db.audit[db.audit.length-1];if(e&&e.act===act){if(ba.b!==undefined)e.b=ba.b;if(ba.a!==undefined)e.a=ba.a;save()}}}}
const AL2={sale_void:'إلغاء فاتورة',sale_edit:'تعديل فاتورة',return:'مرتجع',expense_delete:'حذف مصروف',expense_edit:'تعديل مصروف',closing:'إغلاق صندوق',closing_amend:'تعديل إغلاق معتمد',closing_void:'إلغاء إغلاق',
  locked_override:'تجاوز فترة مقفلة',period_lock:'تغيير قفل الفترة',approval_request:'طلب موافقة',approval_ok:'اعتماد طلب',approval_no:'رفض طلب',purchase_edit:'تعديل فاتورة شراء',
  stock_count:'جرد وتسوية',stock_count_request:'طلب اعتماد جرد',stock_count_reject:'رفض جرد',transfer_send:'إرسال تحويل',transfer_recv:'استلام تحويل',transfer_cancel:'إلغاء تحويل',
  journal_add:'قيد يدوي',journal_reverse:'عكس قيد',coa_add:'حساب جديد',coa_toggle:'تفعيل/إيقاف حساب',bank_add:'حساب بنكي',bank_rec:'تسوية بنكية',landed_cost:'تكلفة وصول',
  quote_status:'حالة عرض سعر',quote_order:'تحويل لطلب بيع',quote_delete:'حذف عرض سعر',loy_adjust:'تعديل نقاط يدوي',loyalty:'إعدادات الولاء',redeem:'استبدال نقاط',product_delete:'حذف منتج',price_change:'تغيير سعر/تكلفة',restore:'استعادة نسخة',backup:'تنزيل نسخة',payroll_pay:'صرف راتب',payroll_cancel:'إلغاء صرف راتب',emp_add:'إضافة موظف',emp_edit:'تعديل موظف',emp_link:'ربط موظف بمستخدم',att_in:'تسجيل حضور',att_out:'تسجيل انصراف',att_edit:'تعديل حضور',leave_req:'طلب إجازة',leave_decide:'قرار إجازة',leave_cancel:'إلغاء إجازة',adv_grant:'صرف سلفة',adv_resched:'إعادة جدولة سلفة',adv_void:'إلغاء سلفة',hr_policy:'سياسة الدوام والرواتب',asset_add:'إضافة أصل',asset_edit:'تعديل أصل',asset_move:'نقل أصل',asset_dispose:'استبعاد أصل',asset_undispose:'تراجع عن استبعاد أصل',bom_add:'قائمة مكونات جديدة',bom_edit:'تعديل قائمة مكونات',bom_toggle:'تفعيل/إيقاف قائمة مكونات',mfg_create:'أمر إنتاج',mfg_complete:'إنجاز أمر إنتاج',mfg_cancel:'إلغاء أمر إنتاج',rep_sched_add:'جدول تقارير جديد',rep_sched_edit:'تعديل جدول تقارير',rep_sched_toggle:'تفعيل/إيقاف جدول تقارير',rep_sched_delete:'حذف جدول تقارير',rep_run_fail:'فشل تقرير مجدول',rep_sent:'إرسال تقرير مجدول',rep_retry:'إعادة تقرير مجدول'};
const show=v=>v===undefined||v===null?'':(typeof v==='object'?Object.keys(v).map(k=>k+': '+(typeof v[k]==='object'?JSON.stringify(v[k]):v[k])).join('، '):String(v));
window.auditModal=function(){if(!adm())return toast('للمدير فقط');
  const q=window.__auq||'',u=window.__auu||'',L=(db.audit||[]).slice().reverse().filter(x=>(!q||x.act===q)&&(!u||x.by===u)).slice(0,120),users=[...new Set((db.audit||[]).map(x=>x.by).filter(Boolean))];
  modal('سجل التدقيق',`<div class="f2"><select onchange="window.__auq=this.value;auditModal()"><option value="">كل العمليات</option>${Object.keys(AL2).map(k=>`<option value="${k}" ${k===q?'selected':''}>${AL2[k]}</option>`).join('')}</select><select onchange="window.__auu=this.value;auditModal()"><option value="">كل المستخدمين</option>${users.map(x=>`<option ${x===u?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
  <div class="card" style="margin-top:8px">${L.length?L.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(AL2[x.act]||x.act)} ${esc(x.ref)}</div><small>${esc(fdate(String(x.t).slice(0,10)))} ${esc(String(x.t).slice(11,16))} — ${esc(x.by)}${x.d?' — '+esc(x.d):''}</small>${x.b!==undefined||x.a!==undefined?`<div style="font-size:12px;margin-top:2px">${x.b!==undefined?'<span style="color:#b23f2d">قبل: '+esc(show(x.b))+'</span><br>':''}${x.a!==undefined?'<span style="color:#2a7a3b">بعد: '+esc(show(x.a))+'</span>':''}</div>`:''}</div></div>`).join(''):'<p class="muted">لا توجد عمليات مسجّلة.</p>'}</div>`)};

/* ===== 2) قفل الفترات / الأيام المغلقة ===== */
const lockDate=()=>(db.settings&&db.settings.lockDate)||'';
const closedDay=d=>ensure().closings.some(c=>c.date===d&&(c.scope||'all')==='all'&&c.status!=='void');
function locked(d){return !!d&&((lockDate()&&d<=lockDate())||closedDay(d))}
function reasonGate(label,fn){window.__gateFn=fn;window.__gateLbl=label;
  modal('تجاوز سجل مغلق',`<p>«${esc(label)}» يقع في فترة/يوم مغلق. سيُسجَّل التجاوز في سجل التدقيق.</p><label>سبب التجاوز (إلزامي)</label><input id="gt_r"><div class="actions"><button class="btn primary" onclick="gateOk()">متابعة</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`)}
window.gateOk=function(){const r=val('gt_r').trim();if(!r)return toast('اكتب السبب');const f=window.__gateFn;window.__gateFn=null;closeModal();log('locked_override',window.__gateLbl,r);if(f)f()};
function gate(date,label,fn){if(!locked(date))return fn();if(!can('close_edit'))return toast('«'+label+'» في فترة/يوم مغلق ولا يمكن تغييره');reasonGate(label,fn)}
/* للعمليات المرتبطة بحقول النافذة (تعديل): لا نفتح نافذة وسيطة كي لا تضيع المدخلات */
const blockedEdit=(date,label)=>{if(locked(date)){toast('«'+label+'» في فترة/يوم مغلق. ألغِ الإغلاق أو افتح الفترة أولًا (للمدير)');return true}return false};
window.ORVEX_FIN={locked,lockDate,closedDay};

/* ===== 3) الموافقات ===== */
const AK={void:'إلغاء فاتورة',expense_del:'حذف مصروف'};
function reqApproval(kind,ref,desc){ensure();
  if(db.approvals.some(a=>a.kind===kind&&a.ref===ref&&a.status==='pending'))return{dup:true};
  const a={id:uid(),kind,ref,desc,by:who(),at:new Date().toISOString(),status:'pending'};db.approvals.push(a);log('approval_request',AK[kind]+' '+desc,'',{a:{kind,ref}});save();return{ok:a}}
const needs=kind=>!adm()&&!window.__apprOk&&!!(db.settings&&(kind==='void'?db.settings.approveVoid:db.settings.approveExpDel));
function execApproval(a){window.__apprOk=true;try{if(a.kind==='void')voidSale(a.ref);else if(a.kind==='expense_del')delExpense(a.ref)}finally{window.__apprOk=false}}
const isDone=a=>a.kind==='void'?!!((db.sales.find(s=>s.id===a.ref)||{}).void||!db.sales.find(s=>s.id===a.ref)):!db.expenses.some(e=>e.id===a.ref);
function decide(id,ok,note){if(!adm())return{err:'للمدير فقط'};const a=ensure().approvals.find(x=>x.id===id);if(!a)return{err:'الطلب غير موجود'};if(a.status!=='pending')return{err:'الطلب مُعالَج مسبقًا'};
  a.status=ok?'approved':'rejected';a.decidedBy=who();a.decidedAt=new Date().toISOString();a.note=String(note||'').trim();log(ok?'approval_ok':'approval_no',AK[a.kind]+' '+a.desc,a.note);return{ok:a}}
window.ORVEX_FIN.reqApproval=reqApproval;window.ORVEX_FIN.decide=decide;window.ORVEX_FIN.needs=needs;
window.approvalsModal=function(){ensure();const L=db.approvals.slice().sort((a,b)=>a.at<b.at?1:-1).filter(a=>adm()||a.by===who()).slice(0,50);
  const ST={pending:'بانتظار المدير',approved:'معتمد',rejected:'مرفوض'};
  modal('الموافقات',L.length?`<div class="card">${L.map(a=>`<div class="row"><div class="grow"><div class="t">${esc(AK[a.kind]||a.kind)} — ${esc(a.desc)}</div><small>${esc(a.by)} — ${esc(fdate(a.at.slice(0,10)))}${a.decidedBy?' — '+esc(a.decidedBy):''}${a.note?' — '+esc(a.note):''}</small></div><div class="end"><span class="badge ${a.status==='pending'?'warn':a.status==='rejected'?'bad':''}">${ST[a.status]}</span>
   ${adm()&&a.status==='pending'?`<button class="btn" onclick="apOk('${jsq(a.id)}')">اعتماد</button><button class="btn ghost" onclick="apNo('${jsq(a.id)}')">رفض</button>`:''}${adm()&&a.status==='approved'&&!isDone(a)?`<button class="btn" onclick="apRun('${jsq(a.id)}')">تنفيذ</button>`:''}</div></div>`).join('')}</div>`:'<p class="muted">لا توجد طلبات.</p>')};
window.apOk=id=>{const r=decide(id,true,'');if(r.err)return toast(r.err);save();approvalsModal();execApproval(r.ok)};
window.apNo=id=>{const r=decide(id,false,'');if(r.err)return toast(r.err);save();approvalsModal();toast('تم الرفض')};
window.apRun=id=>{const a=db.approvals.find(x=>x.id===id);if(a&&a.status==='approved')execApproval(a)};

/* إلغاء الفواتير */
if(typeof voidSale==='function'){const _v=voidSale;voidSale=function(id){const s=db.sales.find(x=>x.id===id);if(!s)return _v(id);
  if(needs('void')){if(!can('void'))return _v(id);const r=reqApproval('void',id,s.no+' — '+s.total);return toast(r.dup?'الطلب بانتظار المدير':'أُرسل طلب الإلغاء لموافقة المدير')}
  gate(s.date,'إلغاء فاتورة '+s.no,()=>_v(id))}}
/* تعديل فاتورة */
if(typeof saveSaleEdit==='function'){const _e=saveSaleEdit;saveSaleEdit=function(id){const s=db.sales.find(x=>x.id===id);if(s&&blockedEdit(s.date,'تعديل فاتورة '+s.no))return;_e(id)}}
/* المصروفات */
if(typeof delExpense==='function'){const _d=delExpense;delExpense=function(id){const e=db.expenses.find(x=>x.id===id);if(!e)return _d(id);
  if(needs('expense_del')){const r=reqApproval('expense_del',id,(e.cat||'')+' — '+e.amount);return toast(r.dup?'الطلب بانتظار المدير':'أُرسل طلب الحذف لموافقة المدير')}
  gate(e.date,'حذف مصروف '+(e.cat||''),()=>{const b=Object.assign({},e);_d(id);log('expense_delete',e.cat||'',e.date+' | '+e.amount,{b,a:null})})}}
if(typeof saveExpense==='function'){const _x=saveExpense;saveExpense=function(id){if(!id)return _x(id);const e=db.expenses.find(x=>x.id===id);if(!e)return _x(id);
  if(blockedEdit(e.date,'تعديل مصروف '+(e.cat||'')))return;const b=Object.assign({},e);_x(id);const n=db.expenses.find(x=>x.id===id);
  if(n&&(n.amount!==b.amount||n.cat!==b.cat||n.date!==b.date))log('expense_edit',n.cat||'',b.amount+' ← '+n.amount,{b:{cat:b.cat,amount:b.amount,date:b.date},a:{cat:n.cat,amount:n.amount,date:n.date}})}}
/* مشتريات: منع تعديل فاتورة في فترة مغلقة + تدقيق */
if(typeof pinvSave==='function'){const _p=pinvSave;pinvSave=function(){const P=state.pinv,o=P&&P.mode==='edit'?db.purchases.find(x=>x.id===P.editId):null;
  if(o&&blockedEdit(o.date,'تعديل فاتورة شراء '+o.no))return;const b=o?{total:o.total,paid:o.paid,lines:o.lines.length}:null;_p();
  if(o){const n=db.purchases.find(x=>x.id===o.id);if(n&&n.total!==b.total)log('purchase_edit',n.no,b.total+' ← '+n.total,{b,a:{total:n.total,paid:n.paid,lines:n.lines.length}})}}}
/* المرتجعات: تسجيل تدقيق */
if(typeof doReturn==='function'){const _r=doReturn;doReturn=function(){const n0=db.returns.length;_r();if(db.returns.length>n0){const r=db.returns[db.returns.length-1];log('return',r.no,'فاتورة '+r.saleNo+' | '+r.total+' | '+(r.method==='balance'?'على الحساب':'نقدًا'),{a:{total:r.total,items:r.items.length,method:r.method}})}}}

/* ===== 4) إغلاق الصندوق v2 ===== */
const r2f=x=>r2(x);
const activeClosings=()=>ensure().closings.filter(c=>c.status!=='void');
lastClosing=function(){return activeClosings().filter(c=>!c.scope||c.scope==='all').sort((a,b)=>a.at<b.at?-1:1).slice(-1)[0]||null};
/* تكاليف الوصول المسدّدة نقدًا تدخل في خروج الصندوق لذلك اليوم */
const landedCash=d=>{let t=0;(db.purchases||[]).forEach(p=>(p.landed||[]).forEach(c=>{if(c.pay==='cash'&&(c.date||(c.t||'').slice(0,10))===d)t+=num(c.amount)}));return r2f(t)};
const _dr=dayReport;dayReport=function(date){const r=_dr(date),x=landedCash(date);if(x){r.exp=r2f(r.exp+x);r.cashOut=r2f(r.cashOut+x)}return r};
function reportFor(date,scope){if(!scope||scope==='all')return dayReport(date);
  const real=db;try{db=Object.assign({},real,{sales:real.sales.filter(s=>s.cashier===scope),returns:real.returns.filter(r=>r.cashier===scope),expenses:[],purchases:[],payments:[]});return dayReport(date)}finally{db=real}}
const CD={scope:'all'};
const findClosing=(d,scope)=>activeClosings().find(c=>c.date===d&&(c.scope||'all')===scope);
closeDayModal=function(scope){
  if(!can('close_day'))return toast('ليست لديك صلاحية إغلاق الصندوق');
  const d=today();CD.scope=typeof scope==='string'&&scope?scope:'all';
  const cashiers=[...new Set(db.sales.filter(s=>!s.void&&s.date===d).map(s=>s.cashier).filter(Boolean))];
  if(CD.scope!=='all'&&!cashiers.includes(CD.scope))CD.scope='all';
  const R=reportFor(d,CD.scope),done=findClosing(d,CD.scope),opening=done?done.opening:0;state.cd={R};
  const row=(a,b)=>`<div class="row"><span class="grow">${a}</span><span>${b}</span></div>`;
  modal('إغلاق الصندوق',`${done?`<div class="note">يوجد إغلاق معتمد لهذا النطاق (${esc(done.no)}). ${can('close_edit')?'تعديله يتطلب سببًا ويُسجَّل في التدقيق.':'تعديله يحتاج صلاحية خاصة.'}</div>`:''}
  <label>نطاق الإغلاق</label><select onchange="closeDayModal(this.value)"><option value="all" ${CD.scope==='all'?'selected':''}>كل المستخدمين (يُصفّر الصندوق)</option>${cashiers.map(c=>`<option ${c===CD.scope?'selected':''}>${esc(c)}</option>`).join('')}</select>
  ${CD.scope!=='all'?'<p class="muted" style="font-size:12.5px;margin:4px 0">إغلاق مستخدم: مبيعاته ومرتجعاته فقط، ولا يُصفّر الصندوق العام.</p>':''}
  <div class="card">${row('عدد الفواتير',R.count)}${row('إجمالي المبيعات',money(R.total))}${row('المرتجعات ('+R.retCount+')','- '+money(R.retTotal))}${row('مقبوض نقدًا من المبيعات',money(R.rcv.cash))}${row('دفعات العملاء',money(R.custPay))}${row('مرتجع نقدي',R.cashRet?'- '+money(R.cashRet):money(0))}${row('مصروفات ومشتريات مدفوعة',money(R.exp+R.purPaid+R.suppPay))}</div>
  <div class="f2"><div><label>رصيد بداية الصندوق</label><input id="cd_open" type="number" step="any" value="${opening}" oninput="cdCalc2()"></div><div><label>المتوقع</label><div id="cd_exp" style="font-weight:700;padding:10px 0"></div></div></div>
  <label>الرصيد الفعلي بعد العدّ (إلزامي)</label><input id="cd_cnt" type="number" inputmode="decimal" step="any" oninput="cdCalc2()" value="${done&&done.counted!==undefined?done.counted:''}">
  <p id="cd_diff" style="margin:6px 0"></p>
  <div id="cd_why" style="display:none"><label>سبب العجز/الزيادة (إلزامي)</label><input id="cd_dw" placeholder="مثال: خطأ فكّة، فاتورة غير مسجلة…"></div>
  ${done?'<label>سبب تعديل الإغلاق المعتمد (إلزامي)</label><input id="cd_am">':''}
  <label>ملاحظات</label><input id="cd_note" placeholder="اختياري">
  <div class="actions"><button class="btn primary" onclick="doCloseDay()">اعتماد الإغلاق</button></div>`);cdCalc2()};
window.cdCalc2=function(){const R=state.cd.R,o=num(val('cd_open')),exp=r2f(o+R.cashIn-R.cashOut),e=document.getElementById('cd_exp');if(e)e.textContent=money(exp);
  const c=val('cd_cnt'),dEl=document.getElementById('cd_diff'),w=document.getElementById('cd_why');if(!dEl)return;
  if(c===''){dEl.textContent='';if(w)w.style.display='none';return}
  const diff=r2f(num(c)-exp);dEl.innerHTML=Math.abs(diff)<0.004?'<b style="color:#2a7a3b">مطابق ✓</b>':(diff<0?'<b style="color:#b23f2d">عجز '+money(-diff)+'</b>':'<b style="color:#b8860b">زيادة '+money(diff)+'</b>');if(w)w.style.display=Math.abs(diff)<0.004?'none':'block'};
doCloseDay=function(){
  if(!can('close_day'))return toast('ليست لديك صلاحية إغلاق الصندوق');
  const d=today(),scope=CD.scope||'all',R=reportFor(d,scope),opening=num(val('cd_open')),expected=r2f(opening+R.cashIn-R.cashOut);
  if(val('cd_cnt')==='')return toast('أدخل الرصيد الفعلي بعد العدّ');
  const counted=r2f(num(val('cd_cnt'))),diff=r2f(counted-expected),dw=val('cd_dw').trim();
  if(Math.abs(diff)>=0.004&&!dw)return toast('اكتب سبب العجز/الزيادة');
  const old=findClosing(d,scope);let amend='';
  if(old){if(!can('close_edit'))return toast('الإغلاق معتمد ولا يمكن تعديله إلا بصلاحية خاصة');amend=val('cd_am').trim();if(!amend)return toast('اكتب سبب تعديل الإغلاق')}
  const c={id:old?old.id:uid(),no:old?old.no:'Z-'+(db.settings.nextZ||1),date:d,at:new Date().toISOString(),by:who(),opening,expected,counted,diff,diffWhy:dw,note:val('cd_note').trim(),scope,status:'approved',R};
  if(old){c.rev=(old.rev||[]).concat({t:c.at,by:c.by,reason:amend,b:{opening:old.opening,expected:old.expected,counted:old.counted,diff:old.diff,total:old.R&&old.R.total}});db.closings[db.closings.indexOf(old)]=c;
    log('closing_amend',c.no,amend+' | عدّ '+old.counted+' ← '+counted,{b:{opening:old.opening,expected:old.expected,counted:old.counted,diff:old.diff},a:{opening,expected,counted,diff}})}
  else{db.closings.push(c);db.settings.nextZ=(db.settings.nextZ||1)+1;log('closing',c.no,(scope==='all'?'الكل':scope)+' | متوقع '+expected+' | فعلي '+counted+' | فرق '+diff,{a:{expected,counted,diff,scope}})}
  save();render();showDayReport(c.id);toast(Math.abs(diff)<0.004?'تم اعتماد الإغلاق — مطابق':'تم اعتماد الإغلاق وسُجّل '+(diff<0?'العجز':'الزيادة'))};
/* إلغاء إغلاق (لا حذف): بصلاحية خاصة وسبب */
window.voidClosing=function(id){if(!can('close_edit'))return toast('تحتاج صلاحية خاصة');const c=db.closings.find(x=>x.id===id);if(!c||c.status==='void')return;
  modal('إلغاء إغلاق '+c.no,`<p>لن يُحذف التقرير؛ يُعلَّم ملغى ويعود الصندوق لحسابه قبل الإغلاق.</p><label>السبب (إلزامي)</label><input id="vc_r"><div class="actions"><button class="btn danger" onclick="voidClosingOk('${jsq(id)}')">إلغاء الإغلاق</button><button class="btn ghost" onclick="closeModal()">رجوع</button></div>`)};
window.voidClosingOk=function(id){const c=db.closings.find(x=>x.id===id),r=val('vc_r').trim();if(!c)return;if(!r)return toast('اكتب السبب');
  c.status='void';c.voidBy=who();c.voidAt=new Date().toISOString();c.voidWhy=r;log('closing_void',c.no,r,{b:{status:'approved',counted:c.counted,diff:c.diff},a:{status:'void'}});save();closeModal();render();toast('أُلغي الإغلاق')};
if(typeof showDayReport==='function'){const _s=showDayReport;showDayReport=function(id){_s(id);const c=db.closings.find(x=>x.id===id),a=document.querySelector('#modal .actions');if(!c||!a)return;
  const x=`<div class="no-print" style="font-size:13px;margin:8px 0">${c.counted!==undefined?`<div class="tot"><span>الرصيد الفعلي (العدّ)</span><b>${money(c.counted)}</b></div><div class="tot"><span>${c.diff<0?'عجز':c.diff>0?'زيادة':'الفرق'}</span><b style="color:${c.diff<0?'#b23f2d':c.diff>0?'#b8860b':'#2a7a3b'}">${money(Math.abs(c.diff||0))}</b></div>${c.diffWhy?'<div>السبب: '+esc(c.diffWhy)+'</div>':''}`:''}
  ${c.scope&&c.scope!=='all'?'<div>نطاق: '+esc(c.scope)+'</div>':''}${c.status==='void'?'<div style="color:#b23f2d"><b>ملغى</b> — '+esc(c.voidWhy||'')+'</div>':''}${(c.rev||[]).length?'<div style="margin-top:4px"><b>تعديلات:</b>'+c.rev.map(v=>'<div>'+esc(fdate(String(v.t).slice(0,10)))+' — '+esc(v.by)+' — '+esc(v.reason)+'</div>').join('')+'</div>':''}</div>`;
  a.insertAdjacentHTML('beforebegin',x);if(can('close_edit')&&c.status!=='void')a.insertAdjacentHTML('afterbegin',`<button class="btn danger no-print" onclick="voidClosing('${jsq(c.id)}')">إلغاء الإغلاق</button>`)}}

/* ===== إعدادات الرقابة ===== */
window.finOpen=function(){if(!adm())return toast('للمدير فقط');const s=db.settings,pend=ensure().approvals.filter(a=>a.status==='pending').length;
  modal('الرقابة المالية',`<label>إقفال الفترة حتى تاريخ (السجلات قبله لا تُلغى/تُعدَّل)</label><input id="fn_lock" type="date" value="${esc(s.lockDate||'')}">
  <label><input type="checkbox" id="fn_v" ${s.approveVoid?'checked':''}> إلغاء الفواتير يحتاج موافقة المدير (لغير المدير)</label>
  <label><input type="checkbox" id="fn_e" ${s.approveExpDel?'checked':''}> حذف المصروفات يحتاج موافقة المدير</label>
  <p class="muted" style="font-size:12.5px">تقديم قفل الفترة سهل؛ <b>تأخيره (فتح فترة مقفلة)</b> يتطلب سببًا ويُسجَّل. اليوم الذي له إغلاق صندوق معتمد يُعامَل مغلقًا تلقائيًا.</p>
  <label>سبب فتح الفترة (يلزم عند تأخير التاريخ)</label><input id="fn_why">
  <div class="actions"><button class="btn primary" onclick="finSave()">حفظ</button><button class="btn" onclick="approvalsModal()">الموافقات${pend?' ('+pend+')':''}</button><button class="btn" onclick="auditModal()">سجل التدقيق</button></div>`)};
window.finSave=function(){const s=db.settings,nl=val('fn_lock'),ol=s.lockDate||'';
  if(nl&&!/^\d{4}-\d{2}-\d{2}$/.test(nl))return toast('تاريخ غير صحيح');
  if(nl>today())return toast('لا يمكن الإقفال حتى تاريخ مستقبلي');
  if(ol&&(!nl||nl<ol)){const w=val('fn_why').trim();if(!w)return toast('اكتب سبب فتح الفترة');log('period_lock','',w,{b:{lockDate:ol},a:{lockDate:nl||''}})}
  else if(nl!==ol)log('period_lock','','إقفال',{b:{lockDate:ol},a:{lockDate:nl}});
  s.lockDate=nl;s.approveVoid=!!document.getElementById('fn_v').checked;s.approveExpDel=!!document.getElementById('fn_e').checked;save();closeModal();toast('تم الحفظ')};
})();
