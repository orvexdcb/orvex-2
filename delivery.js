/* ORVEX — أوامر التوصيل (ميزة delivery_orders): طلب توصيل (اختياريًا مرتبط بفاتورة)، تعيين سائق، متابعة الحالة.
   التخزين: db.deliveries (يُزامَن). أجرة التوصيل تُسجَّل للمتابعة فقط ولا تدخل المحاسبة. */
(function(root){
'use strict';
const STATUS={pending:'بانتظار التجهيز',assigned:'عُيّن سائق',out:'في الطريق',delivered:'تم التسليم',failed:'تعذّر التسليم',cancelled:'ملغى'};
const NEXT={pending:['assigned','out','cancelled'],assigned:['out','pending','cancelled'],out:['delivered','failed'],failed:['pending','cancelled'],delivered:[],cancelled:[]};
const OPEN=s=>s!=='delivered'&&s!=='cancelled';
const canMove=(a,b)=>(NEXT[a]||[]).includes(b);
function move(d,to,by,at){
  if(!d||!canMove(d.status,to))return false;
  d.hist=(d.hist||[]).concat([{at,by:by||'',from:d.status,to}]).slice(-40);d.status=to;
  if(to==='delivered')d.deliveredAt=at;return true;
}
/* فاتورة بالرقم (بلا حساسية لحالة الأحرف) لتعبئة العميل والمبلغ؛ null إن لم توجد */
function saleByNo(sales,no){
  const k=String(no||'').trim().toLowerCase();if(!k)return null;
  return (sales||[]).find(s=>String(s.no||'').toLowerCase()===k)||null;
}
function filterList(list,q,st){
  q=String(q||'').trim().toLowerCase();
  return list.filter(d=>(!st||(st==='open'?OPEN(d.status):d.status===st))&&(!q||[d.no,d.saleNo,d.custName,d.phone,d.address,d.driver].some(x=>String(x||'').toLowerCase().includes(q))));
}
const D={STATUS,NEXT,OPEN,canMove,move,saleByNo,filterList};
root.ORVEX_DELIVERY=D;
if(typeof module!=='undefined'&&module.exports)module.exports=D;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),L=()=>(db.deliveries=db.deliveries||[]);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.delivery_orders={fn:'deliveryModal',label:'أوامر التوصيل'};
let F={q:'',st:'open'};
const allowed=()=>typeof can==='function'?can('invoices'):true;
const rnd=()=>Math.random().toString(36).slice(2,6).toUpperCase();
root.deliveryModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  const all=L(),open=all.filter(d=>OPEN(d.status)).length;
  modal('أوامر التوصيل',`<input class="search" type="search" placeholder="ابحث: الرقم، الفاتورة، العميل، الهاتف، العنوان، السائق" value="${E(F.q)}" oninput="deliveryQ(this.value)">
  ${chips([['open','مفتوحة ('+open+')'],['out','في الطريق'],['delivered','مسلّمة'],['','الكل ('+all.length+')']],F.st,'deliveryF')}
  <div class="card" id="dl">${listHtml()}</div><div class="actions"><button class="btn primary" onclick="deliveryForm()">+ طلب توصيل</button></div>`);
};
function listHtml(){
  const l=filterList(L(),F.q,F.st).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,120);
  if(!l.length)return empty(L().length?'لا توجد نتائج':'لا توجد طلبات توصيل. اضغط «طلب توصيل».');
  return l.map(d=>`<button class="row tap" onclick="deliveryView('${jsq(d.id)}')"><div class="grow"><div class="t">${E(d.custName||'—')} <small>${E(d.no)}</small></div><small>${E(d.address)}${d.driver?' · '+E(d.driver):''}</small></div><span class="badge ${OPEN(d.status)?'':'grey'}">${E(STATUS[d.status]||d.status)}</span></button>`).join('');
}
root.deliveryQ=v=>{F.q=v;const l=document.getElementById('dl');if(l)l.innerHTML=listHtml()};
root.deliveryF=k=>{F.st=k;deliveryModal()};
root.deliveryForm=function(){
  modal('طلب توصيل',`<label>رقم الفاتورة (اختياري — يعبّئ العميل تلقائيًا)</label><input id="dv_s" style="direction:ltr;text-align:left" onchange="deliveryFill(this.value)">
  <div class="f2"><div><label>اسم العميل</label><input id="dv_c"></div><div><label>الهاتف</label><input id="dv_p" type="tel"></div></div>
  <label>العنوان</label><textarea id="dv_a" rows="2" style="width:100%"></textarea>
  <div class="f2"><div><label>السائق (اختياري)</label><input id="dv_d"></div><div><label>أجرة التوصيل (اختياري)</label><input id="dv_f" type="number" inputmode="decimal" step="any"></div></div>
  <label>ملاحظات</label><input id="dv_n">
  <div class="actions"><button class="btn primary" onclick="deliverySave()">حفظ</button><button class="btn ghost" onclick="deliveryModal()">رجوع</button></div>`);
};
root.deliveryFill=function(no){
  const s=saleByNo(db.sales,no);if(!s)return;const c=cust(s.cid);
  if(c){const n=document.getElementById('dv_c'),p=document.getElementById('dv_p'),a=document.getElementById('dv_a');
    if(n&&!n.value)n.value=c.name||'';if(p&&!p.value)p.value=c.phone||'';if(a&&!a.value)a.value=c.address||''}
  toast('تم العثور على الفاتورة '+s.no);
};
root.deliverySave=function(){
  const v=i=>document.getElementById(i).value.trim(),addr=v('dv_a');
  if(!addr)return toast('أدخل العنوان');if(!v('dv_c')&&!v('dv_p'))return toast('أدخل اسم العميل أو هاتفه');
  const s=saleByNo(db.sales,v('dv_s')),fee=num(v('dv_f'));
  if(v('dv_s')&&!s)return toast('رقم الفاتورة غير موجود');
  const d={id:uid(),no:'DLV-'+today().replace(/-/g,'').slice(2)+'-'+rnd(),at:new Date().toISOString(),date:today(),saleId:s?s.id:'',saleNo:s?s.no:'',custName:v('dv_c'),phone:v('dv_p'),address:addr,driver:v('dv_d'),fee:fee>0?fee:0,note:v('dv_n'),status:v('dv_d')?'assigned':'pending',by:(curUser()||{}).name||'',hist:[]};
  L().push(d);save();toast('تم الحفظ');deliveryView(d.id);
};
root.deliveryView=function(id){
  const d=L().find(x=>x.id===id);if(!d)return;
  const mv=(NEXT[d.status]||[]).map(s=>`<button class="btn ${s==='cancelled'||s==='failed'?'danger':s==='delivered'?'primary':''}" onclick="deliveryMove('${jsq(d.id)}','${s}')">${E(STATUS[s])}</button>`).join('');
  modal('توصيل '+d.no,`<div class="card"><div class="row"><span class="grow">العميل</span><b>${E(d.custName||'—')} ${E(d.phone||'')}</b></div><div class="row"><span class="grow">العنوان</span><b>${E(d.address)}</b></div>${d.saleNo?`<div class="row"><span class="grow">الفاتورة</span><b>${E(d.saleNo)}</b></div>`:''}<div class="row"><span class="grow">الحالة</span><b>${E(STATUS[d.status])}</b></div><div class="row"><span class="grow">السائق</span><b>${E(d.driver||'—')}</b></div><div class="row"><span class="grow">الأجرة</span><b>${d.fee?money(d.fee):'—'}</b></div>${d.note?`<div class="row"><span class="grow">ملاحظات</span><b>${E(d.note)}</b></div>`:''}</div>
  ${OPEN(d.status)?`<label>السائق</label><input id="dv_dd" value="${E(d.driver||'')}"><div class="actions"><button class="btn" onclick="deliveryDriver('${jsq(d.id)}')">حفظ السائق</button></div>`:''}
  <div class="actions">${mv}</div>${(d.hist||[]).length?`<h4>السجل</h4>${d.hist.slice().reverse().map(h=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #ddd">${E(String(h.at).slice(0,16).replace('T',' '))} — ${E(STATUS[h.from]||h.from)} ← ${E(STATUS[h.to]||h.to)} ${E(h.by)}</div>`).join('')}`:''}
  <div class="actions"><button class="btn ghost" onclick="deliveryModal()">رجوع</button></div>`);
};
root.deliveryDriver=function(id){
  const d=L().find(x=>x.id===id);if(!d||!OPEN(d.status))return;
  d.driver=document.getElementById('dv_dd').value.trim();
  if(d.driver&&d.status==='pending')move(d,'assigned',(curUser()||{}).name,new Date().toISOString());
  save();toast('تم الحفظ');deliveryView(id);
};
root.deliveryMove=function(id,to){
  const d=L().find(x=>x.id===id);if(!d)return;
  const go=()=>{if(move(d,to,(curUser()||{}).name,new Date().toISOString())){save();toast('تم تغيير الحالة');deliveryView(id)}else toast('انتقال غير مسموح')};
  if(to==='cancelled'||to==='delivered'||to==='failed')return askConfirm(to==='delivered'?'تأكيد تسليم الطلب للعميل؟':to==='failed'?'تسجيل تعذّر التسليم؟':'إلغاء طلب التوصيل؟',go,to==='delivered'?'تسليم':'تأكيد');
  go();
};
})(typeof window!=='undefined'?window:globalThis);
