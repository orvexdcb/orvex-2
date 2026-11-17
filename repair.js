/* ORVEX — أوامر الصيانة (ميزة repair_orders): استلام جهاز، متابعة الحالة، التسليم، وربط تلقائي بالضمان عبر الرقم التسلسلي.
   التخزين: db.repairs (يُزامَن). لا قيود محاسبية تلقائية: السعر النهائي يُسجَّل للمتابعة فقط. */
(function(root){
'use strict';
const STATUS={received:'مستلم',diagnosing:'قيد الفحص',repairing:'قيد الإصلاح',ready:'جاهز للتسليم',delivered:'مسلَّم',cancelled:'ملغى'};
const NEXT={received:['diagnosing','repairing','cancelled'],diagnosing:['repairing','ready','cancelled'],repairing:['ready','cancelled'],ready:['delivered','repairing'],delivered:[],cancelled:[]};
const OPEN=s=>s!=='delivered'&&s!=='cancelled';
/* ضمان ساري لرقم تسلسلي (يطابق بلا حساسية لحالة الأحرف)؛ يعيد السجل أو null */
function warrantyFor(sn,list,today){
  const k=String(sn||'').trim().toLowerCase();if(!k)return null;
  return (list||[]).find(w=>String(w.sn||'').trim().toLowerCase()===k&&w.end&&w.end>=today)||null;
}
function canMove(from,to){return (NEXT[from]||[]).includes(to)}
function move(r,to,by,at){
  if(!r||!canMove(r.status,to))return false;
  r.hist=(r.hist||[]).concat([{at,by:by||'',from:r.status,to}]).slice(-40);r.status=to;
  if(to==='delivered')r.deliveredAt=at;return true;
}
function filterList(list,q,st){
  q=String(q||'').trim().toLowerCase();
  return list.filter(r=>(!st||(st==='open'?OPEN(r.status):r.status===st))&&(!q||[r.no,r.device,r.sn,r.custName,r.phone,r.issue].some(x=>String(x||'').toLowerCase().includes(q))));
}
const R={STATUS,NEXT,warrantyFor,canMove,move,filterList,OPEN};
root.ORVEX_REPAIR=R;
if(typeof module!=='undefined'&&module.exports)module.exports=R;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),L=()=>(db.repairs=db.repairs||[]);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.repair_orders={fn:'repairModal',label:'أوامر الصيانة'};
let F={q:'',st:'open'};
const allowed=()=>typeof can==='function'?can('invoices'):true;
const rnd=()=>Math.random().toString(36).slice(2,6).toUpperCase();
root.repairModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  const all=L(),open=all.filter(r=>OPEN(r.status)).length;
  modal('أوامر الصيانة',`<input class="search" type="search" placeholder="ابحث: الرقم، الجهاز، IMEI، العميل، الهاتف" value="${E(F.q)}" oninput="repairQ(this.value)">
  ${chips([['open','مفتوحة ('+open+')'],['ready','جاهزة'],['delivered','مسلّمة'],['','الكل ('+all.length+')']],F.st,'repairF')}
  <div class="card" id="rl">${listHtml()}</div><div class="actions"><button class="btn primary" onclick="repairForm()">+ استلام جهاز</button></div>`);
};
function listHtml(){
  const l=filterList(L(),F.q,F.st).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,120);
  if(!l.length)return empty(L().length?'لا توجد نتائج':'لا توجد أوامر صيانة. اضغط «استلام جهاز».');
  return l.map(r=>`<button class="row tap" onclick="repairView('${jsq(r.id)}')"><div class="grow"><div class="t">${E(r.device)} <small>${E(r.no)}</small></div><small>${E(r.custName||'—')}${r.phone?' · '+E(r.phone):''} · ${E(r.date)}</small></div><div class="end"><span class="badge ${OPEN(r.status)?'':'grey'}">${E(STATUS[r.status]||r.status)}</span>${r.underWarranty?'<br><small>تحت الضمان</small>':''}</div></button>`).join('');
}
root.repairQ=v=>{F.q=v;const l=document.getElementById('rl');if(l)l.innerHTML=listHtml()};
root.repairF=k=>{F.st=k;repairModal()};
root.repairForm=function(){
  modal('استلام جهاز للصيانة',`<label>الجهاز (النوع والموديل)</label><input id="rp_d"><label>IMEI / الرقم التسلسلي (اختياري)</label><input id="rp_sn" style="direction:ltr;text-align:left">
  <div class="f2"><div><label>اسم العميل</label><input id="rp_c"></div><div><label>الهاتف</label><input id="rp_p" type="tel"></div></div>
  <label>وصف العطل</label><textarea id="rp_i" rows="3" style="width:100%"></textarea>
  <label>التكلفة التقديرية (اختياري)</label><input id="rp_e" type="number" inputmode="decimal" step="any">
  <div class="actions"><button class="btn primary" onclick="repairSave()">حفظ</button><button class="btn ghost" onclick="repairModal()">رجوع</button></div>`);
};
root.repairSave=function(){
  const v=i=>document.getElementById(i).value.trim(),device=v('rp_d');
  if(!device)return toast('أدخل الجهاز');if(!v('rp_i'))return toast('صف العطل');
  const sn=v('rp_sn'),w=warrantyFor(sn,db.warranties,today()),est=num(v('rp_e'));
  const r={id:uid(),no:'REP-'+today().replace(/-/g,'').slice(2)+'-'+rnd(),at:new Date().toISOString(),date:today(),device,sn,custName:v('rp_c'),phone:v('rp_p'),issue:v('rp_i'),est:est>0?est:0,status:'received',underWarranty:!!w,warrantyId:w?w.id:'',by:(curUser()||{}).name||'',hist:[]};
  L().push(r);save();toast(w?'تم الحفظ — الجهاز تحت الضمان':'تم الحفظ');repairView(r.id);
};
root.repairView=function(id){
  const r=L().find(x=>x.id===id);if(!r)return;
  const mv=(NEXT[r.status]||[]).map(s=>`<button class="btn ${s==='cancelled'?'danger':s==='delivered'?'primary':''}" onclick="repairMove('${jsq(r.id)}','${s}')">${E(STATUS[s])}</button>`).join('');
  modal('أمر صيانة '+r.no,`<div class="card"><div class="row"><span class="grow">الجهاز</span><b>${E(r.device)}</b></div>${r.sn?`<div class="row"><span class="grow">SN/IMEI</span><b>${E(r.sn)}</b></div>`:''}<div class="row"><span class="grow">العميل</span><b>${E(r.custName||'—')} ${E(r.phone||'')}</b></div><div class="row"><span class="grow">الحالة</span><b>${E(STATUS[r.status])}</b></div>${r.underWarranty?'<div class="row"><span class="grow">الضمان</span><b>ساري وقت الاستلام</b></div>':''}<div class="row"><span class="grow">التقديرية</span><b>${r.est?money(r.est):'—'}</b></div>${r.final!=null?`<div class="row"><span class="grow">السعر النهائي</span><b>${money(r.final)}</b></div>`:''}</div>
  <div class="card"><b>العطل</b><p style="white-space:pre-wrap;margin:6px 0">${E(r.issue)}</p>${r.note?`<b>ملاحظات الفني</b><p style="white-space:pre-wrap;margin:6px 0">${E(r.note)}</p>`:''}</div>
  ${OPEN(r.status)?`<label>ملاحظات الفني</label><input id="rv_n" value="${E(r.note||'')}"><label>السعر النهائي</label><input id="rv_f" type="number" inputmode="decimal" step="any" value="${r.final!=null?r.final:''}"><div class="actions"><button class="btn" onclick="repairNote('${jsq(r.id)}')">حفظ الملاحظة والسعر</button></div>`:''}
  <div class="actions">${mv}</div>${(r.hist||[]).length?`<h4>السجل</h4>${r.hist.slice().reverse().map(h=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #ddd">${E(String(h.at).slice(0,16).replace('T',' '))} — ${E(STATUS[h.from]||h.from)} ← ${E(STATUS[h.to]||h.to)} ${E(h.by)}</div>`).join('')}`:''}
  <div class="actions"><button class="btn ghost" onclick="repairModal()">رجوع</button></div>`);
};
root.repairNote=function(id){
  const r=L().find(x=>x.id===id);if(!r||!OPEN(r.status))return;
  r.note=document.getElementById('rv_n').value.trim();const f=document.getElementById('rv_f').value;
  if(f!==''){const n=num(f);if(n<0)return toast('سعر غير صالح');r.final=n}
  save();toast('تم الحفظ');repairView(id);
};
root.repairMove=function(id,to){
  const r=L().find(x=>x.id===id);if(!r)return;
  const go=()=>{if(move(r,to,(curUser()||{}).name,new Date().toISOString())){save();toast('تم تغيير الحالة');repairView(id)}else toast('انتقال غير مسموح')};
  if(to==='cancelled'||to==='delivered')return askConfirm(to==='delivered'?'تأكيد تسليم الجهاز للعميل؟':'إلغاء أمر الصيانة؟',go,to==='delivered'?'تسليم':'إلغاء الأمر');
  go();
};
})(typeof window!=='undefined'?window:globalThis);
