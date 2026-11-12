/* ORVEX — المرحلة 1 (تكملة): مخازن متعددة + تحويلات + جلسات جرد + حدود إعادة الطلب + تكاليف الوصول (inventory3.js)
   إضافي فقط ولا يحتاج أي ترحيل في Supabase:
   - المجموعات الجديدة (warehouses, transfers, stocktakes) تُزامَن عبر جدول records الحالي (kind) كباقي المجموعات الاحتياطية.
   - p.stock يبقى الإجمالي كما كان، فكل شاشات البيع والتقارير القديمة تعمل دون تغيير.
   - كمية المخزن الرئيسي (main) = p.stock − مجموع p.wh[*]  (مشتقة، فلا تتعارض مع أي كود قديم).
   - يُحمَّل بعد inventory2.js وقبل server.js. */
(function(){
'use strict';
const MAIN='main';
const lc=s=>String(s==null?'':s).trim().toLowerCase();
const ensure=()=>{['warehouses','transfers','stocktakes'].forEach(k=>{if(!Array.isArray(db[k]))db[k]=[]})};
const I2=()=>window.ORVEX_INV2||{};
const histf=(p,type,from,to,reason,extra)=>{const h=I2().hist;if(h)h(p,type,from,to,reason,extra)};
const audit=(a,b,c)=>{try{if(window.orvexLog)window.orvexLog(a,b,c)}catch(e){}};
const by=()=>((typeof curUser==='function'&&curUser())||{}).name||'';
const stamp=pre=>pre+'-'+today().replace(/-/g,'').slice(2)+'-'+uid().slice(-4).toUpperCase();
const logEv=(d,ev,note)=>{d.log=d.log||[];d.log.push({t:new Date().toISOString(),by:by(),ev,note:note||''})};

/* ================= المخازن والكميات ================= */
const whAll=()=>{ensure();return db.warehouses};
const whById=id=>id===MAIN?{id:MAIN,name:'المخزن الرئيسي',active:true}:whAll().find(w=>w.id===id)||null;
const whActive=()=>[whById(MAIN)].concat(whAll().filter(w=>w.active!==false));
const whName=id=>{const w=whById(id);return w?w.name:'(مخزن محذوف)'};
const others=p=>Object.keys(p.wh||{}).reduce((a,k)=>a+num(p.wh[k]),0);
const whQty=(p,w)=>w===MAIN?r2(num(p.stock)-others(p)):r2(num((p.wh||{})[w]));
/* تغيير كمية مخزن: الإجمالي p.stock يتغير بنفس المقدار دائمًا (المخزن الرئيسي مشتق) */
function whMove(p,w,delta){delta=r2(delta);if(!delta)return;
  if(w!==MAIN){p.wh=p.wh||{};p.wh[w]=r2(num(p.wh[w])+delta)}
  p.stock=r2(num(p.stock)+delta)}
/* نقل بين مخزنين دون تغيير الإجمالي (للبيع من مخزن غير رئيسي) يتم في finalize أدناه */

/* ---- إدارة المخازن ---- */
function whSave(id,name,branch){
  if(!can('stock_edit'))return{err:'ليست لديك صلاحية إدارة المخازن'};
  name=String(name||'').trim();if(!name)return{err:'أدخل اسم المخزن'};
  if(lc(name)===lc('المخزن الرئيسي')||whAll().some(w=>w.id!==id&&lc(w.name)===lc(name)))return{err:'اسم المخزن مستخدم'};
  if(id){const w=whAll().find(x=>x.id===id);if(!w)return{err:'المخزن غير موجود'};w.name=name;w.branch=String(branch||'').trim();audit('warehouse_edit',name,'');return{ok:w}}
  const w={id:uid(),name,branch:String(branch||'').trim(),active:true,at:new Date().toISOString()};whAll().push(w);audit('warehouse_add',name,'');return{ok:w}}
function whDisable(id){
  if(!can('stock_edit'))return{err:'ليست لديك صلاحية'};
  const w=whAll().find(x=>x.id===id);if(!w)return{err:'المخزن غير موجود'};
  if(db.products.some(p=>whQty(p,id)>0))return{err:'لا يمكن إيقاف مخزن فيه كميات؛ حوّلها أولًا'};
  if(db.transfers.some(t=>(t.status==='draft'||t.status==='sent')&&(t.from===id||t.to===id)))return{err:'توجد تحويلات مفتوحة على هذا المخزن'};
  if(db.stocktakes.some(s=>s.wh===id&&(s.status==='open'||s.status==='pending')))return{err:'توجد جلسة جرد مفتوحة على هذا المخزن'};
  w.active=false;audit('warehouse_off',w.name,'');return{ok:w}}
const saleWhKey=()=>(typeof KEY!=='undefined'?KEY:'orvex')+'_salewh';
function saleWh(){try{const w=localStorage.getItem(saleWhKey());const x=w&&whById(w);return x&&x.active!==false?w:MAIN}catch(e){return MAIN}}
function setSaleWh(w){try{if(!w||w===MAIN)localStorage.removeItem(saleWhKey());else localStorage.setItem(saleWhKey(),w)}catch(e){}}

/* ================= التحويل بين المخازن ================= */
const TS={draft:'مسودة',sent:'مرسل',received:'مستلم',cancelled:'ملغى'};
function mergeLines(L){const m={},out=[];(L||[]).forEach(l=>{const q=r2(num(l.qty));if(!l.pid||!(q>0))return;if(m[l.pid])m[l.pid].qty=r2(m[l.pid].qty+q);else{m[l.pid]={pid:l.pid,qty:q};out.push(m[l.pid])}});return out}
function trCreate(from,to,lines,note){
  ensure();if(!can('stock_edit'))return{err:'ليست لديك صلاحية التحويل بين المخازن'};
  const a=whById(from),b=whById(to);
  if(!a||a.active===false||!b||b.active===false)return{err:'اختر مخزنين فعّالين'};
  if(from===to)return{err:'المخزن المرسل والمستلم يجب أن يختلفا'};
  const L=mergeLines(lines);if(!L.length)return{err:'أضف مادة واحدة على الأقل بكمية صحيحة'};
  for(const l of L){const p=prod(l.pid);if(!p)return{err:'مادة غير موجودة في التحويل'};l.name=p.name}
  const t={id:uid(),no:stamp('TR'),from,to,status:'draft',date:today(),at:new Date().toISOString(),by:by(),note:String(note||'').trim(),lines:L,log:[]};
  logEv(t,'draft','إنشاء المسودة');db.transfers.push(t);return{ok:t}}
function trFind(id){ensure();return db.transfers.find(x=>x.id===id)||null}
function trSend(id){
  const t=trFind(id);if(!t)return{err:'المستند غير موجود'};if(!can('stock_edit'))return{err:'ليست لديك صلاحية'};
  if(t.status!=='draft')return{err:'يمكن إرسال المسودة فقط'};
  const a=whById(t.from),b=whById(t.to);if(!a||a.active===false||!b||b.active===false)return{err:'أحد المخزنين غير فعّال'};
  for(const l of t.lines){const p=prod(l.pid);if(!p)return{err:'المادة «'+l.name+'» لم تعد موجودة'};
    if(whQty(p,t.from)+1e-9<l.qty)return{err:'الكمية غير كافية في «'+whName(t.from)+'» للمادة «'+p.name+'» (المتوفر '+whQty(p,t.from)+')'}}
  t.lines.forEach(l=>{const p=prod(l.pid),b0=whQty(p,t.from);whMove(p,t.from,-l.qty);histf(p,'transfer',b0,whQty(p,t.from),'تحويل '+t.no+' إلى '+whName(t.to)+' (قيد النقل)',{wh:t.from,tr:t.no})});
  t.status='sent';t.sentAt=new Date().toISOString();t.sentBy=by();logEv(t,'sent','خُصمت الكمية من '+whName(t.from)+' وهي الآن في الطريق');
  audit('transfer_send',t.no,whName(t.from)+' ← '+whName(t.to)+' | '+t.lines.length+' مادة');return{ok:t}}
/* recv: {pid:{recv,dmg}} — الافتراضي استلام كل الكمية. النقص = المرسل − المستلم − التالف */
function trReceive(id,recv){
  const t=trFind(id);if(!t)return{err:'المستند غير موجود'};if(!can('stock_edit'))return{err:'ليست لديك صلاحية'};
  if(t.status!=='sent')return{err:'يمكن استلام التحويل المرسل فقط'};
  const b=whById(t.to);if(!b||b.active===false)return{err:'المخزن المستلم غير فعّال'};
  const R=[];
  for(const l of t.lines){const x=(recv&&recv[l.pid])||{};const rv=x.recv===undefined||x.recv===''?l.qty:r2(num(x.recv)),dm=r2(num(x.dmg));
    if(rv<0||dm<0)return{err:'كمية سالبة في «'+l.name+'»'};
    if(r2(rv+dm)>l.qty+1e-9)return{err:'المستلم + التالف أكبر من المرسل في «'+l.name+'»'};
    R.push({l,rv,dm,sh:r2(l.qty-rv-dm),note:String(x.note||'').trim()})}
  R.forEach(({l,rv,dm,sh,note})=>{const p=prod(l.pid);l.recv=rv;l.dmg=dm;l.short=sh;if(note)l.note=note;if(p)l.cost=num(p.cost);
    if(!p)return; /* المادة حُذفت أثناء النقل: يبقى السجل فقط */
    const b0=whQty(p,t.to);if(rv>0)whMove(p,t.to,rv);
    histf(p,'transfer',b0,whQty(p,t.to),'استلام '+t.no+' في '+whName(t.to)+(dm?' | تالف '+dm:'')+(sh?' | نقص '+sh:''),{wh:t.to,tr:t.no})});
  t.status='received';t.recvAt=new Date().toISOString();t.recvBy=by();
  const sh=r2(R.reduce((a,x)=>a+x.sh,0)),dm=r2(R.reduce((a,x)=>a+x.dm,0));
  logEv(t,'received','استلام في '+whName(t.to)+(dm?' | تالف '+dm:'')+(sh?' | نقص '+sh:''));
  audit('transfer_recv',t.no,'تالف '+dm+' | نقص '+sh);return{ok:t,short:sh,dmg:dm}}
function trCancel(id,why){
  const t=trFind(id);if(!t)return{err:'المستند غير موجود'};if(!can('stock_edit'))return{err:'ليست لديك صلاحية'};
  if(t.status==='received'||t.status==='cancelled')return{err:'لا يمكن إلغاء هذا المستند'};
  if(t.status==='sent'){ /* إرجاع الكمية إلى المخزن المرسل */
    t.lines.forEach(l=>{const p=prod(l.pid);if(!p)return;const b0=whQty(p,t.from);whMove(p,t.from,l.qty);histf(p,'transfer',b0,whQty(p,t.from),'إلغاء '+t.no+' وإرجاع الكمية',{wh:t.from,tr:t.no})})}
  t.status='cancelled';t.cancelAt=new Date().toISOString();t.cancelBy=by();t.cancelWhy=String(why||'').trim();
  logEv(t,'cancelled',(t.cancelWhy||'بدون سبب')+(t.sentAt?' | أُعيدت الكمية للمرسل':''));audit('transfer_cancel',t.no,t.cancelWhy);return{ok:t}}

/* ================= جلسات الجرد (لكل مخزن) ================= */
const SS={open:'مفتوحة',pending:'بانتظار اعتماد المدير',approved:'معتمدة',rejected:'مرفوضة',closed:'مغلقة بلا فروق'};
const REASONS3=['جرد دوري','تالف','منتهي الصلاحية','فقد / سرقة','خطأ إدخال سابق','أخرى'];
function skStart(wh){
  ensure();if(!can('stock_edit'))return{err:'ليست لديك صلاحية الجرد'};
  const w=whById(wh);if(!w||w.active===false)return{err:'اختر مخزنًا فعّالًا'};
  const ex=db.stocktakes.find(s=>s.wh===wh&&(s.status==='open'||s.status==='pending'));
  if(ex)return{err:'توجد جلسة جرد غير منتهية لهذا المخزن ('+ex.no+')',existing:ex};
  const s={id:uid(),no:stamp('CNT'),wh,status:'open',date:today(),at:new Date().toISOString(),by:by(),lines:[],log:[]};
  logEv(s,'open','بدء الجلسة');db.stocktakes.push(s);return{ok:s}}
const skFind=id=>{ensure();return db.stocktakes.find(x=>x.id===id)||null};
function skCount(id,pid,cnt){
  const s=skFind(id);if(!s)return{err:'الجلسة غير موجودة'};if(s.status!=='open')return{err:'الجلسة غير مفتوحة'};
  const p=prod(pid);if(!p)return{err:'مادة غير موجودة'};
  let l=s.lines.find(x=>x.pid===pid);
  if(cnt===''||cnt===null||cnt===undefined){s.lines=s.lines.filter(x=>x.pid!==pid);return{ok:s}}
  const c=r2(num(cnt));if(c<0)return{err:'الكمية لا تكون سالبة'};
  if(l)l.cnt=c;else s.lines.push({pid,name:p.name,sys:whQty(p,s.wh),cost:num(p.cost),cnt:c});
  return{ok:s}}
const skDiffs=s=>s.lines.map(l=>({l,d:r2(l.cnt-l.sys)})).filter(x=>Math.abs(x.d)>0.0001);
const skValue=s=>r2(skDiffs(s).reduce((a,x)=>a+Math.abs(x.d)*num(x.l.cost),0));
const skNeedsApproval=s=>!isAdmin()&&skValue(s)>num((db.settings||{}).adjLimit);
function skApply(s,approver){
  skDiffs(s).forEach(({l,d})=>{const p=prod(l.pid);if(!p)return;
    const cur=whQty(p,s.wh),target=Math.max(0,r2(cur+d)),delta=r2(target-cur); /* نطبّق الفرق لا الرقم المطلق كي لا نلغي مبيعات جرت أثناء العدّ */
    l.applied=delta;histf(p,'count',cur,target,s.reason+(s.note?' — '+s.note:''),{cnt:s.id,wh:s.wh,ses:s.no});whMove(p,s.wh,delta)});
  s.status='approved';s.approvedBy=approver;s.approvedAt=new Date().toISOString();
  logEv(s,'approved','اعتمدها '+approver+' | قيمة الفروق '+skValue(s));audit('stock_count',s.reason,s.no+' | '+whName(s.wh)+' | '+skDiffs(s).length+' مادة | قيمة '+skValue(s))}
function skSubmit(id,reason,note){
  const s=skFind(id);if(!s)return{err:'الجلسة غير موجودة'};if(s.status!=='open')return{err:'الجلسة غير مفتوحة'};
  if(!can('stock_edit'))return{err:'ليست لديك صلاحية'};
  if(!s.lines.length)return{err:'لم تُدخل أي كمية فعلية'};
  const D=skDiffs(s);
  if(!D.length){s.status='closed';s.closedAt=new Date().toISOString();logEv(s,'closed','لا توجد فروق');return{ok:s,state:'closed'}}
  if(!reason)return{err:'اختر سبب التسوية'};
  s.reason=reason;s.note=String(note||'').trim();s.submitAt=new Date().toISOString();s.submitBy=by();
  if(skNeedsApproval(s)){s.status='pending';logEv(s,'pending','أُرسلت لاعتماد المدير | قيمة الفروق '+skValue(s));audit('stock_count_request',s.no,'قيمة '+skValue(s));return{ok:s,state:'pending'}}
  skApply(s,by());return{ok:s,state:'approved'}}
function skApprove(id){const s=skFind(id);if(!s)return{err:'الجلسة غير موجودة'};if(!isAdmin())return{err:'الاعتماد للمدير فقط'};
  if(s.status!=='pending')return{err:'الجلسة ليست بانتظار الاعتماد'};skApply(s,by());return{ok:s}}
function skReject(id,why){const s=skFind(id);if(!s)return{err:'الجلسة غير موجودة'};if(!isAdmin())return{err:'الرفض للمدير فقط'};
  if(s.status!=='pending')return{err:'الجلسة ليست بانتظار الاعتماد'};
  s.status='rejected';s.rejectedBy=by();s.rejectedAt=new Date().toISOString();s.rejectWhy=String(why||'').trim();logEv(s,'rejected',s.rejectWhy||'بدون سبب');audit('stock_count_reject',s.no,s.rejectWhy);return{ok:s}}

/* ================= حدود إعادة الطلب لكل مخزن ================= */
const minOf=(p,w)=>w===MAIN?num(p.min):num((p.mins||{})[w]);
function lowList(){const L=[];
  db.products.forEach(p=>{whActive().forEach(w=>{
    const q=whQty(p,w.id),m=minOf(p,w.id);
    if(w.id!==MAIN&&!(m>0))return; /* المخازن الفرعية: لا تنبيه بلا حد مضبوط */
    if(q<=0)L.push({p,wh:w.id,q,m,st:'out'});else if(q<=m)L.push({p,wh:w.id,q,m,st:'low'})})});
  return L.map(x=>{const tgt=num(x.p.maxStock)>0?num(x.p.maxStock):Math.max(x.m*2,x.m+1);return Object.assign(x,{need:Math.max(0,r2(tgt-x.q))})})
    .sort((a,b)=>(a.st===b.st?0:a.st==='out'?-1:1)||String(a.p.name).localeCompare(String(b.p.name)))}

/* ================= تكاليف الشراء الإضافية + تقييم المخزون ================= */
const LC_TYPES=['شحن','جمارك','عمولة','تفريغ ونقل','أخرى'];
const r4=x=>Math.round(x*10000)/10000;
/* يوزّع مبلغًا على السطور: حسب القيمة (net) أو الكمية؛ الباقي من التقريب على آخر سطر فيبقى المجموع مطابقًا */
function allocate(lines,total,method){
  const base=lines.map(l=>method==='qty'?num(l.qty):Math.max(0,num(l.net!==undefined?l.net:l.qty*l.cost)));
  let sb=base.reduce((a,x)=>a+x,0);if(!(sb>0)){base.splice(0,base.length,...lines.map(l=>num(l.qty)));sb=base.reduce((a,x)=>a+x,0)}
  if(!(sb>0))return lines.map(()=>0);
  let rest=r2(total);return lines.map((l,i)=>{const sh=i===lines.length-1?rest:r2(total*base[i]/sb);rest=r2(rest-sh);return sh})}
function applyLanded(po,c){
  if(!po||!(po.lines||[]).length)return{err:'فاتورة غير صالحة'};
  const amt=r2(num(c.amount));if(!(amt>0))return{err:'أدخل مبلغًا صحيحًا'};
  const method=c.method==='qty'?'qty':'value',sh=allocate(po.lines,amt,method),wac=(db.settings||{}).valuation==='wac';
  po.lines.forEach((l,i)=>{const s=sh[i];if(!s)return;l.lc=r2(num(l.lc)+s);const p=prod(l.pid);if(!p||!(num(l.qty)>0))return;
    const c0=num(p.cost),latest=l.ca!==undefined&&Math.abs(c0-num(l.ca))<0.0002; /* هل هذه آخر فاتورة أثّرت في تكلفة المادة؟ */
    if(wac&&p.stock>0){const k=Math.min(num(p.stock),num(l.qty))/num(l.qty);p.cost=r4((p.stock*c0+s*k)/p.stock)}
    else p.cost=r4(c0+s/num(l.qty));
    if(latest)l.ca=p.cost});
  po.landed=po.landed||[];po.landed.push({id:uid(),type:c.type||'أخرى',amount:amt,method,pay:c.pay==='bank'?'bank':'cash',date:today(),note:String(c.note||'').trim(),t:new Date().toISOString(),by:by()});
  po.landedTotal=r2(po.landed.reduce((a,x)=>a+x.amount,0));
  audit('landed_cost',po.no,(c.type||'')+' '+amt+' ('+(method==='qty'?'حسب الكمية':'حسب القيمة')+')');return{ok:po,shares:sh}}
/* عند تعديل فاتورة مشتريات: تعاد التكاليف الإضافية المسجّلة على السطور الجديدة */
window.orvexLandedReapply=function(po,old){const L=(old.landed||[]).slice();po.landed=[];po.lines.forEach(l=>{delete l.lc});
  L.forEach(c=>{const r=applyLanded(po,c);if(r.ok){const x=po.landed[po.landed.length-1];x.id=c.id;x.t=c.t;x.by=c.by}})};
/* عند حذف/تعديل فاتورة شراء: نعيد التكلفة السابقة إن لم تتغير التكلفة منذ تلك الفاتورة (لا نكتب فوق شراء لاحق) */
if(typeof pinvRevert==='function'){const _rv=pinvRevert;pinvRevert=function(po){_rv(po);(po.lines||[]).forEach(l=>{const p=prod(l.pid);
  if(p&&l.cb!==undefined&&l.ca!==undefined&&Math.abs(num(p.cost)-num(l.ca))<0.0002&&(db.settings||{}).valuation==='wac')p.cost=num(l.cb)})}}
/* وحدة الشراء: معامل التحويل من اسم الوحدة المعرّفة في باركودات المنتج (قطعة/وحدة أساسية = 1) */
window.orvexUnitF=function(p,u){u=lc(u);if(!p||!u||u===lc(p.baseUnit)||u==='قطعة')return 1;
  const c=((p.codes)||[]).find(k=>lc(k.unit)===u&&num(k.f)>1);return c?num(c.f):1};
/* الأسطر لمرجع الواجهة والاختبارات */
window.ORVEX_INV3={whQty,whMove,whById,whActive,whSave,whDisable,saleWh,setSaleWh,trCreate,trSend,trReceive,trCancel,trFind,skStart,skCount,skSubmit,skApprove,skReject,skDiffs,skValue,lowList,allocate,applyLanded,minOf,TS,SS,MAIN};

/* ================= البيع من مخزن غير رئيسي (إعداد لكل جهاز) ================= */
if(typeof finalize==='function'){const _f=finalize;finalize=function(method,paidIn){
  const sw=saleWh();if(sw===MAIN)return _f(method,paidIn);
  const ln=(state.cart||[]).map(l=>({pid:l.pid,qty:l.qty}));const n0=db.sales.length;
  _f(method,paidIn);if(db.sales.length<=n0)return;
  const s=db.sales[db.sales.length-1];s.wh=sw;
  ln.forEach(l=>{const p=prod(l.pid);if(!p)return;const take=Math.min(num(l.qty),Math.max(0,num((p.wh||{})[sw])));if(!(take>0))return;
    p.wh[sw]=r2(p.wh[sw]-take); /* الإجمالي نقص مسبقًا في finalize؛ الرئيسي المشتق لا يتغير */
    const it=(s.items||[]).find(i=>i.pid===l.pid);if(it)it.whq=r2(num(it.whq)+take)});
  save()}}
{const _r=window.orvexRestoreItems;
  window.orvexRestoreItems=function(items,docNo,reason,sale){if(_r)_r.apply(this,arguments);
    if(!sale||!sale.wh)return;
    (items||[]).forEach(x=>{const p=prod(x.pid),src=(sale.items||[]).find(i=>i.pid===x.pid);if(!p||!src||!(num(src.whq)>0))return;
      const t=Math.min(num(x.qty),r2(src.whq-num(src.whBack)));if(!(t>0))return;
      p.wh=p.wh||{};p.wh[sale.wh]=r2(num(p.wh[sale.wh])+t);src.whBack=r2(num(src.whBack)+t)})}}

/* ================= الواجهة ================= */
const opts=(L,sel,skip)=>L.filter(w=>w.id!==skip).map(w=>`<option value="${esc(w.id)}" ${w.id===sel?'selected':''}>${esc(w.name)}</option>`).join('');
const badge=(t,c)=>`<span class="badge ${c||''}">${esc(t)}</span>`;
const stc=s=>({draft:'',sent:'warn',received:'',cancelled:'bad'}[s]||'');
const val=id=>(($('#'+id)||{}).value||'');

/* ---- المخازن ---- */
window.whModal=function(){ensure();
  const rows=whActive().map(w=>{const n=db.products.filter(p=>whQty(p,w.id)>0).length;
    return`<div class="row"><div class="grow"><div class="t">${esc(w.name)}${w.id===saleWh()?' '+badge('مخزن البيع هنا','warn'):''}</div><small>${esc(w.branch||'')} ${n} مادة بكمية</small></div>
    <div class="end">${w.id===MAIN?'':`<button class="btn" onclick="whForm('${jsq(w.id)}')">تعديل</button><button class="btn ghost" onclick="whOff('${jsq(w.id)}')">إيقاف</button>`}</div></div>`}).join('');
  modal('المخازن',`<div class="card">${rows}</div>
  ${can('stock_edit')?'<div class="actions"><button class="btn primary" onclick="whForm()">+ مخزن جديد</button></div>':''}
  <label>مخزن البيع لهذا الجهاز (تُخصم منه مبيعات نقطة البيع هنا أولًا)</label>
  <select id="wh_sale" onchange="ORVEX_INV3.setSaleWh(this.value);toast('تم الحفظ لهذا الجهاز');whModal()">${opts(whActive(),saleWh())}</select>
  <p class="muted" style="font-size:12.5px">المشتريات تدخل المخزن الرئيسي؛ وزّعها على بقية المخازن عبر «التحويلات».</p>`)};
window.whForm=function(id){const w=id?whAll().find(x=>x.id===id):{name:'',branch:''};if(!w)return;
  modal(id?'تعديل مخزن':'مخزن جديد',`<label>اسم المخزن</label><input id="wf_n" value="${esc(w.name)}"><label>الفرع / الموقع (اختياري)</label><input id="wf_b" value="${esc(w.branch||'')}">
  <div class="actions"><button class="btn primary" onclick="whSaveUi('${jsq(id||'')}')">حفظ</button><button class="btn ghost" onclick="whModal()">رجوع</button></div>`)};
window.whSaveUi=function(id){const r=whSave(id||'',val('wf_n'),val('wf_b'));if(r.err)return toast(r.err);save();whModal();toast('تم الحفظ')};
window.whOff=function(id){askConfirm('إيقاف هذا المخزن؟ يبقى سجله وتحويلاته.',()=>{const r=whDisable(id);if(r.err)return toast(r.err);save();whModal();toast('تم الإيقاف')},'إيقاف')};

/* ---- التحويلات ---- */
const TN={from:MAIN,to:'',lines:[],q:''};
window.trModal=function(){ensure();
  const L=db.transfers.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,60);
  modal('التحويلات بين المخازن',(L.length?`<div class="card">${L.map(t=>`<button class="row tap" onclick="trView('${jsq(t.id)}')"><div class="grow"><div class="t">${esc(t.no)}</div><small>${esc(whName(t.from))} ← ${esc(whName(t.to))} — ${esc(fdate(t.date))} — ${t.lines.length} مادة</small></div><div class="end">${badge(TS[t.status],stc(t.status))}</div></button>`).join('')}</div>`:'<p class="muted">لا توجد تحويلات بعد.</p>')+
  (can('stock_edit')?'<div class="actions"><button class="btn primary" onclick="trNew()">+ تحويل جديد</button></div>':''))};
window.trNew=function(){if(whActive().length<2){return modal('تحويل جديد','<p>أضف مخزنًا ثانيًا أولًا من «المخازن».</p><div class="actions"><button class="btn primary" onclick="whModal()">المخازن</button></div>')}
  TN.from=MAIN;TN.to=(whActive().find(w=>w.id!==MAIN)||{}).id||'';TN.lines=[];TN.q='';trForm()};
function trForm(){
  const q=lc(TN.q),res=TN.q?db.products.filter(p=>lc(p.name).includes(q)||lc(p.sku).includes(q)||((p.codes||[]).some(k=>lc(k.code).includes(q)))).slice(0,8):[];
  const sel=TN.lines.map((l,i)=>{const p=prod(l.pid);return`<div class="row"><div class="grow"><div class="t">${esc(p?p.name:'؟')}</div><small>المتوفر في المرسل: ${p?whQty(p,TN.from):0}</small></div><div class="end"><input type="number" inputmode="decimal" step="any" style="width:80px" value="${l.qty}" oninput="TRN_set(${i},this.value)"><button class="btn ghost" onclick="TRN_del(${i})">✕</button></div></div>`}).join('');
  modal('تحويل جديد',`<div class="f2"><div><label>من مخزن</label><select id="tr_f" onchange="TRN_wh()">${opts(whActive(),TN.from)}</select></div><div><label>إلى مخزن</label><select id="tr_t" onchange="TRN_wh()">${opts(whActive(),TN.to,TN.from)}</select></div></div>
  <input class="search" id="tr_q" type="search" placeholder="ابحث عن مادة لإضافتها" value="${esc(TN.q)}" oninput="TRN_q(this.value)">
  ${res.length?`<div class="card">${res.map(p=>`<button class="row tap" onclick="TRN_add('${jsq(p.id)}')"><div class="grow"><div class="t">${esc(p.name)}</div></div><div class="end"><small>${whQty(p,TN.from)}</small></div></button>`).join('')}</div>`:''}
  <div class="card">${sel||'<p class="muted">لم تُضف مواد.</p>'}</div>
  <label>ملاحظة</label><input id="tr_n">
  <div class="actions"><button class="btn primary" onclick="TRN_save(true)">حفظ وإرسال</button><button class="btn" onclick="TRN_save(false)">حفظ كمسودة</button><button class="btn ghost" onclick="trModal()">رجوع</button></div>`);
  const e=$('#tr_q');if(e&&TN.q){e.focus();try{e.setSelectionRange(e.value.length,e.value.length)}catch(x){}}}
window.TRN_wh=function(){TN.from=val('tr_f');TN.to=val('tr_t');if(TN.to===TN.from)TN.to=(whActive().find(w=>w.id!==TN.from)||{}).id||'';trForm()};
window.TRN_q=v=>{TN.q=v;trForm()};
window.TRN_add=id=>{const l=TN.lines.find(x=>x.pid===id);if(l)l.qty=r2(l.qty+1);else TN.lines.push({pid:id,qty:1});TN.q='';trForm()};
window.TRN_set=(i,v)=>{if(TN.lines[i])TN.lines[i].qty=num(v)};
window.TRN_del=i=>{TN.lines.splice(i,1);trForm()};
window.TRN_save=function(send){TN.from=val('tr_f')||TN.from;TN.to=val('tr_t')||TN.to;
  const r=trCreate(TN.from,TN.to,TN.lines,val('tr_n'));if(r.err)return toast(r.err);
  if(send){const s=trSend(r.ok.id);if(s.err){save();toast('حُفظت كمسودة: '+s.err);return trView(r.ok.id)}}
  save();toast(send?'تم الإرسال — الكمية في الطريق':'تم حفظ المسودة');trView(r.ok.id)};
window.trView=function(id){const t=trFind(id);if(!t)return;
  const lines=t.lines.map(l=>`<div class="row"><div class="grow"><div class="t">${esc(l.name)}</div><small>مرسل ${l.qty}${t.status==='received'?` | مستلم ${l.recv} | تالف ${l.dmg||0} | نقص ${l.short||0}`:''}${l.note?' — '+esc(l.note):''}</small></div></div>`).join('');
  const log=(t.log||[]).slice().reverse().map(g=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #ddd">${esc(String(g.t).slice(0,16).replace('T',' '))} — ${esc(g.by||'')} — ${esc(g.note||g.ev)}</div>`).join('');
  const ed=can('stock_edit');
  modal('تحويل '+t.no,`<div class="card"><div class="row"><span class="grow">الحالة</span>${badge(TS[t.status],stc(t.status))}</div><div class="row"><span class="grow">من</span><b>${esc(whName(t.from))}</b></div><div class="row"><span class="grow">إلى</span><b>${esc(whName(t.to))}</b></div>${t.note?`<div class="row"><span class="grow">ملاحظة</span><span>${esc(t.note)}</span></div>`:''}</div>
  <div class="card">${lines}</div><label>سجل الحركة</label><div class="card">${log}</div>
  <div class="actions">${ed&&t.status==='draft'?`<button class="btn primary" onclick="TRV_send('${jsq(t.id)}')">إرسال</button>`:''}${ed&&t.status==='sent'?`<button class="btn primary" onclick="trRecvForm('${jsq(t.id)}')">تأكيد الاستلام</button>`:''}${ed&&(t.status==='draft'||t.status==='sent')?`<button class="btn danger" onclick="TRV_cancel('${jsq(t.id)}')">إلغاء</button>`:''}<button class="btn ghost" onclick="trModal()">رجوع</button></div>`)};
window.TRV_send=function(id){const r=trSend(id);if(r.err)return toast(r.err);save();toast('تم الإرسال');trView(id)};
window.TRV_cancel=function(id){const t=trFind(id);askConfirm(t&&t.status==='sent'?'ستعود الكمية إلى المخزن المرسل. إلغاء التحويل؟':'إلغاء المسودة؟',()=>{const r=trCancel(id,'');if(r.err)return toast(r.err);save();toast('تم الإلغاء');trView(id)},'إلغاء التحويل')};
window.trRecvForm=function(id){const t=trFind(id);if(!t||t.status!=='sent')return;
  modal('استلام '+t.no,`<p class="muted" style="font-size:12.5px;margin:0 0 6px">الكمية تدخل «${esc(whName(t.to))}» بعد التأكيد فقط. سجّل أي نقص أو تالف.</p>`+t.lines.map((l,i)=>`<div class="card" style="margin-bottom:8px"><b>${esc(l.name)}</b> — المرسل ${l.qty}<div class="f2"><div><label>المستلم</label><input id="rv_r${i}" type="number" step="any" value="${l.qty}"></div><div><label>تالف</label><input id="rv_d${i}" type="number" step="any" value="0"></div></div><input id="rv_n${i}" placeholder="ملاحظة (اختياري)"></div>`).join('')+
  `<div class="actions"><button class="btn primary" onclick="trRecvOk('${jsq(id)}')">تأكيد الاستلام</button><button class="btn ghost" onclick="trView('${jsq(id)}')">رجوع</button></div>`)};
window.trRecvOk=function(id){const t=trFind(id);if(!t)return;const m={};t.lines.forEach((l,i)=>{m[l.pid]={recv:val('rv_r'+i),dmg:val('rv_d'+i),note:val('rv_n'+i)}});
  const r=trReceive(id,m);if(r.err)return toast(r.err);save();toast('تم الاستلام'+(r.short||r.dmg?' — سُجّل نقص/تالف':''));trView(id)};

/* ---- جلسات الجرد ---- */
const SK={q:''};
window.skModal=function(){ensure();
  const L=db.stocktakes.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,60);
  modal('جلسات الجرد',(L.length?`<div class="card">${L.map(s=>`<button class="row tap" onclick="skOpen('${jsq(s.id)}')"><div class="grow"><div class="t">${esc(s.no)} — ${esc(whName(s.wh))}</div><small>${esc(fdate(s.date))} — ${s.lines.length} مادة${s.reason?' — '+esc(s.reason):''}</small></div><div class="end">${badge(SS[s.status],s.status==='pending'?'warn':s.status==='rejected'?'bad':'')}</div></button>`).join('')}</div>`:'<p class="muted">لا توجد جلسات.</p>')+
  (can('stock_edit')?`<label>بدء جلسة جديدة للمخزن</label><div class="f2"><select id="sk_w">${opts(whActive(),MAIN)}</select><button class="btn primary" onclick="skNew()">بدء</button></div>`:''))};
window.skNew=function(){const r=skStart(val('sk_w'));if(r.err){if(r.existing)return skOpen(r.existing.id);return toast(r.err)}save();skOpen(r.ok.id)};
window.skOpen=function(id,keepQ){const s=skFind(id);if(!s)return;if(!keepQ)SK.q='';
  if(s.status!=='open'){const D=skDiffs(s),sc=can('see_cost'),log=(s.log||[]).slice().reverse().map(g=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #ddd">${esc(String(g.t).slice(0,16).replace('T',' '))} — ${esc(g.by||'')} — ${esc(g.note||g.ev)}</div>`).join('');
    return modal('جلسة '+s.no,`<div class="card"><div class="row"><span class="grow">المخزن</span><b>${esc(whName(s.wh))}</b></div><div class="row"><span class="grow">الحالة</span>${badge(SS[s.status],s.status==='pending'?'warn':s.status==='rejected'?'bad':'')}</div>${s.reason?`<div class="row"><span class="grow">السبب</span><span>${esc(s.reason)}${s.note?' — '+esc(s.note):''}</span></div>`:''}${sc?`<div class="row"><span class="grow">قيمة الفروق</span><b>${money(skValue(s))}</b></div>`:''}</div>
    <div class="card">${D.length?D.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.l.name)}</div><small>دفتري ${x.l.sys} ← فعلي ${x.l.cnt}</small></div><div class="end">${badge((x.d>0?'+':'')+x.d,x.d<0?'bad':'warn')}</div></div>`).join(''):'<p class="muted">لا فروق.</p>'}</div><label>السجل</label><div class="card">${log}</div>
    <div class="actions">${isAdmin()&&s.status==='pending'?`<button class="btn primary" onclick="SKV_ok('${jsq(s.id)}')">اعتماد</button><button class="btn danger" onclick="SKV_no('${jsq(s.id)}')">رفض</button>`:''}<button class="btn ghost" onclick="skModal()">رجوع</button></div>`)}
  const q=lc(SK.q),L=db.products.filter(p=>!q||lc(p.name).includes(q)||lc(p.sku).includes(q)||((p.codes||[]).some(k=>lc(k.code).includes(q)))).slice(0,60);
  const cnt=p=>{const l=s.lines.find(x=>x.pid===p.id);return l?l.cnt:''};
  modal('جرد '+whName(s.wh)+' — '+s.no,`<input class="search" id="sk_q" type="search" placeholder="ابحث بالاسم أو الباركود" value="${esc(SK.q)}" oninput="SK_q('${jsq(s.id)}',this.value)">
  <div class="card">${L.map(p=>`<div class="row"><div class="grow"><div class="t">${esc(p.name)}</div><small>الدفتري: <b>${whQty(p,s.wh)}</b></small></div><div class="end"><input type="number" inputmode="decimal" step="any" style="width:90px" placeholder="الفعلي" value="${cnt(p)}" oninput="SK_set('${jsq(s.id)}','${jsq(p.id)}',this.value)"></div></div>`).join('')||'<p class="muted">لا نتائج</p>'}</div>
  <p class="muted" style="font-size:12.5px">المعدودة: <b id="sk_n">${s.lines.length}</b> — الحفظ تلقائي؛ يمكنك إكمال الجلسة لاحقًا. غير المعدودة لا تتغير.</p>
  <div class="actions"><button class="btn primary" onclick="skReview('${jsq(s.id)}')">مراجعة وإرسال</button><button class="btn ghost" onclick="skModal()">إغلاق مؤقتًا</button></div>`);
  const e=$('#sk_q');if(e&&keepQ){e.focus();try{e.setSelectionRange(e.value.length,e.value.length)}catch(x){}}};
window.SK_q=function(id,v){SK.q=v;skOpen(id,true)};
window.SK_set=function(id,pid,v){const r=skCount(id,pid,v);if(r.err)return toast(r.err);save();const e=$('#sk_n');if(e)e.textContent=r.ok.lines.length};
window.skReview=function(id){const s=skFind(id);if(!s)return;const D=skDiffs(s);
  if(!s.lines.length)return toast('لم تُدخل أي كمية فعلية');
  if(!D.length){const r=skSubmit(id,'','');if(r.err)return toast(r.err);save();toast('لا فروق — أُغلقت الجلسة');return skOpen(id)}
  const sc=can('see_cost'),ap=skNeedsApproval(s);
  modal('فروق الجرد',`<div class="card">${D.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.l.name)}</div><small>دفتري ${x.l.sys} ← فعلي ${x.l.cnt}</small></div><div class="end">${badge((x.d>0?'+':'')+x.d,x.d<0?'bad':'warn')}</div></div>`).join('')}</div>${sc?`<p class="muted">قيمة الفروق بالتكلفة: <b>${money(skValue(s))}</b></p>`:''}
  <label>سبب التسوية (إلزامي)</label><select id="sk_r"><option value="">— اختر —</option>${REASONS3.map(r=>`<option>${esc(r)}</option>`).join('')}</select><label>ملاحظة</label><input id="sk_nt">
  <p class="muted" style="font-size:12.5px">${ap?'قيمة الفروق تتجاوز حد الموافقة: سترسل الجلسة لاعتماد المدير ولن تتغير الكميات قبله.':'ستُعتمد التسوية فورًا.'}</p>
  <div class="actions"><button class="btn primary" onclick="skGo('${jsq(id)}')">${ap?'إرسال للاعتماد':'اعتماد التسوية'}</button><button class="btn ghost" onclick="skOpen('${jsq(id)}')">رجوع</button></div>`)};
