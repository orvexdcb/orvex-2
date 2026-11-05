/* ORVEX — القسائم وأكواد الخصم (coupons2.js). تُدار من المدير وتُطبَّق في شاشة الدفع؛ تتزامن عبر records بنوع coupons.
   عدد مرات الاستخدام يُحسب من الفواتير نفسها (s.coupon، دون الملغاة) فلا يوجد عدّاد قابل للتعارض بين الأجهزة. */
(function(){
'use strict';
const C=()=>db.coupons||(db.coupons=[]);
const norm=s=>String(s==null?'':s).trim().toUpperCase();
const usedOf=c=>db.sales.filter(s=>s.coupon===c.code&&!s.void).length;
function check(c,sub){
  if(!c||c.active===false)return 'القسيمة غير فعّالة';
  if(c.expires&&c.expires<today())return 'القسيمة منتهية';
  if(num(c.max)>0&&usedOf(c)>=num(c.max))return 'استُنفد عدد مرات استخدام القسيمة';
  if(num(c.min)>0&&sub<num(c.min))return 'الحد الأدنى للفاتورة '+c.min;
  return ''}
const amt=(c,sub)=>r2(Math.max(0,c.type==='pct'?sub*Math.min(num(c.value),100)/100:Math.min(num(c.value),sub)));

/* ---- شاشة الدفع ---- */
const _op=openPay;openPay=function(){
  _op();const a=$('#modal .actions');if(!a)return;const co=state.co;
  a.insertAdjacentHTML('beforebegin',`<div class="f2" style="margin-top:6px"><div><label>قسيمة خصم</label><input id="cp_code" autocomplete="off" value="${esc(co.coupon||'')}" placeholder="الرمز"></div><div style="align-self:end"><button class="btn" onclick="applyCoupon()">تطبيق</button></div></div>${co.coupon?`<small class="muted">مطبّقة: ${esc(co.coupon)} (${money(co.couponAmt||0)})</small>`:''}`)};
window.applyCoupon=function(){
  const co=state.co,code=norm(($('#cp_code')||{}).value);if(!code)return toast('أدخل رمز القسيمة');
  const c=C().find(x=>x.code===code);if(!c)return toast('رمز غير صحيح');
  const t=calcCart(),e=check(c,t.sub);if(e)return toast(e);
  const a=amt(c,t.sub);if(!(a>0))return toast('لا يوجد خصم لهذه الفاتورة');
  co.coupon=code;co.couponAmt=a;co.disc=a;closeModal();openPay();toast('تم تطبيق القسيمة: '+money(a))};
const _fin=finalize;finalize=function(m,p){
  const co=state.co;let code='';
  if(co&&co.coupon){
    const c=C().find(x=>x.code===co.coupon),t=calcCart();
    if(c&&Math.abs(num(co.disc)-num(co.couponAmt))<0.01){
      const e=check(c,t.sub);if(e){toast(e);return}
      if(Math.abs(amt(c,t.sub)-num(co.couponAmt))>=0.01){toast('تغيّر مجموع الفاتورة؛ أعد تطبيق القسيمة');return}
      code=c.code}
    else{co.coupon='';co.couponAmt=0}}  /* الخصم عُدّل يدويًا: تُسقط القسيمة ويبقى الخصم اليدوي */
  const n0=db.sales.length;_fin(m,p);
  if(code&&db.sales.length>n0){const s=db.sales[db.sales.length-1];s.coupon=code;s.couponAmt=r2(s.discount);save()}};

/* ---- إدارة القسائم (للمدير) ---- */
const L=(a,r,d)=>{if(window.orvexLog)orvexLog(a,r,d)};
window.couponsOpen=function(){
  if(!isAdmin())return toast('للمدير فقط');
  modal('القسائم',`<div class="card">${C().length?C().map(c=>`<div class="row" onclick="couponForm('${jsq(c.id)}')"><div class="grow"><div class="t">${esc(c.code)} ${c.active===false?'<span class="badge">موقوفة</span>':''}</div><small>${c.type==='pct'?c.value+'%':money(c.value)}${num(c.min)>0?' — حد أدنى '+money(c.min):''}${c.expires?' — حتى '+esc(c.expires):''}</small></div><div class="end"><b>${usedOf(c)}${num(c.max)>0?' / '+c.max:''}</b><br><small>استخدام</small></div></div>`).join(''):'<p class="muted">لا توجد قسائم.</p>'}</div>
  <div class="actions"><button class="btn primary" onclick="couponForm()">+ قسيمة</button></div>`)};
window.couponForm=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const c=id?C().find(x=>x.id===id):{code:'',type:'pct',value:'',min:0,max:0,expires:'',active:true};if(!c)return;
  modal(id?'تعديل قسيمة':'قسيمة جديدة',`<label>الرمز</label><input id="cp_c" value="${esc(c.code)}" autocapitalize="characters">
  <div class="f2"><div><label>النوع</label><select id="cp_t"><option value="pct" ${c.type==='pct'?'selected':''}>نسبة %</option><option value="amt" ${c.type==='amt'?'selected':''}>مبلغ ثابت</option></select></div><div><label>القيمة</label><input id="cp_v" type="number" inputmode="decimal" value="${c.value??''}"></div></div>
  <div class="f2"><div><label>حد أدنى للفاتورة</label><input id="cp_m" type="number" inputmode="decimal" value="${c.min||0}"></div><div><label>أقصى استخدامات (0 = بلا حد)</label><input id="cp_x" type="number" value="${c.max||0}"></div></div>
  <label>تاريخ الانتهاء (اختياري)</label><input id="cp_e" type="date" value="${esc(c.expires||'')}">
  <label class="pchk" style="border:0"><input type="checkbox" id="cp_a" ${c.active!==false?'checked':''}> فعّالة</label>
  <div class="actions"><button class="btn primary" onclick="couponSave('${jsq(id||'')}')">حفظ</button><button class="btn ghost" onclick="couponsOpen()">رجوع</button></div>`)};
window.couponSave=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const code=norm($('#cp_c').value),type=$('#cp_t').value,v=num($('#cp_v').value);
  if(!/^[A-Z0-9\u0600-\u06FF_-]{3,20}$/.test(code))return toast('الرمز 3–20 حرفًا/رقمًا بلا مسافات');
  if(!(v>0))return toast('أدخل قيمة صحيحة');if(type==='pct'&&v>100)return toast('النسبة لا تتجاوز 100');
  if(C().some(x=>x.id!==id&&x.code===code))return toast('الرمز مستخدم');
  const o={code,type,value:r2(v),min:Math.max(0,num($('#cp_m').value)),max:Math.max(0,Math.round(num($('#cp_x').value))),expires:$('#cp_e').value,active:$('#cp_a').checked};
  if(id){const c=C().find(x=>x.id===id);if(!c)return;if(c.code!==code&&usedOf(c)>0)return toast('لا يمكن تغيير رمز قسيمة استُخدمت');Object.assign(c,o);L('coupon_edit',code,'')}
  else{C().push(Object.assign({id:uid()},o));L('coupon_add',code,(type==='pct'?v+'%':v))}
  save();toast('تم الحفظ');couponsOpen()};
const _vp=vParties;vParties=function(){return _vp()+(isAdmin()?`<div class="actions"><button class="btn" onclick="couponsOpen()">🎟 القسائم</button></div>`:'')};
window.ORVEX_CP={check,amt,usedOf};
})();
