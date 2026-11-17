/* ORVEX — أوامر الخدمة (service_orders) وأعمال الطباعة (print_services): محرك أوامر عمل مشترك بإعدادين.
   كل أمر: عميل، حقول خاصة بنوعه، حالات بانتقالات مسموحة فقط، سجل تغييرات، بحث وتصفية.
   الأسعار والمقدّم للمتابعة فقط ولا تدخل المحاسبة. التخزين: db.sorders و db.pjobs (يُزامَنان). */
(function(root){
'use strict';
const CFG={
  service:{coll:'sorders',prefix:'SRV',title:'أوامر الخدمة',fn:'serviceModal',code:'service_orders',dueKey:'when',
    STATUS:{new:'جديد',scheduled:'مجدول',progress:'قيد التنفيذ',done:'منجَز',cancelled:'ملغى'},
    NEXT:{new:['scheduled','progress','cancelled'],scheduled:['progress','new','cancelled'],progress:['done','scheduled'],done:[],cancelled:[]},
    END:['done','cancelled'],
    fields:[{k:'custName',l:'اسم العميل',t:'text'},{k:'phone',l:'الهاتف',t:'tel'},{k:'service',l:'الخدمة المطلوبة',t:'area',req:1},{k:'address',l:'الموقع / العنوان',t:'text'},{k:'when',l:'موعد التنفيذ',t:'date'},{k:'worker',l:'الفني / المنفّذ',t:'text'},{k:'price',l:'السعر المتفق عليه',t:'number'},{k:'note',l:'ملاحظات',t:'text'}],
    title1:o=>o.service,sub:o=>[o.custName,o.when,o.worker].filter(Boolean).join(' · '),search:['no','custName','phone','service','address','worker']},
  print:{coll:'pjobs',prefix:'PRT',title:'أعمال الطباعة',fn:'printJobsModal',code:'print_services',dueKey:'due',
    STATUS:{new:'جديد',design:'قيد التصميم',printing:'قيد الطباعة',ready:'جاهز',delivered:'مسلَّم',cancelled:'ملغى'},
    NEXT:{new:['design','printing','cancelled'],design:['printing','cancelled'],printing:['ready'],ready:['delivered'],delivered:[],cancelled:[]},
    END:['delivered','cancelled'],
    fields:[{k:'custName',l:'اسم العميل',t:'text'},{k:'phone',l:'الهاتف',t:'tel'},{k:'job',l:'نوع العمل (بنر، كروت، ختم…)',t:'text',req:1},{k:'qty',l:'الكمية',t:'number'},{k:'size',l:'المقاس / الخامة',t:'text'},{k:'due',l:'موعد التسليم',t:'date'},{k:'price',l:'السعر المتفق عليه',t:'number'},{k:'deposit',l:'المقدّم المستلم',t:'number'},{k:'note',l:'ملاحظات',t:'text'}],
    title1:o=>o.job+(o.qty?' × '+o.qty:''),sub:o=>[o.custName,o.due?'تسليم '+o.due:''].filter(Boolean).join(' · '),search:['no','custName','phone','job','size']}
};
const isEnd=(c,s)=>c.END.includes(s);
const canMove=(c,a,b)=>(c.NEXT[a]||[]).includes(b);
function move(c,o,to,by,at){
  if(!o||!canMove(c,o.status,to))return false;
  o.hist=(o.hist||[]).concat([{at,by:by||'',from:o.status,to}]).slice(-40);o.status=to;return true;
}
/* متأخر: مفتوح وموعده قبل اليوم */
const overdue=(c,o,today)=>!isEnd(c,o.status)&&!!o[c.dueKey]&&o[c.dueKey]<today;
function filterList(c,list,q,st,today){
  q=String(q||'').trim().toLowerCase();
  return list.filter(o=>{
    const okS=!st||(st==='open'?!isEnd(c,o.status):st==='overdue'?overdue(c,o,today):st==='today'?!isEnd(c,o.status)&&o[c.dueKey]===today:o.status===st);
    return okS&&(!q||c.search.some(k=>String(o[k]||'').toLowerCase().includes(q)));
  });
}
/* تنظيف قيم النموذج: حقول مطلوبة، أرقام غير سالبة، تواريخ صحيحة؛ يعيد {o} أو {err} */
function clean(c,raw){
  const o={};
  for(const f of c.fields){
    let v=raw[f.k];v=v==null?'':String(v).trim();
    if(f.req&&!v)return{err:'أدخل: '+f.l};
    if(!v)continue;
    if(f.t==='number'){const n=parseFloat(v);if(!isFinite(n)||n<0)return{err:'قيمة غير صالحة: '+f.l};o[f.k]=n}
    else if(f.t==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return{err:'تاريخ غير صالح: '+f.l};o[f.k]=v}
    else o[f.k]=v.slice(0,300);
  }
  if(!o.custName&&!o.phone)return{err:'أدخل اسم العميل أو هاتفه'};
  return{o};
}
const J={CFG,isEnd,canMove,move,overdue,filterList,clean};
root.ORVEX_JOBS=J;
if(typeof module!=='undefined'&&module.exports)module.exports=J;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),allowed=()=>typeof can==='function'?can('invoices'):true;
const rnd=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const me=()=>(curUser()||{}).name||'';
root.JOBS={};
Object.keys(CFG).forEach(key=>{
  const c=CFG[key],L=()=>(db[c.coll]=db[c.coll]||[]),G='JOBS.'+key;
  let F={q:'',st:'open'};
  const A={};root.JOBS[key]=A;
  if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS[c.code]={fn:c.fn,label:c.title};
  const listHtml=()=>{
    const t=today(),l=filterList(c,L(),F.q,F.st,t).sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,120);
    if(!l.length)return empty(L().length?'لا توجد نتائج':'لا توجد أوامر. اضغط «+ أمر جديد».');
    return l.map(o=>`<button class="row tap" onclick="${G}.view('${jsq(o.id)}')"><div class="grow"><div class="t">${E(c.title1(o))} <small>${E(o.no)}</small></div><small>${E(c.sub(o))}</small></div><span class="badge ${isEnd(c,o.status)?'grey':''}">${E(c.STATUS[o.status]||o.status)}${overdue(c,o,t)?' ⚠':''}</span></button>`).join('');
  };
  A.open=function(){
    if(!allowed())return toast('ليست لديك صلاحية');
    const t=today(),all=L();
    modal(c.title,`<input class="search" type="search" placeholder="ابحث" value="${E(F.q)}" oninput="${G}.q(this.value)">
    ${chips([['open','مفتوحة ('+all.filter(o=>!isEnd(c,o.status)).length+')'],['today','اليوم'],['overdue','متأخرة ('+all.filter(o=>overdue(c,o,t)).length+')'],['','الكل ('+all.length+')']],F.st,G+'.f')}
    <div class="card" id="jl_${key}">${listHtml()}</div><div class="actions"><button class="btn primary" onclick="${G}.form()">+ أمر جديد</button></div>`);
  };
  A.q=v=>{F.q=v;const l=document.getElementById('jl_'+key);if(l)l.innerHTML=listHtml()};
  A.f=k=>{F.st=k;A.open()};
  A.form=function(){
    modal('أمر جديد — '+c.title,c.fields.map(f=>`<label>${E(f.l)}${f.req?' *':''}</label>${f.t==='area'?`<textarea id="jf_${f.k}" rows="2" style="width:100%"></textarea>`:`<input id="jf_${f.k}" type="${f.t==='number'?'number':f.t==='date'?'date':f.t==='tel'?'tel':'text'}" ${f.t==='number'?'step="any" inputmode="decimal"':''}>`}`).join('')+`<div class="actions"><button class="btn primary" onclick="${G}.save()">حفظ</button><button class="btn ghost" onclick="${G}.open()">رجوع</button></div>`);
  };
  A.save=function(){
    if(!allowed())return;const raw={};c.fields.forEach(f=>{const e=document.getElementById('jf_'+f.k);raw[f.k]=e?e.value:''});
    const r=clean(c,raw);if(r.err)return toast(r.err);
    const o=Object.assign({id:uid(),no:c.prefix+'-'+today().replace(/-/g,'').slice(2)+'-'+rnd(),at:new Date().toISOString(),date:today(),status:'new',by:me(),hist:[]},r.o);
    L().push(o);save();toast('تم الحفظ');A.view(o.id);
  };
  A.view=function(id){
    const o=L().find(x=>x.id===id);if(!o)return;
    const rows=c.fields.filter(f=>o[f.k]!=null&&o[f.k]!=='').map(f=>`<div class="row"><span class="grow">${E(f.l)}</span><b>${f.t==='number'&&/price|deposit/.test(f.k)?money(o[f.k]):E(o[f.k])}</b></div>`).join('');
    const left=(o.price!=null&&o.deposit!=null)?`<div class="row"><span class="grow">المتبقي (للمتابعة)</span><b>${money(Math.max(0,o.price-o.deposit))}</b></div>`:'';
    const mv=(c.NEXT[o.status]||[]).map(s=>`<button class="btn ${s==='cancelled'?'danger':''}" onclick="${G}.move('${jsq(o.id)}','${s}')">${E(c.STATUS[s])}</button>`).join('');
    modal(E(c.title1(o))+' — '+o.no,`<div class="card"><div class="row"><span class="grow">الحالة</span><b>${E(c.STATUS[o.status])}</b></div>${rows}${left}</div><div class="actions">${mv}</div>${(o.hist||[]).length?`<h4>السجل</h4>${o.hist.slice().reverse().map(h=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #ddd">${E(String(h.at).slice(0,16).replace('T',' '))} — ${E(c.STATUS[h.from]||h.from)} ← ${E(c.STATUS[h.to]||h.to)} ${E(h.by)}</div>`).join('')}`:''}<div class="actions"><button class="btn ghost" onclick="${G}.open()">رجوع</button></div>`);
  };
  A.move=function(id,to){
    const o=L().find(x=>x.id===id);if(!o)return;
    const go=()=>{if(move(c,o,to,me(),new Date().toISOString())){save();toast('تم تغيير الحالة');A.view(id)}else toast('انتقال غير مسموح')};
    if(to==='cancelled'||isEnd(c,to))return askConfirm(to==='cancelled'?'إلغاء الأمر؟':'تأكيد: '+c.STATUS[to]+'؟',go,'تأكيد');
    go();
  };
  root[c.fn]=A.open;
});
})(typeof window!=='undefined'?window:globalThis);
