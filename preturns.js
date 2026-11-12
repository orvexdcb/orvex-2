/* ORVEX — مرتجع الشراء (مرتجع للمورد).
   - يخفض المخزون (والتشغيلة إن كان المنتج بتشغيلات) بالتكلفة الأصلية للسطر (صافي + تكاليف الوصول)/الكمية.
   - method='balance': يخصم من ذمة المورد حتى رصيده (apPart) والباقي نقدًا؛ غيره: استرداد نقدي/بنكي كامل.
   - لا يتجاوز الكمية المشتراة المتبقية للإرجاع ولا المخزون المتاح؛ لا حذف: الإلغاء بـ void لاحقًا فقط (غير مفعّل بعد).
   - فاتورة الشراء التي عليها مرتجعات لا تُعدَّل ولا تُحذف (يمنع تعارض المخزون والذمم).
   - القيد المحاسبي مشتق في accounting.js (preturnLines)، والمجموعة db.preturns تتزامن كأي records. */
(function(root){
'use strict';
var num=function(v){var n=parseFloat(v);return isFinite(n)?n:0},r2=function(n){return Math.round(num(n)*100)/100},r4=function(n){return Math.round(num(n)*10000)/10000};
var METHODS=['cash','card','transfer','balance'];
function capacities(db,po){
  var used={};(db.preturns||[]).forEach(function(r){if(r.void||r.poId!==po.id)return;(r.items||[]).forEach(function(it){used[it.lk]=r4((used[it.lk]||0)+num(it.qty))})});
  return(po.lines||[]).map(function(l,k){return{k:k,l:l,left:r4(num(l.qty)-(used[k]||0))}})}
function hasReturns(db,po){return!!po&&(db.preturns||[]).some(function(r){return!r.void&&r.poId===po.id})}
function create(db,input,env){
  env=env||{};var MAIN=env.MAIN||'main';
  var prod=function(id){return(db.products||[]).find(function(p){return p.id===id})};
  var po=(db.purchases||[]).find(function(x){return x.id===input.poId});
  if(!po||po.void)return{err:'فاتورة الشراء غير موجودة'};
  if(METHODS.indexOf(input.method)<0)return{err:'اختر طريقة الاسترداد'};
  var req=(input.items||[]).filter(function(i){return num(i.qty)>0});
  if(!req.length)return{err:'أدخل كمية مرتجعة لصنف واحد على الأقل'};
  var caps=capacities(db,po),items=[],need={},lotNeed={},err=null;
  req.forEach(function(rq){
    if(err)return;var p=prod(rq.pid);if(!p){err='صنف غير موجود';return}
    var left=r4(num(rq.qty)),wh=rq.wh||MAIN;
    caps.forEach(function(c){
      if(c.l.pid!==rq.pid||left<=1e-9)return;
      var t=Math.min(c.left,left);if(!(t>1e-9))return;
      c.left=r4(c.left-t);left=r4(left-t);
      var unit=r4((num(c.l.net!==undefined?c.l.net:num(c.l.qty)*num(c.l.cost))+num(c.l.lc))/num(c.l.qty));
      items.push({pid:p.id,name:p.name,qty:r4(t),cost:unit,lk:c.k,lot:rq.lot||'',wh:wh});
    });
    if(left>1e-9){err='الكمية المرتجعة من «'+p.name+'» أكبر من المتاح للإرجاع في هذه الفاتورة';return}
    var key=p.id+'|'+wh;need[key]=r4((need[key]||0)+num(rq.qty));
    if(p.trackBatch){
      if(!rq.lot){err='حدد تشغيلة «'+p.name+'»';return}
      var b=(p.batches||[]).find(function(x){return x.no===rq.lot});
      if(!b){err='تشغيلة غير موجودة: '+rq.lot;return}
      var lk=p.id+'|'+rq.lot;lotNeed[lk]=r4((lotNeed[lk]||0)+num(rq.qty));
      if(lotNeed[lk]>num(b.qty)+1e-4){err='كمية التشغيلة '+rq.lot+' أقل من المرتجع';return}
    }
  });
  if(err)return{err:err};
  var bad=Object.keys(need).map(function(k){var s=k.split('|'),p=prod(s[0]),av=env.whQty?num(env.whQty(p,s[1])):num(p.stock);return need[k]>av+1e-4?p.name:null}).filter(Boolean)[0];
  if(bad)return{err:'المخزون غير كافٍ لإرجاع «'+bad+'»'};
  var total=r2(items.reduce(function(s,i){return s+i.qty*i.cost},0));
  if(!(total>0))return{err:'قيمة المرتجع صفر'};
  var sp=po.sid?(db.suppliers||[]).find(function(s){return s.id===po.sid}):null,apPart=0;
  if(input.method==='balance'){if(!sp)return{err:'لا مورد على الفاتورة لخصم الذمة؛ اختر استردادًا نقديًا'};apPart=r2(Math.min(total,Math.max(num(sp.balance),0)))}
  /* ---- تطبيق الأثر (بعد اكتمال كل التحققات) ---- */
  items.forEach(function(it){
    var p=prod(it.pid);
    if(env.whMove)env.whMove(p,it.wh,-it.qty);else p.stock=r2(num(p.stock)-it.qty);
    if(p.trackBatch&&it.lot){var b=p.batches.find(function(x){return x.no===it.lot});b.qty=r2(num(b.qty)-it.qty)}
  });
  if(sp&&apPart>0)sp.balance=r2(num(sp.balance)-apPart);
  var now=env.now||new Date().toISOString();
  var r={id:env.uid?env.uid():('pr'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)),
    no:env.no||('PR-'+((db.preturns||[]).length+1)),at:now,date:input.date||(env.today?env.today():now.slice(0,10)),
    poId:po.id,poNo:po.no,sid:po.sid||'',items:items,total:total,method:input.method,
    cashMethod:input.method==='balance'?'cash':input.method,apPart:apPart,cashPart:r2(total-apPart),
    note:String(input.note||'').trim(),by:env.by||''};
  (db.preturns=db.preturns||[]).push(r);
  return{ok:r}}
var api={create:create,capacities:capacities,hasReturns:hasReturns,METHODS:METHODS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.orvexPReturn=api;

/* ================= الواجهة (تعمل فقط داخل التطبيق) ================= */
if(typeof document==='undefined'||typeof modal!=='function'||typeof showPurchase!=='function'||typeof db==='undefined')return;
var I3=window.ORVEX_INV3||{};
function env(){return{MAIN:I3.MAIN||'main',whQty:I3.whQty,whMove:I3.whMove,uid:uid,today:today,by:(curUser()||{}).name||'',no:prNo()}}
function prNo(){var d='';try{d=(localStorage.getItem(KEY+'_devid')||'').slice(0,3)}catch(e){}
  db.settings.nextPr=Math.max(1,Math.floor(+db.settings.nextPr||1));var mx=0;(db.preturns||[]).forEach(function(r){var m=/-(\d+)$/.exec(String(r.no||''));if(m&&+m[1]>mx)mx=+m[1]});
  var n=Math.max(db.settings.nextPr,mx+1);db.settings.nextPr=n+1;return 'PR-'+(d?'L'+d+'-':'')+n}
var canRet=function(){return can('purchases')};
var _sp=showPurchase;
showPurchase=function(id){_sp(id);var po=db.purchases.find(function(x){return x.id===id}),b=document.querySelector('#modal .sh-body');if(!po||!b)return;
  var rs=(db.preturns||[]).filter(function(r){return r.poId===id&&!r.void});
  var h=rs.map(function(r){return '<div class="row"><span class="grow">↩️ '+esc(r.no)+' — '+fdate(r.date)+'</span><b>'+money(r.total)+'</b></div>'}).join('');
  b.insertAdjacentHTML('beforeend',(rs.length?'<div class="card"><b>مرتجعات هذه الفاتورة</b>'+h+'</div>':'')+(canRet()?'<div class="actions"><button class="btn" onclick="prOpen(\''+jsq(id)+'\')">↩️ مرتجع شراء</button></div>':''))};
window.prOpen=function(id){if(!canRet())return toast('ليست لديك صلاحية');var po=db.purchases.find(function(x){return x.id===id});if(!po)return;
  var caps=capacities(db,po).filter(function(c){return c.left>0}),s=po.sid?(db.suppliers||[]).find(function(x){return x.id===po.sid}):null;
  if(!caps.length)return toast('لا توجد كميات متاحة للإرجاع في هذه الفاتورة');
  var rows=caps.map(function(c,i){var p=db.products.find(function(x){return x.id===c.l.pid});
    var lot=p&&p.trackBatch?'<select id="pr_l'+i+'"><option value="">التشغيلة…</option>'+(p.batches||[]).filter(function(b){return num(b.qty)>0}).map(function(b){return '<option>'+esc(b.no)+'</option>'}).join('')+'</select>':'';
    return '<div class="row"><div class="grow t">'+esc(c.l.name)+'<br><small>المتاح للإرجاع '+c.left+'</small></div>'+lot+'<input id="pr_q'+i+'" type="number" min="0" max="'+c.left+'" step="any" placeholder="0" style="width:90px"></div>'}).join('');
  window.__prCaps=caps.map(function(c){return c.l.pid});
  modal('مرتجع شراء — '+po.no,'<div class="card">'+rows+'</div><label>طريقة الاسترداد</label><select id="pr_m"><option value="balance"'+(s?'':' disabled')+'>خصم من ذمة المورد'+(s?' (رصيده '+money(s.balance)+')':'')+'</option><option value="cash">نقدًا (الصندوق)</option><option value="transfer">تحويل بنكي</option><option value="card">بطاقة</option></select><label>ملاحظة</label><input id="pr_n"><div class="actions"><button class="btn primary" id="pr_ok" onclick="prSave(\''+jsq(id)+'\')">تسجيل المرتجع</button><button class="btn ghost" onclick="showPurchase(\''+jsq(id)+'\')">رجوع</button></div>')};
window.prSave=function(id){if(!canRet())return;var btn=document.getElementById('pr_ok');if(btn&&btn.disabled)return;
  var items=(window.__prCaps||[]).map(function(pid,i){var q=document.getElementById('pr_q'+i),l=document.getElementById('pr_l'+i);return{pid:pid,qty:q?q.value:0,lot:l?l.value:''}});
  if(btn)btn.disabled=true;
  var r=create(db,{poId:id,items:items,method:document.getElementById('pr_m').value,note:document.getElementById('pr_n').value},env());
  if(r.err){if(btn)btn.disabled=false;return toast(r.err)}
  save();render();showPurchase(id);toast('تم تسجيل مرتجع الشراء '+r.ok.no)};
/* فاتورة عليها مرتجعات: لا حذف ولا تعديل */
if(typeof pinvDelete==='function'){var _pd=pinvDelete;pinvDelete=function(){var P=state.pinv,po=P&&db.purchases[P.navIdx];if(po&&hasReturns(db,po))return toast('لا يمكن حذف فاتورة عليها مرتجعات شراء');return _pd()}}
if(typeof pinvRevert==='function'){var _pr=pinvRevert;pinvRevert=function(po){if(hasReturns(db,po)){toast('لا يمكن تعديل فاتورة عليها مرتجعات شراء');throw new Error('ORVEX_PO_HAS_RETURNS')}return _pr(po)}}
})(typeof window!=='undefined'?window:globalThis);
