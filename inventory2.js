/* ORVEX — المرحلة 1: مخزون احترافي (inventory2.js)
   إضافي فقط: كل الحقول الجديدة اختيارية داخل صف المنتج نفسه (codes, trackBatch, batches, trackSerial, serials, hist)،
   فلا حاجة لأي ترحيل في Supabase ولا لتغيير بنية IndexedDB، والمنتجات القديمة تعمل كما هي.
   يُحمَّل بعد addon.js وقبل server.js (كي تلتقط VIEWS دوال العرض المغلَّفة). */
(function(){
'use strict';
const lc=s=>String(s==null?'':s).trim().toLowerCase();
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const validDate=s=>{if(!ISO.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s};
const daysTo=s=>Math.round((Date.parse(s+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/864e5);

/* ---------- 1) باركودات متعددة + وحدات بمعامل تحويل ---------- */
function codesOf(p){const a=[];if(p&&p.sku)a.push({code:String(p.sku).trim(),unit:'',f:1});
  ((p&&p.codes)||[]).forEach(c=>{if(c&&c.code)a.push({code:String(c.code).trim(),unit:c.unit||'',f:num(c.f)>0?num(c.f):1,price:num(c.price)>0?num(c.price):0,cost:num(c.cost)>0?num(c.cost):0})});return a}
function hit(c){const q=lc(c);if(!q)return null;
  for(const p of db.products){for(const k of codesOf(p)){if(lc(k.code)===q)return{p,f:k.f,unit:k.unit,price:k.price,cost:k.cost}}}return null}
window.orvexFindByCode=function(c){const h=hit(c);window.__scanQty=h&&h.f>1?h.f:0;return h?h.p:null};
const _mp=matchProds;matchProds=function(q){q=lc(q);return db.products.filter(p=>lc(p.name).includes(q)||codesOf(p).some(k=>lc(k.code).includes(q)))};
const _de=doEntry;doEntry=function(q){const h=q&&hit(q);if(h){const n0=state.cart.length;addCart(h.p.id,h.f>1?h.f:undefined);
  /* سعر بيع خاص بالوحدة: يُحوَّل لسعر القطعة الأساسية (السعر÷المعامل) فيبقى الإجمالي والمخزون صحيحين؛ يُطبَّق على السطر الجديد فقط */
  if(h.price>0&&h.f>0&&state.cart.length>n0){const l=state.cart[state.cart.length-1];if(l&&l.pid===h.p.id){l.price=h.price/h.f;l.unit=h.unit;if(typeof posRender==='function')posRender()}}return}_de(q)};

const lines=t=>String(t||'').split(/\n/).map(x=>x.trim()).filter(Boolean).map(x=>x.split(/\s*[|\t،]\s*/).map(y=>y.trim()));
function parseCodes(t,ownId,sku){
  const out=[],seen=new Set();if(sku)seen.add(lc(sku));
  for(const r of lines(t)){const code=r[0];if(!code)continue;const f=r[2]?num(r[2]):1;
    if(!(f>0))return{err:'معامل الوحدة غير صحيح للباركود: '+code};
    if(seen.has(lc(code)))return{err:'الباركود مكرر: '+code};seen.add(lc(code));
    const o=db.products.find(p=>p.id!==ownId&&codesOf(p).some(k=>lc(k.code)===lc(code)));
    if(o)return{err:'الباركود «'+code+'» مستخدم للمادة: '+o.name};
    const pr=r[3]?num(r[3]):0,co=r[4]?num(r[4]):0;
    if(pr<0||co<0)return{err:'سعر الوحدة لا يكون سالبًا: '+code};
    if(pr>0&&Math.abs(r2(pr/f)*f-pr)>0.005)return{err:'سعر الوحدة «'+code+'» لا يقبل القسمة بدقة على المعامل '+f+'؛ اختر سعرًا يقبل القسمة'};
    const o2={code,unit:r[1]||'',f};if(pr>0)o2.price=pr;if(co>0)o2.cost=co;out.push(o2)}
  return{list:out}}
function parseBatches(t){
  const out=[],seen=new Set();
  for(const r of lines(t)){const no=r[0];if(!no)continue;
    if(seen.has(lc(no)))return{err:'رقم الدفعة مكرر: '+no};seen.add(lc(no));
    const exp=r[1]||'';if(exp&&!validDate(exp))return{err:'تاريخ غير صحيح للدفعة «'+no+'» (الصيغة YYYY-MM-DD)'};
    const q=r[2]===undefined||r[2]===''?0:num(r[2]);if(q<0)return{err:'كمية سالبة في الدفعة: '+no};
    const mfg=r[3]||'';if(mfg&&!validDate(mfg))return{err:'تاريخ إنتاج غير صحيح للدفعة «'+no+'» (الصيغة YYYY-MM-DD)'};
    if(mfg&&exp&&mfg>exp)return{err:'تاريخ الإنتاج بعد تاريخ الانتهاء في الدفعة: '+no};
    const o={no,exp,qty:r2(q)};if(mfg)o.mfg=mfg;out.push(o)}
  return{list:out}}
function parseSerials(t,ownId){
  const out=[],seen=new Set();
  for(const r of lines(t)){const sn=r[0];if(!sn)continue;
    if(seen.has(lc(sn)))return{err:'رقم تسلسلي مكرر: '+sn};seen.add(lc(sn));
    const o=db.products.find(p=>p.id!==ownId&&(p.serials||[]).some(x=>lc(x.sn)===lc(sn)));
    if(o)return{err:'الرقم التسلسلي «'+sn+'» مسجّل للمادة: '+o.name};
    out.push(sn)}
  return{list:out}}

/* سجل حركة داخل المنتج (آخر 60 حركة) — تدقيق بمعرّف ثابت لكل حركة */
function hist(p,type,from,to,reason,extra){p.hist=p.hist||[];
  p.hist.push(Object.assign({id:uid(),t:new Date().toISOString(),type,from,to,diff:r2(to-from),reason:reason||'',by:(curUser()||{}).name||''},extra||{}));
  if(p.hist.length>60)p.hist.splice(0,p.hist.length-60)}
const HT={count:'جرد',adjust:'تسوية',sale:'بيع',meta:'تعديل بيانات',transfer:'تحويل مخزني'};

/* ---------- نموذج المنتج: قسم الخيارات المتقدمة ---------- */
const _pf=productForm;productForm=function(id){
  _pf(id);if(!can('stock_edit'))return;const a=$('#modal .actions');if(!a)return;
  const p=id?(prod(id)||{}):{};
  const cs=(p.codes||[]).map(c=>[c.code,c.unit||'',c.f>1?c.f:'',c.price||'',c.cost||''].join(' | ').replace(/( \| )+$/,'')).join('\n');
  const bs=(p.batches||[]).map(b=>[b.no,b.exp||'',b.qty,b.mfg||''].join(' | ').replace(/( \| )+$/,'')).join('\n');
  const ss=(p.serials||[]).filter(x=>x.st!=='sold').map(x=>x.sn).join('\n');
  const H=(p.hist||[]).slice(-8).reverse().map(h=>`<div style="font-size:12px;display:flex;justify-content:space-between;gap:6px;padding:3px 0;border-bottom:1px dashed #ddd"><span>${esc(fdate(String(h.t).slice(0,10)))} — ${esc(HT[h.type]||h.type)}${h.reason?' ('+esc(h.reason)+')':''}</span><b>${h.from} ← ${h.to}</b></div>`).join('');
  const ta=(i,v,ph)=>`<textarea id="${i}" rows="3" style="width:100%" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
  a.insertAdjacentHTML('beforebegin',`<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">⚙ خيارات مخزون متقدمة (باركودات/وحدات/دفعات/تسلسلي)</summary>
  <label>باركودات ووحدات إضافية — سطر لكل باركود: الباركود | اسم الوحدة | عدد القطع | سعر بيع الوحدة | سعر شراء الوحدة (الأخيران اختياريان)</label>${ta('pf_codes',cs,'مثال: 6221234567890 | كرتونة | 12 | 120 | 100')}
  <p class="muted" style="font-size:12px;margin:2px 0">مسح باركود وحدة بمعامل 12 يضيف 12 قطعة أساسية إلى الفاتورة بسعر القطعة المفردة.</p>
  <label class="pchk" style="border:0"><input type="checkbox" id="pf_tb" ${p.trackBatch?'checked':''}> تتبع الدفعات وتواريخ الصلاحية</label>
  ${ta('pf_batches',bs,'رقم الدفعة | تاريخ الانتهاء YYYY-MM-DD | الكمية | تاريخ الإنتاج YYYY-MM-DD (اختياري)')}
  <label class="pchk" style="border:0"><input type="checkbox" id="pf_ts" ${p.trackSerial?'checked':''}> تتبع الأرقام التسلسلية (يُطلب رقم لكل قطعة عند البيع)</label>
  ${ta('pf_serials',ss,'رقم تسلسلي واحد في كل سطر (المتوفر في المخزن فقط)')}
  ${H?`<label style="margin-top:8px">آخر الحركات</label>${H}`:''}</details>`)};

function readExtras(id){
  const sku=($('#pf_sku')||{}).value||'';
  if(sku&&db.products.some(p=>p.id!==id&&(p.codes||[]).some(k=>lc(k.code)===lc(sku))))return{err:'هذا الباركود مستخدم كباركود إضافي لمادة أخرى'};
  const c=parseCodes($('#pf_codes').value,id,sku.trim());if(c.err)return c;
  const tb=$('#pf_tb').checked,ts=$('#pf_ts').checked;
  const b=parseBatches($('#pf_batches').value);if(b.err)return b;
  const s=parseSerials($('#pf_serials').value,id);if(s.err)return s;
  return{codes:c.list,tb,ts,batches:b.list,serials:s.list}}
const _sp=saveProduct;saveProduct=function(id){
  if(!can('stock_edit')||!$('#pf_codes'))return _sp(id);
  const R=readExtras(id);if(R.err)return toast(R.err);
  const n0=db.products.length,_o=id?prod(id):null,_op=_o?[_o.price,_o.cost]:null;_sp(id);
  if($('#modal'))return; /* رفض الحفظ الأصلي: لا نكتب شيئًا */
  const p=id?prod(id):(db.products.length>n0?db.products[db.products.length-1]:null);if(!p)return;
  if(R.codes.length)p.codes=R.codes;else delete p.codes;
  p.trackBatch=R.tb;if(R.tb||R.batches.length)p.batches=R.batches;
  if(_op&&window.orvexLog&&(p.price!==_op[0]||p.cost!==_op[1]))orvexLog('price_change',p.name,'السعر '+_op[0]+'←'+p.price+' | التكلفة '+_op[1]+'←'+p.cost);
  p.trackSerial=R.ts;
  if(R.ts||R.serials.length||(p.serials||[]).length){const keep=(p.serials||[]).filter(x=>x.st==='sold'&&!R.serials.some(n=>lc(n)===lc(x.sn)));
    p.serials=keep.concat(R.serials.map(sn=>({sn,st:'in'})))}
  if(R.tb&&R.batches.length){const t=r2(R.batches.reduce((a,x)=>a+x.qty,0));if(Math.abs(t-p.stock)>0.0001)toast('تنبيه: مجموع كميات الدفعات ('+t+') لا يساوي المخزون ('+p.stock+')')}
  if(R.ts&&R.serials.length!==Math.round(p.stock))toast('تنبيه: عدد الأرقام التسلسلية المتوفرة ('+R.serials.length+') لا يساوي المخزون ('+p.stock+')');
  save()};

/* ---------- 2) البيع: أرقام تسلسلية + سحب الدفعات بالأقدم انتهاءً (FEFO) ---------- */
function fefo(p,q){const used=[];let left=q;
  const bs=(p.batches||[]).filter(b=>b.qty>0).sort((a,b)=>(a.exp||'9999-12-31').localeCompare(b.exp||'9999-12-31'));
  for(const b of bs){if(left<=0)break;const t=Math.min(b.qty,left);b.qty=r2(b.qty-t);left=r2(left-t);used.push({no:b.no,q:t,exp:b.exp||''})}
  return{used,short:left}}
function serialModal(need,cont){
  const body=need.map(l=>{const p=prod(l.pid),av=(p.serials||[]).filter(x=>x.st!=='sold').map(x=>x.sn);
    return`<div class="card" style="margin-bottom:8px"><b>${esc(p.name)}</b> — المطلوب: ${l.qty} رقم تسلسلي<br><small class="muted">المتوفر: ${esc(av.slice(0,12).join('، ')||'لا يوجد')}${av.length>12?' …':''}</small>
    <textarea id="sr_${esc(p.id)}" rows="${Math.min(6,Math.max(2,Math.ceil(l.qty)))}" style="width:100%" placeholder="رقم في كل سطر (امسح أو اكتب)"></textarea></div>`}).join('');
  window.__serialNeed=need;window.__serialCont=cont;
  modal('الأرقام التسلسلية',body+`<div class="actions"><button class="btn primary" onclick="orvexSerialOk()">تأكيد ومتابعة البيع</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`)}
window.orvexSerialOk=function(){
  const need=window.__serialNeed||[],pick={};
  for(const l of need){const p=prod(l.pid),el=document.getElementById('sr_'+l.pid);
    const L=lines(el?el.value:'').map(r=>r[0]).filter(Boolean);
    if(L.length!==Math.round(l.qty))return toast('«'+p.name+'»: يلزم '+l.qty+' رقمًا تسلسليًا (أدخلت '+L.length+')');
    if(new Set(L.map(lc)).size!==L.length)return toast('«'+p.name+'»: يوجد رقم مكرر');
    for(const sn of L){if(!(p.serials||[]).some(x=>x.st!=='sold'&&lc(x.sn)===lc(sn)))return toast('الرقم «'+sn+'» غير متوفر في مخزون «'+p.name+'»')}
    pick[l.pid]=L}
  window.__serialPick=pick;const f=window.__serialCont;closeModal();if(f)f()};
function pickOk(need){const pk=window.__serialPick;return !!pk&&need.every(l=>pk[l.pid]&&pk[l.pid].length===Math.round(l.qty))}
const _fin=finalize;finalize=function(method,paidIn){
  const ln=(state.cart||[]).map(l=>({pid:l.pid,qty:l.qty}));
  const need=ln.filter(l=>{const p=prod(l.pid);return p&&p.trackSerial});
  if(need.length&&!pickOk(need)){window.__serialPick=null;return serialModal(need,()=>finalize(method,paidIn))}
  const n0=db.sales.length;_fin(method,paidIn);
  if(db.sales.length<=n0)return; /* لم تُنشأ الفاتورة: نُبقي الاختيار للمحاولة التالية */
  const s=db.sales[db.sales.length-1],pk=window.__serialPick||{};window.__serialPick=null;let exp=false;
  ln.forEach(l=>{const p=prod(l.pid);if(!p)return;const it=(s.items||[]).find(i=>i.pid===l.pid);
    if(p.trackBatch&&(p.batches||[]).length){const r=fefo(p,l.qty);if(it&&r.used.length)it.bt=r.used;if(r.used.some(u=>u.exp&&u.exp<today()))exp=true}
    if(p.trackSerial&&pk[l.pid]){pk[l.pid].forEach(sn=>{const x=(p.serials||[]).find(y=>lc(y.sn)===lc(sn));if(x){x.st='sold';x.sale=s.no}});if(it)it.sn=pk[l.pid]}
    if(p.trackBatch||p.trackSerial)hist(p,'sale',r2(p.stock+l.qty),p.stock,s.no)});
  save();if(exp)toast('تنبيه: الفاتورة سحبت من دفعة منتهية الصلاحية')};

/* ---------- 3) تنبيهات الصلاحية ---------- */
const expDays=()=>{const d=num((db.settings||{}).expDays);return d>0?d:30};
function expiring(){const lim=expDays(),L=[];
  db.products.forEach(p=>{if(!p.trackBatch)return;(p.batches||[]).forEach(b=>{if(b.exp&&b.qty>0){const d=daysTo(b.exp);if(d<=lim)L.push({p,b,d})}})});
  return L.sort((a,b)=>a.d-b.d)}
const dl=x=>x.d<0?`<span class="badge bad">منتهية منذ ${-x.d} يوم</span>`:`<span class="badge warn">بعد ${x.d} يوم</span>`;
function expRows(L){return L.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.p.name)}</div><small>دفعة ${esc(x.b.no)} — ${x.b.mfg?'إنتاج '+esc(x.b.mfg)+' — ':''}ينتهي ${esc(x.b.exp)} — الكمية ${x.b.qty}</small></div><div class="end">${dl(x)}</div></div>`).join('')}
window.expModal=function(){const L=expiring();modal('الصلاحية (خلال '+expDays()+' يوم)',L.length?`<div class="card">${expRows(L)}</div>`:'<p class="muted">لا توجد دفعات منتهية أو قريبة الانتهاء.</p>')};
function expCard(){if(!(isAdmin()||can('stock_view')))return '';const L=expiring();if(!L.length)return '';
  return`<div class="card"><h3 style="margin:0 0 6px">⏳ قرب انتهاء الصلاحية (${L.length})</h3>${expRows(L.slice(0,5))}${L.length>5?'<button class="btn" onclick="expModal()">عرض الكل</button>':''}</div>`}
const _vh=vHome;vHome=function(){const h=_vh();try{const c=expCard();if(!c)return h;const i=h.lastIndexOf('</section>');return(h.includes('od-main')&&i>-1)?h.slice(0,i)+c+h.slice(i):h+c}catch(e){return h}};

/* ---------- 4) الجرد والتسويات الموثّقة ---------- */
const ST={q:'',c:{}};
const REASONS=['جرد دوري','تالف','منتهي الصلاحية','فقد / سرقة','خطأ إدخال سابق','أخرى'];
const stRows=()=>{const q=lc(ST.q);return db.products.filter(p=>!q||lc(p.name).includes(q)||codesOf(p).some(k=>lc(k.code).includes(q))).slice(0,80)};
const stCnt=()=>Object.keys(ST.c).length;
function stList(){const L=stRows();if(!L.length)return '<p class="muted">لا نتائج</p>';
  return L.map(p=>`<div class="row"><div class="grow"><div class="t">${esc(p.name)}</div><small>الدفتري: <b>${p.stock}</b></small></div><div class="end"><input type="number" inputmode="decimal" step="any" style="width:90px" placeholder="الفعلي" value="${ST.c[p.id]!==undefined?ST.c[p.id]:''}" oninput="ORVEX_ST.set('${jsq(p.id)}',this.value)"></div></div>`).join('')}
window.ORVEX_ST={q(v){ST.q=v;const e=$('#st_l');if(e)e.innerHTML=stList()},
  set(id,v){if(String(v).trim()==='')delete ST.c[id];else ST.c[id]=num(v);const b=$('#st_n');if(b)b.textContent=stCnt()}};
window.stocktakeModal=function(){if(!can('stock_edit'))return toast('ليست لديك صلاحية الجرد');ST.q='';ST.c={};
  modal('جرد المخزون',`<p class="muted" style="font-size:12.5px;margin:0 0 6px">أدخل الكمية الفعلية للمواد التي عددتها فقط؛ المواد الفارغة لا تتغير.</p>
  <input class="search" type="search" placeholder="ابحث بالاسم أو الباركود" oninput="ORVEX_ST.q(this.value)"><div id="st_l" class="card">${stList()}</div>
  <div class="actions"><button class="btn primary" onclick="stReview()">مراجعة الفروق (<span id="st_n">0</span>)</button></div>`)};
function stDiffs(){return Object.keys(ST.c).map(id=>{const p=prod(id);return p?{p,sys:p.stock,cnt:r2(ST.c[id])}:null}).filter(x=>x&&Math.abs(x.cnt-x.sys)>0.0001)}
window.stReview=function(){const D=stDiffs();if(!D.length)return toast('لا توجد فروق بين الدفتري والفعلي');
  const val=r2(D.reduce((a,x)=>a+Math.abs(x.cnt-x.sys)*(num(x.p.cost)||0),0)),sc=can('see_cost');
  modal('فروق الجرد',`<div class="card">${D.map(x=>`<div class="row"><div class="grow"><div class="t">${esc(x.p.name)}</div><small>دفتري ${x.sys} ← فعلي ${x.cnt}</small></div><div class="end"><span class="badge ${x.cnt<x.sys?'bad':'warn'}">${r2(x.cnt-x.sys)>0?'+':''}${r2(x.cnt-x.sys)}</span></div></div>`).join('')}</div>
  ${sc?`<p class="muted">قيمة الفروق بالتكلفة: <b>${money(val)}</b></p>`:''}
  <label>سبب التسوية (إلزامي)</label><select id="st_r"><option value="">— اختر —</option>${REASONS.map(r=>`<option>${esc(r)}</option>`).join('')}</select>
  <label>ملاحظة</label><input id="st_note">
  <p class="muted" style="font-size:12.5px">${isAdmin()?'ستُعتمد التسوية بصلاحية المدير.':'يلزم اعتماد المدير إذا تجاوزت قيمة الفروق حد الموافقة المضبوط.'}</p>
  <div class="actions"><button class="btn primary" onclick="stApply()">اعتماد التسوية</button><button class="btn ghost" onclick="stocktakeModal()">رجوع</button></div>`)};
window.stApply=function(){const D=stDiffs();if(!D.length)return toast('لا توجد فروق');
  const r=($('#st_r')||{}).value;if(!r)return toast('اختر سبب التسوية');
  const val=D.reduce((a,x)=>a+Math.abs(x.cnt-x.sys)*(num(x.p.cost)||0),0);
  if(!isAdmin()&&val>num((db.settings||{}).adjLimit))return toast('قيمة الفروق تتجاوز حد الموافقة؛ يلزم اعتماد المدير');
  const note=(($('#st_note')||{}).value||'').trim(),cnt=uid();
  D.forEach(x=>{const reason=r+(note?' — '+note:'');hist(x.p,'count',x.p.stock,x.cnt,reason,{cnt});x.p.stock=x.cnt});
  if(window.orvexLog)orvexLog('stock_count',r,D.length+' مادة | قيمة الفروق '+r2(val));ST.c={};save();closeModal();render();toast('تم اعتماد الجرد وتسوية '+D.length+' مادة')};

/* ---------- 5) إعدادات متقدمة (للمدير) + تكلفة الوصول ---------- */
window.advInvModal=function(){if(!isAdmin())return toast('للمدير فقط');const s=db.settings;
  modal('إعدادات المخزون المتقدمة',`<label>تنبيه الصلاحية قبل (يوم)</label><input id="ai_exp" type="number" value="${expDays()}">
  <label>حد اعتماد التسويات لغير المدير (قيمة بالتكلفة، 0 = المدير فقط)</label><input id="ai_lim" type="number" value="${num(s.adjLimit)}">
  <label class="pchk" style="border:0"><input type="checkbox" id="ai_lc" ${s.landedCost?'checked':''}> احتساب تكلفة الوصول: توزيع «الإضافي» وحسم الفاتورة على تكلفة الأصناف عند الشراء</label>
  <div class="actions"><button class="btn primary" onclick="advInvSave()">حفظ</button></div>`)};
window.advInvSave=function(){const s=db.settings;s.expDays=Math.max(1,Math.round(num($('#ai_exp').value))||30);s.adjLimit=Math.max(0,num($('#ai_lim').value));s.landedCost=$('#ai_lc').checked;save();closeModal();toast('تم الحفظ')};
window.orvexLandedShare=function(net,c){if(!db.settings.landedCost||!(c.net>0))return 0;return r2((c.ex-c.dv)*net/c.net)};

const _vst=vStock;vStock=function(){const sv=can('stock_view')||isAdmin();
  return _vst()+`<div class="actions">${can('stock_edit')?'<button class="btn" onclick="stocktakeModal()">📋 جرد المخزون</button>':''}${sv?'<button class="btn" onclick="expModal()">⏳ الصلاحية</button>':''}${isAdmin()?'<button class="btn" onclick="advInvModal()">⚙ إعدادات متقدمة</button>':''}${isAdmin()?'<button class="btn" onclick="auditModal()">🧾 سجل التدقيق</button>':''}</div>`};

/* ---------- 6) سدّ ثغرات: إلغاء الفاتورة/المرتجع يعيد الدفعات والأرقام التسلسلية ---------- */
HT.ret='مرتجع';
window.orvexRestoreItems=function(items,docNo,reason,sale){
  (items||[]).forEach(x=>{const p=prod(x.pid);if(!p||!(p.trackBatch||p.trackSerial))return;
    const src=((sale&&sale.items)||items).find(i=>i.pid===x.pid)||{};let q=num(x.qty);const q0=q;
    if(p.trackBatch&&(src.bt||[]).length){p.batches=p.batches||[];
      for(const u of src.bt.slice().reverse()){if(q<=0)break;const t=Math.min(q,r2(u.q-(u.back||0)));if(t<=0)continue;
        const b=p.batches.find(y=>y.no===u.no);if(b)b.qty=r2(b.qty+t);else p.batches.push({no:u.no,exp:u.exp||'',qty:r2(t)});
        u.back=r2((u.back||0)+t);q=r2(q-t)}}
    if(p.trackSerial&&(src.sn||[]).length){let k=Math.round(q0);
      for(const sn of src.sn){if(k<=0)break;const y=(p.serials||[]).find(z=>lc(z.sn)===lc(sn)&&z.st==='sold'&&(!sale||z.sale===sale.no));if(y){y.st='in';delete y.sale;k--}}}
    hist(p,'ret',r2(p.stock-q0),p.stock,reason+' '+docNo)})};

/* ---------- 7) سدّ ثغرات: استلام المشتريات ينشئ الدفعات ---------- */
function batchPrompt(po){
  const L=(po.lines||[]).filter(l=>{const p=prod(l.pid);return p&&p.trackBatch});if(!L.length)return;
  window.__bp={po:po.no,L:L.map(l=>({pid:l.pid,qty:l.qty}))};
  modal('بيانات الدفعات — '+po.no,`<p class="muted" style="font-size:12.5px;margin:0 0 6px">سجّل رقم الدفعة وتاريخ الانتهاء للمواد المتتبَّعة. يمكنك تركها فارغة وإدخالها لاحقًا من نموذج المنتج.</p>`+
  window.__bp.L.map((l,k)=>`<div class="card" style="margin-bottom:8px"><b>${esc(prod(l.pid).name)}</b> — الكمية ${l.qty}<div class="f2"><div><label>رقم الدفعة</label><input id="bp_n${k}" value="${esc(po.no)}"></div><div><label>تاريخ الإنتاج</label><input id="bp_m${k}" type="date"></div></div><div class="f2"><div><label>تاريخ الانتهاء</label><input id="bp_e${k}" type="date"></div></div></div>`).join('')+
  `<div class="actions"><button class="btn primary" onclick="orvexBatchOk()">حفظ الدفعات</button><button class="btn ghost" onclick="closeModal()">لاحقًا</button></div>`)}
window.orvexBatchOk=function(){const B=window.__bp;if(!B)return;
  const rows=B.L.map((l,k)=>({l,no:(($('#bp_n'+k)||{}).value||'').trim(),exp:(($('#bp_e'+k)||{}).value||'').trim(),mfg:(($('#bp_m'+k)||{}).value||'').trim()}));
  for(const r of rows){if(!r.no)return toast('أدخل رقم الدفعة أو اضغط «لاحقًا»');if(r.exp&&!validDate(r.exp))return toast('تاريخ غير صحيح');if(r.mfg&&!validDate(r.mfg))return toast('تاريخ الإنتاج غير صحيح');if(r.mfg&&r.exp&&r.mfg>r.exp)return toast('تاريخ الإنتاج بعد تاريخ الانتهاء')}
  rows.forEach(r=>{const p=prod(r.l.pid);p.batches=p.batches||[];const b=p.batches.find(y=>y.no===r.no&&(y.exp||'')===r.exp);
    if(b){b.qty=r2(b.qty+r.l.qty);b.po=b.po||B.po;if(r.mfg&&!b.mfg)b.mfg=r.mfg}else{const nb={no:r.no,exp:r.exp,qty:r2(r.l.qty),po:B.po};if(r.mfg)nb.mfg=r.mfg;p.batches.push(nb)}});
  window.__bp=null;save();closeModal();render();toast('تم تسجيل الدفعات')};
const _ps=pinvSave;pinvSave=function(){const P=state.pinv,eid=P&&P.editId,old=eid?db.purchases.find(x=>x.id===eid):null,oldAt=old&&old.editedAt,n0=db.purchases.length;
  _ps();let po=null;
  if(eid){const x=db.purchases.find(y=>y.id===eid);if(x&&x.editedAt!==oldAt)po=x}else if(db.purchases.length>n0)po=db.purchases[db.purchases.length-1];
  if(po)batchPrompt(po)};
const _prv=pinvRevert;pinvRevert=function(po){_prv(po);(po.lines||[]).forEach(l=>{const p=prod(l.pid);if(p&&p.batches)p.batches=p.batches.filter(b=>b.po!==po.no)})};

window.ORVEX_INV2={HT,hist,codesOf,hit,parseCodes,parseBatches,parseSerials,fefo,validDate,expiring,stDiffs,ST,batchPrompt};
})();
