/* ================= ORVEX: تصنيف الأنشطة التجارية — المراحل 1 (رئيسي) + 2 (فرعي) + 3 (تخصص دقيق) + 4 (إعدادات النشاط) =================
   - عند إنشاء محل جديد: قائمة «النشاط الرئيسي» ثم، إن كان له أنشطة فرعية، قائمة «النشاط الفرعي» تتغير خياراتها حسب الرئيسي.
   - عند تعديل محل: عرض النشاط الحالي (رئيسي/فرعي) وإمكانية تغييره.
   - ثم، إن كان للفرعي تخصصات دقيقة، قائمة «التخصص الدقيق» تتغير حسب الفرعي.
   - الحفظ في orvex_shop_classification.activity_id: يشير إلى أعمق مستوى تم اختياره (تخصص ثم فرعي ثم رئيسي).
   - المحلات الحالية لا تتأثر: بلا صف تصنيف تبقى كما هي، والمصنّفة برئيسي فقط (المرحلة 1) تبقى صالحة.
   - المرحلة 4: عند تصنيف المحل (أو تغيير تصنيفه) تُنسخ إعدادات نشاطه الافتراضية إلى orvex_shop_settings (دالة apply في القاعدة)؛
     المحل المعدَّل يدويًا لا يُستبدل إلا بزر «إعادة تطبيق». المحلات الحالية لا تُمسّ حتى يُصنَّف المؤسس أحدها.
   - لا يغيّر جدول shops ولا دالة orvex-admin؛ الربط في جدول مستقل.
   - تصنيف النشاط الرئيسي إلزامي لإنشاء محل جديد؛ عند تعذّر القراءة يتوقف الإنشاء. النشاط الفرعي إلزامي فقط إذا كانت له خيارات، والتخصص الدقيق اختياري.
   - إن لم تُطبَّق migration المرحلة 1 يعمل إنشاء المحل كالمعتاد (القائمة معطّلة مع تنبيه)،
     وإن لم تُطبَّق migration المرحلة 2 أو 3 لا تظهر القائمة الموافقة ويعمل ما قبلها كالسابق. */
