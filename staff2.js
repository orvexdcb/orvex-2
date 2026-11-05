/* ORVEX — الموظفون والرواتب (staff2.js). للمدير فقط. يتزامن عبر records بنوعي employees وpayroll.
   صرف الراتب يُنشئ مصروفًا بتصنيف «رواتب» فيظهر في التقارير والإغلاق. معرّفات الصرف ثابتة (موظف+شهر) فلا يتكرر الصرف من جهازين. */
(function(){
'use strict';
const emps=()=>db.employees||(db.employees=[]),pays=()=>db.payroll||(db.payroll=[]);
const curM=()=>today().slice(0,7);
const eid=(e,m)=>'pay-'+e+'-'+m;
const salary=v=>Math.max(0,r2(num(v)));
const L=(a,r,d)=>{if(window.orvexLog)orvexLog(a,r,d)};

window.staffOpen=function(){
  if(!isAdmin())return toast('للمدير فقط');
  const E=emps().slice().sort((a,b)=>(b.active!==false)-(a.active!==false)||String(a.name).localeCompare(String(b.name),'ar'));
  modal('الموظفون',`<div class="card">${E.length?E.map(e=>`<div class="row" onclick="empForm('${jsq(e.id)}')"><div class="grow"><div class="t">${esc(e.name)} ${e.active===false?'<span class="badge">موقوف</span>':''}</div><small>${esc(e.job||'')} ${e.phone?'— '+esc(e.phone):''}</small></div><div class="end"><b>${money(e.salary||0)}</b></div></div>`).join(''):'<p class="muted">لا يوجد موظفون بعد.</p>'}</div>
  <div class="actions"><button class="btn primary" onclick="empForm()">+ موظف</button><button class="btn" onclick="payrollOpen()">💵 صرف الرواتب</button></div>`)};

window.empForm=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const e=id?emps().find(x=>x.id===id):{name:'',job:'',phone:'',salary:'',hired:today(),active:true,note:''};if(!e)return;
  modal(id?'تعديل موظف':'موظف جديد',`<label>الاسم</label><input id="em_n" value="${esc(e.name)}"><label>الوظيفة</label><input id="em_j" value="${esc(e.job||'')}">
  <label>الهاتف</label><input id="em_p" type="tel" value="${esc(e.phone||'')}"><label>الراتب الشهري</label><input id="em_s" type="number" inputmode="decimal" value="${e.salary??''}">
  <label>تاريخ التعيين</label><input id="em_h" type="date" value="${esc(e.hired||'')}"><label>ملاحظة</label><input id="em_t" value="${esc(e.note||'')}">
  <label class="pchk" style="border:0"><input type="checkbox" id="em_a" ${e.active!==false?'checked':''}> على رأس العمل</label>
  <div class="actions"><button class="btn primary" onclick="empSave('${jsq(id||'')}')">حفظ</button><button class="btn ghost" onclick="staffOpen()">رجوع</button></div>`)};

window.empSave=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const name=$('#em_n').value.trim();if(!name)return toast('أدخل الاسم');
  const o={name,job:$('#em_j').value.trim(),phone:$('#em_p').value.trim(),salary:salary($('#em_s').value),hired:$('#em_h').value,note:$('#em_t').value.trim(),active:$('#em_a').checked};
  if(emps().some(x=>x.id!==id&&lc(x.name)===lc(name)))return toast('يوجد موظف بنفس الاسم');
  if(id){const e=emps().find(x=>x.id===id);if(!e)return;const os=e.salary;Object.assign(e,o);L('emp_edit',name,os!==o.salary?'الراتب '+os+'←'+o.salary:'')}
  else{emps().push(Object.assign({id:uid()},o));L('emp_add',name,'راتب '+o.salary)}
  save();toast('تم الحفظ');staffOpen()};
const lc=s=>String(s==null?'':s).trim().toLowerCase();

/* ---- كشف الرواتب الشهري ---- */
window.payrollOpen=function(m){
  if(!isAdmin())return toast('للمدير فقط');
  m=m||window.__prm||curM();window.__prm=m;
  const E=emps().filter(e=>e.active!==false),P=pays().filter(p=>p.month===m);
  const tot=r2(P.reduce((a,p)=>a+num(p.net),0));
  modal('رواتب شهر '+m,`<input type="month" value="${esc(m)}" onchange="payrollOpen(this.value)">
  <div class="card" style="margin-top:8px">${E.length?E.map(e=>{const p=P.find(x=>x.emp===e.id);
    return p?`<div class="row"><div class="grow"><div class="t">${esc(e.name)}</div><small>صُرف ${esc(fdate(p.date))} — أساسي ${p.base} + مكافأة ${p.bonus} − خصم ${p.deduct}</small></div><div class="end"><b>${money(p.net)}</b><br><button class="btn" onclick="payCancel('${jsq(p.id)}')">إلغاء</button></div></div>`
    :`<div class="card" style="margin:6px 0"><div class="t">${esc(e.name)} <small>أساسي ${money(e.salary||0)}</small></div>
      <div class="f2"><div><label>مكافأة</label><input id="pb_${esc(e.id)}" type="number" inputmode="decimal" placeholder="0"></div><div><label>خصم/سلفة</label><input id="pd_${esc(e.id)}" type="number" inputmode="decimal" placeholder="0"></div></div>
      <button class="btn primary" onclick="payEmp('${jsq(e.id)}','${jsq(m)}')">صرف الراتب</button></div>`}).join(''):'<p class="muted">أضف موظفين أولًا.</p>'}</div>
  <p class="muted">المصروف هذا الشهر: <b>${money(tot)}</b></p><div class="actions"><button class="btn ghost" onclick="staffOpen()">رجوع</button></div>`)};

window.payEmp=function(empId,m){
  if(!isAdmin())return toast('للمدير فقط');
  const e=emps().find(x=>x.id===empId);if(!e)return toast('الموظف غير موجود');
  if(pays().some(p=>p.id===eid(empId,m)))return toast('صُرف راتب هذا الشهر مسبقًا');
  const base=salary(e.salary),bonus=salary(($('#pb_'+empId)||{}).value),ded=salary(($('#pd_'+empId)||{}).value),net=r2(base+bonus-ded);
  if(!(net>0))return toast('صافي الراتب يجب أن يكون أكبر من صفر');
  const id=eid(empId,m);
  pays().push({id,emp:empId,name:e.name,month:m,base,bonus,deduct:ded,net,date:today(),by:(curUser()||{}).name||''});
  db.expenses.push({id:'exp-'+id,cat:'رواتب',amount:net,date:today(),note:'راتب '+e.name+' — '+m});
  L('payroll_pay',e.name,m+' | الصافي '+net);save();toast('تم صرف الراتب');payrollOpen(m)};

window.payCancel=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const p=pays().find(x=>x.id===id);if(!p)return;
  askConfirm('إلغاء صرف راتب «'+p.name+'» لشهر '+p.month+'؟ سيُحذف المصروف المرتبط به.',()=>{
    db.payroll=pays().filter(x=>x.id!==id);db.expenses=db.expenses.filter(x=>x.id!=='exp-'+id);
    L('payroll_cancel',p.name,p.month+' | '+p.net);save();toast('أُلغي الصرف');payrollOpen(p.month)})};

const _vp=vParties;vParties=function(){return _vp()+(isAdmin()?`<div class="actions"><button class="btn" onclick="staffOpen()">👥 الموظفون والرواتب</button></div>`:'')};
window.ORVEX_STAFF={emps,pays,eid};
})();