window.skGo=function(id){const r=skSubmit(id,val('sk_r'),val('sk_nt'));if(r.err)return toast(r.err);save();render();toast(r.state==='pending'?'أُرسلت لاعتماد المدير':'تم اعتماد الجرد');skOpen(id)};
window.SKV_ok=function(id){const r=skApprove(id);if(r.err)return toast(r.err);save();render();toast('تم الاعتماد وتطبيق التسوية');skOpen(id)};
window.SKV_no=function(id){askConfirm('رفض التسوية؟ لن تتغير الكميات.',()=>{const r=skReject(id,'');if(r.err)return toast(r.err);save();toast('تم الرفض');skOpen(id)},'رفض')};

/* ---- تقرير إعادة الطلب ---- */
window.reModal=function(){const L=lowList();
  const txt=L.map(x=>x.p.name+' — '+whName(x.wh)+' — المتوفر '+x.q+' — مقترح '+x.need).join('\n');window.__reTxt=txt;
  modal('إعادة الطلب',L.length?`<div class="card">${L.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.p.name)}</div><small>${esc(whName(x.wh))} — المتوفر ${x.q} — الحد ${x.m} — مقترح ${x.need}</small></div><div class="end">${badge(x.st==='out'?'نفد':'منخفض',x.st==='out'?'bad':'warn')}</div></div>`).join('')}</div><div class="actions"><button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText(window.__reTxt).then(()=>toast('تم النسخ'))">نسخ القائمة</button></div>`:'<p class="muted">لا توجد مواد تحتاج إعادة طلب.</p>')};

