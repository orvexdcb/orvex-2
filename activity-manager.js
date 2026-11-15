/* ================= ORVEX: تصنيف الأنشطة التجارية — المرحلة 5 (إدارة التصنيفات من حساب المؤسس) =================
   قسم «إدارة أنواع المحلات والأنشطة التجارية» في لوحة المصمم/المؤسس:
   - إضافة نشاط رئيسي / فرعي / تخصص دقيق، وتعديل الأسماء، وتفعيل/تعطيل، وإعادة الترتيب.
   - ربط فرعي أو تخصص بأب آخر (من نفس المستوى)، وحذف ما لم يُستخدم فقط (لا أبناء ولا محلات).
   - تعديل إعدادات النشاط (المرحلة 4): الواجهة، التصنيفات، الوحدات، الحقول، المخزون، التقارير، الأدوات.
     المستويات الأدنى ترث من الأعلى ويُحفظ منها الفرق فقط، فيبقى تعديل الأب منعكسًا عليها.
   - لا يغيّر أي محل موجود: تُطبَّق الإعدادات الجديدة على المحل عند تصنيفه أو بزر «إعادة تطبيق» في تعديل المحل.
   - الكتابة عبر نفس مسارات المرحلة 1 (RLS للمؤسس فقط) ودوال المرحلة 5 في القاعدة؛ لا يمس shops ولا المبيعات ولا المخزون.
   - الواجهة تدعم 3 مستويات الآن (الرئيسي، الفرعي، التخصص) لأن نماذج المحل تعرضها؛ القاعدة تقبل أكثر لاحقًا. */
