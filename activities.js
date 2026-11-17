/* ORVEX — إدارة أنواع المحلات والميزات (لوحة المؤسس) + بوابة الميزات الممنوحة.
   يستخدم بنية Supabase الموجودة فقط: orvex_business_activities / orvex_features / orvex_feature_links /
   orvex_shop_classification / orvex_shop_settings / orvex_shop_feature_assignments ودوال orvex_*.
   لا جداول جديدة ولا حذف تلقائي. نظام الميزات القديم (shops.features) يبقى كما هو للوحدات الأساسية. */
(function(root){
'use strict';

/* ---------- منطق صرف (قابل للاختبار) ---------- */
function indexBy(list){const m={};(list||[]).forEach(x=>{m[x.id]=x});return m}
function chainOf(id,byId){const out=[];let cur=byId[id],g=0;while(cur&&g++<10){out.push(cur.id);cur=cur.parent_id?byId[cur.parent_id]:null}return out}
/* الميزات المقترحة لنشاط: ما ارتبط بـ all أو بأي نشاط في سلسلة الأجداد (وراثة) */
function proposedFeatures(activityId,acts,feats,links){
  const by=indexBy(acts),chain=activityId?chainOf(activityId,by):[],res=[];
  feats.filter(f=>f.is_active).forEach(f=>{
    const ls=links.filter(l=>l.feature_id===f.id);
    const all=ls.some(l=>l.scope==='all');
    const hit=ls.find(l=>l.scope==='activity'&&chain.includes(l.activity_id));
    if(all||hit)res.push({feature:f,source:all?'all':(hit.activity_id===activityId?'direct':'inherited'),from:hit?hit.activity_id:null});
  });
  return res.sort((a,b)=>(a.feature.sort_order-b.feature.sort_order)||String(a.feature.name_ar).localeCompare(b.feature.name_ar));
}
/* مقارنة المقترح بالممنوح فعلًا: لا سحب تلقائي أبدًا؛ الممنوح يدويًا خارج المقترح يُحفظ */
function diffGrants(proposed,assign){
  const granted=new Set((assign||[]).filter(a=>a.is_granted).map(a=>a.feature_id)),pid=new Set(proposed.map(p=>p.feature.id));
  return{
    add:proposed.filter(p=>!granted.has(p.feature.id)),
    keep:proposed.filter(p=>granted.has(p.feature.id)),
    manual:[...granted].filter(id=>!pid.has(id))
  };
}
/* سجل الشاشات الفعلية: لا تُعدّ الميزة فعّالة لمجرد وجودها في القاعدة */
const SCREENS={
  quotes:{fn:'quotesModal',label:'عروض الأسعار'},
  expiry_alerts:{fn:'expModal',label:'الصلاحية'},
  barcode_scan:{fn:'scanOpen',label:'مسح الباركود'},
  production_orders:{fn:'mfgOpen',label:'التصنيع'},
  bom:{fn:'mfgOpen',label:'التصنيع'},
  serial_tracking:{embedded:'orvexSerialOk',note:'يعمل ضمن البيع (نافذة السيريال) ولا شاشة مستقلة'},
  batches:{embedded:'orvexBatchOk',note:'يعمل ضمن المشتريات/المخزون ولا شاشة مستقلة'}
};
function screenStatus(code,w){
  w=w||root;const s=SCREENS[code];
  if(!s)return{state:'missing'};
  if(s.fn&&typeof w[s.fn]==='function')return{state:'screen',fn:s.fn,label:s.label};
  if(s.embedded&&(typeof w[s.embedded]!=='undefined'))return{state:'embedded',note:s.note};
  return{state:'missing'};
}
const ST_LABEL={screen:'شاشة فعلية',embedded:'مدمجة في دورة العمل',missing:'لا توجد شاشة بعد'};

/* إعدادات النشاط → سلوك: decimal_qty=false يمنع الكميات الكسرية (undefined/true = السلوك الحالي بلا تغيير) */
function getPath(o,path){return String(path).split('.').reduce((x,k)=>x&&typeof x==='object'?x[k]:undefined,o)}
function coerceQty(v,settings){
  if(getPath(settings,'sales.decimal_qty')!==false||!(v>0)||Number.isInteger(v))return{v,changed:false};
  return{v:Math.max(1,Math.round(v)),changed:true};
}
/* قيم أولية لنموذج منتج جديد من إعدادات النشاط (اقتراحات فقط؛ المنتجات القائمة لا تُمس) */
function productDefaults(settings){
  const inv=getPath(settings,'inventory')||{},cats=getPath(settings,'categories');
  return{trackBatch:inv.track_batch===true||inv.track_expiry===true,trackSerial:inv.track_serial===true,
    categories:Array.isArray(cats)?cats.filter(c=>typeof c==='string'&&c.trim()):[]};
}
/* حقول المنتج المخصصة للنشاط (settings.product_fields) → قيمة نظيفة تُخزَّن في product.extra[key] */
function fieldDefs(settings){
  const f=getPath(settings,'product_fields');
  return Array.isArray(f)?f.filter(x=>x&&/^[a-z][a-z0-9_]{0,40}$/.test(x.key||'')&&['text','number','date','bool'].includes(x.type)):[];
}
function cleanField(def,raw){
  if(def.type==='bool')return raw===true||raw==='true'||raw==='1';
  const t=String(raw==null?'':raw).trim();if(!t)return undefined;
  if(def.type==='number'){const n=parseFloat(t);return isFinite(n)?n:undefined}
  if(def.type==='date')return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:undefined;
  return t.slice(0,200);
}
/* بحث نصي في بيانات النشاط (product.extra): نصوص وأرقام فقط، بحد أدنى حرفان */
function matchExtra(p,q){
  q=String(q==null?'':q).trim().toLowerCase();if(q.length<2||!p||!p.extra)return false;
  return Object.keys(p.extra).some(k=>{if(k==='_vg')return false;const v=p.extra[k];return (typeof v==='string'||typeof v==='number')&&String(v).toLowerCase().includes(q)});
}
const A={matchExtra,fieldDefs,cleanField,productDefaults,getPath,coerceQty,chainOf,proposedFeatures,diffGrants,screenStatus,SCREENS,indexBy};
root.ORVEX_ACT=A;
if(typeof module!=='undefined'&&module.exports)module.exports=A;
if(typeof document==='undefined'||!root.__orvexRequest&&typeof window==='undefined')return;

/* ---------- جانب المحل: تحميل الميزات الممنوحة وإتاحتها ---------- */
const rq=(p,o)=>window.__orvexRequest(p,o);
const rpc=(n,a)=>rq('/rest/v1/rpc/'+n,{method:'POST',body:JSON.stringify(a||{})});
const SBX=()=>window.__orvexSync&&window.__orvexSync.SB;
const E=s=>typeof esc==='function'?esc(s):String(s==null?'':s);
const founder=()=>!!(window.orvexRole&&window.orvexRole.founder());
let granted=null,grantedFor=null,loading=false,shopSettings=null;
A.setting=p=>getPath(shopSettings,p);
const shopId=()=>{const S=SBX();return S&&(S.shop||(S.prof&&S.prof.shop_id))||null};
A.granted=()=>granted;
/* هل مُنحت الميزة لهذا المحل؟ (null قبل التحميل أو عند الفشل → لا نخفي شيئًا من النظام القديم) */
A.has=code=>granted?granted.some(g=>g.code===code):false;
async function loadGranted(){
  const sid=shopId();if(!sid||loading||grantedFor===sid&&granted)return;
  loading=true;
  try{granted=await rpc('orvex_my_shop_features',{p_shop:sid});grantedFor=sid;
    try{const r=await rq('/rest/v1/orvex_shop_settings?shop_id=eq.'+sid+'&select=settings');shopSettings=r&&r[0]?r[0].settings:null}catch(e){shopSettings=null}
    if(typeof render==='function')render()}
  catch(e){granted=null}finally{loading=false}
}
A.reload=()=>{grantedFor=null;granted=null;shopSettings=null;return loadGranted()};

/* شاشة «ميزات النشاط» للمحل: تعرض الممنوح فقط وتفتح الشاشة الفعلية إن وُجدت */
if(typeof TITLES==='object')TITLES.actfeatures='ميزات النشاط';
window.actFeatOpen=function(fn){if(typeof window[fn]==='function')window[fn]();else toast('الشاشة غير متوفرة')};
if(typeof VIEWS==='object'){
  VIEWS.actfeatures=function(){
    setTimeout(loadGranted,0);
    if(!granted)return '<div class="card"><p class="muted">لا توجد ميزات نشاط ممنوحة لهذا المحل بعد.</p></div>';
    if(!granted.length)return '<div class="card"><p class="muted">لم يمنح المؤسس ميزات خاصة بنشاط هذا المحل بعد.</p></div>';
    return '<div class="card">'+granted.map(g=>{
      const s=screenStatus(g.code);
      return `<div class="row"><div class="grow"><div class="t">${E(g.name_ar)}</div><small>${E(ST_LABEL[s.state])}${s.note?' — '+E(s.note):''}</small></div>${s.state==='screen'?`<button class="btn primary" onclick="actFeatOpen('${s.fn}')">فتح</button>`:''}</div>`}).join('')+'</div>';
  };
  if(typeof VIEWS.more==='function'){
    const _m=VIEWS.more;
    VIEWS.more=function(){
      const h=_m.apply(this,arguments);setTimeout(loadGranted,0);
      if(typeof h!=='string'||!granted||!granted.length)return h;
      return h+`<button class="od-mi" onclick="go('actfeatures')">ميزات النشاط (${granted.length})</button>`;
    };
  }
}
if(typeof render==='function'){
  const _r=render;
  render=function(){const r=_r.apply(this,arguments);if(shopId()&&grantedFor!==shopId())setTimeout(loadGranted,0);return r};
}


/* إعداد النشاط: منع الكميات الكسرية في نقطة البيع عندما decimal_qty=false (للمحلات المطبَّق عليها ملف نشاط فقط) */
if(typeof window.setQty==='function'){
  const _sq=window.setQty;
  window.setQty=function(i,v){
    const n=typeof num==='function'?num(v):parseFloat(v),c=coerceQty(n,shopSettings);
    if(c.changed&&typeof toast==='function')toast('نشاط هذا المحل لا يقبل كميات كسرية؛ تم التقريب إلى '+c.v);
    return _sq.call(this,i,c.changed?c.v:v);
  };
}

/* إعدادات النشاط → نموذج المنتج الجديد: تفعيل الدفعات/الصلاحية/التسلسلي مبدئيًا واقتراح تصنيفات النشاط */
if(typeof window.productForm==='function'){
  const _pf=window.productForm;
  window.productForm=function(id){
    const r=_pf.apply(this,arguments);
    try{
      if(id||!shopSettings)return r;
      const d=productDefaults(shopSettings),tb=document.getElementById('pf_tb'),ts=document.getElementById('pf_ts'),dl=document.getElementById('catlist');
      if(tb&&d.trackBatch)tb.checked=true;
      if(ts&&d.trackSerial)ts.checked=true;
      if((d.trackBatch||d.trackSerial)&&tb){const det=tb.closest('details');if(det)det.open=true}
      if(dl){const have=new Set([...dl.querySelectorAll('option')].map(o=>o.value));
        d.categories.forEach(c=>{if(!have.has(c)){const o=document.createElement('option');o.value=c;dl.appendChild(o)}})}
    }catch(e){}
    return r;
  };
}

/* حقول المنتج حسب النشاط: عرض داخل النموذج وحفظ في product.extra (لا تُنشئ أعمدة ولا تمس بقية الحقول) */
(function(){
  if(typeof window.saveProduct!=='function')return;
  const _pf2=window.productForm,_sp2=window.saveProduct;
  window.productForm=function(id){
    const r=_pf2.apply(this,arguments);
    try{
      const defs=fieldDefs(shopSettings),a=document.querySelector('#modal .actions');
      if(!defs.length||!a||typeof can==='function'&&!can('stock_edit'))return r;
      const p=id&&typeof prod==='function'?(prod(id)||{}):{},ex=p.extra||{};
      a.insertAdjacentHTML('beforebegin','<div class="card" id="pf_extra" style="padding:8px 12px;margin-top:10px"><b>بيانات النشاط</b>'+defs.map(d=>{
        const v=ex[d.key],lab=E(d.label_ar||d.key);
        if(d.type==='bool')return `<label class="pchk" style="border:0"><input type="checkbox" data-xf="${E(d.key)}" ${v===true?'checked':''}> ${lab}</label>`;
        return `<label>${lab}</label><input data-xf="${E(d.key)}" type="${d.type==='number'?'number':d.type==='date'?'date':'text'}" ${d.type==='number'?'step="any" inputmode="decimal"':''} value="${E(v==null?'':v)}">`}).join('')+'</div>');
    }catch(e){}
    return r;
  };
  window.saveProduct=function(id){
    const box=document.getElementById('pf_extra'),defs=fieldDefs(shopSettings);
    if(!box||!defs.length)return _sp2.apply(this,arguments);
    const vals={};defs.forEach(d=>{const el=box.querySelector('[data-xf="'+d.key+'"]');if(el)vals[d.key]=cleanField(d,d.type==='bool'?el.checked:el.value)});
    const n0=db.products.length,r=_sp2.apply(this,arguments);
    if(document.getElementById('modal'))return r; /* رُفض الحفظ: لا نكتب شيئًا */
    const p=id?prod(id):(db.products.length>n0?db.products[db.products.length-1]:null);
    if(p){const ex=Object.assign({},p.extra||{});defs.forEach(d=>{if(vals[d.key]===undefined||vals[d.key]===false&&d.type==='bool'&&ex[d.key]===undefined)delete ex[d.key];else ex[d.key]=vals[d.key]});
      if(Object.keys(ex).length)p.extra=ex;else delete p.extra;save()}
    return r;
  };
})();

/* بحث بحقول النشاط (رقم القطعة، الماركة، IMEI…) في نقطة البيع وقائمة المخزون — يوسّع النتائج ولا يستبدلها */
(function(){
  if(typeof window.matchProds==='function'){
    const _mp=window.matchProds;
    window.matchProds=function(q){
      const base=_mp.apply(this,arguments);
      try{const ids=new Set(base.map(p=>p.id));return base.concat(db.products.filter(p=>!ids.has(p.id)&&matchExtra(p,q)))}catch(e){return base}
    };
  }
  if(typeof window.stockList==='function'){
    const _sl=window.stockList;
    window.stockList=function(){
      const q=(state.stockQ||'').trim().toLowerCase();
      if(q.length<2||!db.products.some(p=>p.extra))return _sl.apply(this,arguments);
      const all=db.products,keepQ=state.stockQ;
      try{
        const base=new Set(all.filter(p=>p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q)).map(p=>p.id));
        db.products=all.filter(p=>base.has(p.id)||matchExtra(p,q));state.stockQ='';
        return _sl.apply(this,arguments);
      }finally{db.products=all;state.stockQ=keepQ}
    };
  }
})();
/* ---------- جانب المؤسس ---------- */
let ACTS=[],FEATS=[],LINKS=[],SHOPS=[],CLS=[],tab='act',sel=null,selShop=null,asg=[];
const byId=()=>indexBy(ACTS);
const kids=pid=>ACTS.filter(a=>(a.parent_id||null)===(pid||null)).sort((a,b)=>(a.sort_order-b.sort_order)||a.name_ar.localeCompare(b.name_ar));
const LVL={1:'نشاط رئيسي',2:'نشاط فرعي',3:'تخصص دقيق'};
const MAXL=6;
async function loadAll(){
  [ACTS,FEATS,LINKS,SHOPS,CLS]=await Promise.all([
    rq('/rest/v1/orvex_business_activities?select=*&order=level,sort_order&limit=2000'),
    rq('/rest/v1/orvex_features?select=*&order=sort_order&limit=500'),
    rq('/rest/v1/orvex_feature_links?select=*&limit=5000'),
    rq('/rest/v1/shops?select=id,name,features&order=created_at&limit=1000'),
    rq('/rest/v1/orvex_shop_classification?select=*&limit=1000')]);
}
const shell=()=>{let d=document.getElementById('actc');if(!d){d=document.createElement('div');d.id='actc';document.body.appendChild(d);document.body.classList.add('noscroll')}return d};
window.orvexActClose=function(){const d=document.getElementById('actc');if(d)d.remove();document.body.classList.remove('noscroll')};
window.orvexActivitiesCenter=async function(){
  if(!founder())return toast('هذه الشاشة للمؤسس فقط');
  const d=shell();d.innerHTML='<div class="actc-h"><h2>أنواع المحلات والميزات</h2><button class="btn" onclick="orvexActClose()">إغلاق</button></div><div class="actc-b"><p class="muted">جارٍ التحميل…</p></div>';
  try{await loadAll();draw()}catch(e){d.querySelector('.actc-b').innerHTML='<p class="muted">'+E(e.message)+'</p>'}
};
function draw(){
  const d=shell();
  const tabs=[['act','الأنشطة والتخصصات'],['feat','الميزات وربطها'],['shop','تصنيف المحلات ومنح الميزات']];
  d.innerHTML=`<div class="actc-h"><h2>أنواع المحلات والميزات</h2><button class="btn" onclick="orvexActClose()">إغلاق</button></div><div class="actc-b"><div class="chips">${tabs.map(([k,l])=>`<button class="chip ${k===tab?'on':''}" onclick="actTab('${k}')">${l}</button>`).join('')}</div><div id="actBody"></div></div>`;
  ({act:drawActs,feat:drawFeats,shop:drawShops})[tab]();
}
window.actTab=k=>{tab=k;draw()};
const fail=e=>toast(/founder only/.test(e.message)?'للمؤسس فقط':e.message);

/* --- الأنشطة --- */
function drawActs(){
  const b=document.getElementById('actBody'),roots=kids(null);
  const open=new Set(window.__actOpen||[]);ACTS.forEach(a=>a._open=open.has(a.id));
  const row=(a,depth)=>{
    const ch=kids(a.id);
    return `<div class="row" style="padding-inline-start:${depth*18}px"><button class="chip" onclick="actToggle('${a.id}')" ${ch.length||a.level<MAXL?'':'disabled'}>${ch.length?(open.has(a.id)?'▾':'▸')+' '+ch.length:'+'}</button><div class="grow"><div class="t">${E(a.name_ar)}</div><small>${LVL[a.level]||'مستوى '+a.level} · ${E(a.code)}</small></div><span class="badge ${a.is_active?'':'grey'}">${a.is_active?'فعّال':'معطّل'}</span><button class="btn" onclick="actEdit('${a.id}')">تعديل</button></div>`+(open.has(a.id)?ch.map(c=>row(c,depth+1)).join(''):'');
  };
  b.innerHTML=`<div class="card"><small class="muted">${ACTS.filter(a=>a.level===1).length} رئيسي · ${ACTS.filter(a=>a.level===2).length} فرعي · ${ACTS.filter(a=>a.level===3).length} دقيق${ACTS.some(a=>a.level>3)?' · '+ACTS.filter(a=>a.level>3).length+' مستويات أعمق':''}</small>${roots.map(r=>row(r,0)).join('')}</div><div class="actions"><button class="btn primary" onclick="actEdit('',null)">+ نشاط رئيسي</button></div>`;
}
window.actToggle=id=>{const s=new Set(window.__actOpen||[]);s.has(id)?s.delete(id):s.add(id);window.__actOpen=[...s];drawActs()};
window.actEdit=function(id,parent){
  const a=id?byId()[id]:null,par=a?(a.parent_id||null):(parent===undefined?null:parent);
  const sibs=kids(par),pl=par?byId()[par].level:0,lvl=a?a.level:pl+1;
  const cands=a&&a.parent_id?ACTS.filter(x=>x.level===byId()[a.parent_id].level&&x.id!==a.id):[];
  modal(a?'تعديل: '+a.name_ar:'نشاط جديد ('+(LVL[lvl]||'مستوى '+lvl)+')',`
  <label>الاسم بالعربية</label><input id="ac_n" value="${E(a?a.name_ar:'')}">
  <label>الاسم بالإنجليزية (اختياري)</label><input id="ac_e" value="${E(a?a.name_en||'':'')}" style="direction:ltr;text-align:left">
  <label>الكود (حروف إنجليزية صغيرة وأرقام و _ . -)</label><input id="ac_c" value="${E(a?a.code:'')}" ${a?'disabled':''} style="direction:ltr;text-align:left">
  ${a&&cands.length?`<label>النشاط الأعلى التابع له</label><select id="ac_p">${cands.map(c=>`<option value="${c.id}" ${c.id===a.parent_id?'selected':''}>${E(c.name_ar)}</option>`).join('')}</select>`:''}
  <label class="pchk" style="border:0"><input type="checkbox" id="ac_a" ${!a||a.is_active?'checked':''}> فعّال</label>
  ${a?`<label>إعدادات النشاط (JSON)</label><textarea id="ac_s" rows="8" style="width:100%;direction:ltr;text-align:left;font-family:monospace">${E(JSON.stringify(a.settings||{},null,1))}</textarea><button class="btn" onclick="actEff('${a.id}')">عرض الإعدادات الفعلية بعد الدمج مع الأعلى</button><div id="ac_eff"></div>`:''}
  <div class="actions"><button class="btn primary" onclick="actSave('${id||''}',${par?`'${par}'`:'null'},${lvl})">حفظ</button>
  ${a?`<button class="btn" onclick="actMove('${a.id}',-1)">▲</button><button class="btn" onclick="actMove('${a.id}',1)">▼</button>`:''}
  ${a?`<button class="btn" onclick="actNew('${a.id}')">+ تابع</button><button class="btn danger" onclick="actDel('${a.id}')">حذف</button>`:''}</div>`);
};
window.actNew=pid=>{closeModal();actEdit('',pid)};
window.actEff=async id=>{try{const r=await rpc('orvex_effective_activity_settings',{p_activity:id});document.getElementById('ac_eff').innerHTML='<pre style="direction:ltr;text-align:left;white-space:pre-wrap;font-size:12px;max-height:220px;overflow:auto">'+E(JSON.stringify(r,null,1))+'</pre>'}catch(e){fail(e)}};
window.actSave=async function(id,par,lvl){
  const name=document.getElementById('ac_n').value.trim();if(!name)return toast('أدخل الاسم');
  const body={name_ar:name,name_en:document.getElementById('ac_e').value.trim()||null,is_active:document.getElementById('ac_a').checked};
  const st=document.getElementById('ac_s');
  if(st){try{const j=JSON.parse(st.value||'{}');if(!j||typeof j!=='object'||Array.isArray(j))throw 0;body.settings=j}catch(e){return toast('إعدادات JSON غير صالحة')}}
  try{
    if(id){await rq('/rest/v1/orvex_business_activities?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
      const sp=document.getElementById('ac_p');if(sp&&sp.value!==byId()[id].parent_id)await rpc('orvex_move_activity',{p_id:id,p_parent:sp.value})}
    else{const code=document.getElementById('ac_c').value.trim();if(!/^[a-z0-9_.-]{2,80}$/.test(code))return toast('كود غير صالح');
      if(ACTS.some(a=>a.code===code))return toast('الكود مستخدم');
      body.code=code;body.level=lvl;body.parent_id=par;body.sort_order=(kids(par).reduce((m,a)=>Math.max(m,a.sort_order),0))+10;
      await rq('/rest/v1/orvex_business_activities',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)})}
    closeModal();await loadAll();draw();toast('تم الحفظ')
  }catch(e){fail(e)}
};
window.actMove=async function(id,dir){
  const a=byId()[id],sibs=kids(a.parent_id||null),i=sibs.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=sibs.length)return;
  const ids=sibs.map(x=>x.id);[ids[i],ids[j]]=[ids[j],ids[i]];
  try{await rpc('orvex_reorder_activities',{p_ids:ids});await loadAll();closeModal();draw()}catch(e){fail(e)}
};
window.actDel=id=>askConfirm('حذف النشاط؟ لا يُسمح إن كانت له تفرعات أو محلات مرتبطة (عطّله بدل ذلك).',async()=>{try{await rpc('orvex_delete_activity',{p_id:id});await loadAll();draw();toast('تم الحذف')}catch(e){toast(/children|assigned/.test(e.message)?'لا يمكن الحذف: له تفرعات أو محلات. عطّله بدل ذلك.':e.message)}},'حذف');

