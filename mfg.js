/* ORVEX — المرحلة 5 / بند 16: التصنيع (mfg.js). مجموعتان جديدتان تتزامنان عبر records: boms (قوائم المكونات) وprodOrders (أوامر الإنتاج).
   - BOM: منتج نهائي + كمية الدفعة + مكونات (كمية + نسبة هدر مسموح %) + عمالة وتكاليف إضافية للدفعة. منتج واحد = قائمة فعّالة واحدة.
   - أمر الإنتاج: مسودة ← منجز | ملغى. يحفظ نسخة من القائمة وقت الإنشاء فلا يتغير تاريخه بتعديلها لاحقًا.
   - الإنجاز: يخصم المواد من المخزن المختار (FEFO للمواد المتتبعة بالدفعات) ويضيف المنتج النهائي (بدفعة جديدة إن كان متتبعًا) بدفعة واحدة غير قابلة للتجزئة؛
     يُرفض كل شيء قبل أي تعديل إن نقص رصيد أو كان التاريخ في فترة مقفلة.
   - التكلفة: مواد (المستهلك × تكلفة المادة وقت الإنجاز) + عمالة وتكاليف إضافية. الهدر ضمن المسموح يدخل تكلفة المنتج، وما زاد عن المسموح
     «هدر غير طبيعي» يُحمَّل مصروفًا (5500) ولا يدخل تكلفة المنتج. تكلفة الوحدة = (المواد + الإضافي − الهدر غير الطبيعي) ÷ الكمية المنتجة،
     وتُحدِّث تكلفة المنتج بالمتوسط المرجّح أو آخر تكلفة حسب إعداد التقييم القائم.
   - الدفتر: قيد مشتق لكل أمر منجز (مدين مخزون + 5500، دائن مخزون المواد + مصدر التكاليف الإضافية). لا تُخزَّن قيود.
   - لا إلغاء لأمر منجز (التصحيح بتسوية/جرد مسجّلة). غير مدعوم: المنتجات ذات الأرقام التسلسلية. */
