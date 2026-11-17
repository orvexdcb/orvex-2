/* ORVEX — تسعير الذهب (ميزة gold_pricing): سعر الغرام لكل عيار + حاسبة + تحديث أسعار منتجات الذهب بعد معاينة وتأكيد.
   الأسعار تُحفظ في db.settings.goldRates (تُزامَن مع إعدادات المحل). حقول المنتج من النشاط: karat، weight_g، making_charge. */
(function(root){
'use strict';
const KARATS=['24','22','21','18','14'];
/* يستخرج العيار من نص مثل «21» أو «21K» أو «عيار 21»؛ يعيد '' إن لم يكن ضمن العيارات المعروفة */
function parseKarat(v){
  const m=/(\d{2})/.exec(String(v==null?'':v).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return m&&KARATS.includes(m[1])?m[1]:'';
}
const pos=n=>{n=parseFloat(n);return isFinite(n)&&n>=0?n:0};
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
/* سعر القطعة = الوزن × سعر غرام العيار + أجرة الصياغة (مبلغ ثابت للقطعة)؛ null إن نقص وزن أو عيار أو سعر */
function priceFor(item,rates){
  const k=parseKarat(item&&item.karat),w=pos(item&&item.weight_g),rate=pos(rates&&rates[k]);
  if(!k||!(w>0)||!(rate>0))return null;
  return r2(w*rate+pos(item.making_charge));
}
/* معاينة التحديث: المنتجات التي يتغير سعرها فقط */
function preview(products,rates){
  const out=[];
  (products||[]).forEach(p=>{
    const np=priceFor(p.extra||{},rates);
    if(np!=null&&r2(+p.price||0)!==np)out.push({id:p.id,name:p.name,old:+p.price||0,price:np});
  });
  return out;
}
const G={KARATS,parseKarat,priceFor,preview};
root.ORVEX_GOLD=G;
if(typeof module!=='undefined'&&module.exports)module.exports=G;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.gold_pricing={fn:'goldModal',label:'تسعير الذهب'};
const rates=()=>(db.settings.goldRates&&typeof db.settings.goldRates==='object')?db.settings.goldRates:{};
root.goldModal=function(){
  if(!isAdmin())return toast('هذه الشاشة للمدير فقط');
  const R=rates();
  modal('تسعير الذهب',`<p class="muted" style="margin-top:0">أدخل سعر الغرام لكل عيار (${E(db.settings.currency)}).</p>
  <div class="f2">${KARATS.map(k=>`<div><label>عيار ${k}</label><input id="gr_${k}" type="number" inputmode="decimal" step="any" value="${R[k]||''}"></div>`).join('')}</div>
  <div class="actions"><button class="btn primary" onclick="goldSaveRates()">حفظ الأسعار</button></div>
  <h4>حاسبة</h4><div class="f2"><div><label>العيار</label><select id="gc_k">${KARATS.map(k=>`<option>${k}</option>`).join('')}</select></div><div><label>الوزن (غرام)</label><input id="gc_w" type="number" inputmode="decimal" step="any" oninput="goldCalc()"></div></div>
  <label>أجرة الصياغة للقطعة</label><input id="gc_m" type="number" inputmode="decimal" step="any" oninput="goldCalc()"><div id="gc_out" class="note" style="margin-top:8px">—</div>
  <div class="actions"><button class="btn" onclick="goldPreview()">معاينة تحديث أسعار منتجات الذهب</button></div>`);
  document.getElementById('gc_k').onchange=goldCalc;
};
root.goldSaveRates=function(){
  const R={};KARATS.forEach(k=>{const n=pos(document.getElementById('gr_'+k).value);if(n>0)R[k]=n});
  db.settings.goldRates=R;save();toast('تم حفظ الأسعار');
};
root.goldCalc=function(){
  const g=id=>document.getElementById(id).value,p=priceFor({karat:g('gc_k'),weight_g:g('gc_w'),making_charge:g('gc_m')},rates());
  document.getElementById('gc_out').textContent=p==null?'أدخل الوزن وتأكد من حفظ سعر هذا العيار':'السعر: '+money(p);
};
root.goldPreview=function(){
  const P=preview(db.products,rates());
  modal('معاينة تحديث الأسعار',P.length?`<p>سيتغير سعر البيع لـ <b>${P.length}</b> منتج حسب الأسعار الحالية (لا يُغيَّر سعر الشراء). المنتجات بلا عيار أو وزن لا تُمس.</p><div class="card">${P.slice(0,100).map(x=>`<div class="row"><div class="grow">${E(x.name)}</div><div class="end"><small>${fmt(x.old)} ←</small> <b>${fmt(x.price)}</b></div></div>`).join('')}</div>${P.length>100?`<p class="muted">يُعرض أول 100 من ${P.length}.</p>`:''}<div class="actions"><button class="btn primary" onclick="goldApply()">اعتماد التحديث</button><button class="btn ghost" onclick="goldModal()">رجوع</button></div>`
    :'<p class="muted">لا منتجات تحتاج تحديثًا. تأكد من حفظ أسعار العيارات، ومن أن للمنتجات عيارًا ووزنًا (من بيانات النشاط).</p><div class="actions"><button class="btn ghost" onclick="goldModal()">رجوع</button></div>');
};
root.goldApply=function(){
  if(!isAdmin())return;
  const P=preview(db.products,rates());let n=0;
  P.forEach(x=>{const p=prod(x.id);if(!p)return;const old=p.price;p.price=x.price;n++;
    if(window.orvexLog)orvexLog('price_change',p.name,'السعر '+old+'←'+p.price+' (تسعير الذهب)')});
  save();closeModal();toast('تم تحديث '+n+' منتج');
};
})(typeof window!=='undefined'?window:globalThis);