/* ---- ربط بالشاشات القائمة ---- */
if(typeof vStock==='function'){const _v=vStock;vStock=function(){const n=lowList().length,sv=can('stock_view')||isAdmin();
  return _v()+`<div class="actions">${sv?'<button class="btn" onclick="whModal()">🏬 المخازن</button><button class="btn" onclick="trModal()">🔁 التحويلات</button>':''}${can('stock_edit')?'<button class="btn" onclick="skModal()">📋 جلسات الجرد</button>':''}${sv?`<button class="btn" onclick="reModal()">📉 إعادة الطلب${n?' ('+n+')':''}</button>`:''}</div>`}}
if(typeof vHome==='function'){const _h=vHome;vHome=function(){const h=_h();try{if(!(isAdmin()||can('stock_view')))return h;const L=lowList(),out=L.filter(x=>x.st==='out').length;if(!L.length)return h;
  const c=`<div class="card"><h3 style="margin:0 0 6px">📉 تنبيه المخزون</h3><div class="row"><div class="grow">نفد: <b>${out}</b> — منخفض: <b>${L.length-out}</b></div><div class="end"><button class="btn" onclick="reModal()">تقرير إعادة الطلب</button></div></div></div>`;
  const i=h.lastIndexOf('</section>');return(h.includes('od-main')&&i>-1)?h.slice(0,i)+c+h.slice(i):h+c}catch(e){return h}}}