(function(root){
'use strict';
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const r4=n=>Math.round((+n+Number.EPSILON)*10000)/10000;
const B=()=>db.boms||(db.boms=[]),O=()=>db.prodOrders||(db.prodOrders=[]);
const I3=()=>root.ORVEX_INV3||{},I2=()=>root.ORVEX_INV2||{};
const L=(a,r,d,ba)=>{try{if(root.orvexLog)root.orvexLog(a,r,d,ba)}catch(e){}};
const ok_=()=>isAdmin()||can('stock_edit'),seeCost=()=>isAdmin()||can('see_cost');
const lockD=()=>{try{return(root.ORVEX_FIN&&root.ORVEX_FIN.lockDate&&root.ORVEX_FIN.lockDate())||''}catch(e){return''}};
const by=()=>(curUser()||{}).name||'';
const stamp=()=>'MO-'+today().replace(/-/g,'').slice(2)+'-'+uid().slice(-4).toUpperCase();
const whQ=(p,w)=>I3().whQty?I3().whQty(p,w||'main'):num(p.stock);
const whM=(p,w,d)=>{if(I3().whMove)I3().whMove(p,w||'main',d);else p.stock=r2(num(p.stock)+d)};
const whName=w=>{const x=I3().whById&&I3().whById(w||'main');return x?x.name:'(مخزن محذوف)'};
const histf=(p,t,a,b,why)=>{const h=I2().hist;if(h)h(p,t,a,b,why)};
if(I2().HT){I2().HT.mfg_use='تصنيع (استهلاك)';I2().HT.mfg_out='تصنيع (إنتاج)'}
const ST={draft:'مسودة',done:'منجز',cancelled:'ملغى'};

/* ===== قوائم المكونات ===== */
function dependsOn(x,F,skip,seen){seen=seen||new Set();if(seen.has(x))return false;seen.add(x);
  return B().some(b=>b.active!==false&&b.id!==skip&&b.pid===x&&b.comps.some(c=>c.pid===F||dependsOn(c.pid,F,skip,seen)))}
function stdCost(b){const m=b.comps.reduce((s,c)=>{const p=prod(c.pid);return s+num(c.qty)*(1+num(c.waste)/100)*num(p&&p.cost)},0);
  const batch=r2(m+num(b.labor)+num(b.overhead));return{mat:r2(m),batch,unit:b.outQty>0?r4(batch/b.outQty):0}}
function bomSave(id,v){
  if(!ok_())return{err:'ليست لديك صلاحية التصنيع'};
  const old=id?B().find(x=>x.id===id):null;if(id&&!old)return{err:'القائمة غير موجودة'};
  const fin=prod(v.pid);if(!fin)return{err:'اختر المنتج النهائي'};
  if(fin.trackSerial)return{err:'المنتج النهائي يتتبع أرقامًا تسلسلية: غير مدعوم في التصنيع'};
  const outQty=r4(num(v.outQty));if(!(outQty>0))return{err:'كمية الدفعة يجب أن تكون أكبر من صفر'};
  const comps=[],seen=new Set();
  for(const c of v.comps||[]){const p=prod(c.pid);if(!p)return{err:'مكوّن غير موجود'};if(seen.has(c.pid))return{err:'المكوّن مكرر: '+p.name};seen.add(c.pid);
    if(c.pid===v.pid)return{err:'المنتج النهائي لا يكون مكوّنًا لنفسه'};if(p.trackSerial)return{err:'«'+p.name+'» يتتبع أرقامًا تسلسلية: غير مدعوم كمكوّن'};
    const q=r4(num(c.qty)),w=num(c.waste);if(!(q>0))return{err:'كمية غير صحيحة للمكوّن: '+p.name};if(w<0||w>100)return{err:'نسبة الهدر بين 0 و100: '+p.name};
    if(dependsOn(c.pid,v.pid,id))return{err:'حلقة مغلقة: «'+p.name+'» يعتمد على «'+fin.name+'»'};
    comps.push({pid:c.pid,qty:q,waste:w})}
  if(!comps.length)return{err:'أضف مكوّنًا واحدًا على الأقل'};
  const labor=r2(num(v.labor)),overhead=r2(num(v.overhead));if(labor<0||overhead<0)return{err:'تكلفة سالبة'};
  if(B().some(b=>b.id!==id&&b.active!==false&&b.pid===v.pid&&v.active!==false))return{err:'للمنتج قائمة فعّالة مسبقًا: عدّلها أو أوقفها'};
  const o={pid:v.pid,outQty,comps,labor,overhead,note:String(v.note||'').trim(),active:v.active!==false};
  if(old){const b={outQty:old.outQty,comps:old.comps.length,labor:old.labor,overhead:old.overhead};Object.assign(old,o,{ver:(old.ver||1)+1,upAt:new Date().toISOString(),upBy:by()});
    L('bom_edit',fin.name,'نسخة '+old.ver,{b,a:{outQty,comps:comps.length,labor,overhead}});return{ok:old}}
  const b=Object.assign({id:uid(),ver:1,at:new Date().toISOString(),by:by()},o);B().push(b);L('bom_add',fin.name,comps.length+' مكوّن');return{ok:b}}
function bomToggle(id){if(!ok_())return{err:'ليست لديك صلاحية التصنيع'};const b=B().find(x=>x.id===id);if(!b)return{err:'القائمة غير موجودة'};
  if(b.active===false&&B().some(x=>x.id!==id&&x.active!==false&&x.pid===b.pid))return{err:'للمنتج قائمة فعّالة أخرى'};
  if(b.active!==false&&O().some(o=>o.bomId===id&&o.status==='draft'))return{err:'توجد أوامر إنتاج مفتوحة على هذه القائمة'};
  b.active=b.active===false;L('bom_toggle',(prod(b.pid)||{}).name||'',b.active?'تفعيل':'إيقاف');return{ok:b}}

/* ===== أوامر الإنتاج ===== */
function plan(S,qty){return S.comps.map(c=>{const need=r4(c.qty*qty/S.outQty);return{pid:c.pid,need,plan:r4(need*(1+num(c.waste)/100)),waste:num(c.waste)}})}
function poCreate(bomId,qty,v){
  if(!ok_())return{err:'ليست لديك صلاحية التصنيع'};v=v||{};
  const b=B().find(x=>x.id===bomId);if(!b||b.active===false)return{err:'اختر قائمة مكونات فعّالة'};
  qty=r4(num(qty));if(!(qty>0))return{err:'الكمية المخططة يجب أن تكون أكبر من صفر'};
  const wh=v.wh||'main',w=I3().whById&&I3().whById(wh);if(I3().whById&&(!w||w.active===false))return{err:'مخزن غير صالح'};
  const date=v.date||today();if(!ISO.test(date))return{err:'تاريخ غير صحيح'};
  const S={pid:b.pid,outQty:b.outQty,comps:b.comps.map(c=>({pid:c.pid,qty:c.qty,waste:c.waste})),labor:b.labor,overhead:b.overhead,ver:b.ver||1};
  const o={id:uid(),no:stamp(),bomId,bom:S,qty,wh,date,status:'draft',rows:plan(S,qty),note:String(v.note||'').trim(),by:by(),at:new Date().toISOString()};
  O().push(o);L('mfg_create',o.no,(prod(b.pid)||{}).name+' × '+qty);return{ok:o}}
function shortages(o){const w=o.wh||'main';return o.rows.map(r=>{const p=prod(r.pid);const av=p?whQ(p,w):0;return av+1e-9<r.plan?{pid:r.pid,name:p?p.name:'(محذوف)',need:r.plan,have:av}:null}).filter(Boolean)}
function poComplete(id,v){
  v=v||{};if(!ok_())return{err:'ليست لديك صلاحية التصنيع'};
  const o=O().find(x=>x.id===id);if(!o)return{err:'أمر الإنتاج غير موجود'};if(o.status!=='draft')return{err:'الأمر ليس مسودة'};
  const date=v.date||today();if(!ISO.test(date))return{err:'تاريخ غير صحيح'};if(date>today())return{err:'تاريخ الإنجاز في المستقبل'};if(date<o.date)return{err:'تاريخ الإنجاز أقدم من الأمر'};
  if(lockD()&&date<=lockD())return{err:'التاريخ يقع في فترة مقفلة حتى '+lockD()};
  const out=r4(num(v.out));if(!(out>0))return{err:'أدخل الكمية المنتجة (أكبر من صفر)'};
  const S=o.bom,fin=prod(S.pid),wh=o.wh||'main';if(!fin)return{err:'المنتج النهائي محذوف'};if(fin.trackSerial)return{err:'المنتج النهائي يتتبع أرقامًا تسلسلية'};
  if(I3().whById){const w=I3().whById(wh);if(!w||w.active===false)return{err:'المخزن غير فعّال'}}
  const xPay=['none','cash','bank'].includes(v.xPay)?v.xPay:'none';
  const labor=v.labor===undefined||v.labor===''?r2(S.labor*out/S.outQty):r2(num(v.labor)),over=v.overhead===undefined||v.overhead===''?r2(S.overhead*out/S.outQty):r2(num(v.overhead));
  if(labor<0||over<0)return{err:'تكلفة سالبة'};
  const rows=[];let any=false;
  for(const c of S.comps){const p=prod(c.pid);if(!p)return{err:'مكوّن محذوف من المنتجات'};if(p.trackSerial)return{err:'«'+p.name+'» يتتبع أرقامًا تسلسلية'};
    const pl=o.rows.find(r=>r.pid===c.pid),raw=v.used&&v.used[c.pid];
    const used=raw===undefined||raw===''?r4(pl?pl.plan:0):r4(num(raw));if(used<0)return{err:'كمية سالبة: '+p.name};if(used>0)any=true;
    if(whQ(p,wh)+1e-9<used)return{err:'رصيد غير كافٍ في «'+whName(wh)+'»: '+p.name+' (متوفر '+whQ(p,wh)+' والمطلوب '+used+')'};
    const need=r4(c.qty*out/S.outQty),allowed=r4(need*(1+num(c.waste)/100)),cost=num(p.cost);
    rows.push({pid:c.pid,name:p.name,need,allowed,used,cost,val:r2(used*cost),
      normal:r2(Math.max(0,Math.min(used,allowed)-need)*cost),abn:r2(Math.max(0,used-allowed)*cost)})}
  if(!any)return{err:'لا توجد مواد مستهلكة'};
  let batchNo='';if(fin.trackBatch){batchNo=String(v.batchNo||o.no).trim();const e=String(v.exp||'').trim();if(e&&!ISO.test(e))return{err:'تاريخ انتهاء غير صحيح'};if(e&&e<date)return{err:'تاريخ الانتهاء قبل الإنتاج'}}
  const cMat=r2(rows.reduce((s,r)=>s+r.val,0)),abn=r2(rows.reduce((s,r)=>s+r.abn,0)),nor=r2(rows.reduce((s,r)=>s+r.normal,0)),X=r2(labor+over);
  const cap=r2(cMat+X-abn),unit=r4(cap/out);
  /* ——— تنفيذ بلا فشل متوقع بعد هذه النقطة ——— */
  rows.forEach(r=>{const p=prod(r.pid);if(!(r.used>0))return;const b0=p.stock;
    if(p.trackBatch&&(p.batches||[]).length&&I2().fefo){const f=I2().fefo(p,r.used);if(f.used.length)r.bt=f.used}
    whM(p,wh,-r.used);histf(p,'mfg_use',b0,p.stock,o.no)});
  const b0=fin.stock,wac=(db.settings||{}).valuation==='wac';
  fin.cost=wac&&b0>0?r4((b0*num(fin.cost)+cap)/(b0+out)):unit;
  whM(fin,wh,out);
  if(fin.trackBatch){fin.batches=fin.batches||[];const e=String(v.exp||'').trim(),ex=fin.batches.find(b=>b.no===batchNo);
    if(ex){ex.qty=r2(ex.qty+out);if(e)ex.exp=e}else{const nb={no:batchNo,exp:e,qty:r2(out)};nb.mfg=date;fin.batches.push(nb)}}
  histf(fin,'mfg_out',b0,fin.stock,o.no);
  o.status='done';o.done={date,out,rows,cMat,labor,overhead:over,xPay,normalWaste:nor,abnormalWaste:abn,capitalized:cap,unit,batchNo,note:String(v.note||'').trim(),by:by(),at:new Date().toISOString()};
  L('mfg_complete',o.no,fin.name+' × '+out+' | تكلفة الوحدة '+unit+' | هدر غير طبيعي '+abn,{b:{status:'draft'},a:{out,cMat,X,abn,unit}});
  return{ok:o}}
function poCancel(id,reason){
  if(!ok_())return{err:'ليست لديك صلاحية التصنيع'};const o=O().find(x=>x.id===id);if(!o)return{err:'أمر الإنتاج غير موجود'};
  if(o.status!=='draft')return{err:'لا يُلغى إلا أمر في المسودة'};if(!String(reason||'').trim())return{err:'اكتب سبب الإلغاء'};
  o.status='cancelled';o.cancel={reason:String(reason).trim(),by:by(),at:new Date().toISOString()};L('mfg_cancel',o.no,reason);return{ok:o}}

/* ===== الدفتر والتقارير ===== */
function entries(keyId,bankId){
  const out=[];
  O().forEach(o=>{if(o.status!=='done'||!o.done)return;const d=o.done,C=r2(d.cMat),X=r2(num(d.labor)+num(d.overhead)),A=r2(d.abnormalWaste),F=r2(C+X-A);
    if(!(C>0||X>0)||!ISO.test(String(d.date||'')))return;
    const xa=d.xPay==='cash'?keyId.cash:d.xPay==='bank'?bankId:keyId.opex,ln=[];
    if(F>0)ln.push({a:keyId.inventory,d:F,c:0});if(A>0)ln.push({a:keyId.inventory_adjust,d:A,c:0});
    if(C>0)ln.push({a:keyId.inventory,d:0,c:C});if(X>0)ln.push({a:xa,d:0,c:X});
    out.push({key:'mfg:'+o.id,src:'mfg',date:d.date,memo:'تصنيع '+o.no+' — '+((prod(o.bom.pid)||{}).name||''),lines:ln})});
  return out}
function report(from,to){
  const L2=O().filter(o=>o.status==='done'&&o.done&&(!from||o.done.date>=from)&&(!to||o.done.date<=to)),by={};
  L2.forEach(o=>{const k=o.bom.pid,r=by[k]||(by[k]={pid:k,name:(prod(k)||{}).name||'(محذوف)',orders:0,out:0,cost:0,normal:0,abn:0});
    r.orders++;r.out=r4(r.out+o.done.out);r.cost=r2(r.cost+o.done.capitalized);r.normal=r2(r.normal+o.done.normalWaste);r.abn=r2(r.abn+o.done.abnormalWaste)});
  const rows=Object.values(by).map(r=>Object.assign(r,{unit:r.out>0?r4(r.cost/r.out):0}));
  return{orders:L2.length,rows,out:r4(rows.reduce((s,r)=>s+r.out,0)),cost:r2(rows.reduce((s,r)=>s+r.cost,0)),normal:r2(rows.reduce((s,r)=>s+r.normal,0)),abn:r2(rows.reduce((s,r)=>s+r.abn,0))}}

root.ORVEX_MFG={bomSave,bomToggle,bomCost:stdCost,poCreate,poComplete,poCancel,shortages,entries,report,plan,B,O};

/* ================= الواجهة ================= */
if(typeof document==='undefined'||!root.modal)return;
const val=id=>{const e=document.getElementById(id);return e?e.value:''};
const M={tab:'orders'},MB={id:'',pid:'',outQty:1,comps:[],labor:0,overhead:0,note:'',q:'',fq:''};
const money_=v=>seeCost()?money(v):'—';
root.mfgOpen=function(t){
  if(!ok_())return toast('ليست لديك صلاحية التصنيع');if(typeof t==='string')M.tab=t;
  const tabs=chips([['orders','الأوامر'],['boms','القوائم'],['rep','التقرير']],M.tab,'mfgOpen');
  let h='';
  if(M.tab==='orders'){const L2=O().slice().sort((a,b)=>(a.status==='draft'?0:1)-(b.status==='draft'?0:1)||String(b.at).localeCompare(String(a.at))).slice(0,60);
    h=`<div class="card">${L2.length?L2.map(o=>`<div class="row" onclick="moView('${jsq(o.id)}')"><div class="grow"><div class="t">${esc(o.no)} — ${esc((prod(o.bom.pid)||{}).name||'(محذوف)')} <span class="badge">${ST[o.status]}</span></div><small>${esc(fdate(o.done?o.done.date:o.date))} — ${esc(whName(o.wh))}</small></div><div class="end"><b>${o.done?o.done.out:o.qty}</b><br><small>${o.done?'منتَج':'مخطط'}</small></div></div>`).join(''):'<p class="muted">لا توجد أوامر إنتاج.</p>'}</div><div class="actions"><button class="btn primary" onclick="moNew()">+ أمر إنتاج</button></div>`}
  else if(M.tab==='boms'){h=`<div class="card">${B().length?B().map(b=>{const f=prod(b.pid),c=stdCost(b);return`<div class="row" onclick="bomForm('${jsq(b.id)}')"><div class="grow"><div class="t">${esc(f?f.name:'(محذوف)')} ${b.active===false?'<span class="badge">موقوفة</span>':''}</div><small>دفعة ${b.outQty} — ${b.comps.length} مكوّن</small></div><div class="end"><b>${seeCost()?money_(c.unit):'—'}</b><br><small>تكلفة الوحدة</small></div></div>`}).join(''):'<p class="muted">لا توجد قوائم مكونات.</p>'}</div><div class="actions"><button class="btn primary" onclick="bomForm()">+ قائمة مكونات</button></div>`}
  else{const m=M.rm||today().slice(0,7),r=report(m+'-01',m+'-31');
    h=`<input type="month" value="${esc(m)}" onchange="M_rm(this.value)"><div class="card" style="margin-top:8px">${r.rows.length?r.rows.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.name)}</div><small>${x.orders} أمر — منتَج ${x.out}${seeCost()?' — هدر طبيعي '+money(x.normal)+' — غير طبيعي '+money(x.abn):''}</small></div><div class="end"><b>${money_(x.cost)}</b><br><small>${seeCost()?money(x.unit)+'/وحدة':''}</small></div></div>`).join(''):'<p class="muted">لا إنتاج منجز في هذا الشهر.</p>'}</div>${seeCost()?`<p class="muted">إجمالي تكلفة الإنتاج <b>${money(r.cost)}</b> — هدر غير طبيعي محمَّل مصروفًا <b>${money(r.abn)}</b></p>`:''}`}
  modal('التصنيع',tabs+h+'<div class="actions"><button class="btn ghost" onclick="closeModal()">إغلاق</button></div>')};
root.M_rm=v=>{M.rm=v;mfgOpen('rep')};
root.moNew=function(){const bs=B().filter(b=>b.active!==false);
  if(!bs.length)return modal('أمر إنتاج',`<p>أنشئ قائمة مكونات أولًا.</p><div class="actions"><button class="btn primary" onclick="bomForm()">+ قائمة مكونات</button><button class="btn ghost" onclick="mfgOpen('orders')">رجوع</button></div>`);
  const ws=I3().whActive?I3().whActive():[{id:'main',name:'المخزن الرئيسي'}];
  modal('أمر إنتاج',`<label>القائمة</label><select id="mn_b">${bs.map(b=>`<option value="${esc(b.id)}">${esc((prod(b.pid)||{}).name||'')} (دفعة ${b.outQty})</option>`).join('')}</select><label>الكمية المخططة</label><input id="mn_q" type="number" step="any" inputmode="decimal" value="1"><label>المخزن</label><select id="mn_w">${ws.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select><label>التاريخ</label><input id="mn_d" type="date" value="${today()}"><label>ملاحظة</label><input id="mn_t">
  <div class="actions"><button class="btn primary" onclick="moMake()">إنشاء</button><button class="btn ghost" onclick="mfgOpen('orders')">رجوع</button></div>`)};
root.moMake=function(){const r=poCreate(val('mn_b'),val('mn_q'),{wh:val('mn_w'),date:val('mn_d'),note:val('mn_t')});if(r.err)return toast(r.err);save();toast('تم الإنشاء');moView(r.ok.id)};
root.moView=function(id){const o=O().find(x=>x.id===id);if(!o)return mfgOpen();const f=prod(o.bom.pid),sh=o.status==='draft'?shortages(o):[],d=o.done;
  modal(o.no,`<p><b>${esc(f?f.name:'(محذوف)')}</b> — <span class="badge">${ST[o.status]}</span><br><small>${esc(whName(o.wh))} — ${esc(fdate(o.date))} — ${esc(o.by||'')}</small></p>
  <div class="card">${(d?d.rows:o.rows).map(r=>{const p=prod(r.pid);return`<div class="row"><div class="grow">${esc(r.name||(p?p.name:'(محذوف)'))}<br><small>${d?'استُهلك '+r.used+(seeCost()?' — تكلفة '+money(r.val):'')+(r.abn>0&&seeCost()?' — هدر غير طبيعي '+money(r.abn):''):'مطلوب '+r.plan+' (متوفر '+(p?whQ(p,o.wh):0)+')'}</small></div></div>`}).join('')}</div>
  ${d?`<div class="card" style="margin-top:8px"><div class="row"><div class="grow">المنتَج</div><div class="end"><b>${d.out}</b></div></div>${seeCost()?`<div class="row"><div class="grow">تكلفة المواد</div><div class="end">${money(d.cMat)}</div></div><div class="row"><div class="grow">عمالة + إضافي</div><div class="end">${money(d.labor+d.overhead)}</div></div><div class="row"><div class="grow">هدر غير طبيعي (مصروف)</div><div class="end">${money(d.abnormalWaste)}</div></div><div class="row"><div class="grow"><b>تكلفة الوحدة</b></div><div class="end"><b>${money(d.unit)}</b></div></div>`:''}</div>${d.batchNo?`<small class="muted">الدفعة: ${esc(d.batchNo)}</small>`:''}`:''}
  ${sh.length?`<p class="muted" style="color:var(--danger,#c0392b)">رصيد ناقص: ${sh.map(x=>esc(x.name)+' ('+x.have+'/'+x.need+')').join('، ')}</p>`:''}
  ${o.cancel?`<p class="muted">أُلغي: ${esc(o.cancel.reason)}</p>`:''}
  <div class="actions">${o.status==='draft'?`<button class="btn primary" onclick="moDoneForm('${jsq(id)}')">إنجاز</button><button class="btn danger" onclick="moCancelForm('${jsq(id)}')">إلغاء</button>`:''}<button class="btn ghost" onclick="mfgOpen('orders')">رجوع</button></div>`)};
root.moDoneForm=function(id){const o=O().find(x=>x.id===id);if(!o||o.status!=='draft')return;const f=prod(o.bom.pid);
  modal('إنجاز '+o.no,`<label>الكمية المنتجة فعليًا (المخططة ${o.qty})</label><input id="md_o" type="number" step="any" inputmode="decimal" value="${o.qty}"><label>تاريخ الإنجاز</label><input id="md_d" type="date" value="${today()}">
  <h3 style="margin:10px 0 4px">المواد المستهلكة فعليًا</h3><div class="card">${o.rows.map((r,i)=>{const p=prod(r.pid);return`<div class="row"><div class="grow">${esc(p?p.name:'(محذوف)')}<br><small>مخطط ${r.plan} — متوفر ${p?whQ(p,o.wh):0}</small></div><div class="end"><input id="md_u${i}" type="number" step="any" inputmode="decimal" value="${r.plan}" style="width:90px"></div></div>`}).join('')}</div>
  <div class="f2"><div><label>العمالة</label><input id="md_l" type="number" inputmode="decimal" value="${r2(o.bom.labor*o.qty/o.bom.outQty)}"></div><div><label>تكاليف إضافية</label><input id="md_h" type="number" inputmode="decimal" value="${r2(o.bom.overhead*o.qty/o.bom.outQty)}"></div></div>
  <label>مصدر العمالة والتكاليف</label><select id="md_x"><option value="none">مسجّلة كمصروف مسبقًا (تحميل على التكلفة فقط)</option><option value="cash">تُدفع الآن من الصندوق</option><option value="bank">تُدفع الآن من البنك</option></select>
  ${f&&f.trackBatch?`<div class="f2"><div><label>رقم الدفعة</label><input id="md_b" value="${esc(o.no)}"></div><div><label>تاريخ الانتهاء</label><input id="md_e" type="date"></div></div>`:''}
  <small class="muted">الاستهلاك فوق المسموح (هدر غير طبيعي) يُحمَّل مصروفًا ولا يدخل تكلفة المنتج.</small>
  <div class="actions"><button class="btn primary" onclick="moDone('${jsq(id)}')">تأكيد الإنجاز</button><button class="btn ghost" onclick="moView('${jsq(id)}')">رجوع</button></div>`)};
root.moDone=function(id){const o=O().find(x=>x.id===id);if(!o)return;const used={};o.rows.forEach((r,i)=>{used[r.pid]=val('md_u'+i)});
  askConfirm('سيُخصم الاستهلاك من المخزن وتُضاف الكمية المنتجة. لا يمكن التراجع بعد الإنجاز.',()=>{
    const r=poComplete(id,{out:val('md_o'),date:val('md_d'),used,labor:val('md_l'),overhead:val('md_h'),xPay:val('md_x'),batchNo:val('md_b'),exp:val('md_e')});
    if(r.err){toast(r.err);return moDoneForm(id)}save();toast('تم الإنجاز');moView(id)},'تأكيد')};
root.moCancelForm=function(id){modal('إلغاء أمر',`<label>السبب</label><input id="mc_r"><div class="actions"><button class="btn danger" onclick="moCancel('${jsq(id)}')">إلغاء الأمر</button><button class="btn ghost" onclick="moView('${jsq(id)}')">رجوع</button></div>`)};
root.moCancel=function(id){const r=poCancel(id,val('mc_r'));if(r.err)return toast(r.err);save();toast('تم الإلغاء');moView(id)};

/* نموذج القائمة: الحالة في MB وتُقرأ حقولها قبل أي إعادة رسم */
const sync=()=>{const e=id=>document.getElementById(id);if(!e('bm_o'))return;MB.outQty=e('bm_o').value;MB.labor=e('bm_l').value;MB.overhead=e('bm_h').value;MB.note=e('bm_t').value;MB.comps.forEach((c,i)=>{const q=e('bm_q'+i),w=e('bm_w'+i);if(q)c.qty=q.value;if(w)c.waste=w.value})};
root.bomForm=function(id){
  if(!ok_())return toast('ليست لديك صلاحية التصنيع');
  const b=id?B().find(x=>x.id===id):null;
  Object.assign(MB,b?{id:b.id,pid:b.pid,outQty:b.outQty,comps:b.comps.map(c=>Object.assign({},c)),labor:b.labor,overhead:b.overhead,note:b.note||'',q:'',fq:''}:{id:'',pid:'',outQty:1,comps:[],labor:0,overhead:0,note:'',q:'',fq:''});
  bomRender()};
function bomRender(){
  const fin=prod(MB.pid),cur=MB.id?B().find(x=>x.id===MB.id):null;
  modal(MB.id?'تعديل قائمة':'قائمة مكونات',`<label>المنتج النهائي</label>${fin?`<div class="row"><div class="grow"><b>${esc(fin.name)}</b></div><div class="end"><button class="btn ghost" onclick="MB_fin('')">تغيير</button></div></div>`:`<input placeholder="ابحث عن المنتج" oninput="MB_fq(this.value)" value="${esc(MB.fq)}"><div id="bm_fr" class="card">${finRes()}</div>`}
  <div class="f2"><div><label>كمية الدفعة</label><input id="bm_o" type="number" step="any" inputmode="decimal" value="${esc(MB.outQty)}"></div><div></div></div>
  <h3 style="margin:10px 0 4px">المكونات (للدفعة الواحدة)</h3><div class="card">${MB.comps.length?MB.comps.map((c,i)=>{const p=prod(c.pid);return`<div class="row"><div class="grow">${esc(p?p.name:'(محذوف)')}</div><div class="end"><input id="bm_q${i}" type="number" step="any" inputmode="decimal" value="${esc(c.qty)}" style="width:70px" placeholder="كمية"> <input id="bm_w${i}" type="number" step="any" inputmode="decimal" value="${esc(c.waste||0)}" style="width:60px" placeholder="هدر٪"> <button class="x" onclick="MB_del(${i})" aria-label="حذف">✕</button></div></div>`}).join(''):'<p class="muted">أضف مكونات.</p>'}</div>
  <input placeholder="+ إضافة مكوّن (ابحث)" oninput="MB_q(this.value)" value="${esc(MB.q)}"><div id="bm_r" class="card">${compRes()}</div>
  <div class="f2"><div><label>عمالة للدفعة</label><input id="bm_l" type="number" inputmode="decimal" value="${esc(MB.labor)}"></div><div><label>تكاليف إضافية للدفعة</label><input id="bm_h" type="number" inputmode="decimal" value="${esc(MB.overhead)}"></div></div>
  <label>ملاحظة</label><input id="bm_t" value="${esc(MB.note)}">${cur&&seeCost()?`<p class="muted">التكلفة المعيارية للوحدة: <b>${money(stdCost(cur).unit)}</b></p>`:''}
  <div class="actions"><button class="btn primary" onclick="bomGo()">حفظ</button>${cur?`<button class="btn" onclick="bomOff('${jsq(cur.id)}')">${cur.active===false?'تفعيل':'إيقاف'}</button>`:''}<button class="btn ghost" onclick="mfgOpen('boms')">رجوع</button></div>`)}
const hits=(q,ex)=>{q=String(q||'').trim().toLowerCase();if(!q)return[];const f=I2().codesOf;return db.products.filter(p=>!ex(p)&&(p.name.toLowerCase().includes(q)||(f?f(p):[]).some(k=>String(k.code).toLowerCase().includes(q)))).slice(0,6)};
const finRes=()=>hits(MB.fq,()=>false).map(p=>`<div class="row" onclick="MB_fin('${jsq(p.id)}')"><div class="grow">${esc(p.name)}</div></div>`).join('');
const compRes=()=>hits(MB.q,p=>p.id===MB.pid||MB.comps.some(c=>c.pid===p.id)).map(p=>`<div class="row" onclick="MB_add('${jsq(p.id)}')"><div class="grow">${esc(p.name)}</div></div>`).join('');
root.MB_fin=id=>{sync();MB.pid=id;MB.fq='';bomRender()};
root.MB_fq=v=>{MB.fq=v;const e=document.getElementById('bm_fr');if(e)e.innerHTML=finRes()};
root.MB_q=v=>{MB.q=v;const e=document.getElementById('bm_r');if(e)e.innerHTML=compRes()};
root.MB_add=id=>{sync();MB.comps.push({pid:id,qty:1,waste:0});MB.q='';bomRender()};
root.MB_del=i=>{sync();MB.comps.splice(i,1);bomRender()};
root.bomGo=function(){sync();const r=bomSave(MB.id,{pid:MB.pid,outQty:MB.outQty,comps:MB.comps,labor:MB.labor,overhead:MB.overhead,note:MB.note});if(r.err)return toast(r.err);save();toast('تم الحفظ');MB.id='';mfgOpen('boms')};
root.bomOff=function(id){const r=bomToggle(id);if(r.err)return toast(r.err);save();mfgOpen('boms')};
if(typeof vParties==='function'){const _vp=vParties;vParties=function(){return _vp()+(ok_()?`<div class="actions"><button class="btn" onclick="mfgOpen()">🏭 التصنيع</button></div>`:'')}}
})(typeof window!=='undefined'?window:globalThis);
