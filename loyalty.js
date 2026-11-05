/* ORVEX — نقاط الولاء (loyalty.js). معطّل افتراضيًا (db.settings.loyaltyOn).
   يعتمد على جدول loyalty_ledger (migrations/004 — مسودة تُطبَّق وتُختبر أولًا). سجل حركات إلحاقي: كل حركة بمعرّف ثابت،
   تُحفظ في صندوق صادر محلي وتُرسل عند توفر الاتصال، وإعادة الإرسال آمنة. إن لم يوجد الجدول تبقى الحركات معلّقة ولا تتأثر المبيعات ولا المزامنة. */
(function(){
'use strict';
const API=()=>window.__orvexLoy||null;
const OK=()=>{const a=API();return !!(a&&a.ok())};
const KEY=()=>'orvex_loy_out_'+((API()&&API().shop())||'local');
const outGet=()=>{try{return JSON.parse(localStorage.getItem(KEY())||'[]')}catch(e){return[]}};
const outSet=a=>{try{localStorage.setItem(KEY(),JSON.stringify(a))}catch(e){}};
const on=()=>!!(db.settings&&db.settings.loyaltyOn&&db.settings.loyLocal===false);  /* الافتراضي صار الدفتر المحلي (loyalty2.js) */
const rate=()=>{const r=num(db.settings.loyEarnPer);return r>0?r:1000};   /* كل كم عملة = نقطة */
const pval=()=>{const v=num(db.settings.loyPointVal);return v>0?v:10};   /* قيمة النقطة عند الاستبدال */
const qadd=e=>{const a=outGet();if(!a.some(x=>x.id===e.id)){a.push(e);outSet(a)}};

/* ---- إرسال الصندوق الصادر (آمن للتكرار) ---- */
let busy=false;
async function flush(){
  if(busy||!OK())return;busy=true;
  try{for(const e of outGet().filter(x=>!x.rej)){
      try{
        await API().insert([{id:e.id,customer_id:e.cid,kind:e.kind,points:e.pts,ref:e.ref||null,note:e.note||null,by_name:e.by||null}]);
        let a=outGet(),x=a.find(y=>y.id===e.id);if(!x)continue;
        if(x.credit&&!x.applied){x.applied=true;outSet(a);const c=cust(x.credit.cid);if(c){c.balance=r2(c.balance-x.credit.amt);save()}}
        outSet(outGet().filter(y=>y.id!==e.id))
      }catch(err){
        const m=String(err&&err.message||'');
        if(/ORVEX_LOYALTY_INSUFFICIENT/.test(m)){const a=outGet(),x=a.find(y=>y.id===e.id);if(x){x.rej='الرصيد غير كافٍ';outSet(a)}}
        else break; /* خطأ اتصال أو الجدول غير موجود: نُبقي الحركات ونتوقف */
      }}}
  finally{busy=false}}
window.orvexLoyFlush=flush;
setInterval(()=>{if(on())flush()},30000);window.addEventListener('online',()=>{if(on())flush()});

/* ---- كسب النقاط عند البيع ---- */
const _fin=finalize;finalize=function(m,p){
  const n0=db.sales.length;_fin(m,p);
  if(!on()||db.sales.length<=n0)return;
  const s=db.sales[db.sales.length-1];if(!s.cid)return;
  const pts=Math.floor(num(s.total)/rate());if(pts<=0)return;
  s.loy=pts;qadd({id:'earn-'+s.id,cid:s.cid,kind:'earn',pts,ref:s.no,by:(curUser()||{}).name||''});save();flush();
  toast('اكتسب العميل '+pts+' نقطة')};

/* ---- عكس النقاط عند الإلغاء/المرتجع (بنسبة المبلغ، من النقاط المسجّلة على الفاتورة نفسها) ---- */
window.orvexLoyReverse=function(s,r){
  if(!on()||!s||!s.loy||!s.cid)return;
  const frac=r?Math.min(1,num(r.total)/(num(s.total)||1)):1;
  const pts=Math.floor(s.loy*frac);if(pts<=0)return;
  qadd({id:'rev-'+(r?r.id:s.id),cid:s.cid,kind:'reverse',pts:-pts,ref:r?r.no:s.no,by:(curUser()||{}).name||''});save();flush()};

/* ---- الاستبدال: يخصم النقاط من الرصيد ويقيّد قيمتها رصيدًا دائنًا للعميل (يُحتسب مرة واحدة فقط) ---- */
window.orvexRedeem=async function(){
  const cid=window.__loyCid,c=cust(cid);if(!c)return toast('اختر العميل');
  const pts=Math.floor(num(($('#ly_pts')||{}).value));if(!(pts>0))return toast('أدخل عدد النقاط');
  if(!OK())return toast('الاستبدال يحتاج اتصالًا بالإنترنت');
  const amt=r2(pts*pval()),e={id:'red-'+uid(),cid,kind:'redeem',pts:-pts,ref:'',note:'استبدال نقاط',by:(curUser()||{}).name||'',credit:{cid,amt}};
  qadd(e);await flush();
  const left=outGet().find(x=>x.id===e.id);
  if(left){if(left.rej){outSet(outGet().filter(x=>x.id!==e.id));return toast('الرصيد غير كافٍ لهذا الاستبدال')}return toast('الاستبدال قيد الإرسال وسيُطبَّق تلقائيًا عند توفر الاتصال؛ لا تكرره')}
  if(window.orvexLog)orvexLog('redeem',c.name,pts+' نقطة = '+amt);toast('تم استبدال '+pts+' نقطة بقيمة '+money(amt)+' (رصيد دائن للعميل)');window.loyaltyOpen(cid)};

/* ---- الواجهة ---- */
window.loyaltyOpen=async function(cid){
  if(!(isAdmin()||can('parties')))return toast('ليست لديك صلاحية');
  window.__loyCid=cid||window.__loyCid||'';
  const s=db.settings,adm=isAdmin(),c=window.__loyCid?cust(window.__loyCid):null,out=outGet();
  let body=`<label class="pchk" style="border:0"><input type="checkbox" id="ly_on" ${on()?'checked':''} ${adm?'':'disabled'}> تفعيل نقاط الولاء</label>
  <div class="f2"><div><label>كل كم ${esc(s.currency||'')} = نقطة</label><input id="ly_rate" type="number" value="${rate()}" ${adm?'':'disabled'}></div><div><label>قيمة النقطة عند الاستبدال</label><input id="ly_val" type="number" value="${pval()}" ${adm?'':'disabled'}></div></div>
  ${adm?'<div class="actions"><button class="btn" onclick="loyaltySave()">حفظ الإعدادات</button></div>':''}
  <p class="muted" style="font-size:12.5px">تحتاج الميزة جدول الولاء في Supabase (migrations/004). ${OK()?'الاتصال بالسحابة متوفر.':'<b>غير متصل بالسحابة الآن.</b>'}</p>`;
  if(on()){
    body+=`<label>العميل</label><select id="ly_c" onchange="loyaltyOpen(this.value)"><option value="">— اختر —</option>${db.customers.map(x=>`<option value="${esc(x.id)}" ${x.id===window.__loyCid?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
    if(c){let rows=null,err='';try{if(OK())rows=await API().list(c.id)}catch(e){err='تعذّر جلب السجل (هل طُبّق الترحيل؟)'}
      const bal=rows?rows.reduce((a,x)=>a+num(x.points),0):null,pend=out.filter(x=>x.cid===c.id&&!x.rej).reduce((a,x)=>a+x.pts,0);
      body+=`<div class="card" style="margin-top:8px"><div>الرصيد: <b>${bal===null?'—':bal}</b> نقطة ${pend?`<small>(معلّق ${pend>0?'+':''}${pend})</small>`:''} ${bal!==null?`<small>≈ ${money(bal*pval())}</small>`:''}</div>${err?`<small class="muted">${esc(err)}</small>`:''}
      ${(rows||[]).slice(0,10).map(x=>`<div style="font-size:12px;display:flex;justify-content:space-between"><span>${esc(fdate(String(x.created_at).slice(0,10)))} — ${({earn:'كسب',redeem:'استبدال',adjust:'تعديل',reverse:'عكس'})[x.kind]||esc(x.kind)} ${esc(x.ref||'')}</span><b>${x.points>0?'+':''}${x.points}</b></div>`).join('')}</div>
      <div class="f2"><div><label>نقاط للاستبدال</label><input id="ly_pts" type="number"></div><div style="align-self:end"><button class="btn primary" onclick="orvexRedeem()">استبدال</button></div></div>`}
    const rj=out.filter(x=>x.rej);if(rj.length)body+=`<p class="note" style="font-size:12.5px">حركات مرفوضة (${rj.length}): ${rj.map(x=>esc(x.ref||x.id)+' — '+esc(x.rej)).join('، ')}</p>`;
    if(out.filter(x=>!x.rej).length)body+=`<p class="muted" style="font-size:12.5px">حركات بانتظار الإرسال: ${out.filter(x=>!x.rej).length}</p>`}
  modal('نقاط الولاء',body)};
window.loyaltySave=function(){if(!isAdmin())return toast('للمدير فقط');const s=db.settings;
  const _lo=s.loyaltyOn,_lr=s.loyEarnPer,_lv=s.loyPointVal;s.loyaltyOn=$('#ly_on').checked;s.loyEarnPer=Math.max(1,num($('#ly_rate').value)||1000);s.loyPointVal=Math.max(0.01,num($('#ly_val').value)||10);if(window.orvexLog)orvexLog('loyalty','','مفعّل '+!!_lo+'←'+s.loyaltyOn+' | كل '+_lr+'←'+s.loyEarnPer+' | القيمة '+_lv+'←'+s.loyPointVal);save();toast('تم الحفظ');window.loyaltyOpen(window.__loyCid)};

const _vp=vParties;vParties=function(){return _vp()+((isAdmin()||can('parties'))?`<div class="actions"><button class="btn" onclick="loyaltyOpen()">⭐ نقاط الولاء</button></div>`:'')};

window.ORVEX_LOY={flush,outGet,qadd,rate,pval};
})();
