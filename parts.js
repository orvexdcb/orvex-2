/* ORVEX — قطع الغيار: البحث برقم القطعة (part_number_search) والبحث بالسيارة ماركة/موديل/سنة (vehicle_fitment).
   يقرأ حقول النشاط من product.extra: part_no، vehicle_make، vehicle_model، year_range. للقراءة والإضافة للسلة فقط. */
(function(root){
'use strict';
const AR='٠١٢٣٤٥٦٧٨٩';
const digits=s=>String(s==null?'':s).replace(/[٠-٩]/g,d=>AR.indexOf(d));
/* توحيد رقم القطعة: حروف كبيرة، بلا مسافات أو شرطات أو نقاط أو شرطة مائلة */
const normPart=s=>digits(s).toUpperCase().replace(/[\s\-_.\/\\]+/g,'');
const norm=s=>digits(s).trim().toLowerCase();
/* «2015-2020» أو «2015 – 2020» أو «2015» أو «2015+» أو «حتى 2010»؛ null إن لم يُفهم */
function parseYearRange(v){
  const s=digits(v).trim();if(!s)return null;
  const ys=(s.match(/(?:19|20)\d{2}/g)||[]).map(Number);if(!ys.length)return null;
  if(ys.length>=2)return[Math.min(ys[0],ys[1]),Math.max(ys[0],ys[1])];
  if(/\+|فما فوق|وما بعد|from|up/i.test(s))return[ys[0],9999];
  if(/حتى|الى|إلى|until|to\b/i.test(s))return[0,ys[0]];
  return[ys[0],ys[0]];
}
function fitsYear(range,year){
  const r=parseYearRange(range),y=parseInt(digits(year),10);
  if(!y)return true;           /* لم تُحدَّد سنة: لا تُستبعد */
  if(!r)return false;           /* نطاق غير مفهوم: لا نخمّن أنها تناسب */
  return y>=r[0]&&y<=r[1];
}
function byPart(products,q){
  const k=normPart(q);if(k.length<2)return[];
  return products.filter(p=>p.extra&&normPart(p.extra.part_no).includes(k));
}
function byVehicle(products,f){
  const mk=norm(f&&f.make),md=norm(f&&f.model);
  if(!mk&&!md)return[];
  return products.filter(p=>{
    const e=p.extra;if(!e)return false;
    const pm=norm(e.vehicle_make),pd=norm(e.vehicle_model);
    if(!pm&&!pd)return false;   /* بلا بيانات سيارة: لا تظهر في بحث السيارة */
    return(!mk||pm.includes(mk))&&(!md||pd.includes(md))&&fitsYear(e.year_range,f.year);
  });
}
const P={normPart,parseYearRange,fitsYear,byPart,byVehicle};
root.ORVEX_PARTS=P;
if(typeof module!=='undefined'&&module.exports)module.exports=P;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS){const S=root.ORVEX_ACT.SCREENS;S.part_number_search={fn:'partsModal',label:'البحث برقم القطعة'};S.vehicle_fitment={fn:'partsModal',label:'البحث بالسيارة'}}
let M={tab:'part',q:'',mk:'',md:'',yr:''};
root.partsModal=function(tab){
  if(typeof can==='function'&&!can('pos'))return toast('ليست لديك صلاحية');
  if(tab==='part'||tab==='car')M.tab=tab;
  modal('قطع الغيار',`<div class="chips"><button class="chip ${M.tab==='part'?'on':''}" onclick="partsModal('part')">برقم القطعة</button><button class="chip ${M.tab==='car'?'on':''}" onclick="partsModal('car')">بالسيارة</button></div>
  ${M.tab==='part'?`<input class="search" id="pt_q" type="search" placeholder="رقم القطعة (الشرطات والمسافات لا تؤثر)" value="${E(M.q)}" oninput="partsRun()" style="direction:ltr;text-align:left">`
  :`<div class="f2"><div><label>الماركة</label><input id="pt_mk" value="${E(M.mk)}" oninput="partsRun()"></div><div><label>الموديل</label><input id="pt_md" value="${E(M.md)}" oninput="partsRun()"></div></div><label>سنة الصنع (اختياري)</label><input id="pt_yr" type="number" inputmode="numeric" value="${E(M.yr)}" oninput="partsRun()">`}
  <div class="card" id="pt_out">${resHtml()}</div>`);
};
function results(){
  const v=id=>{const e=document.getElementById(id);return e?e.value:''};
  if(M.tab==='part'){M.q=v('pt_q')||M.q;return byPart(db.products,M.q)}
  M.mk=v('pt_mk');M.md=v('pt_md');M.yr=v('pt_yr');return byVehicle(db.products,{make:M.mk,model:M.md,year:M.yr});
}
function resHtml(){
  const R=results().slice(0,60);
  if(!R.length)return empty(M.tab==='part'?'اكتب رقم القطعة (حرفان على الأقل)':'أدخل الماركة أو الموديل — المنتجات بلا بيانات سيارة لا تظهر هنا');
  return R.map(p=>{const e=p.extra||{};return `<div class="row"><div class="grow"><div class="t">${E(p.name)}</div><small>${e.part_no?E(e.part_no)+' · ':''}${E([e.vehicle_make,e.vehicle_model,e.year_range].filter(Boolean).join(' '))}</small></div><div class="end"><b>${money(p.price)}</b><small>${p.stock>0?'المتوفر: '+p.stock:'نفد'}</small></div>${p.stock>0&&typeof addCart==='function'?`<button class="btn" onclick="partsAdd('${jsq(p.id)}')">+</button>`:''}</div>`}).join('');
}
root.partsRun=function(){const o=document.getElementById('pt_out');if(o)o.innerHTML=resHtml()};
root.partsAdd=id=>{if(typeof addCart==='function')addCart(id,1,true)};
})(typeof window!=='undefined'?window:globalThis);