/* نموذج المنتج: وحدة أساسية + هدف إعادة الطلب + حدود لكل مخزن + كميات المخازن */
if(typeof productForm==='function'){const _pf=productForm;productForm=function(id){_pf(id);
  if(!can('stock_edit'))return;const a=$('#modal .actions');if(!a)return;const p=id?(prod(id)||{}):{},W=whActive().filter(w=>w.id!==MAIN);
  const qty=id?whActive().map(w=>`<span class="badge">${esc(w.name)}: ${whQty(p,w.id)}</span>`).join(' '):'';
  a.insertAdjacentHTML('beforebegin',`<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">🏬 وحدة أساسية وحدود إعادة الطلب والمخازن</summary>
  <div class="f2"><div><label>الوحدة الأساسية (للتخزين)</label><input id="pf_bu" value="${esc(p.baseUnit||'قطعة')}"></div><div><label>الكمية المستهدفة عند إعادة الطلب</label><input id="pf_mx" type="number" step="any" value="${p.maxStock||''}"></div></div>
  ${W.map(w=>`<label>حد التنبيه في «${esc(w.name)}»</label><input id="pf_wm_${esc(w.id)}" type="number" step="any" value="${(p.mins&&p.mins[w.id])||''}">`).join('')}
  ${qty?`<label>الكميات حسب المخزن</label><div>${qty}</div>`:''}${W.length?'<p class="muted" style="font-size:12.5px">«الكمية في المخزون» أعلاه هي الإجمالي لكل المخازن؛ للنقل بين المخازن استخدم «التحويلات».</p>':''}</details>`)}}