(function(){
'use strict';
const root=typeof window!=='undefined'?window:globalThis;
if(root.__orvexActivityManager)return;

const MAX_LEVEL=3;
const LEVEL_NAME={1:'نشاط رئيسي',2:'نشاط فرعي',3:'تخصص دقيق'};
const CHILD_NAME={1:'نشاط فرعي',2:'تخصص دقيق'};
const LAYOUTS={retail:'متجر تجزئة',restaurant:'مطعم',services:'خدمات',manufacturing:'تصنيع'};
const FIELD_TYPES={text:'نص',number:'رقم',date:'تاريخ',bool:'نعم/لا'};
const STOCKTAKE={periodic:'دوري',frequent:'متكرر',daily:'يومي'};
const INV_FLAGS=[['track_serial','أرقام تسلسلية'],['track_expiry','تاريخ صلاحية'],['track_batch','تشغيلات / دفعات'],['variants','مقاسات وألوان / موديلات'],['weighable','بيع بالوزن']];
const TOOL_LABELS={tables:'الطاولات',orders:'الطلبات',kitchen_display:'شاشة المطبخ',weights:'الأوزان',expiry_alerts:'تنبيهات الصلاحية',barcode_scan:'مسح الباركود',sizes_colors:'المقاسات والألوان',variants_matrix:'مصفوفة الموديلات',serial_tracking:'الأرقام التسلسلية',warranty:'الضمان',repair_orders:'أوامر الصيانة',vehicle_fitment:'توافق القطع مع السيارات',part_number_search:'بحث برقم القطعة',delivery_orders:'أوامر التوصيل',project_quotes:'عروض المشاريع',installments:'التقسيط',batches:'التشغيلات',gold_pricing:'تسعير الذهب',print_services:'خدمات الطباعة',service_orders:'أوامر الخدمة',quotes:'عروض الأسعار',production_orders:'أوامر الإنتاج',bom:'قوائم المكونات'};
const REPORT_LABELS={sales_daily:'المبيعات اليومية',sales_by_variant:'المبيعات حسب المقاس/اللون',stock_levels:'مستويات المخزون',profit:'الأرباح',expiry_report:'تقرير الصلاحية',warranty_report:'تقرير الضمان',top_items:'الأصناف الأكثر مبيعًا',production_report:'تقرير الإنتاج'};
const LIM={name:120,item:60,items:60,fields:40};

const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/* ---------------------------------------------------------------- منطق نقي (قابل للاختبار) ---------------------------------------------------------------- */
const byOrder=(a,b)=>(a.sort_order-b.sort_order)||String(a.name_ar).localeCompare(String(b.name_ar),'ar');

/* من صفوف مسطّحة إلى شجرة: kids(id) أبناء مرتبون، roots المستوى الأول */
function buildTree(rows){
 const list=Array.isArray(rows)?rows.filter(r=>r&&r.id):[],byId=new Map(),kidsOf=new Map();
 list.forEach(r=>byId.set(r.id,r));
 list.forEach(r=>{const k=r.parent_id&&byId.has(r.parent_id)?r.parent_id:null;if(k===null&&r.parent_id)return;const a=kidsOf.get(k)||[];a.push(r);kidsOf.set(k,a)});
 kidsOf.forEach(a=>a.sort(byOrder));
 return {byId,roots:kidsOf.get(null)||[],kids:id=>kidsOf.get(id)||[],
  parentOf:id=>{const r=byId.get(id);return r&&r.parent_id?byId.get(r.parent_id)||null:null},
  chain:id=>{const out=[];let r=byId.get(id),guard=0;while(r&&guard++<20){out.unshift(r);r=r.parent_id?byId.get(r.parent_id):null}return out}};
}
/* عدد المحلات المصنّفة على كل نشاط: own مباشر، total يشمل كل أبنائه */
function countShops(tree,classRows){
 const own=new Map(),total=new Map();
 (classRows||[]).forEach(c=>{if(c&&c.activity_id)own.set(c.activity_id,(own.get(c.activity_id)||0)+1)});
 const walk=id=>{let n=own.get(id)||0;tree.kids(id).forEach(k=>{n+=walk(k.id)});total.set(id,n);return n};
 tree.roots.forEach(r=>walk(r.id));
 return {own:id=>own.get(id)||0,total:id=>total.get(id)||0};
}
/* رمز فريد يطابق قيد القاعدة ^[a-z0-9_.-]{2,80}$ (الأسماء عربية فلا تُشتق منها) */
function genCode(parentCode,taken,rand){
 const r=typeof rand==='function'?rand:()=>Math.random().toString(36).slice(2,8);
 for(let i=0;i<50;i++){
  const tail=String(r()).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'x'+i;
  const base=parentCode?String(parentCode).slice(0,60)+'.c':'custom.',code=(base+tail).slice(0,80);
  if(/^[a-z0-9_.-]{2,80}$/.test(code)&&!(taken&&taken.has(code)))return code;
 }
 throw new Error('تعذر توليد رمز فريد');
}
const norm=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
/* يتحقق من الاسم: غير فارغ، ≤120، وغير مكرر بين الإخوة */
function validateName(name,siblings,selfId){
 const n=norm(name);
 if(!n)return {ok:false,error:'اكتب الاسم'};
 if(n.length>LIM.name)return {ok:false,error:'الاسم طويل (الحد '+LIM.name+' حرفًا)'};
 const dup=(siblings||[]).some(s=>s.id!==selfId&&norm(s.name_ar).toLowerCase()===n.toLowerCase());
 if(dup)return {ok:false,error:'يوجد عنصر بنفس الاسم في هذه القائمة'};
 return {ok:true,name:n};
}
/* تبديل عنصر مع جاره ضمن قائمة معرّفات؛ يعيد القائمة الجديدة أو null إن لم يتحرك */
function moveInList(ids,id,dir){
 const i=ids.indexOf(id),j=i+(dir<0?-1:1);
 if(i<0||j<0||j>=ids.length)return null;
 const a=ids.slice();[a[i],a[j]]=[a[j],a[i]];return a;
}
/* آباء مسموح الانتقال إليهم: من نفس مستوى الأب الحالي فقط (فتبقى مستويات الشجرة سليمة) */
function moveTargets(tree,node){
 if(!node||!node.parent_id)return [];
 const cur=tree.byId.get(node.parent_id);if(!cur)return [];
 const pool=[];
 const add=(r)=>{if(r.id===node.id||r.id===node.parent_id)return;
  const label=tree.chain(r.id).map(x=>x.name_ar).join(' › ');pool.push({id:r.id,label,active:r.is_active!==false})};
 const walk=(list)=>list.forEach(r=>{if(r.level===cur.level)add(r);if(r.level<cur.level)walk(tree.kids(r.id))});
 walk(tree.roots);
 return pool;
}

/* ---- الإعدادات: دمج يطابق دالة القاعدة orvex_jsonb_deep_merge (الكائنات تُدمج، والمصفوفات والقيم تُستبدل) ---- */
function deepMerge(a,b){
 if(b===undefined)return a;
 if(isObj(a)&&isObj(b)){const o={};Object.keys(a).forEach(k=>{o[k]=a[k]});Object.keys(b).forEach(k=>{o[k]=k in a?deepMerge(a[k],b[k]):b[k]});return o}
 return b;
}
function deepEqual(a,b){
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((x,i)=>deepEqual(x,b[i]));
 if(isObj(a)&&isObj(b)){const ka=Object.keys(a),kb=Object.keys(b);return ka.length===kb.length&&ka.every(k=>k in b&&deepEqual(a[k],b[k]))}
 return false;
}
/* الإعدادات الفعلية = دمج سلسلة الأجداد من الرئيسي حتى النشاط نفسه (الأعمق يغلب) */
function effective(chainSettings){return (chainSettings||[]).reduce((acc,s)=>deepMerge(acc,isObj(s)?s:{}),{})}
/* الفرق الأدنى الذي يجب حفظه فوق الموروث: ما تغيّر فقط (الكائنات تُقارن مفتاحًا مفتاحًا) */
function minimalOverride(inherited,edited){
 const out={};
 Object.keys(edited||{}).forEach(k=>{
  const a=inherited?inherited[k]:undefined,b=edited[k];
  if(isObj(a)&&isObj(b)){const d=minimalOverride(a,b);if(Object.keys(d).length)out[k]=d}
  else if(!deepEqual(a,b))out[k]=b;
 });
 return out;
}
const lines=t=>{const seen=new Set(),o=[];String(t==null?'':t).split(/\r?\n/).forEach(l=>{const v=norm(l);if(v&&!seen.has(v)){seen.add(v);o.push(v)}});return o};
const fieldsToText=a=>(Array.isArray(a)?a:[]).map(f=>f&&f.key?[f.key,f.label_ar||'',f.type||'text'].join('|'):'').filter(Boolean).join('\n');
/* سطر لكل حقل: المفتاح|التسمية|النوع */
function parseFields(text){
 const out=[],keys=new Set();
 for(const l of lines(text)){
  const p=l.split('|').map(x=>x.trim());
  if(p.length<2||!p[0]||!p[1])return {ok:false,error:'صيغة الحقل: المفتاح|التسمية|النوع — «'+l+'»'};
  const type=p[2]||'text';
  if(!/^[a-z][a-z0-9_]{1,40}$/.test(p[0]))return {ok:false,error:'مفتاح الحقل بحروف إنجليزية صغيرة وأرقام و_ فقط: «'+p[0]+'»'};
  if(!(type in FIELD_TYPES))return {ok:false,error:'نوع الحقل غير معروف: «'+type+'» (text, number, date, bool)'};
  if(p[1].length>LIM.item)return {ok:false,error:'تسمية الحقل طويلة: «'+p[1]+'»'};
  if(keys.has(p[0]))return {ok:false,error:'مفتاح مكرر: «'+p[0]+'»'};
  keys.add(p[0]);out.push({key:p[0],label_ar:p[1],type});
 }
 if(out.length>LIM.fields)return {ok:false,error:'عدد الحقول كبير (الحد '+LIM.fields+')'};
 return {ok:true,fields:out};
}
/* من كائن الإعدادات إلى قيم النموذج */
function settingsToForm(st){
 st=isObj(st)?st:{};const inv=isObj(st.inventory)?st.inventory:{},sal=isObj(st.sales)?st.sales:{},pur=isObj(st.purchases)?st.purchases:{};
 return {layout:LAYOUTS[st.layout]?st.layout:'retail',categories:(Array.isArray(st.categories)?st.categories:[]).join('\n'),
  units:(Array.isArray(st.units)?st.units:[]).join('\n'),fields:fieldsToText(st.product_fields),
  tools:Array.isArray(st.tools)?st.tools.slice():[],reports:Array.isArray(st.reports)?st.reports.slice():[],
  inv:{track_serial:!!inv.track_serial,track_expiry:!!inv.track_expiry,track_batch:!!inv.track_batch,variants:!!inv.variants,weighable:!!inv.weighable,stocktake:STOCKTAKE[inv.stocktake]?inv.stocktake:'periodic'},
  decimal_qty:!!sal.decimal_qty,expiry_on_receive:!!pur.track_expiry_on_receive};
}
/* من قيم النموذج إلى كائن إعدادات كامل فوق base (المفاتيح غير المعروفة في base تبقى كما هي) */
function formToSettings(f,base){
 const out=isObj(base)?JSON.parse(JSON.stringify(base)):{};
 if(!LAYOUTS[f.layout])return {ok:false,error:'نوع الواجهة غير صالح'};
 const cats=lines(f.categories),units=lines(f.units);
 if(cats.length>LIM.items||units.length>LIM.items)return {ok:false,error:'عدد العناصر كبير (الحد '+LIM.items+' لكل قائمة)'};
 if(cats.concat(units).some(x=>x.length>LIM.item))return {ok:false,error:'أحد العناصر أطول من '+LIM.item+' حرفًا'};
 const pf=parseFields(f.fields);if(!pf.ok)return pf;
 const tools=Array.from(new Set((f.tools||[]).filter(x=>/^[a-z][a-z0-9_]{1,40}$/.test(x)))),reports=Array.from(new Set((f.reports||[]).filter(x=>/^[a-z][a-z0-9_]{1,40}$/.test(x))));
 const i=f.inv||{};
 out.layout=f.layout;out.categories=cats;out.units=units;out.product_fields=pf.fields;out.tools=tools;out.reports=reports;
 out.inventory=Object.assign({},isObj(out.inventory)?out.inventory:{},{track_serial:!!i.track_serial,track_expiry:!!i.track_expiry,track_batch:!!i.track_batch,variants:!!i.variants,weighable:!!i.weighable,stocktake:STOCKTAKE[i.stocktake]?i.stocktake:'periodic'});
 out.sales=Object.assign({},isObj(out.sales)?out.sales:{},{decimal_qty:!!f.decimal_qty});
 out.purchases=Object.assign({},isObj(out.purchases)?out.purchases:{});
 if(f.expiry_on_receive)out.purchases.track_expiry_on_receive=true;else delete out.purchases.track_expiry_on_receive;
 return {ok:true,settings:out};
}
const DEFAULT_MAIN_SETTINGS={categories:[],units:['قطعة'],product_fields:[],inventory:{track_serial:false,track_expiry:false,track_batch:false,variants:false,weighable:false,stocktake:'periodic'},sales:{decimal_qty:false},purchases:{},reports:['sales_daily','stock_levels'],tools:[],layout:'retail'};

/* رسائل أخطاء مفهومة (القاعدة تُرجع نصًا إنجليزيًا) */
function friendlyError(e){
 const m=String(e&&e.message||e||'');
 if(/has \d+ child/i.test(m))return 'لا يمكن الحذف: له تصنيفات فرعية. احذفها أو انقلها أولًا.';
 if(/shop\(s\) are classified|classified on it/i.test(m))return 'لا يمكن الحذف: توجد محلات مصنّفة عليه. عطّله بدل حذفه.';
 if(/duplicate key|23505|already exists/i.test(m))return 'الاسم أو الرمز مكرر.';
 if(/founder only|403|غير مسموح/i.test(m))return 'هذه العملية للمؤسس فقط.';
 if(/same level|must be at level/i.test(m))return 'الانتقال ممكن فقط إلى أب من نفس المستوى.';
 if(/not found|does not exist|42883|PGRST202/i.test(m))return 'الميزة غير مفعّلة بعد على قاعدة البيانات (طبّق migration المرحلة 5).';
 return m||'حدث خطأ غير متوقع';
}

/* ---------------------------------------------------------------- عرض HTML (دوال نقية) ---------------------------------------------------------------- */
function treeHtml(tree,counts,open,selected){
 const row=(r)=>{
  const kids=tree.kids(r.id),isOpen=open.has(r.id),sel=selected===r.id,n=counts.total(r.id),canAdd=r.level<MAX_LEVEL;
  const badges=(r.is_active===false?'<span class="oam-b off">معطّل</span>':'')+(n?'<span class="oam-b">'+n+' محل</span>':'')+(kids.length?'<span class="oam-b c">'+kids.length+' '+E(CHILD_NAME[r.level]||'فرعي')+'</span>':'');
  let h='<li class="oam-row l'+r.level+(r.is_active===false?' off':'')+'" data-id="'+E(r.id)+'"><div class="oam-line"><button type="button" class="oam-name" data-act="toggle" data-id="'+E(r.id)+'" aria-expanded="'+(isOpen?'true':'false')+'"><i class="oam-chev">'+(isOpen?'▾':'◂')+'</i><span>'+E(r.name_ar)+'</span></button><span class="oam-badges">'+badges+'</span></div>';
  if(isOpen){
   h+='<div class="oam-bar" role="group" aria-label="إجراءات '+E(r.name_ar)+'">'
    +'<button type="button" class="oam-btn" data-act="up" data-id="'+E(r.id)+'" aria-label="تحريك للأعلى">▲</button>'
    +'<button type="button" class="oam-btn" data-act="down" data-id="'+E(r.id)+'" aria-label="تحريك للأسفل">▼</button>'
    +'<button type="button" class="oam-btn" data-act="edit" data-id="'+E(r.id)+'">تعديل</button>'
    +'<button type="button" class="oam-btn" data-act="settings" data-id="'+E(r.id)+'">الإعدادات</button>'
    +(canAdd?'<button type="button" class="oam-btn pri" data-act="add" data-id="'+E(r.id)+'">+ '+E(CHILD_NAME[r.level])+'</button>':'')
    +'<button type="button" class="oam-btn danger" data-act="delete" data-id="'+E(r.id)+'">حذف</button></div>';
   if(kids.length)h+='<ul class="oam-ul">'+kids.map(row).join('')+'</ul>';
   else if(canAdd)h+='<p class="oam-empty">لا يوجد '+E(CHILD_NAME[r.level])+' بعد.</p>';
  }
  return h+'</li>';
 };
 return tree.roots.length?'<ul class="oam-ul root">'+tree.roots.map(row).join('')+'</ul>':'<p class="oam-empty">لا توجد أنشطة. أضف أول نشاط رئيسي.</p>';
}
function checkList(name,known,labels,chosen){
 const keys=known.concat(chosen.filter(x=>!known.includes(x)));
 return '<div class="oam-checks">'+keys.map(k=>'<label class="oam-ck"><input type="checkbox" data-grp="'+name+'" value="'+E(k)+'"'+(chosen.includes(k)?' checked':'')+'><span>'+E(labels[k]||k)+'</span></label>').join('')+'</div>';
}
function settingsFormHtml(f){
 const opts=(o,sel)=>Object.keys(o).map(k=>'<option value="'+E(k)+'"'+(k===sel?' selected':'')+'>'+E(o[k])+'</option>').join('');
 return '<label class="oam-l">نوع الواجهة<select id="oam_layout">'+opts(LAYOUTS,f.layout)+'</select></label>'
 +'<label class="oam-l">تصنيفات المنتجات الافتراضية <small>(سطر لكل تصنيف)</small><textarea id="oam_cats" rows="4">'+E(f.categories)+'</textarea></label>'
 +'<label class="oam-l">وحدات القياس <small>(سطر لكل وحدة)</small><textarea id="oam_units" rows="3">'+E(f.units)+'</textarea></label>'
 +'<label class="oam-l">الحقول الإضافية للمنتجات <small>(سطر لكل حقل: المفتاح|التسمية|النوع — النوع: text, number, date, bool)</small><textarea id="oam_fields" rows="4" dir="ltr" style="text-align:left" placeholder="size|المقاس|text">'+E(f.fields)+'</textarea></label>'
 +'<fieldset class="oam-fs"><legend>خيارات المخزون والجرد</legend><div class="oam-checks">'
 +INV_FLAGS.map(x=>'<label class="oam-ck"><input type="checkbox" id="oam_inv_'+x[0]+'"'+(f.inv[x[0]]?' checked':'')+'><span>'+E(x[1])+'</span></label>').join('')
 +'</div><label class="oam-l">الجرد<select id="oam_stocktake">'+opts(STOCKTAKE,f.inv.stocktake)+'</select></label></fieldset>'
 +'<fieldset class="oam-fs"><legend>المبيعات والمشتريات</legend><div class="oam-checks">'
 +'<label class="oam-ck"><input type="checkbox" id="oam_decimal"'+(f.decimal_qty?' checked':'')+'><span>السماح بكميات عشرية في البيع</span></label>'
 +'<label class="oam-ck"><input type="checkbox" id="oam_expiry_recv"'+(f.expiry_on_receive?' checked':'')+'><span>طلب تاريخ الصلاحية عند استلام المشتريات</span></label></div></fieldset>'
 +'<fieldset class="oam-fs"><legend>التقارير التشغيلية</legend>'+checkList('reports',Object.keys(REPORT_LABELS),REPORT_LABELS,f.reports)+'</fieldset>'
 +'<fieldset class="oam-fs"><legend>أدوات ووظائف النشاط</legend>'+checkList('tools',Object.keys(TOOL_LABELS),TOOL_LABELS,f.tools)+'</fieldset>';
}

/* ---------------------------------------------------------------- الواجهة (DOM + الشبكة) ---------------------------------------------------------------- */
const rq=(p,o)=>{if(typeof root.__orvexRequest!=='function')return Promise.reject(new Error('خدمة المصادقة غير جاهزة'));return root.__orvexRequest(p,o)};
const say=m=>{try{root.toast(m)}catch(e){}};
const founder=()=>!!(root.orvexRole&&typeof root.orvexRole.ok==='function'&&root.orvexRole.ok());
const T='/rest/v1/orvex_business_activities';
const S={rows:[],tree:null,counts:null,open:new Set(),sel:null,sheet:null,busy:false,loaded:false,err:''};
let host=null;

async function fetchAll(path){
 const out=[];
 for(let off=0;off<20000;off+=1000){
  const r=await rq(path+'&limit=1000&offset='+off);
  if(!Array.isArray(r))break;out.push(...r);if(r.length<1000)break;
 }
 return out;
}
async function load(){
 S.err='';
 try{
  S.rows=await fetchAll(T+'?select=id,parent_id,level,code,name_ar,name_en,sort_order,is_active&order=level.asc,sort_order.asc,name_ar.asc');
  let cls=[];try{cls=await fetchAll('/rest/v1/orvex_shop_classification?select=activity_id&order=shop_id.asc')}catch(e){}
  S.tree=buildTree(S.rows);S.counts=countShops(S.tree,cls);S.loaded=true;
 }catch(e){S.err=friendlyError(e)}
}
/* بعد أي كتابة: نُبطل تخزين القوائم المؤقت في activities.js ثم نعيد التحميل */
async function afterWrite(){
 try{root.__orvexActivities&&root.__orvexActivities.reset&&root.__orvexActivities.reset()}catch(e){}
 await load();
}
async function run(fn,okMsg){
 if(S.busy)return false;S.busy=true;paint();
 try{await fn();if(okMsg)say(okMsg);await afterWrite();S.busy=false;return true}
 catch(e){S.busy=false;say(friendlyError(e));paint();return false}
}

function injectStyle(){
 if(document.getElementById('oam-style'))return;
 const st=document.createElement('style');st.id='oam-style';
 st.textContent=`#orvex-act-mgr,#orvex-feat-mgr{position:fixed;inset:0;z-index:10040;font-family:inherit;color:var(--ink,#17251e)}
.oam-back{position:absolute;inset:0;background:rgba(0,0,0,.62);display:flex;justify-content:center;align-items:flex-start;padding:2vh 10px;overflow:auto}
.oam-panel{width:min(820px,100%);background:var(--bg,#f5f7f5);border:1px solid var(--line,#dce4de);border-radius:18px;padding:14px;box-shadow:0 20px 70px #0005;max-height:96vh;overflow:auto;box-sizing:border-box}
.oam-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}.oam-head h2{margin:0;flex:1;font-size:19px;line-height:1.4}
.oam-x{border:0;border-radius:10px;width:40px;height:40px;font-size:22px;background:var(--surface,#fff);color:inherit;cursor:pointer}
.oam-sub{margin:0 0 12px;color:var(--muted,#66756c);font-size:13px;line-height:1.7}
.oam-top{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.oam-btn{min-height:40px;padding:6px 12px;border-radius:10px;border:1px solid var(--line,#dce4de);background:var(--surface,#fff);color:inherit;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;touch-action:manipulation}
.oam-btn.pri{background:#0e8a43;border-color:#0e8a43;color:#fff}.oam-btn.danger{color:#c0262b;border-color:#e8b9bb}.oam-btn:disabled{opacity:.5;cursor:default}
.oam-ul{list-style:none;margin:0;padding:0}.oam-ul .oam-ul{margin:6px 0 2px;padding-inline-start:14px;border-inline-start:2px solid var(--line,#dce4de)}
.oam-row{margin:6px 0}.oam-row.off>.oam-line .oam-name span{opacity:.55;text-decoration:line-through}
.oam-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--surface,#fff);border:1px solid var(--line,#dce4de);border-radius:12px;padding:4px 8px}
.oam-name{flex:1 1 150px;min-height:42px;display:flex;align-items:center;gap:8px;background:none;border:0;color:inherit;font:inherit;font-weight:800;font-size:14.5px;text-align:start;cursor:pointer;touch-action:manipulation}
.oam-row.l1>.oam-line .oam-name{font-size:15.5px}.oam-chev{font-style:normal;width:14px;color:var(--muted,#66756c)}
.oam-badges{display:flex;gap:5px;flex-wrap:wrap}.oam-b{font-size:11.5px;padding:2px 8px;border-radius:999px;background:#e6f4ec;color:#0b6b35;font-weight:700}.oam-b.c{background:#eef1f4;color:#4a5560}.oam-b.off{background:#fde8e8;color:#b02a2f}
.oam-bar{display:flex;gap:6px;flex-wrap:wrap;padding:8px 2px 4px}
.oam-empty{margin:6px 4px;color:var(--muted,#66756c);font-size:13px}
.oam-sheet{position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;z-index:2}
.oam-card{width:min(640px,100%);max-height:92vh;overflow:auto;background:var(--bg,#f5f7f5);border-radius:18px 18px 0 0;padding:14px;box-sizing:border-box}
@media(min-width:700px){.oam-sheet{align-items:center}.oam-card{border-radius:18px}}
.oam-card h3{margin:0 0 4px;font-size:17px}.oam-note{font-size:12.5px;color:var(--muted,#66756c);line-height:1.7;margin:4px 0 10px}
.oam-l{display:grid;gap:5px;font-size:13px;font-weight:700;margin:10px 0}.oam-l small{font-weight:400;color:var(--muted,#66756c)}
.oam-card input[type=text],.oam-card select,.oam-card textarea{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid var(--line,#dce4de);background:var(--surface,#fff);color:inherit;font:inherit;font-size:14px}
.oam-fs{border:1px solid var(--line,#dce4de);border-radius:12px;margin:10px 0;padding:6px 10px 10px}.oam-fs legend{font-weight:800;font-size:13px;padding:0 6px}
.oam-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:2px 10px}
.oam-ck{display:flex;align-items:center;gap:8px;min-height:38px;font-size:13.5px;font-weight:600}.oam-ck input{width:20px;height:20px}
.oam-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.oam-err{color:#b02a2f;font-size:13px;margin:8px 0}`;
 document.head.appendChild(st);
}

function paint(){
 if(!host)return;
 const dis=S.busy?' disabled':'';
 let body;
 if(S.err)body='<p class="oam-err" role="alert">'+E(S.err)+'</p><button type="button" class="oam-btn" data-act="reload">إعادة المحاولة</button>';
 else if(!S.loaded)body='<p class="oam-empty">جارٍ التحميل…</p>';
 else body='<div class="oam-top"><button type="button" class="oam-btn pri" data-act="add-main"'+dis+'>+ نشاط رئيسي جديد</button><button type="button" class="oam-btn" data-act="expand"'+dis+'>فتح الكل</button><button type="button" class="oam-btn" data-act="collapse"'+dis+'>طيّ الكل</button></div>'+treeHtml(S.tree,S.counts,S.open,S.sel);
 host.innerHTML='<div class="oam-back"><div class="oam-panel" dir="rtl" role="dialog" aria-modal="true" aria-label="إدارة أنواع المحلات والأنشطة التجارية">'
  +'<div class="oam-head"><h2>إدارة أنواع المحلات والأنشطة التجارية</h2><button type="button" class="oam-x" data-act="close" aria-label="إغلاق">✕</button></div>'
  +'<p class="oam-sub">أضف الأنشطة وعدّلها وغيّر ترتيبها، وخصّص إعدادات كل نشاط. التغييرات لا تمس المحلات الحالية؛ تُطبَّق الإعدادات على المحل عند تصنيفه أو بزر «إعادة تطبيق» في تعديل المحل.</p>'
  +body+'</div>'+(S.sheet?sheetHtml():'')+'</div>';
}

/* ---- النوافذ السفلية: إضافة / تعديل / إعدادات ---- */
let sheetCtx=null;
function sheetHtml(){
 const sh=S.sheet,node=sh.id?S.tree.byId.get(sh.id):null;
 if(sh.kind==='add'){
  const parent=sh.id?node:null,level=parent?parent.level+1:1;
  return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><h3>إضافة '+E(LEVEL_NAME[level])+'</h3>'+(parent?'<p class="oam-note">تحت: '+E(S.tree.chain(parent.id).map(x=>x.name_ar).join(' › '))+'</p>':'<p class="oam-note">يظهر في قائمة «النشاط الرئيسي» عند إنشاء محل جديد.</p>')
   +'<label class="oam-l">الاسم بالعربية<input type="text" id="oam_name" maxlength="'+LIM.name+'" autocomplete="off"></label><label class="oam-l">الاسم بالإنجليزية <small>(اختياري)</small><input type="text" id="oam_en" dir="ltr" maxlength="'+LIM.name+'" autocomplete="off"></label>'
   +'<p class="oam-err" id="oam_e" role="alert"></p><div class="oam-act"><button type="button" class="oam-btn pri" data-act="save-add">إضافة</button><button type="button" class="oam-btn" data-act="sheet-close">إلغاء</button></div></div></div>';
 }
 if(!node)return '';
 if(sh.kind==='edit'){
  const targets=moveTargets(S.tree,node),n=S.counts.total(node.id);
  return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><h3>تعديل: '+E(node.name_ar)+'</h3><p class="oam-note">'+E(LEVEL_NAME[node.level]||'')+' · الرمز: <bdi dir="ltr">'+E(node.code)+'</bdi>'+(n?' · '+n+' محل مصنّف عليه':'')+'</p>'
   +'<label class="oam-l">الاسم بالعربية<input type="text" id="oam_name" maxlength="'+LIM.name+'" value="'+E(node.name_ar)+'"></label><label class="oam-l">الاسم بالإنجليزية<input type="text" id="oam_en" dir="ltr" maxlength="'+LIM.name+'" value="'+E(node.name_en||'')+'"></label>'
   +'<label class="oam-ck"><input type="checkbox" id="oam_active"'+(node.is_active!==false?' checked':'')+'><span>مفعّل (يظهر في قوائم إنشاء المحلات)</span></label>'
   +(targets.length?'<label class="oam-l">نقل إلى أب آخر <small>(المحلات المصنّفة عليه تبقى كما هي)</small><select id="oam_move"><option value="">— بدون نقل —</option>'+targets.map(t=>'<option value="'+E(t.id)+'">'+E(t.label)+(t.active?'':' (معطّل)')+'</option>').join('')+'</select></label>':'')
   +'<p class="oam-err" id="oam_e" role="alert"></p><div class="oam-act"><button type="button" class="oam-btn pri" data-act="save-edit">حفظ</button><button type="button" class="oam-btn" data-act="sheet-close">إلغاء</button></div></div></div>';
 }
 if(sh.kind==='settings'){
  if(!sh.form)return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><p class="oam-empty">جارٍ تحميل الإعدادات…</p></div></div>';
  const inherit=node.level>1;
  return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><h3>إعدادات: '+E(node.name_ar)+'</h3>'
   +'<p class="oam-note">'+(inherit?'هذا '+E(LEVEL_NAME[node.level])+' يرث إعدادات '+E(S.tree.chain(node.id).slice(0,-1).map(x=>x.name_ar).join(' › '))+'، ويُحفظ هنا ما تغيّره فقط.':'هذه الإعدادات الأساسية للنشاط الرئيسي، وترثها أنشطته الفرعية وتخصصاته.')
   +' لا تتغير إعدادات المحلات الحالية تلقائيًا.</p>'+settingsFormHtml(sh.form)
   +'<p class="oam-err" id="oam_e" role="alert"></p><div class="oam-act"><button type="button" class="oam-btn pri" data-act="save-settings">حفظ الإعدادات</button>'
   +(inherit?'<button type="button" class="oam-btn" data-act="reset-settings">إلغاء التخصيص (وراثة كاملة)</button>':'')
   +'<button type="button" class="oam-btn" data-act="sheet-close">إلغاء</button></div></div></div>';
 }
 return '';
}
const $q=id=>document.getElementById(id);
const setErr=m=>{const e=$q('oam_e');if(e)e.textContent=m||''};
function readForm(){
 const ck=id=>{const e=$q(id);return !!(e&&e.checked)},grp=g=>Array.from(host.querySelectorAll('input[data-grp="'+g+'"]:checked')).map(x=>x.value),v=id=>{const e=$q(id);return e?e.value:''};
 return {layout:v('oam_layout'),categories:v('oam_cats'),units:v('oam_units'),fields:v('oam_fields'),tools:grp('tools'),reports:grp('reports'),
  inv:{track_serial:ck('oam_inv_track_serial'),track_expiry:ck('oam_inv_track_expiry'),track_batch:ck('oam_inv_track_batch'),variants:ck('oam_inv_variants'),weighable:ck('oam_inv_weighable'),stocktake:v('oam_stocktake')},
  decimal_qty:ck('oam_decimal'),expiry_on_receive:ck('oam_expiry_recv')};
}
async function openSettings(id){
 S.sheet={kind:'settings',id,form:null};paint();
 try{
  const chain=S.tree.chain(id),ids=chain.map(x=>x.id);
  const r=await rq(T+'?id=in.('+ids.map(encodeURIComponent).join(',')+')&select=id,level,settings');
  const m=new Map((r||[]).map(x=>[x.id,x]));
  const own=m.get(id)&&isObj(m.get(id).settings)?m.get(id).settings:{};
  const above=chain.slice(0,-1).map(x=>m.get(x.id)&&m.get(x.id).settings);
  const inherited=effective(above),eff=deepMerge(inherited,own);
  sheetCtx={id,own,inherited};
  if(S.sheet&&S.sheet.id===id){S.sheet.form=settingsToForm(S.tree.byId.get(id).level===1&&!Object.keys(own).length?DEFAULT_MAIN_SETTINGS:eff);paint()}
 }catch(e){S.sheet=null;say(friendlyError(e));paint()}
}

async function onAction(act,id){
 const node=id?S.tree&&S.tree.byId.get(id):null;
 switch(act){
  case 'close':close();return;
  case 'reload':S.loaded=false;paint();await load();paint();return;
  case 'toggle':if(S.open.has(id))S.open.delete(id);else S.open.add(id);S.sel=id;paint();return;
  case 'expand':S.rows.forEach(r=>{if(S.tree.kids(r.id).length)S.open.add(r.id)});paint();return;
  case 'collapse':S.open.clear();paint();return;
  case 'sheet-close':S.sheet=null;sheetCtx=null;paint();return;
  case 'add-main':S.sheet={kind:'add',id:null};paint();return;
  case 'add':if(node&&node.level<MAX_LEVEL){S.sheet={kind:'add',id:node.id};paint()}return;
  case 'edit':if(node){S.sheet={kind:'edit',id:node.id};paint()}return;
  case 'settings':if(node)await openSettings(node.id);return;
  case 'up':case 'down':{
   if(!node)return;
   const sibs=(node.parent_id?S.tree.kids(node.parent_id):S.tree.roots).map(x=>x.id),next=moveInList(sibs,node.id,act==='up'?-1:1);
   if(next)await run(()=>rq('/rest/v1/rpc/orvex_reorder_activities',{method:'POST',body:JSON.stringify({p_ids:next})}));
   return}
  case 'delete':{
   if(!node)return;
   if(S.tree.kids(node.id).length){say('لا يمكن الحذف: له تصنيفات فرعية. احذفها أو انقلها أولًا.');return}
   if(S.counts.total(node.id)){say('لا يمكن الحذف: توجد محلات مصنّفة عليه. عطّله بدل حذفه.');return}
   if(!root.confirm('حذف «'+node.name_ar+'» نهائيًا؟ يُحذف التصنيف غير المستخدم فقط.'))return;
   await run(()=>rq('/rest/v1/rpc/orvex_delete_activity',{method:'POST',body:JSON.stringify({p_id:node.id})}),'تم الحذف');
   return}
  case 'save-add':return saveAdd();
  case 'save-edit':return saveEdit();
  case 'save-settings':return saveSettings(false);
  case 'reset-settings':return saveSettings(true);
 }
}
async function saveAdd(){
 const parent=S.sheet.id?S.tree.byId.get(S.sheet.id):null,level=parent?parent.level+1:1;
 if(level>MAX_LEVEL)return;
 const sibs=parent?S.tree.kids(parent.id):S.tree.roots,v=validateName($q('oam_name').value,sibs,null);
 if(!v.ok){setErr(v.error);return}
 const taken=new Set(S.rows.map(r=>r.code)),code=genCode(parent?parent.code:'',taken),en=norm($q('oam_en').value)||null;
 if(en&&en.length>LIM.name){setErr('الاسم الإنجليزي طويل');return}
 const order=sibs.reduce((m,r)=>Math.max(m,r.sort_order||0),0)+10;
 const body={parent_id:parent?parent.id:null,level,code,name_ar:v.name,name_en:en,sort_order:order,is_active:true};
 if(level===1)body.settings=DEFAULT_MAIN_SETTINGS;
 const keep=parent?parent.id:null;
 S.sheet=null;
 const ok=await run(()=>rq(T,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)}),'تمت الإضافة');
 if(ok&&keep){S.open.add(keep);paint()}
}
async function saveEdit(){
 const node=S.tree.byId.get(S.sheet.id);if(!node)return;
 const sibs=node.parent_id?S.tree.kids(node.parent_id):S.tree.roots,v=validateName($q('oam_name').value,sibs,node.id);
 if(!v.ok){setErr(v.error);return}
 const en=norm($q('oam_en').value)||null,active=$q('oam_active').checked,mv=$q('oam_move')?$q('oam_move').value:'';
 if(en&&en.length>LIM.name){setErr('الاسم الإنجليزي طويل');return}
 const used=S.counts.total(node.id);
 if(!active&&node.is_active!==false&&used&&!root.confirm('يوجد '+used+' محل مصنّف على «'+node.name_ar+'». تعطيله يخفيه من القوائم الجديدة دون تغيير تلك المحلات. متابعة؟'))return;
 if(mv&&used&&!root.confirm('سيُنقل «'+node.name_ar+'» وتبقى المحلات المصنّفة عليه كما هي، لكن إعداداتها لن تتغير إلا عند «إعادة تطبيق». متابعة؟'))return;
 const patch={name_ar:v.name,name_en:en,is_active:active};
 const changed=patch.name_ar!==node.name_ar||(patch.name_en||null)!==(node.name_en||null)||patch.is_active!==(node.is_active!==false);
 S.sheet=null;
 await run(async()=>{
  if(changed)await rq(T+'?id=eq.'+encodeURIComponent(node.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
  if(mv)await rq('/rest/v1/rpc/orvex_move_activity',{method:'POST',body:JSON.stringify({p_id:node.id,p_parent:mv})});
 },'تم الحفظ');
}
async function saveSettings(reset){
 const sh=S.sheet,node=S.tree.byId.get(sh.id);if(!node||!sheetCtx||sheetCtx.id!==node.id)return;
 let next;
 if(reset){next={}}
 else{
  const r=formToSettings(readForm(),node.level===1?sheetCtx.own:{});
  if(!r.ok){setErr(r.error);return}
  /* الرئيسي: إعدادات كاملة؛ الأدنى: الفرق عن الموروث فقط */
  next=node.level===1?r.settings:minimalOverride(sheetCtx.inherited,r.settings);
 }
 S.sheet=null;sheetCtx=null;
 await run(()=>rq(T+'?id=eq.'+encodeURIComponent(node.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({settings:next})}),reset?'أُلغي التخصيص':'حُفظت إعدادات النشاط');
}

function onClick(ev){
 const b=ev.target.closest&&ev.target.closest('[data-act]');if(!b||!host||!host.contains(b)||b.disabled)return;
 ev.preventDefault();onAction(b.getAttribute('data-act'),b.getAttribute('data-id')||'');
}
function onKey(ev){if(ev.key==='Escape'&&host){if(S.sheet){S.sheet=null;sheetCtx=null;paint()}else close()}}
function close(){
 if(!host)return;document.removeEventListener('keydown',onKey);host.removeEventListener('click',onClick);
 host.remove();host=null;S.sheet=null;sheetCtx=null;document.body.classList.remove('noscroll');
}
async function open(){
 if(!founder()){say('إدارة الأنشطة للمؤسس فقط');return}
 if(typeof root.__orvexRequest!=='function'){say('خدمة المصادقة غير جاهزة');return}
 if(host)return;
 injectStyle();
 host=document.createElement('div');host.id='orvex-act-mgr';document.body.appendChild(host);
 host.addEventListener('click',onClick);document.addEventListener('keydown',onKey);
 S.loaded=false;S.sheet=null;S.busy=false;paint();
 await load();paint();
}

root.orvexActivityManager=open;
root.__orvexActivityManager={open,close,injectStyle,logic:{buildTree,countShops,genCode,validateName,moveInList,moveTargets,deepMerge,deepEqual,effective,minimalOverride,parseFields,fieldsToText,settingsToForm,formToSettings,friendlyError,treeHtml,settingsFormHtml,lines,MAX_LEVEL,DEFAULT_MAIN_SETTINGS}};
})();
