/* ORVEX — الضمان (ميزة warranty). يُسجَّل تلقائيًا عند البيع لكل منتج له مدة ضمان، ويُدار من شاشة مستقلة.
   مدة الضمان من product.extra.warranty_months (حقل النشاط) أو product.warrantyMonths. التخزين: db.warranties (يُزامَن). */
(function(root){
'use strict';
function pad(n){return String(n).padStart(2,'0')}
/* إضافة أشهر مع تثبيت اليوم على آخر الشهر عند الحاجة (31 يناير + شهر = 28/29 فبراير) */
function addMonths(ymd,m){
  const mt=/^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd||'');if(!mt||!(m>0))return null;
  let y=+mt[1],mo=+mt[2]-1+Math.round(m),d=+mt[3];y+=Math.floor(mo/12);mo=((mo%12)+12)%12;
  const last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();
  return y+'-'+pad(mo+1)+'-'+pad(Math.min(d,last));
}
function daysBetween(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)}
function status(w,today,soon){
  soon=soon||30;if(!w||!w.end)return'unknown';
  const d=daysBetween(today,w.end);
  return d<0?'expired':d<=soon?'soon':'active';
}
function monthsOf(p){
  if(!p)return 0;
  const v=p.extra&&p.extra.warranty_months!=null?p.extra.warranty_months:p.warrantyMonths;
  const n=parseFloat(v);return isFinite(n)&&n>0&&n<=600?Math.round(n):0;
}
/* ضمانات فاتورة: سجل لكل رقم تسلسلي، وإلا سجل واحد للصنف */
function fromSale(s,prodOf,uid){
  const out=[];
  (s.items||[]).forEach(it=>{
    const m=monthsOf(prodOf(it.pid));if(!m)return;
    const end=addMonths(s.date,m);if(!end)return;
    const base={saleId:s.id,saleNo:s.no,pid:it.pid,name:it.name,months:m,start:s.date,end,cid:s.cid||''};
    if(Array.isArray(it.sn)&&it.sn.length)it.sn.forEach(sn=>out.push(Object.assign({id:uid(),sn:String(sn),qty:1},base)));
    else out.push(Object.assign({id:uid(),sn:'',qty:it.qty},base));
  });
  return out;
}
function search(list,q){
  q=String(q||'').trim().toLowerCase();if(!q)return list;
  return list.filter(w=>[w.name,w.sn,w.saleNo,w.custName].some(x=>String(x||'').toLowerCase().includes(q)));
}
const W={addMonths,daysBetween,status,monthsOf,fromSale,search};
root.ORVEX_WARRANTY=W;
if(typeof module!=='undefined'&&module.exports)module.exports=W;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),L=()=>(db.warranties=db.warranties||[]);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.warranty={fn:'warrantyModal',label:'الضمان'};
let F={q:'',st:''};
const ST={active:['ساري','ok'],soon:['قارب على الانتهاء','warn'],expired:['منتهي','grey'],unknown:['—','grey']};
function allowed(){return typeof can==='function'?can('invoices'):true}
function rows(){
  const t=today(),list=search(L().map(w=>Object.assign({},w,{custName:(cust(w.cid)||{}).name||''})),F.q);
  return list.filter(w=>!F.st||status(w,t)===F.st).sort((a,b)=>String(a.end).localeCompare(String(b.end)));
}
root.warrantyModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  const t=today(),all=L(),cnt={active:0,soon:0,expired:0};all.forEach(w=>{const s=status(w,t);if(cnt[s]!=null)cnt[s]++});
  const R=rows().slice(0,150);
  modal('الضمان',`<input class="search" id="wq" type="search" placeholder="ابحث: المنتج، الرقم التسلسلي، الفاتورة، العميل" value="${E(F.q)}" oninput="warrantyQ(this.value)">
  ${chips([['','الكل ('+all.length+')'],['active','ساري ('+cnt.active+')'],['soon','قارب ('+cnt.soon+')'],['expired','منتهي ('+cnt.expired+')']],F.st,'warrantyF')}
  <div class="card" id="wl">${listHtml(R)}</div>
  <div class="actions"><button class="btn primary" onclick="warrantyForm()">+ ضمان يدوي</button></div>`);
};
function listHtml(R){
  if(!R.length)return empty(L().length?'لا توجد نتائج':'لا توجد ضمانات بعد. تُسجَّل تلقائيًا عند بيع منتج له مدة ضمان.');
  const t=today();
  return R.map(w=>{const s=ST[status(w,t)];
    return `<div class="row"><div class="grow"><div class="t">${E(w.name)}${w.sn?' <small>SN: '+E(w.sn)+'</small>':''}</div><small>${E(w.saleNo||'يدوي')} · حتى ${E(w.end)} (${w.months} شهر)${w.custName?' · '+E(w.custName):''}</small></div><span class="badge ${s[1]==='grey'?'grey':''}">${s[0]}</span>${isAdmin()?`<button class="btn danger" onclick="warrantyDel('${jsq(w.id)}')">حذف</button>`:''}</div>`}).join('');
}
root.warrantyQ=v=>{F.q=v;const l=document.getElementById('wl');if(l)l.innerHTML=listHtml(rows().slice(0,150))};
root.warrantyF=k=>{F.st=k;warrantyModal()};
root.warrantyForm=function(){
  modal('ضمان يدوي',`<label>المنتج / الوصف</label><input id="wf_n"><label>الرقم التسلسلي (اختياري)</label><input id="wf_sn" style="direction:ltr;text-align:left">
  <div class="f2"><div><label>تاريخ البداية</label><input id="wf_s" type="date" value="${today()}"></div><div><label>المدة (شهر)</label><input id="wf_m" type="number" inputmode="numeric" value="12"></div></div>
  <div class="actions"><button class="btn primary" onclick="warrantySave()">حفظ</button><button class="btn ghost" onclick="warrantyModal()">رجوع</button></div>`);
};
root.warrantySave=function(){
  const name=document.getElementById('wf_n').value.trim(),m=parseInt(document.getElementById('wf_m').value,10),st=document.getElementById('wf_s').value;
  if(!name)return toast('أدخل المنتج');if(!(m>0&&m<=600))return toast('مدة غير صالحة');
  const end=addMonths(st,m);if(!end)return toast('تاريخ غير صالح');
  L().push({id:uid(),saleId:'',saleNo:'',pid:'',name,sn:document.getElementById('wf_sn').value.trim(),qty:1,months:m,start:st,end,cid:''});
  save();warrantyModal();toast('تم الحفظ');
};
root.warrantyDel=id=>{if(!isAdmin())return;askConfirm('حذف سجل الضمان؟',()=>{db.warranties=L().filter(w=>w.id!==id);save();warrantyModal()},'حذف')};

/* تسجيل تلقائي بعد كل فاتورة جديدة؛ لا يعطّل البيع أبدًا */
if(typeof root.finalize==='function'){
  const _f=root.finalize;
  root.finalize=function(){
    const n0=db.sales.length,r=_f.apply(this,arguments);
    try{
      if(db.sales.length>n0){
        const s=db.sales[db.sales.length-1],ws=fromSale(s,prod,uid);
        if(ws.length){L().push.apply(L(),ws);save()}
      }
    }catch(e){}
    return r;
  };
}
})(typeof window!=='undefined'?window:globalThis);