/* --- الميزات وربطها --- */
function drawFeats(){
  const b=document.getElementById('actBody');
  b.innerHTML=`<div class="card">${FEATS.map(f=>{
    const s=screenStatus(f.code),n=LINKS.filter(l=>l.feature_id===f.id).length;
    return `<div class="row"><div class="grow"><div class="t">${E(f.name_ar)} <small>${E(f.code)}</small></div><small>${n} ربط · ${ST_LABEL[s.state]}${f.has_screen&&s.state==='missing'?' ⚠ مسجلة has_screen لكن بلا شاشة':''}</small></div><span class="badge ${f.is_active?'':'grey'}">${f.is_active?'فعّالة':'معطّلة'}</span><button class="btn" onclick="featEdit('${f.id}')">ربط</button></div>`}).join('')}</div>`;
}
window.featEdit=function(fid){
  const f=FEATS.find(x=>x.id===fid),ls=LINKS.filter(l=>l.feature_id===fid),all=ls.some(l=>l.scope==='all'),set=new Set(ls.filter(l=>l.scope==='activity').map(l=>l.activity_id));
  const tree=(pid,d)=>kids(pid).map(a=>`<label class="pchk" style="padding-inline-start:${d*16}px"><input type="checkbox" data-fa="${a.id}" ${set.has(a.id)?'checked':''}> ${E(a.name_ar)}</label>`+(a.level<3||ACTS.some(x=>x.parent_id===a.id)?tree(a.id,d+1):'')).join('');
  modal('ربط: '+f.name_ar,`<label class="pchk"><input type="checkbox" id="fl_all" ${all?'checked':''}> لكل الأنشطة</label><p class="muted" style="font-size:12.5px">الربط بنشاط يشمل تلقائيًا كل ما تحته (وراثة).</p><div class="card" style="max-height:50vh;overflow:auto;padding:4px 12px">${tree(null,0)}</div><div class="actions"><button class="btn primary" onclick="featSave('${fid}')">حفظ الربط</button></div>`);
};
window.featSave=async fid=>{
  const ids=[...document.querySelectorAll('[data-fa]')].filter(c=>c.checked).map(c=>c.dataset.fa);
  try{await rpc('orvex_set_feature_links',{p_feature:fid,p_all:document.getElementById('fl_all').checked,p_activities:ids});closeModal();await loadAll();draw();toast('تم الحفظ')}catch(e){fail(e)}
};

