/* ORVEX — المطعم: الطاولات (tables) + الطلبات (orders) + شاشة المطبخ (kitchen_display).
   التخزين: db.rtables و db.rorders (يُزامَنان). الدفع: يُحمَّل الطلب إلى سلة نقطة البيع فيمر بدورة الفاتورة والمخزون والمحاسبة الحالية،
   ولا يُنشأ أي قيد مالي هنا. */
(function(root){
'use strict';
const STATUS={open:'مفتوح',sent:'أُرسل للمطبخ',preparing:'قيد التحضير',ready:'جاهز',served:'قُدّم',billed:'حُوّل للفاتورة',cancelled:'ملغى'};
const NEXT={open:['sent','cancelled'],sent:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['served'],served:['billed'],billed:[],cancelled:[]};
const ACTIVE=s=>s!=='billed'&&s!=='cancelled';
const KITCHEN=s=>s==='sent'||s==='preparing'||s==='ready';
const canMove=(a,b)=>(NEXT[a]||[]).includes(b);
function move(o,to,by,at){
  if(!o||!canMove(o.status,to))return false;
  if(to==='sent'&&!(o.items||[]).length)return false; /* لا يُرسل طلب فارغ */
  o.hist=(o.hist||[]).concat([{at,by:by||'',from:o.status,to}]).slice(-40);o.status=to;return true;
}
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
function total(items,priceOf){return r2((items||[]).reduce((s,i)=>s+(+i.qty||0)*(+priceOf(i.pid)||0),0))}
/* حالة الطاولة من طلباتها: free أو busy مع الطلب النشط */
function tableState(t,orders){
  const o=(orders||[]).find(x=>x.tableId===t.id&&ACTIVE(x.status));
  return o?{state:'busy',order:o}:{state:'free',order:null};
}
function ageMin(o,nowMs){const t=Date.parse(o.sentAt||o.at);return isFinite(t)?Math.max(0,Math.round((nowMs-t)/60000)):0}
function addItem(o,pid,qty,name){
  if(!o||!(qty>0))return false;
  const l=(o.items||(o.items=[])).find(i=>i.pid===pid&&!i.note);
  if(l)l.qty=Math.round((l.qty+qty)*1000)/1000;else o.items.push({pid,name,qty,note:''});
  return true;
}
const R={STATUS,NEXT,ACTIVE,KITCHEN,canMove,move,total,tableState,ageMin,addItem};
root.ORVEX_REST=R;
if(typeof module!=='undefined'&&module.exports)module.exports=R;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s),T=()=>(db.rtables=db.rtables||[]),O=()=>(db.rorders=db.rorders||[]);
const S=root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS;
if(S){S.tables={fn:'tablesModal',label:'الطاولات'};S.orders={fn:'tablesModal',label:'طلبات المطعم'};S.kitchen_display={fn:'kitchenModal',label:'شاشة المطبخ'}}
const allowed=()=>typeof can==='function'?can('pos'):true;
const me=()=>(curUser()||{}).name||'';
const now=()=>new Date().toISOString();
const rnd=()=>Math.random().toString(36).slice(2,5).toUpperCase();
const price=pid=>{const p=prod(pid);return p?p.price:0};

root.tablesModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  modal('الطاولات والطلبات',`<div class="card">${T().length?T().map(t=>{const st=tableState(t,O());
    return `<button class="row tap" onclick="tableOpen('${jsq(t.id)}')"><div class="grow"><div class="t">${E(t.name)} ${t.seats?`<small>${t.seats} مقاعد</small>`:''}</div>${st.order?`<small>${E(STATUS[st.order.status])} · ${money(total(st.order.items,price))}</small>`:''}</div><span class="badge ${st.state==='busy'?'':'grey'}">${st.state==='busy'?'مشغولة':'فارغة'}</span></button>`}).join(''):empty('لا طاولات. أضف طاولة.')}</div>
  <div class="actions">${isAdmin()?'<button class="btn primary" onclick="tableForm()">+ طاولة</button>':''}<button class="btn" onclick="kitchenModal()">شاشة المطبخ</button></div>`);
};
root.tableForm=function(){
  if(!isAdmin())return;
  modal('طاولة جديدة',`<label>الاسم / الرقم</label><input id="tb_n"><label>عدد المقاعد (اختياري)</label><input id="tb_s" type="number" inputmode="numeric"><div class="actions"><button class="btn primary" onclick="tableSave()">حفظ</button><button class="btn ghost" onclick="tablesModal()">رجوع</button></div>`);
};
root.tableSave=function(){
  const n=document.getElementById('tb_n').value.trim();if(!n)return toast('أدخل الاسم');
  if(T().some(t=>t.name===n))return toast('الاسم مستخدم');
  T().push({id:uid(),name:n,seats:parseInt(document.getElementById('tb_s').value,10)||0});save();tablesModal();
};
root.tableDel=id=>{
  if(!isAdmin())return;const t=T().find(x=>x.id===id);if(!t)return;
  if(tableState(t,O()).state==='busy')return toast('عليها طلب نشط');
  askConfirm('حذف الطاولة؟',()=>{db.rtables=T().filter(x=>x.id!==id);save();tablesModal()},'حذف');
};
/* فتح طاولة: ينشئ طلبًا مفتوحًا إن لم يكن لها طلب نشط */
root.tableOpen=function(tid){
  const t=T().find(x=>x.id===tid);if(!t)return;
  let o=tableState(t,O()).order;
  if(!o){o={id:uid(),no:'ORD-'+today().replace(/-/g,'').slice(2)+'-'+rnd(),tableId:t.id,tableName:t.name,at:now(),status:'open',items:[],by:me(),hist:[]};O().push(o);save()}
  orderView(o.id);
};
let pq='';
root.orderView=function(id,keepQ){
  const o=O().find(x=>x.id===id);if(!o)return;if(!keepQ)pq='';
  const editable=o.status==='open',q=pq.trim().toLowerCase();
  const L=editable?db.products.filter(p=>p.stock>0&&(!q||p.name.toLowerCase().includes(q))).slice(0,30):[];
  const mv=(NEXT[o.status]||[]).map(s=>`<button class="btn ${s==='cancelled'?'danger':s==='billed'?'primary':''}" onclick="orderMove('${jsq(o.id)}','${s}')">${s==='billed'?'تحويل للفاتورة':s==='sent'?'إرسال للمطبخ':E(STATUS[s])}</button>`).join('');
  modal(E(o.tableName)+' — '+o.no,`<div class="card"><div class="row"><span class="grow">الحالة</span><b>${E(STATUS[o.status])}</b></div>
  ${(o.items||[]).map((i,k)=>`<div class="row"><div class="grow">${E(i.name)}${i.note?`<br><small>${E(i.note)}</small>`:''}</div><b>× ${i.qty}</b><b>${money(i.qty*price(i.pid))}</b>${editable?`<button class="btn danger" onclick="orderDel('${jsq(o.id)}',${k})">×</button>`:''}</div>`).join('')||empty('لا أصناف بعد')}
  <div class="row"><span class="grow"><b>الإجمالي</b></span><b>${money(total(o.items,price))}</b></div></div>
  ${editable?`<input class="search" type="search" placeholder="ابحث عن صنف لإضافته" value="${E(pq)}" oninput="orderQ('${jsq(o.id)}',this.value)"><div class="card" id="ol" style="max-height:28vh;overflow:auto">${prodHtml(o.id,L)}</div>`:''}
  <div class="actions">${mv}<button class="btn ghost" onclick="tablesModal()">رجوع</button>${isAdmin()&&!O().some(x=>x.tableId===o.tableId&&x.id!==o.id&&ACTIVE(x.status))?`<button class="btn" onclick="tableDel('${jsq(o.tableId)}')">حذف الطاولة</button>`:''}</div>`);
};
function prodHtml(oid,L){
  return L.length?L.map(p=>`<button class="row tap" onclick="orderAdd('${jsq(oid)}','${jsq(p.id)}')"><div class="grow">${E(p.name)}</div><b>${money(p.price)}</b></button>`).join(''):empty('لا نتائج');
}
root.orderQ=(id,v)=>{pq=v;const l=document.getElementById('ol');if(l){const q=v.trim().toLowerCase();l.innerHTML=prodHtml(id,db.products.filter(p=>p.stock>0&&(!q||p.name.toLowerCase().includes(q))).slice(0,30))}};
root.orderAdd=function(id,pid){
  const o=O().find(x=>x.id===id),p=prod(pid);if(!o||o.status!=='open'||!p)return;
  const have=((o.items||[]).find(i=>i.pid===pid)||{}).qty||0;
  if(have+1>p.stock)return toast('المتوفر من «'+p.name+'»: '+p.stock);
  addItem(o,pid,1,p.name);save();orderView(id,true);
};
root.orderDel=function(id,k){const o=O().find(x=>x.id===id);if(!o||o.status!=='open')return;o.items.splice(k,1);save();orderView(id)};
root.orderMove=function(id,to){
  const o=O().find(x=>x.id===id);if(!o)return;
  const go=()=>{
    if(to==='billed')return orderBill(o);
    if(move(o,to,me(),now())){if(to==='sent')o.sentAt=now();save();toast('تم');orderView(id)}else toast(to==='sent'?'أضف أصنافًا أولًا':'انتقال غير مسموح');
  };
  if(to==='cancelled')return askConfirm('إلغاء الطلب؟',go,'إلغاء الطلب');
  go();
};
/* التحويل للفاتورة: تُضاف الأصناف إلى سلة نقطة البيع، ولا يُغلق الطلب إلا إذا أُضيفت كلها */
function orderBill(o){
  if(typeof addCart!=='function'||typeof state==='undefined')return toast('نقطة البيع غير متاحة');
  if(state.cart&&state.cart.length)return toast('سلة نقطة البيع غير فارغة؛ أنهِ الفاتورة الحالية أولًا');
  for(const i of o.items){const p=prod(i.pid);if(!p||p.stock<i.qty)return toast('لا يكفي مخزون «'+i.name+'»')}
  o.items.forEach(i=>addCart(i.pid,i.qty,true));
  const ok=o.items.every(i=>(state.cart.find(l=>l.pid===i.pid)||{}).qty>=i.qty);
  if(!ok)return toast('تعذّر نقل كل الأصناف إلى السلة');
  move(o,'billed',me(),now());save();closeModal();
  if(typeof go==='function')go('pos');toast('الطلب في سلة البيع — أتمم الدفع');
}
/* شاشة المطبخ: الطلبات المرسلة بترتيب الأقدم، مع تحديث تلقائي كل 20 ثانية وهي مفتوحة */
let kt=null;
root.kitchenModal=function(){
  if(!allowed())return toast('ليست لديك صلاحية');
  const L=O().filter(o=>KITCHEN(o.status)).sort((a,b)=>String(a.sentAt||a.at).localeCompare(String(b.sentAt||b.at)));
  modal('المطبخ',`<div id="kd">${L.length?L.map(o=>`<div class="card"><div class="row"><b class="grow">${E(o.tableName)} <small>${E(o.no)}</small></b><span class="badge ${o.status==='ready'?'':'grey'}">${E(STATUS[o.status])}</span><small>${ageMin(o,Date.now())} د</small></div>${o.items.map(i=>`<div>${i.qty} × ${E(i.name)}${i.note?` <small>(${E(i.note)})</small>`:''}</div>`).join('')}<div class="actions">${o.status==='sent'?`<button class="btn" onclick="kitchenMove('${jsq(o.id)}','preparing')">بدء التحضير</button>`:''}${o.status==='preparing'?`<button class="btn primary" onclick="kitchenMove('${jsq(o.id)}','ready')">جاهز</button>`:''}${o.status==='ready'?`<button class="btn primary" onclick="kitchenMove('${jsq(o.id)}','served')">تم التقديم</button>`:''}</div></div>`).join(''):empty('لا طلبات في المطبخ')}</div><div class="actions"><button class="btn ghost" onclick="tablesModal()">الطاولات</button></div>`);
  clearInterval(kt);kt=setInterval(()=>{if(!document.getElementById('kd')){clearInterval(kt);return}kitchenModal()},20000);
};
root.kitchenMove=function(id,to){const o=O().find(x=>x.id===id);if(o&&move(o,to,me(),now())){save();kitchenModal()}};
})(typeof window!=='undefined'?window:globalThis);
