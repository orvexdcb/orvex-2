/* ORVEX — محرك تقييم تكلفة المخزون (نقي، بلا DOM ولا تعديل لأي بيانات).
   يحسب تكلفة كل صرف بثلاث سياسات: fifo | wac (متوسط مرجّح متحرك) | specific (حسب التشغيلة/الرقم التسلسلي).
   مشتق ومحدَّد: النتيجة تعتمد على المستندات فقط، فتتطابق على كل الأجهزة بعد المزامنة (لا طبقات مخزَّنة تتعارض).
   غير موصول بالواجهة بعد: لا يغيّر p.cost ولا قيود البيع الحالية. */
(function(root){
'use strict';
var r2=function(n){return Math.round((+n||0)*100)/100},r4=function(n){return Math.round((+n||0)*10000)/10000};
var ORDER={in:0,ret_in:1,out:2};
function sortEv(ev){return ev.map(function(e,i){return{e:e,i:i}}).sort(function(a,b){
  var x=a.e,y=b.e;if(x.date!==y.date)return x.date<y.date?-1:1;
  if((x.at||'')!==(y.at||''))return(x.at||'')<(y.at||'')?-1:1;
  if(ORDER[x.type]!==ORDER[y.type])return ORDER[x.type]-ORDER[y.type];
  return a.i-b.i}).map(function(o){return o.e})}
/* events: [{type:'in'|'ret_in'|'out', date:'YYYY-MM-DD', at?, qty, unitCost? (للدخول), lot?, ref}]
   opening: {qty,cost} رصيد افتتاحي قبل أول حركة. method: 'fifo'|'wac'|'specific' */
function value(events,method,opening){
  var ev=sortEv(events),outs=[],layers=[],short=0,lastUnit=0,qtyOnHand=0,avg=0;
  if(opening&&opening.qty>0){layers.push({qty:opening.qty,unit:+opening.cost||0,lot:opening.lot||'',ref:'opening'});qtyOnHand=opening.qty;avg=+opening.cost||0;lastUnit=avg}
  ev.forEach(function(e){
    var q=+e.qty||0;if(!(q>0))return;
    if(e.type==='in'||e.type==='ret_in'){
      var u=+e.unitCost||0;layers.push({qty:q,unit:u,lot:e.lot||'',ref:e.ref});
      avg=(qtyOnHand+q)>0?((qtyOnHand*avg)+(q*u))/(qtyOnHand+q):u;qtyOnHand+=q;lastUnit=u;return}
    /* out */
    var need=q,cost=0,parts=[],flag=false;
    if(method==='wac'){
      var take=Math.min(need,Math.max(qtyOnHand,0));cost+=take*avg;need-=take;qtyOnHand-=take;
      var left=take;for(var i=0;i<layers.length&&left>1e-9;i++){var t=Math.min(layers[i].qty,left);layers[i].qty-=t;left-=t}
      if(take>0)parts.push({q:take,unit:avg})}
    else{
      var cand=layers.filter(function(l){return l.qty>1e-9&&(method!=='specific'||(e.lot&&l.lot===e.lot))});
      if(e.fromRef)cand=cand.filter(function(l){return l.ref===e.fromRef}).concat(cand.filter(function(l){return l.ref!==e.fromRef}));
      for(var j=0;j<cand.length&&need>1e-9;j++){var tk=Math.min(cand[j].qty,need);cand[j].qty-=tk;need-=tk;cost+=tk*cand[j].unit;qtyOnHand-=tk;parts.push({q:tk,unit:cand[j].unit,lot:cand[j].lot})}}
    if(need>1e-9){ /* عجز: نقيّم على آخر تكلفة معروفة ونُعلِّم */
      flag=true;short+=need;cost+=need*lastUnit;qtyOnHand-=need;parts.push({q:need,unit:lastUnit,short:true});need=0}
    outs.push({ref:e.ref,qty:q,cost:r2(cost),unit:r4(cost/q),parts:parts,short:flag});
  });
  layers=layers.filter(function(l){return l.qty>1e-9});
  var remQty=0,remVal=0;
  if(method==='wac'){remQty=Math.max(qtyOnHand,0);remVal=remQty*avg}
  else layers.forEach(function(l){remQty+=l.qty;remVal+=l.qty*l.unit});
  return{outs:outs,layers:layers.map(function(l){return{qty:r4(l.qty),unit:r4(l.unit),lot:l.lot}}),remQty:r4(remQty),remValue:r2(remVal),shortQty:r4(short),cogs:r2(outs.reduce(function(s,o){return s+o.cost},0))}}
/* يبني الحركات لمنتج من مستندات المحل: مشتريات (+ تكاليف الوصول)، مبيعات، مرتجعات بيع.
   تكلفة وحدة الشراء = (صافي السطر + تكلفة الوصول المُوزَّعة) / الكمية. */
function movements(db,pid){
  var ev=[];
  (db.purchases||[]).forEach(function(po){if(po.void)return;(po.lines||[]).forEach(function(l,k){
    if(l.pid!==pid||!(+l.qty>0))return;
    var tot=(+l.net||0)+(+l.lc||0);ev.push({type:'in',date:po.date,at:po.at,qty:+l.qty,unitCost:tot/(+l.qty),lot:l.lot||l.batch||'',ref:'po:'+po.id+':'+k})})});
  (db.sales||[]).forEach(function(s){if(s.void)return;(s.items||[]).forEach(function(it,k){
    if(it.pid!==pid||!(+it.qty>0))return;ev.push({type:'out',date:s.date,at:s.at,qty:+it.qty,lot:(it.bt&&it.bt[0]&&it.bt[0].no)||it.lot||'',ref:'sale:'+s.id+':'+k})})});
  (db.returns||[]).forEach(function(rt){if(rt.void)return;(rt.items||[]).forEach(function(it,k){
    if(it.pid!==pid||!(+it.qty>0))return;ev.push({type:'ret_in',date:rt.date,at:rt.at,qty:+it.qty,unitCost:+it.cost||0,lot:it.lot||'',ref:'ret:'+rt.id+':'+k})})});
  (db.preturns||[]).forEach(function(r){if(r.void)return;(r.items||[]).forEach(function(it,k){
    if(it.pid!==pid||!(+it.qty>0))return;ev.push({type:'out',date:r.date,at:r.at,qty:+it.qty,lot:it.lot||'',fromRef:'po:'+r.poId+':'+it.lk,ref:'pret:'+r.id+':'+k,isPReturn:true})})});
  return ev}
/* رصيد افتتاحي = المخزون الحالي − صافي الحركات المسجّلة (ما قبل التوثيق) بتكلفة المنتج الحالية */
function opening(db,p,ev){var net=ev.reduce(function(s,e){return s+(e.type==='out'?-e.qty:e.qty)},0);var q=r4((+p.stock||0)-net);return q>0?{qty:q,cost:+p.cost||0}:null}
function valueProduct(db,p,method){var ev=movements(db,p.id);return value(ev,method||'fifo',opening(db,p,ev))}
var api={value:value,movements:movements,opening:opening,valueProduct:valueProduct};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.orvexCosting=api;
})(typeof window!=='undefined'?window:globalThis);
