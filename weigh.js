/* ORVEX — البيع بالوزن (ميزة weights): اختيار مادة، إدخال الوزن (كغم/غرام) أو المبلغ، وإضافتها لفاتورة نقطة البيع.
   الافتراض: وحدة المادة الأساسية وسعرها بالكيلوغرام. لا يغيّر المخزون ولا الأسعار؛ الإضافة تمر عبر addCart الحالية. */
(function(root){
'use strict';
const UNITS={kg:1,g:0.001};
const q3=n=>Math.round((n+Number.EPSILON)*1000)/1000;
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const pos=n=>{n=parseFloat(n);return isFinite(n)&&n>0?n:0};
function weightToQty(value,unit){const f=UNITS[unit];return f?q3(pos(value)*f):0}
function amountToQty(amount,price){const p=pos(price);return p>0?q3(pos(amount)/p):0}
function amountFor(qty,price){return r2(pos(qty)*pos(price))}
const Wt={weightToQty,amountToQty,amountFor};
root.ORVEX_WEIGH=Wt;
if(typeof module!=='undefined'&&module.exports)module.exports=Wt;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS)root.ORVEX_ACT.SCREENS.weights={fn:'weighModal',label:'البيع بالوزن'};
let W={pid:'',q:''};
root.weighModal=function(){
  if(typeof can==='function'&&!can('pos'))return toast('ليست لديك صلاحية البيع');
  const q=W.q.trim().toLowerCase(),L=db.products.filter(p=>p.stock>0&&(!q||p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q))).slice(0,40),p=W.pid?prod(W.pid):null;
  modal('البيع بالوزن',`<p class="muted" style="margin-top:0">سعر المادة يُعتبر لكل كيلوغرام.</p>
  <input class="search" type="search" placeholder="ابحث عن المادة" value="${E(W.q)}" oninput="weighQ(this.value)">
  <div class="card" id="wlist" style="max-height:30vh;overflow:auto">${listHtml(L)}</div>
  ${p?`<div class="card"><b>${E(p.name)}</b> — ${money(p.price)} / كغم — المتوفر ${p.stock}
  <div class="f2"><div><label>الوزن</label><input id="wg_v" type="number" inputmode="decimal" step="any" oninput="weighCalc('w')"></div><div><label>الوحدة</label><select id="wg_u" onchange="weighCalc('w')"><option value="kg">كغم</option><option value="g">غرام</option></select></div></div>
  <label>أو المبلغ المطلوب (${E(db.settings.currency)})</label><input id="wg_a" type="number" inputmode="decimal" step="any" oninput="weighCalc('a')">
  <div id="wg_out" class="note" style="margin-top:8px">—</div><div class="actions"><button class="btn primary" onclick="weighAdd()">إضافة للفاتورة</button></div></div>`:''}`);
};
function listHtml(L){
  if(!L.length)return empty('لا توجد مواد متوفرة');
  return L.map(p=>`<button class="row tap" onclick="weighPick('${jsq(p.id)}')"><div class="grow"><div class="t">${E(p.name)}</div></div><div class="end"><b>${money(p.price)}</b><small>المتوفر: ${p.stock}</small></div></button>`).join('');
}
root.weighQ=v=>{W.q=v;const l=document.getElementById('wlist');if(l){const q=v.trim().toLowerCase();l.innerHTML=listHtml(db.products.filter(p=>p.stock>0&&(!q||p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q))).slice(0,40))}};
root.weighPick=id=>{W.pid=id;weighModal()};
let cur=0;
root.weighCalc=function(from){
  const p=prod(W.pid);if(!p)return;const g=id=>document.getElementById(id).value;
  let qty;
  if(from==='a'){qty=amountToQty(g('wg_a'),p.price);document.getElementById('wg_v').value='';}
  else{qty=weightToQty(g('wg_v'),g('wg_u'));document.getElementById('wg_a').value=''}
  cur=qty;const out=document.getElementById('wg_out');
  out.textContent=qty>0?(qty+' كغم = '+money(amountFor(qty,p.price))+(qty>p.stock?' — أكبر من المتوفر':'')):'—';
};
root.weighAdd=function(){
  const p=prod(W.pid);if(!p||!(cur>0))return toast('أدخل الوزن أو المبلغ');
  if(cur>p.stock)return toast('المتوفر من «'+p.name+'»: '+p.stock);
  const line=()=>state.cart.find(l=>l.pid===p.id),before=line()?line().qty:0;
  addCart(p.id,cur,true);
  const after=line()?line().qty:0;
  if(after>before){closeModal();cur=0;W.pid=''} /* لم تُضف (مخزون غير كافٍ): تبقى النافذة مفتوحة */
};
})(typeof window!=='undefined'?window:globalThis);