if(typeof saveProduct==='function'){const _sp=saveProduct;saveProduct=function(id){
  if(!can('stock_edit')||!$('#pf_bu'))return _sp(id);
  const bu=val('pf_bu').trim()||'قطعة',mx=num(val('pf_mx')),mins={};
  whActive().filter(w=>w.id!==MAIN).forEach(w=>{const e=$('#pf_wm_'+w.id);if(e&&String(e.value).trim()!==''&&num(e.value)>=0)mins[w.id]=num(e.value)});
  const n0=db.products.length;_sp(id);if($('#modal'))return;
  const p=id?prod(id):(db.products.length>n0?db.products[db.products.length-1]:null);if(!p)return;
  p.baseUnit=bu;if(mx>0)p.maxStock=mx;else delete p.maxStock;if(Object.keys(mins).length)p.mins=mins;else delete p.mins;save()}}

/* إعدادات متقدمة: طريقة تقييم المخزون */
if(typeof advInvModal==='function'){const _am=advInvModal;advInvModal=function(){_am();const a=$('#modal .actions');if(!a)return;
  a.insertAdjacentHTML('beforebegin',`<label>طريقة تقييم تكلفة المخزون عند الشراء</label><select id="ai_val"><option value="last" ${(db.settings.valuation||'last')==='last'?'selected':''}>آخر تكلفة شراء (الحالية)</option><option value="wac" ${db.settings.valuation==='wac'?'selected':''}>المتوسط المرجّح</option></select>`)}}