/* --- تصنيف المحلات ومنح الميزات --- */
function drawShops(){
  const b=document.getElementById('actBody'),by=byId();
  b.innerHTML=`<div class="card">${SHOPS.map(s=>{const c=CLS.find(x=>x.shop_id===s.id),a=c&&by[c.activity_id];
    const path=a?chainOf(a.id,by).reverse().map(i=>by[i].name_ar).join(' ‹ '):'غير مصنّف';
    return `<button class="row tap" onclick="actShop('${s.id}')"><div class="grow"><div class="t">${E(s.name)}</div><small>${E(path)}</small></div></button>`}).join('')||'<p class="muted">لا محلات.</p>'}</div>`;
}
window.actShop=async function(sid){
  selShop=sid;const c=CLS.find(x=>x.shop_id===sid),by=byId();sel=c?c.activity_id:null;
  try{asg=await rq('/rest/v1/orvex_shop_feature_assignments?shop_id=eq.'+sid+'&select=*')}catch(e){return fail(e)}
  shopModal();
};
function chainSel(){return sel?chainOf(sel,byId()).reverse():[]}
function shopModal(){
  const s=SHOPS.find(x=>x.id===selShop),ch=chainSel(),by=byId();
  const levels=[];let pid=null;
  for(let i=0;i<=ch.length;i++){const opts=kids(pid).filter(a=>a.is_active);if(!opts.length)break;levels.push({pid,opts,cur:ch[i]||''});pid=ch[i];if(!pid)break}
  const prop=sel?proposedFeatures(sel,ACTS,FEATS,LINKS):[],df=diffGrants(prop,asg),cur=CLS.find(x=>x.shop_id===selShop);
  const changed=!cur||cur.activity_id!==sel;
  modal('تصنيف: '+s.name,`${levels.map((l,i)=>`<label>${LVL[i+1]||'مستوى '+(i+1)}</label><select onchange="actPick(${i},this.value)"><option value="">— اختر —</option>${l.opts.map(o=>`<option value="${o.id}" ${o.id===l.cur?'selected':''}>${E(o.name_ar)}</option>`).join('')}</select>`).join('')}
  ${sel?`<h4>الميزات المقترحة (${prop.length})</h4><div class="card" style="padding:4px 12px">${prop.length?prop.map(p=>{const g=asg.find(a=>a.feature_id===p.feature.id&&a.is_granted),st=screenStatus(p.feature.code);
    return `<label class="pchk"><input type="checkbox" data-pf="${p.feature.id}" ${g||!cur?'checked':''}> ${E(p.feature.name_ar)} <small>${p.source==='all'?'عامة':p.source==='inherited'?'موروثة':'مباشرة'} · ${ST_LABEL[st.state]}${g?' · ممنوحة':''}</small></label>`}).join(''):'<p class="muted">لا ميزات مرتبطة بهذا التصنيف.</p>'}</div>
  ${df.manual.length?`<p class="muted" style="font-size:12.5px">ميزات ممنوحة يدويًا خارج المقترح (${df.manual.length}) ستبقى كما هي ولن تُسحب تلقائيًا.</p>`:''}
  ${changed&&cur?`<p class="note">تغيير التصنيف: سيُحفظ التصنيف الجديد ويُمنح المعتمد أعلاه فقط. لا يُسحب شيء تلقائيًا، وإعدادات النشاط المخصصة لا تُستبدل إلا بتأكيدك.</p>`:''}
  <label class="pchk" style="border:0"><input type="checkbox" id="as_set" checked> تطبيق إعدادات النشاط (لا يستبدل التخصيص اليدوي)</label>
  <label class="pchk" style="border:0"><input type="checkbox" id="as_pos"> إظهار الميزات الممنوحة حديثًا في نقطة البيع</label>
  <div class="actions"><button class="btn primary" onclick="actApply()">اعتماد التصنيف ومنح الميزات المحددة</button></div>`:''}
  ${asg.filter(a=>a.is_granted).length?`<h4>الميزات الممنوحة فعليًا</h4><div class="card" style="padding:4px 12px">${asg.filter(a=>a.is_granted).map(a=>{const f=FEATS.find(x=>x.id===a.feature_id);return f?`<div class="row"><div class="grow">${E(f.name_ar)}<br><small>ترتيب ${a.sort_order} · ${a.show_in_pos?'تظهر في نقطة البيع':'لا تظهر في نقطة البيع'}</small></div><button class="btn" onclick="actPos('${f.id}',${!a.show_in_pos})">${a.show_in_pos?'إخفاء من البيع':'إظهار في البيع'}</button><button class="btn danger" onclick="actRevoke('${f.id}')">سحب</button></div>`:''}).join('')}</div>`:''}`);
}
window.actPick=(i,v)=>{const ch=chainSel().slice(0,i);if(v)ch.push(v);sel=ch.length?ch[ch.length-1]:null;shopModal()};
window.actApply=async function(){
  if(!sel)return toast('اختر النشاط');
  const ids=[...document.querySelectorAll('[data-pf]')].filter(c=>c.checked).map(c=>c.dataset.pf),showPos=document.getElementById('as_pos').checked;
  try{
    const ex=CLS.find(x=>x.shop_id===selShop);
    if(ex)await rq('/rest/v1/orvex_shop_classification?shop_id=eq.'+selShop,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({activity_id:sel})});
    else await rq('/rest/v1/orvex_shop_classification',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({shop_id:selShop,activity_id:sel})});
    for(const fid of ids){const f=FEATS.find(x=>x.id===fid),old=asg.find(a=>a.feature_id===fid&&a.is_granted);
      await rpc('orvex_set_shop_feature',{p_shop:selShop,p_feature:fid,p_granted:true,p_show_in_pos:old?old.show_in_pos:showPos,p_sort_order:old?old.sort_order:(f.sort_order||100)})}
    if(document.getElementById('as_set').checked)await rpc('orvex_apply_activity_profile',{p_shop:selShop,p_force:false});
    await loadAll();asg=await rq('/rest/v1/orvex_shop_feature_assignments?shop_id=eq.'+selShop+'&select=*');
    shopModal();toast('تم الاعتماد');if(A.reload&&SBX()&&SBX().shop===selShop)A.reload()
  }catch(e){fail(e)}
};
window.actPos=async(fid,v)=>{const a=asg.find(x=>x.feature_id===fid);try{await rpc('orvex_set_shop_feature',{p_shop:selShop,p_feature:fid,p_granted:true,p_show_in_pos:v,p_sort_order:a?a.sort_order:100});asg=await rq('/rest/v1/orvex_shop_feature_assignments?shop_id=eq.'+selShop+'&select=*');shopModal()}catch(e){fail(e)}};
window.actRevoke=fid=>askConfirm('سحب هذه الميزة من المحل؟',async()=>{try{await rpc('orvex_set_shop_feature',{p_shop:selShop,p_feature:fid,p_granted:false,p_show_in_pos:false,p_sort_order:100});asg=await rq('/rest/v1/orvex_shop_feature_assignments?shop_id=eq.'+selShop+'&select=*');shopModal();toast('تم السحب')}catch(e){fail(e)}},'سحب');

