/* ORVEX — التقسيط (ميزة installments): جدول أقساط فوق دين قائم للعميل (فاتورة آجلة).
   لا يُنشئ مسارًا ماليًا جديدًا: الدين موجود أصلًا في رصيد العميل، وكل قسط يُدفع يُسجَّل كدفعة عميل عادية
   (customer.balance ينقص + سجل في db.payments بنوع 'c')، فيظهر في الإغلاق اليومي ككل دفعة. بلا فوائد ولا غرامات.
   التخزين: db.installments (يُزامَن). */
(function(root){
'use strict';
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const pad=n=>String(n).padStart(2,'0');
function addMonths(ymd,m){
  const mt=/^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd||'');if(!mt)return null;
  let y=+mt[1],mo=+mt[2]-1+m,d=+mt[3];y+=Math.floor(mo/12);mo=((mo%12)+12)%12;
  return y+'-'+pad(mo+1)+'-'+pad(Math.min(d,new Date(Date.UTC(y,mo+1,0)).getUTCDate()));
}
function addDays(ymd,n){
  const t=Date.parse(ymd+'T00:00:00Z');if(!isFinite(t))return null;
  const d=new Date(t+n*86400000);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}
/* جدول أقساط متساوية؛ الفرق الناتج عن التقريب يُضاف إلى القسط الأخير لتطابق المجموع المبلغَ بالضبط */
function schedule(total,count,first,unit,every){
  total=r2(+total);count=Math.round(+count);
  if(!(total>0)||!(count>=1&&count<=120)||!/^\d{4}-\d{2}-\d{2}$/.test(first||''))return null;
  const step=Math.max(1,Math.round(+every||1));
  const base=Math.floor(total/count*100)/100,out=[];let sum=0;
  for(let i=0;i<count;i++){
    const due=unit==='days'?addDays(first,i*step):addMonths(first,i*step);if(!due)return null;
    const amt=i===count-1?r2(total-sum):base;sum=r2(sum+amt);
    out.push({n:i+1,due,amt,paid:0,paidAt:''});
  }
  return out;
}
const itemLeft=i=>r2(Math.max(0,i.amt-i.paid));
const planLeft=p=>r2((p.items||[]).reduce((s,i)=>s+itemLeft(i),0));
const planTotal=p=>r2((p.items||[]).reduce((s,i)=>s+i.amt,0));
const isOpen=p=>p.status==='active';
function itemState(i,today){return itemLeft(i)<=0.005?'paid':i.due<today?'overdue':'due'}
function planState(p,today){
  if(p.status==='cancelled')return'cancelled';if(p.status==='done')return'done';
  return(p.items||[]).some(i=>itemState(i,today)==='overdue')?'overdue':'active';
}
/* المتاح للتقسيط للعميل = رصيده المستحق − المتبقي على خططه النشطة الأخرى */
function available(balance,plans,cid){
  const used=(plans||[]).filter(p=>p.cid===cid&&isOpen(p)).reduce((s,p)=>s+planLeft(p),0);
  return r2(Math.max(0,(+balance||0)-used));
}
/* تطبيق مبلغ على قسط: لا يتجاوز المتبقي منه؛ يعيد المبلغ المطبَّق الفعلي */
function applyToItem(p,idx,amount,at){
  const i=(p.items||[])[idx];if(!i||!isOpen(p))return 0;
  const a=r2(Math.min(+amount||0,itemLeft(i)));if(!(a>0))return 0;
  i.paid=r2(i.paid+a);i.paidAt=at;
  if(planLeft(p)<=0.005)p.status='done';
  return a;
}
function filterList(plans,q,st,today,nameOf){
  q=String(q||'').trim().toLowerCase();
  return plans.filter(p=>(!st||(st==='open'?isOpen(p):planState(p,today)===st))&&(!q||[p.no,p.saleNo,nameOf?nameOf(p.cid):''].some(x=>String(x||'').toLowerCase().includes(q))));
}
const I={addMonths,addDays,schedule,itemLeft,planLeft,planTotal,itemState,planState,available,applyToItem,isOpen,filterList};
root.ORVEX_INST=I;
if(typeof module!=='undefined'&&module.exports)module.exports=I;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),L=()=>(db.installments=db.installments||[]);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.installments={fn:'installModal',label:'التقسيط'};
let F={q:'',st:'open'};
const allowed=()=>typeof can==='function'?can('parties'):true;
const rnd=()=>Math.random().toString(36).slice(2,5).toUpperCase();
const nameOf=cid=>(cust(cid)||{}).name||'—';
const ST={active:['جارٍ',''],overdue:['متأخر',''],done:['مكتمل','grey'],cancelled:['ملغى','grey']};
root.installModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  const t=today(),all=L(),od=all.filter(p=>planState(p,t)==='overdue').length;
  modal('التقسيط',`<input class="search" type="search" placeholder="ابحث: العميل أو رقم الخطة أو الفاتورة" value="${E(F.q)}" oninput="installQ(this.value)">
  ${chips([['open','جارية ('+all.filter(isOpen).length+')'],['overdue','متأخرة ('+od+')'],['done','مكتملة'],['','الكل ('+all.length+')']],F.st,'installF')}
  <div class="card" id="il">${listHtml()}</div><div class="actions"><button class="btn primary" onclick="installForm()">+ خطة تقسيط</button></div>`);
};
function listHtml(){
  const t=today(),l=filterList(L(),F.q,F.st,t,nameOf).sort((a,b)=>{const na=(a.items.find(i=>itemLeft(i)>0)||{due:'9'}).due,nb=(b.items.find(i=>itemLeft(i)>0)||{due:'9'}).due;return na.localeCompare(nb)}).slice(0,100);
  if(!l.length)return empty(L().length?'لا توجد نتائج':'لا توجد خطط. اضغط «خطة تقسيط».');
  return l.map(p=>{const s=planState(p,t),nx=p.items.find(i=>itemLeft(i)>0);
    return `<button class="row tap" onclick="installView('${jsq(p.id)}')"><div class="grow"><div class="t">${E(nameOf(p.cid))} <small>${E(p.no)}</small></div><small>متبقي ${money(planLeft(p))}${nx?' · القسط القادم '+E(nx.due):''}</small></div><span class="badge ${ST[s][1]}">${ST[s][0]}</span></button>`}).join('');
}
root.installQ=v=>{F.q=v;const l=document.getElementById('il');if(l)l.innerHTML=listHtml()};
root.installF=k=>{F.st=k;installModal()};
let draft={cid:''};
root.installForm=function(){
  const C=db.customers.filter(c=>available(c.balance,L(),c.id)>0.005);
  modal('خطة تقسيط جديدة',`<label>العميل (عليه دين غير مقسَّط)</label><select id="in_c" onchange="installPick(this.value)"><option value="">— اختر —</option>${C.map(c=>`<option value="${E(c.id)}" ${c.id===draft.cid?'selected':''}>${E(c.name)} — ${money(available(c.balance,L(),c.id))}</option>`).join('')}</select>
  ${C.length?'':'<p class="muted">لا يوجد عملاء عليهم دين متاح للتقسيط.</p>'}
  <div class="f2"><div><label>المبلغ المراد تقسيطه</label><input id="in_a" type="number" inputmode="decimal" step="any" oninput="installPrev()"></div><div><label>عدد الأقساط</label><input id="in_n" type="number" inputmode="numeric" value="6" oninput="installPrev()"></div></div>
  <div class="f2"><div><label>الدورية</label><select id="in_u" onchange="installPrev()"><option value="m">شهري</option><option value="w">أسبوعي</option><option value="d15">كل 15 يومًا</option></select></div><div><label>تاريخ أول قسط</label><input id="in_f" type="date" value="${addMonths(today(),1)}" onchange="installPrev()"></div></div>
  <label>رقم الفاتورة المرتبطة (اختياري)</label><input id="in_s" style="direction:ltr;text-align:left">
  <div id="in_p" class="note" style="margin-top:8px">—</div>
  <div class="actions"><button class="btn primary" onclick="installSave()">إنشاء الخطة</button><button class="btn ghost" onclick="installModal()">رجوع</button></div>`);
};
root.installPick=function(cid){
  draft.cid=cid;const c=cust(cid),a=document.getElementById('in_a');
  if(c&&a)a.value=available(c.balance,L(),cid);installPrev();
};
function params(){
  const g=id=>document.getElementById(id).value,u=g('in_u');
  return{cid:g('in_c'),amt:num(g('in_a')),n:parseInt(g('in_n'),10),first:g('in_f'),unit:u==='m'?'months':'days',every:u==='w'?7:u==='d15'?15:1};
}
root.installPrev=function(){
  const o=params(),c=cust(o.cid),el=document.getElementById('in_p');if(!el)return;
  const s=schedule(o.amt,o.n,o.first,o.unit,o.every);
  el.textContent=!s?'—':(s.length+' قسط × '+money(s[0].amt)+(s.length>1&&s[s.length-1].amt!==s[0].amt?' (الأخير '+money(s[s.length-1].amt)+')':'')+' — آخر قسط '+s[s.length-1].due+(c&&o.amt>available(c.balance,L(),o.cid)+0.005?' — أكبر من المتاح':''));
};
root.installSave=function(){
  if(!allowed())return;const o=params(),c=cust(o.cid);
  if(!c)return toast('اختر العميل');
  const av=available(c.balance,L(),c.id);
  if(!(o.amt>0)||o.amt>av+0.005)return toast('المبلغ يتجاوز المتاح للتقسيط: '+money(av));
  const items=schedule(o.amt,o.n,o.first,o.unit,o.every);if(!items)return toast('أدخل عدد أقساط (1–120) وتاريخًا صحيحين');
  const sn=document.getElementById('in_s').value.trim(),s=sn?db.sales.find(x=>String(x.no).toLowerCase()===sn.toLowerCase()):null;
  if(sn&&!s)return toast('رقم الفاتورة غير موجود');
  if(s&&s.cid!==c.id)return toast('الفاتورة لعميل آخر');
  const p={id:uid(),no:'INS-'+today().replace(/-/g,'').slice(2)+'-'+rnd(),cid:c.id,saleId:s?s.id:'',saleNo:s?s.no:'',at:new Date().toISOString(),status:'active',items,by:(curUser()||{}).name||''};
  L().push(p);save();toast('تم إنشاء الخطة');installView(p.id);
};
root.installView=function(id){
  const p=L().find(x=>x.id===id);if(!p)return;const t=today(),open=isOpen(p),c=cust(p.cid);
  modal('خطة '+p.no,`<div class="card"><div class="row"><span class="grow">العميل</span><b>${E(nameOf(p.cid))}</b></div>${p.saleNo?`<div class="row"><span class="grow">الفاتورة</span><b>${E(p.saleNo)}</b></div>`:''}<div class="row"><span class="grow">إجمالي الخطة</span><b>${money(planTotal(p))}</b></div><div class="row"><span class="grow">المتبقي</span><b>${money(planLeft(p))}</b></div><div class="row"><span class="grow">الحالة</span><b>${E(ST[planState(p,t)][0])}</b></div></div>
  <div class="card">${p.items.map((i,k)=>{const s=itemState(i,t);return `<div class="row"><div class="grow"><div class="t">القسط ${i.n} — ${E(i.due)}</div><small>${money(i.amt)}${i.paid>0&&s!=='paid'?' · مدفوع '+money(i.paid):''}${i.paidAt?' · '+E(String(i.paidAt).slice(0,10)):''}</small></div><span class="badge ${s==='paid'?'grey':''}">${s==='paid'?'مدفوع':s==='overdue'?'متأخر':'مستحق'}</span>${open&&s!=='paid'?`<button class="btn primary" onclick="installPay('${jsq(p.id)}',${k})">دفع</button>`:''}</div>`}).join('')}</div>
  <div class="actions">${open&&isAdmin()?`<button class="btn danger" onclick="installCancel('${jsq(p.id)}')">إلغاء الخطة</button>`:''}<button class="btn ghost" onclick="installModal()">رجوع</button></div>`);
};
root.installPay=function(pid,k){
  const p=L().find(x=>x.id===pid);if(!p||!isOpen(p))return;const i=p.items[k];if(!i)return;
  modal('دفع القسط '+i.n,`<p>المتبقي من القسط: <b>${money(itemLeft(i))}</b></p><label>المبلغ المستلم</label><input id="ip_a" type="number" inputmode="decimal" step="any" value="${itemLeft(i)}"><div class="actions"><button class="btn primary" onclick="installPayDo('${jsq(pid)}',${k})">تسجيل الدفعة</button><button class="btn ghost" onclick="installView('${jsq(pid)}')">رجوع</button></div>`);
};
root.installPayDo=function(pid,k){
  if(!allowed())return;const p=L().find(x=>x.id===pid);if(!p||!isOpen(p))return;
  const c=cust(p.cid);if(!c)return toast('العميل غير موجود');
  const want=num(document.getElementById('ip_a').value);if(!(want>0))return toast('أدخل مبلغًا صحيحًا');
  const at=new Date().toISOString(),a=applyToItem(p,k,want,at);
  if(!(a>0))return toast('لا مبلغ مطبَّق');
  /* نفس خطوتي recordPayment في parties.js بالضبط: الرصيد ثم سجل الدفعة */
  c.balance=r2(c.balance-a);
  db.payments.push({id:uid(),type:'c',pid:c.id,amount:a,at,date:today(),inst:p.id});
  save();if(typeof render==='function')render();toast('تم تسجيل الدفعة');installView(pid);
};
root.installCancel=id=>{
  if(!isAdmin())return;
  askConfirm('إلغاء الخطة؟ تبقى الدفعات المسجلة ويبقى الدين على العميل كما هو.',()=>{const p=L().find(x=>x.id===id);if(p&&isOpen(p)){p.status='cancelled';save();installModal()}},'إلغاء الخطة');
};
})(typeof window!=='undefined'?window:globalThis);