if(window.advInvSave){const _as=window.advInvSave;window.advInvSave=function(){const e=$('#ai_val');if(e)db.settings.valuation=e.value==='wac'?'wac':'last';_as()}}

/* تكاليف الوصول على فاتورة المشتريات */
if(typeof showPurchase==='function'){const _shp=showPurchase;showPurchase=function(id){_shp(id);const po=db.purchases.find(x=>x.id===id),b=$('#modal .sh-body');if(!po||!b)return;
  const L=(po.landed||[]).map(c=>`<div class="row"><span class="grow">${esc(c.type)}${c.note?' — '+esc(c.note):''}</span><b>${money(c.amount)}</b></div>`).join('');
  const eff=po.lines.filter(l=>num(l.lc)>0&&num(l.qty)>0).map(l=>`<div class="row"><span class="grow">${esc(l.name)}</span><small>${fmt((num(l.net!==undefined?l.net:l.qty*l.cost)+num(l.lc))/l.qty)} للقطعة</small></div>`).join('');
  b.insertAdjacentHTML('beforeend',`${L?`<label>تكاليف إضافية (تكلفة الوصول)</label><div class="card">${L}${eff?'<div class="muted" style="font-size:12px;margin-top:6px">تكلفة الوصول الفعلية:</div>'+eff:''}</div>`:''}${can('purchases')&&can('see_cost')?`<div class="actions"><button class="btn" onclick="lcForm('${jsq(po.id)}')">➕ تكاليف إضافية (شحن/جمارك/عمولة)</button></div>`:''}`)}}