/* --- مدخل لوحة المؤسس --- */
if(typeof VIEWS==='object'&&typeof VIEWS.studio==='function'){
  const _vs=VIEWS.studio;
  VIEWS.studio=function(){
    const h=_vs.apply(this,arguments);
    if(typeof h==='string'&&h.includes('id="shopList"')&&founder())
      return h.replace('<div class="card" id="shopList"','<div class="card" id="actCard"><h3>أنواع المحلات والميزات</h3><p class="muted" style="margin-top:0">إدارة الأنشطة والتخصصات وربط الميزات وتصنيف المحلات.</p><div class="actions"><button class="btn primary" onclick="orvexActivitiesCenter()">فتح الإدارة</button></div></div><div class="card" id="shopList"');
    return h;
  };
}

/* --- بعد إنشاء محل جديد: افتح تصنيفه مباشرة (المؤسس يعتمد الميزات بنفسه) --- */
if(typeof window.makeShop==='function'){
  const _mk=window.makeShop;
  window.makeShop=async function(){
    let before=null;
    try{before=new Set((await rq('/rest/v1/shops?select=id&limit=1000')).map(x=>x.id))}catch(e){}
    const r=await _mk.apply(this,arguments);
    if(!before||!founder())return r;
    try{
      const now=await rq('/rest/v1/shops?select=id&limit=1000'),nw=now.filter(x=>!before.has(x.id));
      if(nw.length===1){tab='shop';await loadAll();draw();await actShop(nw[0].id);toast('حدّد نشاط المحل واعتمد ميزاته')}
    }catch(e){}
    return r;
  };
}
const st=document.createElement('style');
st.textContent='#actc{position:fixed;inset:0;z-index:90;background:var(--bg,#fff);color:var(--ink,#123);overflow:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom,0)}#actc .actc-h{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface,#fff);border-bottom:1px solid var(--line,#d9e8df)}#actc .actc-h h2{flex:1;margin:0;font-size:17px}#actc .actc-b{max-width:900px;margin:0 auto;padding:14px}#actc select,#actc input:not([type=checkbox]){width:100%;box-sizing:border-box}';
document.head.appendChild(st);
})(typeof window!=='undefined'?window:globalThis);