(function(){
if(window.__orvexActivities)return;
const FALLBACK=[
 ['general_trade','التجارة العامة'],['food_consumer','المواد الغذائية والاستهلاكية'],['fashion','الملابس والأزياء'],
 ['electronics','الإلكترونيات والأجهزة الكهربائية'],['phones_telecom','الهواتف والاتصالات'],['automotive','السيارات وقطع الغيار'],
 ['construction','البناء والإنشاءات'],['furniture','الأثاث والمفروشات'],['health_pharma','الصحة والأدوية'],
 ['restaurants','المطاعم والمأكولات'],['perfume_beauty','العطور ومستحضرات التجميل'],['jewelry_gold','المجوهرات والذهب'],
 ['stationery_books','القرطاسية والمكتبات'],['professional_services','الخدمات المهنية'],['industrial','الأنشطة الصناعية'],
 ['agricultural','الأنشطة الزراعية'],['other','الأنشطة الأخرى']
].map((a,i)=>({id:null,code:a[0],name_ar:a[1],sort_order:(i+1)*10}));
const E=s=>String(s==null?'':s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const rq=(p,o)=>{if(typeof window.__orvexRequest!=='function')return Promise.reject(new Error('no server'));return window.__orvexRequest(p,o)};
const founder=()=>!!(window.orvexRole&&typeof window.orvexRole.ok==='function'&&window.orvexRole.ok());
const say=m=>{try{toast(m)}catch(e){}};
const $id=i=>document.getElementById(i);
let cache=null,subCache=null,specCache=null;

async function loadMain(force){
 if(cache&&!force)return cache;
 try{
  const r=await rq('/rest/v1/orvex_business_activities?level=eq.1&is_active=eq.true&select=id,code,name_ar,sort_order&order=sort_order.asc,name_ar.asc');
  if(Array.isArray(r)&&r.length){cache={db:true,items:r};return cache}
 }catch(e){}
 return {db:false,items:FALLBACK,error:'تعذر تحميل التصنيفات من قاعدة البيانات'};
}
/* الأنشطة الفرعية (المستوى 2) النشطة؛ قائمة فارغة إن لم تُطبَّق migration المرحلة 2 */
async function loadSubs(force){
 if(subCache&&!force)return subCache;
 try{
  const r=await rq('/rest/v1/orvex_business_activities?level=eq.2&is_active=eq.true&select=id,parent_id,code,name_ar,sort_order&order=sort_order.asc,name_ar.asc');
  if(Array.isArray(r)){subCache=r;return subCache}
 }catch(e){}
 return [];
}
/* التخصصات الدقيقة (المستوى 3) النشطة؛ قائمة فارغة إن لم تُطبَّق migration المرحلة 3 */
async function loadSpecs(force){
 if(specCache&&!force)return specCache;
 try{
  const r=await rq('/rest/v1/orvex_business_activities?level=eq.3&is_active=eq.true&select=id,parent_id,code,name_ar,sort_order&order=sort_order.asc,name_ar.asc');
  if(Array.isArray(r)){specCache=r;return specCache}
 }catch(e){}
 return [];
}
const specsOf=(subId,all)=>(all||specCache||[]).filter(s=>subId&&s.parent_id===subId);
const subsOf=(mainId,all)=>(all||subCache||[]).filter(s=>mainId&&s.parent_id===mainId);
/* من activity_id المحفوظ (رئيسي أو فرعي أو تخصص) إلى {main, sub, spec} */
function resolve(current,mains,subs,specs){
 if(!current)return {main:null,sub:null,spec:null};
 const p=(specs||[]).find(x=>x.id===current);
 if(p){const sb=(subs||[]).find(x=>x.id===p.parent_id)||null;return {main:sb?(mains||[]).find(x=>x.id===sb.parent_id)||null:null,sub:sb,spec:p}}
 const s=(subs||[]).find(x=>x.id===current);
 if(s)return {main:(mains||[]).find(x=>x.id===s.parent_id)||null,sub:s,spec:null};
 return {main:(mains||[]).find(x=>x.id===current)||null,sub:null,spec:null};
}
async function getShopActivity(shopId){
 const r=await rq('/rest/v1/orvex_shop_classification?shop_id=eq.'+encodeURIComponent(shopId)+'&select=activity_id');
 return r&&r[0]?r[0].activity_id:null;
}
/* code قد يكون لنشاط رئيسي أو فرعي (الأكواد فريدة عبر كل المستويات) */
async function setShopActivity(shopId,code){
 const a=await rq('/rest/v1/orvex_business_activities?code=eq.'+encodeURIComponent(code)+'&select=id');
 if(!a||!a[0])throw new Error('النشاط المختار غير موجود');
 await rq('/rest/v1/orvex_shop_classification?on_conflict=shop_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({shop_id:shopId,activity_id:a[0].id})});
}

/* ---- المرحلة 4: إعدادات النشاط (تُنسخ من ملف النشاط إلى المحل وتبقى قابلة للتعديل) ---- */
const LAYOUTS={retail:'متجر تجزئة',restaurant:'مطعم',services:'خدمات',manufacturing:'تصنيع'};
const applyProfile=(shopId,force)=>rq('/rest/v1/rpc/orvex_apply_activity_profile',{method:'POST',body:JSON.stringify({p_shop:shopId,p_force:!!force})});
async function getShopSettings(shopId){
 const r=await rq('/rest/v1/orvex_shop_settings?shop_id=eq.'+encodeURIComponent(shopId)+'&select=settings,customized,source_activity_id,applied_at');
 return r&&r[0]?r[0]:null;
}
/* تعديل يدوي: يُعلَّم customized فلا يستبدله تغيير التصنيف لاحقًا */
async function saveShopSettings(shopId,settings){
 await rq('/rest/v1/orvex_shop_settings?on_conflict=shop_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({shop_id:shopId,settings:settings||{},customized:true})});
}
function summarize(st){
 if(!st||typeof st!=='object')return '';
 const n=a=>Array.isArray(a)?a.length:0,o=[];
 if(st.layout)o.push('الواجهة: '+(LAYOUTS[st.layout]||st.layout));
 o.push(n(st.categories)+' تصنيف منتجات');o.push(n(st.units)+' وحدة قياس');
 if(n(st.product_fields))o.push(n(st.product_fields)+' حقل إضافي');
 if(n(st.tools))o.push(n(st.tools)+' أداة');
 return o.join(' · ');
}
/* واجهة للوحدات الأخرى: orvexProfile.get('inventory.track_expiry') / has('tools','tables') لمحل المستخدم الحالي */
const prof={settings:null,shop:null,features:null,
 async load(){
  const sid=window.__orvexAcct&&typeof window.__orvexAcct.shop==='function'?window.__orvexAcct.shop():'';
  if(!sid){this.settings=null;this.shop=null;this.features=null;return null}
  try{const r=await getShopSettings(sid);this.settings=r?r.settings:null}catch(e){this.settings=null}
  /* المرحلة 6: ميزات المحل الفعلية (مرتبطة بنشاطه أو بأحد آبائه أو بكل المحلات)؛ null إن لم تُطبَّق migration المرحلة 6 */
  try{const f=await rq('/rest/v1/rpc/orvex_shop_features',{method:'POST',body:JSON.stringify({p_shop:sid})});this.features=Array.isArray(f)?f:null}catch(e){this.features=null}
  this.shop=sid;return this.settings;
 },
 get(path,def){
  let v=this.settings;
  for(const k of String(path||'').split('.').filter(Boolean)){if(v&&typeof v==='object'&&k in v)v=v[k];else return def}
  return v===undefined?def:v;
 },
 has(path,item){const v=this.get(path,[]);return Array.isArray(v)&&v.includes(item)},
 /* ميزة مفعّلة للمحل: من نظام الميزات (المرحلة 6) أو من tools القديمة في الإعدادات */
 hasFeature(code){return (Array.isArray(this.features)&&this.features.some(f=>f.code===code))||this.has('tools',code)}
};
function addProfilePanel(box,shopId){
 if(!box||$id('sf_prof'))return;
 const d=document.createElement('div');d.id='sf_prof';
 d.innerHTML='<label>إعدادات النشاط</label><p class="muted" id="sf_prof_t" style="font-size:12.5px;margin:4px 0">جارٍ التحميل…</p><button type="button" class="btn" id="sf_prof_b" style="margin-bottom:8px">إعادة تطبيق إعدادات النشاط</button>';
 box.insertAdjacentElement('afterend',d);
 const t=d.querySelector('#sf_prof_t'),b=d.querySelector('#sf_prof_b');
 const show=async()=>{
  try{const r=await getShopSettings(shopId);
   t.textContent=r?(summarize(r.settings)+(r.customized?' (معدّلة يدويًا)':'')):'لا إعدادات مطبّقة بعد (محل قديم أو لم يُحفظ تصنيفه). تُطبَّق تلقائيًا عند حفظ النشاط.';
  }catch(e){t.textContent='إعدادات النشاط غير مفعّلة بعد (طبّق migration المرحلة 4).';b.disabled=true}
 };
 b.addEventListener('click',async()=>{
  if(!window.confirm('سيستبدل ذلك إعدادات المحل الحالية بالإعدادات الافتراضية لنشاطه المحفوظ. متابعة؟'))return;
  b.disabled=true;
  try{await applyProfile(shopId,true);say('تم تطبيق إعدادات النشاط');await show()}catch(e){say('تعذر التطبيق: '+e.message)}
  b.disabled=false;
 });
 show();
}

/* قراءة الاختيار الحالي من القوائم: code = أعمق مستوى مختار */
function pick(mainId,subId,specId){
 const sel=$id(mainId);
 if(!sel||sel.dataset.db!=='1')return {db:false,main:'',sub:'',spec:'',needSub:false,needSpec:false,code:''};
 const main=sel.value,m=cache&&cache.items.find(x=>x.code===main),subSel=$id(subId),specSel=$id(specId);
 const needSub=!!(m&&subsOf(m.id).length);
 const sub=needSub&&subSel?subSel.value:'';
 const sb=sub&&(subCache||[]).find(x=>x.code===sub);
 const needSpec=!!(sb&&specsOf(sb.id).length);
 const spec=needSpec&&specSel?specSel.value:'';
 return {db:true,main,sub,spec,needSub,needSpec,code:spec||sub||main};
}

/* يضيف قوائم النشاط (رئيسي + فرعي + تخصص) بعد حقل اسم المحل ويملؤها بعد التحميل */
function inject(afterSel,selId,subId,specId,label,current){
 const anchor=document.querySelector(afterSel);if(!anchor||$id(selId))return null;
 const box=document.createElement('div');
 box.innerHTML='<label>'+E(label)+'</label><select id="'+selId+'" disabled><option value="">جارٍ التحميل…</option></select>'
  +'<div id="'+subId+'_w" style="display:none"><label>النشاط الفرعي</label><select id="'+subId+'"><option value="">اختر النشاط الفرعي…</option></select></div>'
  +'<div id="'+specId+'_w" style="display:none"><label>التخصص الدقيق</label><select id="'+specId+'"><option value="">اختر التخصص الدقيق…</option></select></div>'
  +'<p class="muted" id="'+selId+'_h" style="font-size:12.5px;margin:4px 0 8px"></p>';
 anchor.insertAdjacentElement('afterend',box);
 const sel=box.querySelector('#'+selId),wrap=box.querySelector('#'+subId+'_w'),subSel=box.querySelector('#'+subId),
  swrap=box.querySelector('#'+specId+'_w'),specSel=box.querySelector('#'+specId),hint=box.querySelector('p');
 const fillSpecs=(keep)=>{
  const sb=(subCache||[]).find(x=>x.code===subSel.value),list=sb?specsOf(sb.id):[];
  if(!list.length){swrap.style.display='none';specSel.innerHTML='<option value="">اختر التخصص الدقيق…</option>';return list}
  specSel.innerHTML='<option value="">اختر التخصص الدقيق…</option>'+list.map(x=>'<option value="'+E(x.code)+'">'+E(x.name_ar)+'</option>').join('');
  swrap.style.display='';if(keep)specSel.value=keep;return list;
 };
 const fillSubs=(keep)=>{
  const m=cache&&cache.items.find(x=>x.code===sel.value),list=m?subsOf(m.id):[];
  if(!list.length){wrap.style.display='none';subSel.innerHTML='<option value="">اختر النشاط الفرعي…</option>';fillSpecs();return list}
  subSel.innerHTML='<option value="">اختر النشاط الفرعي…</option>'+list.map(x=>'<option value="'+E(x.code)+'">'+E(x.name_ar)+'</option>').join('');
  wrap.style.display='';if(keep)subSel.value=keep;fillSpecs();return list;
 };
 Promise.all([loadMain(),loadSubs(),loadSpecs()]).then(([r,subs,specs])=>{
  if(!document.body.contains(sel))return;
  if(!r.db){
   sel.innerHTML='<option value="">غير متاح حاليًا</option>';sel.dataset.db='0';
   hint.textContent='تعذّر تحميل أنواع المحلات من قاعدة البيانات. لا يمكن إنشاء محل دون تصنيف. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.';
   const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='إعادة تحميل التصنيفات';
   retry.addEventListener('click',async()=>{retry.disabled=true;retry.textContent='جارٍ إعادة المحاولة…';cache=null;subCache=null;specCache=null;
    try{const rr=await loadMain(true);await loadSubs(true);await loadSpecs(true);if(rr.db){sel.dataset.db='1';sel.disabled=false;sel.innerHTML='<option value="">اختر النشاط الرئيسي…</option>'+rr.items.map(x=>'<option value="'+E(x.code)+'">'+E(x.name_ar)+'</option>').join('');hint.textContent='تم تحميل التصنيفات. اختر النشاط الرئيسي.';retry.remove()}else{retry.disabled=false;retry.textContent='إعادة تحميل التصنيفات'}}catch(e){retry.disabled=false;retry.textContent='إعادة تحميل التصنيفات'}});
   box.appendChild(retry);return}
  sel.dataset.db='1';sel.disabled=false;
  sel.innerHTML='<option value="">اختر النشاط الرئيسي…</option>'+r.items.map(x=>'<option value="'+E(x.code)+'">'+E(x.name_ar)+'</option>').join('');
  sel.addEventListener('change',()=>{hint.textContent='';fillSubs()});
  subSel.addEventListener('change',()=>{hint.textContent='';fillSpecs()});
  const cur=resolve(current,r.items,subs,specs);
  if(cur.main){
   sel.value=cur.main.code;sel.dataset.orig=(cur.spec||cur.sub||cur.main).code;
   const list=fillSubs(cur.sub?cur.sub.code:'');
   if(cur.sub)fillSpecs(cur.spec?cur.spec.code:'');
   if(!cur.sub&&list.length)hint.textContent='هذا المحل مصنّف بنشاط رئيسي فقط؛ اختر النشاط الفرعي إن رغبت.';
   else if(cur.sub&&!cur.spec&&specsOf(cur.sub.id,specs).length)hint.textContent='اختر التخصص الدقيق لهذا المحل إن رغبت.';
  }
 });
 return sel;
}

/* ---- محل جديد ---- */
const _nsf=window.newShopForm;
if(typeof _nsf==='function')window.newShopForm=function(){
 const r=_nsf.apply(this,arguments);
 if(founder())inject('#n_s','n_act','n_sub','n_spec','النشاط التجاري الرئيسي',null);
 return r;
};
const _ms=window.makeShop;
if(typeof _ms==='function')window.makeShop=async function(){
 if(!founder())return _ms.apply(this,arguments);
 const nm=$id('n_s'),name=nm?nm.value.trim():'',p=pick('n_act','n_sub','n_spec'),code=p.code;
 if(!p.db){say('لا يمكن إنشاء المحل الآن: تعذّر تحميل التصنيفات من قاعدة البيانات. أعد المحاولة بعد استعادة الاتصال.');return}
 if(!p.main){say('اختر النشاط الرئيسي للمحل');return}
 if(p.needSub&&!p.sub){say('اختر النشاط الفرعي للمحل');return}
 /* التخصص الدقيق اختياري؛ عند عدم اختياره يُحفظ النشاط الفرعي */
 const q='/rest/v1/shops?name=eq.'+encodeURIComponent(name)+'&select=id';
 let before=null;
 if(code&&name){try{before=new Set((await rq(q)).map(x=>x.id))}catch(e){}}
 const r=await _ms.apply(this,arguments);
 if(!code||!name||$id('n_s'))return r; /* فشل الإنشاء: النافذة ما زالت مفتوحة */
 try{
  if(!before)throw new Error('تعذر تحديد المحل الجديد');
  const created=(await rq(q)).filter(x=>!before.has(x.id));
  if(created.length!==1)throw new Error('تعذر تحديد المحل الجديد');
  await setShopActivity(created[0].id,code);
  try{await applyProfile(created[0].id,false)}catch(e){} /* قبل migration المرحلة 4 لا يضرّ */
 }catch(e){say('تم إنشاء المحل، لكن لم يُحفظ النشاط ('+e.message+'). افتح تعديل المحل واختره.')}
 return r;
};

/* ---- تعديل محل ---- */
const _sm=window.shopMenu;
if(typeof _sm==='function')window.shopMenu=async function(id){
 const r=await _sm.apply(this,arguments);
 if(!founder()||!$id('sf_n'))return r;
 let cur=null;try{cur=await getShopActivity(id)}catch(e){}
 const sel=inject('#sf_n','sf_act','sf_sub','sf_spec','النشاط التجاري الرئيسي',cur);
 if(sel&&sel.parentElement)addProfilePanel(sel.parentElement,id);
 return r;
};
const _ssf=window.saveShopF;
if(typeof _ssf==='function')window.saveShopF=async function(id){
 if(!founder())return _ssf.apply(this,arguments);
 const sel=$id('sf_act'),p=pick('sf_act','sf_sub','sf_spec'),orig=sel?(sel.dataset.orig||''):'';
 /* أي تغيير يصل لمستوى له خيارات أدنى يتطلب اختيارها؛ ولا نحفظ المحل قبل ذلك */
 if(p.db&&p.main&&p.code!==orig){
  if(p.needSub&&!p.sub){say('اختر النشاط الفرعي للمحل');return}
  /* التخصص الدقيق اختياري عند الإنشاء والتعديل. */
 }
 const r=await _ssf.apply(this,arguments);
 if(p.code&&p.code!==orig&&!$id('sf_n')){
  try{await setShopActivity(id,p.code);try{await applyProfile(id,false)}catch(e){}}catch(e){say('حُفظ المحل، لكن لم يُحفظ النشاط: '+e.message)}
 }
 return r;
};

const reset=()=>{cache=null;subCache=null;specCache=null};
window.__orvexActivities={reset,FALLBACK,loadMain,loadSubs,loadSpecs,subsOf,specsOf,resolve,getShopActivity,setShopActivity,applyProfile,getShopSettings,saveShopSettings,summarize};
window.orvexProfile=prof;
})();