window.lcForm=function(id){const po=db.purchases.find(x=>x.id===id);if(!po)return;
  modal('تكاليف إضافية — '+po.no,`<label>النوع</label><select id="lc_t">${LC_TYPES.map(t=>`<option>${esc(t)}</option>`).join('')}</select><label>المبلغ</label><input id="lc_a" type="number" inputmode="decimal" step="any"><label>طريقة التوزيع على المواد</label><select id="lc_m"><option value="value">حسب قيمة المادة</option><option value="qty">حسب الكمية</option></select><label>سُدّدت من</label><select id="lc_p"><option value="cash">الصندوق (يدخل في إغلاق اليوم)</option><option value="bank">البنك</option></select><label>ملاحظة</label><input id="lc_n">
  <p class="muted" style="font-size:12.5px">تُضاف إلى تكلفة المواد (${db.settings.valuation==='wac'?'المتوسط المرجّح':'آخر تكلفة'}) ولا تغيّر مستحق المورد. لا تُحذف بعد التطبيق (تبقى في سجل الفاتورة).</p>
  <div class="actions"><button class="btn primary" onclick="lcOk('${jsq(id)}')">توزيع وتطبيق</button><button class="btn ghost" onclick="showPurchase('${jsq(id)}')">رجوع</button></div>`)};
window.lcOk=function(id){if(!(can('purchases')&&can('see_cost')))return toast('ليست لديك صلاحية');const po=db.purchases.find(x=>x.id===id);if(!po)return;
  const r=applyLanded(po,{type:val('lc_t'),amount:val('lc_a'),method:val('lc_m'),pay:val('lc_p'),note:val('lc_n')});if(r.err)return toast(r.err);save();render();toast('تم توزيع التكلفة على المواد');showPurchase(id)};
})();
