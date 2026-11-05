/* ORVEX — المرحلة 3: ولاء العملاء المحلي (loyalty2.js)
   بديل يعمل دون Supabase ودون إنترنت: دفتر نقاط إلحاقي db.loyTx يُزامَن عبر records. كل حركة بمعرّف حتمي
   (earn-<saleId> / red-<saleId> / rev-<id> / rfd-<saleId>) فإعادة مزامنة الفاتورة أو إعادة المعالجة لا تكرر النقاط.
   القواعد: كل كم عملة = نقطة، حد أدنى للفاتورة، مضاعف حسب الفئة، صلاحية النقاط (أيام)، قيمة النقطة، حد أدنى للاستبدال.
   الاستبدال داخل نافذة الدفع كخصم على الفاتورة (يتعارض مع القسيمة فلا يجتمعان).
   loyalty.js القديم (السحابي) يبقى معطّلًا ما لم يُضبط loyLocal=false صراحة. يُحمَّل بعد loyalty.js و coupons2.js وقبل server.js. */
(function(){
'use strict';
const T=()=>{if(!Array.isArray(db.loyTx))db.loyTx=[];return db.loyTx};
const S=()=>db.settings||(db.settings={});
const on=()=>!!S().loyaltyOn&&S().loyLocal!==false;
const rate=()=>{const r=num(S().loyEarnPer);return r>0?r:1000};
const pval=()=>{const v=num(S().loyPointVal);return v>0?v:10};
const minInv=()=>Math.max(0,num(S().loyMinInvoice));
const minRed=()=>Math.max(0,Math.floor(num(S().loyMinRedeem)));
const expDays=()=>Math.max(0,Math.floor(num(S().loyExpiryDays)));
const catMult=()=>{const m=S().loyCatMult;return m&&typeof m==='object'?m:{}};
const by=()=>(typeof curUser==='function'&&(curUser()||{}).name)||'';
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return ymd(x)};
const log=(a,r,d,ba)=>{try{if(window.orvexLog)window.orvexLog(a,r,d,ba)}catch(e){}};

/* إضافة حركة مرة واحدة فقط (المعرّف الحتمي يمنع التكرار) */
function addTx(t){if(!t||!t.id||!t.cid||!t.pts)return false;if(T().some(x=>x.id===t.id))return false;
  const o=Object.assign({date:today(),at:new Date().toISOString(),by:by()},t);T().push(o);return o}

/* الرصيد: إعادة تشغيل الحركات زمنيًا. كل استهلاك يخصم من الدفعات الصالحة وقت الحركة (الأقرب انتهاءً أولًا) ثم المنتهية إن لزم؛
   ما يتبقى منتهيًا بعد اليوم يُفقد. الفائض السالب يُحفظ كدَين يُسدَّد من أول نقاط تُكتسب. */
function balance(cid,asOf){asOf=asOf||today();
  const tx=T().filter(t=>t.cid===cid).slice().sort((a,b)=>String(a.at||a.date).localeCompare(String(b.at||b.date))),lots=[];let debt=0;
  for(const t of tx){
    if(t.pts>0){let p=t.pts;if(debt>0){const d=Math.min(debt,p);debt-=d;p-=d}if(p>0)lots.push({rem:p,exp:t.exp||'9999-12-31'})}
    else{let n=-t.pts;const d0=t.date||today(),order=lots.filter(l=>l.rem>0).sort((a,b)=>((a.exp>=d0?0:1)-(b.exp>=d0?0:1))||(a.exp<b.exp?-1:a.exp>b.exp?1:0));
      for(const l of order){if(n<=0)break;const d=Math.min(l.rem,n);l.rem-=d;n-=d}debt+=n}}
  const live=lots.filter(l=>l.exp>=asOf),dead=lots.filter(l=>l.exp<asOf),soon=live.filter(l=>l.rem>0&&l.exp!=='9999-12-31').sort((a,b)=>a.exp<b.exp?-1:1)[0];
  return{available:live.reduce((a,l)=>a+l.rem,0)-debt,expired:dead.reduce((a,l)=>a+l.rem,0),debt,nextExpiry:soon?soon.exp:'',nextExpiryPts:soon?soon.rem:0,total:tx.reduce((a,t)=>a+t.pts,0)}}

/* النقاط المكتسبة لفاتورة: صافي بعد الخصم وقبل الضريبة × متوسط مضاعف الفئات ÷ قيمة النقطة */
function earnPts(s){if(!s||!s.cid)return 0;
  const base=s.net!==undefined?num(s.net):num(s.total)-num(s.tax);if(!(base>0)||base<minInv())return 0;
  const M=catMult();let a=0,w=0;(s.items||[]).forEach(i=>{const p=prod(i.pid),m=num(M[p&&p.cat])>0?num(M[p.cat]):1,x=num(i.qty)*num(i.price);a+=x;w+=x*m});
  const avg=a>0?w/a:1;return Math.max(0,Math.floor(base*avg/rate()+1e-9))}
function earnForSale(s){if(!on()||!s||!s.cid||s.loy)return 0;const pts=earnPts(s);if(pts<=0)return 0;
  const o=addTx({id:'earn-'+s.id,cid:s.cid,kind:'earn',pts,sale:s.id,ref:s.no,exp:expDays()?addDays(s.date||today(),expDays()):''});if(!o)return 0;s.loy=pts;return pts}
/* أقصى نقاط قابلة للاستبدال في فاتورة بمجموع sub */
function redeemMax(cid,sub){const av=Math.max(0,balance(cid).available);return Math.max(0,Math.min(av,Math.floor(num(sub)/pval()+1e-9)))}
function adjust(cid,pts,reason){if(!isAdmin())return{err:'للمدير فقط'};const c=cust(cid);if(!c)return{err:'اختر العميل'};pts=Math.trunc(num(pts));if(!pts)return{err:'أدخل عدد النقاط'};
  reason=String(reason||'').trim();if(!reason)return{err:'اكتب سبب التعديل'};
  const b0=balance(cid).available,o=addTx({id:'adj-'+uid(),cid,kind:'adjust',pts,note:reason,exp:pts>0&&expDays()?addDays(today(),expDays()):''});
  log('loy_adjust',c.name,(pts>0?'+':'')+pts+' — '+reason,{b:{points:b0},a:{points:balance(cid).available}});return{ok:o}}
function reverse(s,r){if(!on()||!s||!s.cid)return;
  if(s.loy>0){const done=T().filter(t=>t.sale===s.id&&t.kind==='reverse').reduce((a,t)=>a-t.pts,0),left=s.loy-done,
      want=r?Math.floor(s.loy*Math.min(1,num(r.total)/(num(s.total)||1))+1e-9):left,pts=Math.min(left,want);
    if(pts>0)addTx({id:'rev-'+(r?r.id:s.id),cid:s.cid,kind:'reverse',pts:-pts,sale:s.id,ref:r?r.no:s.no})}
  if(!r&&s.loyRedeem>0)addTx({id:'rfd-'+s.id,cid:s.cid,kind:'refund',pts:s.loyRedeem,sale:s.id,ref:s.no,exp:expDays()?addDays(today(),expDays()):''})}
function couponLog(){return db.sales.filter(s=>s.coupon).map(s=>({date:s.date,code:s.coupon,amount:num(s.couponAmt),no:s.no,cust:(cust(s.cid)||{}).name||'',void:!!s.void})).sort((a,b)=>a.date<b.date?1:-1)}
window.ORVEX_LOY={on,addTx,balance,earnPts,earnForSale,redeemMax,adjust,reverse,couponLog,pval,rate};

/* ---- البيع: استبدال داخل الدفع + كسب بعده ---- */
{const _r=window.orvexLoyReverse;window.orvexLoyReverse=function(s,r){if(S().loyLocal===false&&_r)return _r.apply(this,arguments);reverse(s,r)}}
if(typeof finalize==='function'){const _f=finalize;finalize=function(m,p){
  const co=state.co;let red=null;
  if(co&&num(co.loyPts)>0){
    if(!on()||!co.cid||Math.abs(num(co.disc)-num(co.loyAmt))>=0.01){co.loyPts=0;co.loyAmt=0;toast('أُسقط استبدال النقاط لأن الخصم تغيّر')}
    else{const av=balance(co.cid).available;if(av<co.loyPts){toast('رصيد النقاط لا يكفي');return}red={pts:co.loyPts,amt:co.loyAmt,cid:co.cid}}}
  const n0=db.sales.length;_f(m,p);
  if(db.sales.length>n0&&on()){const s=db.sales[db.sales.length-1];
    if(red&&s.cid===red.cid){s.loyRedeem=red.pts;s.loyRedeemAmt=red.amt;addTx({id:'red-'+s.id,cid:red.cid,kind:'redeem',pts:-red.pts,ref:s.no});log('redeem',(cust(red.cid)||{}).name||'',red.pts+' نقطة = '+red.amt+' | '+s.no)}
    const e=earnForSale(s);save();if(e)toast('اكتسب العميل '+e+' نقطة')}}}
window.loyApply=function(){const co=state.co,pts=Math.floor(num(($('#ly_pp')||{}).value));
  if(!on())return toast('الولاء غير مفعّل');if(!co.cid)return toast('اختر العميل أولًا');if(co.coupon)return toast('أزل القسيمة أولًا؛ لا يجتمع الخصمان');
  if(!(pts>0))return toast('أدخل عدد النقاط');if(minRed()&&pts<minRed())return toast('الحد الأدنى للاستبدال '+minRed()+' نقطة');
  const t=calcCart(),mx=redeemMax(co.cid,t.sub);if(pts>mx)return toast('الأقصى المتاح لهذه الفاتورة '+mx+' نقطة');
  co.loyPts=pts;co.loyAmt=r2(pts*pval());co.disc=co.loyAmt;closeModal();openPay();toast('خصم النقاط: '+money(co.loyAmt))};
window.loyCancel=function(){const co=state.co;if(num(co.loyPts)>0&&Math.abs(num(co.disc)-num(co.loyAmt))<0.01)co.disc=0;co.loyPts=0;co.loyAmt=0;closeModal();openPay()};
if(typeof openPay==='function'){const _o=openPay;openPay=function(){_o();if(!on())return;const a=$('#modal .actions'),co=state.co;if(!a||!co.cid)return;
  const b=balance(co.cid),t=calcCart(),mx=redeemMax(co.cid,t.sub);
  a.insertAdjacentHTML('beforebegin',`<div class="card" style="margin-top:6px"><div style="font-size:13px">نقاط العميل: <b>${b.available}</b> ≈ ${money(b.available*pval())}${b.nextExpiry?` <small class="muted">(${b.nextExpiryPts} تنتهي ${esc(b.nextExpiry)})</small>`:''}</div>
  ${num(co.loyPts)>0?`<small>مطبّق: ${co.loyPts} نقطة (${money(co.loyAmt)}) <button class="btn ghost" onclick="loyCancel()">إلغاء</button></small>`:(mx>0?`<div class="f2"><div><label>استبدال نقاط (حتى ${mx})</label><input id="ly_pp" type="number" inputmode="numeric" min="1" max="${mx}"></div><div style="align-self:end"><button class="btn" onclick="loyApply()">استبدال</button></div></div>`:'<small class="muted">لا نقاط قابلة للاستبدال في هذه الفاتورة</small>')}</div>`)}}

/* ---- شاشة الولاء ---- */
const KL={earn:'كسب',redeem:'استبدال',adjust:'تعديل',reverse:'عكس',refund:'ردّ'};
window.loyaltyOpen=function(cid){if(!(isAdmin()||can('parties')))return toast('ليست لديك صلاحية');
  window.__loyCid=cid||window.__loyCid||'';const s=S(),adm=isAdmin(),c=window.__loyCid?cust(window.__loyCid):null;
  const cm=Object.keys(catMult()).map(k=>k+' | '+catMult()[k]).join('\n');
  let h=`<label class="pchk" style="border:0"><input type="checkbox" id="ly_on" ${s.loyaltyOn&&s.loyLocal!==false?'checked':''} ${adm?'':'disabled'}> تفعيل نقاط الولاء</label>
  <div class="f2"><div><label>كل كم ${esc(s.currency||'')} = نقطة</label><input id="ly_rate" type="number" value="${rate()}" ${adm?'':'disabled'}></div><div><label>قيمة النقطة عند الاستبدال</label><input id="ly_val" type="number" value="${pval()}" ${adm?'':'disabled'}></div></div>
  <div class="f2"><div><label>حد أدنى للفاتورة لكسب نقاط</label><input id="ly_min" type="number" value="${minInv()||''}" ${adm?'':'disabled'}></div><div><label>صلاحية النقاط (أيام، 0 = بلا انتهاء)</label><input id="ly_exp" type="number" value="${expDays()||''}" ${adm?'':'disabled'}></div></div>
  <div class="f2"><div><label>حد أدنى للاستبدال (نقاط)</label><input id="ly_mr" type="number" value="${minRed()||''}" ${adm?'':'disabled'}></div></div>
  <label>مضاعف حسب الفئة (سطر لكل فئة: الفئة | المضاعف، مثال: عطور | 2)</label><textarea id="ly_cm" rows="2" ${adm?'':'disabled'}>${esc(cm)}</textarea>
  ${adm?'<div class="actions"><button class="btn primary" onclick="loySaveSettings()">حفظ الإعدادات</button></div>':''}
  <label>العميل</label><select onchange="loyaltyOpen(this.value)"><option value="">— اختر —</option>${db.customers.map(x=>`<option value="${esc(x.id)}" ${x.id===window.__loyCid?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
  if(c){const b=balance(c.id),L=T().filter(t=>t.cid===c.id).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,25);
    h+=`<div class="card" style="margin-top:8px"><div>الرصيد المتاح: <b>${b.available}</b> نقطة ≈ ${money(Math.max(0,b.available)*pval())}${b.expired?` <small class="muted">(منتهية ${b.expired})</small>`:''}${b.nextExpiry?` <small class="muted">— ${b.nextExpiryPts} تنتهي ${esc(b.nextExpiry)}</small>`:''}</div>
    ${L.map(x=>`<div style="font-size:12px;display:flex;justify-content:space-between"><span>${esc(fdate(x.date))} — ${KL[x.kind]||esc(x.kind)} ${esc(x.ref||x.note||'')}</span><b>${x.pts>0?'+':''}${x.pts}</b></div>`).join('')||'<small class="muted">لا حركات</small>'}</div>
    ${adm?`<div class="f2"><div><label>تعديل يدوي (±نقاط)</label><input id="ly_ap" type="number"></div><div><label>السبب (إلزامي)</label><input id="ly_ar"></div></div><div class="actions"><button class="btn" onclick="loyAdjustUi()">تسجيل التعديل</button></div>`:''}`}
  h+=`<div class="actions"><button class="btn" onclick="couponLogOpen()">سجل استخدام القسائم</button></div><p class="muted" style="font-size:12.5px">النقاط تُسجَّل محليًا وتُزامَن بين أجهزة المحل. الاستبدال يتم من نافذة الدفع.</p>`;
  modal('نقاط الولاء',h)};
window.loySaveSettings=function(){if(!isAdmin())return toast('للمدير فقط');const s=S(),g=i=>($('#'+i)||{}).value,r=num(g('ly_rate')),v=num(g('ly_val'));
  if(!(r>0)||!(v>0))return toast('أدخل قيمًا صحيحة');const m={};
  for(const line of String(g('ly_cm')||'').split('\n')){const p=line.split('|').map(x=>x.trim());if(!p[0])continue;const x=num(p[1]);if(!(x>0))return toast('مضاعف غير صحيح للفئة: '+p[0]);m[p[0]]=x}
  const b={on:s.loyaltyOn,rate:s.loyEarnPer,val:s.loyPointVal};
  s.loyaltyOn=!!$('#ly_on').checked;s.loyLocal=true;s.loyEarnPer=r;s.loyPointVal=v;s.loyMinInvoice=Math.max(0,num(g('ly_min')));s.loyExpiryDays=Math.max(0,Math.floor(num(g('ly_exp'))));s.loyMinRedeem=Math.max(0,Math.floor(num(g('ly_mr'))));s.loyCatMult=m;
  log('loyalty','إعدادات','',{b,a:{on:s.loyaltyOn,rate:r,val:v}});save();toast('تم الحفظ');loyaltyOpen()};
window.loyAdjustUi=function(){const r=adjust(window.__loyCid,($('#ly_ap')||{}).value,($('#ly_ar')||{}).value);if(r.err)return toast(r.err);save();toast('تم التعديل');loyaltyOpen()};
window.couponLogOpen=function(){const L=couponLog().slice(0,80);
  modal('سجل استخدام القسائم',L.length?`<div class="card">${L.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.code)} — ${esc(x.no)}${x.void?' <span class="badge bad">ملغاة</span>':''}</div><small>${esc(fdate(x.date))} — ${esc(x.cust||'بدون عميل')}</small></div><b>${money(x.amount)}</b></div>`).join('')}</div>`:'<p class="muted">لم تُستخدم قسائم بعد.</p>')};
})();
