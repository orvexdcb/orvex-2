/* ================= ORVEX: تصنيف الأنشطة التجارية — المرحلة 6 (نظام الميزات الخاصة بالأنشطة) =================
   قسم «ميزات الأنشطة» للمؤسس:
   - كتالوج ميزات (مدمجة: الطاولات، الأرقام التسلسلية، الضمان… + ميزات يضيفها المؤسس).
   - ربط كل ميزة بـ «كل المحلات» أو بأنشطة محددة من أي مستوى؛ المحل يحصل على الميزة إن ارتبطت بنشاطه أو بأحد آبائه.
   - تفعيل/تعطيل ميزة، وحذف المخصّصة فقط (المدمجة تُعطَّل ولا تُحذف).
   - الميزة هنا «علامة» يقرؤها النظام (orvexProfile.hasFeature)؛ الشاشات الفعلية للميزات الجديدة تُبنى لاحقًا،
     وتُوسَم «قيد التجهيز» في لوحة المحل حتى يكون لها شاشة.
   - لا يغيّر shops ولا المبيعات ولا المخزون ولا إعدادات أي محل مخزّنة؛ الميزات تُحسب عند الفتح من التصنيف الحالي.
   - للمؤسس فقط: RLS + دالة orvex_set_feature_links في القاعدة + حارس في server.js. */
(function(){
'use strict';
const root=typeof window!=='undefined'?window:globalThis;
if(root.__orvexFeatureManager)return;

const LIM={name:80,desc:300};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const LEVEL={1:'رئيسي',2:'فرعي',3:'تخصص'};

/* ---------------------------------------------------------------- منطق نقي ---------------------------------------------------------------- */
function genCode(taken,rand){
 const r=typeof rand==='function'?rand:()=>Math.random().toString(36).slice(2,8);
 for(let i=0;i<50;i++){
  const tail=String(r()).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'x'+i,code='f_'+tail;
  if(/^[a-z][a-z0-9_]{1,40}$/.test(code)&&!(taken&&taken.has(code)))return code;
 }
 throw new Error('تعذر توليد رمز فريد');
}
function validateFeature(name,desc,features,selfId){
 const n=norm(name),d=String(desc==null?'':desc).trim();
 if(!n)return {ok:false,error:'اكتب اسم الميزة'};
 if(n.length>LIM.name)return {ok:false,error:'الاسم طويل (الحد '+LIM.name+' حرفًا)'};
 if(d.length>LIM.desc)return {ok:false,error:'الوصف طويل (الحد '+LIM.desc+' حرفًا)'};
 if((features||[]).some(f=>f.id!==selfId&&norm(f.name_ar).toLowerCase()===n.toLowerCase()))return {ok:false,error:'توجد ميزة بنفس الاسم'};
 return {ok:true,name:n,desc:d||null};
}
/* حالة ربط ميزة: all أو مجموعة معرّفات أنشطة */
function linkState(links,featureId){
 const mine=(links||[]).filter(l=>l.feature_id===featureId);
 return {all:mine.some(l=>l.scope==='all'),ids:new Set(mine.filter(l=>l.scope==='activity'&&l.activity_id).map(l=>l.activity_id))};
}
function scopeSummary(st){
 if(st.all)return 'كل المحلات';
 return st.ids.size?st.ids.size+' نشاط':'غير مرتبطة';
}
function friendlyError(e){
 const m=String(e&&e.message||e||'');
 if(/duplicate key|23505/i.test(m))return 'الاسم أو الرمز مكرر.';
 if(/founder only|403|غير مسموح/i.test(m))return 'هذه العملية للمؤسس فقط.';
 if(/unknown activity/i.test(m))return 'أحد الأنشطة المختارة لم يعد موجودًا. أعد فتح الشاشة.';
 if(/not found|does not exist|42P01|42883|PGRST20[25]/i.test(m))return 'نظام الميزات غير مفعّل بعد على قاعدة البيانات (طبّق migration المرحلة 6).';
 return m||'حدث خطأ غير متوقع';
}

/* ---------------------------------------------------------------- عرض HTML ---------------------------------------------------------------- */
function listHtml(features,links){
 if(!features.length)return '<p class="oam-empty">لا توجد ميزات. أضف أول ميزة.</p>';
 return '<ul class="oam-ul root">'+features.map(f=>{
  const st=linkState(links,f.id),sum=scopeSummary(st);
  const b=(f.is_builtin?'<span class="oam-b c">مدمجة</span>':'<span class="oam-b">مخصّصة</span>')
   +(f.has_screen?'<span class="oam-b">لها شاشة</span>':'<span class="oam-b c">قيد التجهيز</span>')
   +(f.is_active===false?'<span class="oam-b off">معطّلة</span>':'')
   +'<span class="oam-b'+(sum==='غير مرتبطة'?' off':'')+'">'+E(sum)+'</span>';
  return '<li class="oam-row'+(f.is_active===false?' off':'')+'"><div class="oam-line"><span class="oam-name" style="cursor:default"><span>'+E(f.name_ar)+'</span></span><span class="oam-badges">'+b+'</span></div>'
   +(f.description?'<p class="oam-note" style="margin:4px 8px">'+E(f.description)+'</p>':'')
   +'<div class="oam-bar"><button type="button" class="oam-btn pri" data-act="link" data-id="'+E(f.id)+'">اقتراحات الأنشطة</button>'
   +'<button type="button" class="oam-btn pri" data-act="shops" data-id="'+E(f.id)+'">تخصيص المحلات</button>'
   +'<button type="button" class="oam-btn" data-act="edit" data-id="'+E(f.id)+'">تعديل</button>'
   +(f.is_builtin?'':'<button type="button" class="oam-btn danger" data-act="delete" data-id="'+E(f.id)+'">حذف</button>')+'</div></li>';
 }).join('')+'</ul>';
}
/* شجرة أنشطة بمربعات اختيار؛ اختيار نشاط يشمل أبناءه عند المحل (وراثة) */
function checklistHtml(tree,selected){
 const row=r=>'<li><label class="oam-ck"><input type="checkbox" data-aid="'+E(r.id)+'"'+(selected.has(r.id)?' checked':'')+'><span>'+E(r.name_ar)+' <small>('+E(LEVEL[r.level]||'')+')</small>'+(r.is_active===false?' <small>· معطّل</small>':'')+'</span></label>'
  +(tree.kids(r.id).length?'<ul class="oam-ul">'+tree.kids(r.id).map(row).join('')+'</ul>':'')+'</li>';
 return tree.roots.length?'<ul class="oam-ul root">'+tree.roots.map(row).join('')+'</ul>':'<p class="oam-empty">لا توجد أنشطة.</p>';
}

/* ---------------------------------------------------------------- الواجهة ---------------------------------------------------------------- */
const rq=(p,o)=>{if(typeof root.__orvexRequest!=='function')return Promise.reject(new Error('خدمة المصادقة غير جاهزة'));return root.__orvexRequest(p,o)};
const say=m=>{try{root.toast(m)}catch(e){}};
const founder=()=>!!(root.orvexRole&&typeof root.orvexRole.ok==='function'&&root.orvexRole.ok());
const S={features:[],links:[],tree:null,shops:[],assignments:[],sheet:null,busy:false,loaded:false,err:''};
let host=null;
const $q=id=>document.getElementById(id);
const setErr=m=>{const e=$q('ofm_e');if(e)e.textContent=m||''};
const AM=()=>root.__orvexActivityManager&&root.__orvexActivityManager.logic;

async function fetchAll(path){
 const out=[];
 for(let off=0;off<20000;off+=1000){const r=await rq(path+'&limit=1000&offset='+off);if(!Array.isArray(r))break;out.push(...r);if(r.length<1000)break}
 return out;
}
async function load(){
 S.err='';
 try{
  const am=AM();if(!am)throw new Error('وحدة إدارة الأنشطة غير محمّلة');
  S.features=await fetchAll('/rest/v1/orvex_features?select=id,code,name_ar,description,sort_order,is_active,is_builtin,has_screen&order=sort_order.asc,name_ar.asc');
  S.links=await fetchAll('/rest/v1/orvex_feature_links?select=feature_id,scope,activity_id&order=id.asc');
  S.tree=am.buildTree(await fetchAll('/rest/v1/orvex_business_activities?select=id,parent_id,level,code,name_ar,sort_order,is_active&order=level.asc,sort_order.asc,name_ar.asc'));
  S.shops=await fetchAll('/rest/v1/shops?select=id,name&order=name.asc');
  S.assignments=await fetchAll('/rest/v1/orvex_shop_feature_assignments?select=shop_id,feature_id,is_granted,show_in_pos,sort_order&order=shop_id.asc');
  S.loaded=true;
 }catch(e){S.err=friendlyError(e)}
}
async function run(fn,okMsg){
 if(S.busy)return false;S.busy=true;paint();
 try{await fn();if(okMsg)say(okMsg);await load();S.busy=false;paint();return true}
 catch(e){S.busy=false;say(friendlyError(e));paint();return false}
}
function paint(){
 if(!host)return;
 let body;
 if(S.err)body='<p class="oam-err" role="alert">'+E(S.err)+'</p><button type="button" class="oam-btn" data-act="reload">إعادة المحاولة</button>';
 else if(!S.loaded)body='<p class="oam-empty">جارٍ التحميل…</p>';
 else body='<div class="oam-top"><button type="button" class="oam-btn pri" data-act="add"'+(S.busy?' disabled':'')+'>+ ميزة جديدة</button></div>'+listHtml(S.features,S.links);
 host.innerHTML='<div class="oam-back"><div class="oam-panel" dir="rtl" role="dialog" aria-modal="true" aria-label="ميزات الأنشطة">'
  +'<div class="oam-head"><h2>ميزات الأنشطة التجارية</h2><button type="button" class="oam-x" data-act="close" aria-label="إغلاق">✕</button></div>'
  +'<p class="oam-sub">اقتراحات الأنشطة لا تمنح الميزة تلقائيًا. منح الميزة يتم لكل محل على حدة من «تخصيص المحلات»، ويمكن اختيار إظهارها كأيقونة في نقطة البيع إذا كانت لها شاشة فعلية.</p>'
  +body+'</div>'+sheetHtml()+'</div>';
}
function sheetHtml(){
 const sh=S.sheet;if(!sh)return '';
 const f=sh.id?S.features.find(x=>x.id===sh.id):null;
 if(sh.kind==='add'||(sh.kind==='edit'&&f))return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><h3>'+(f?'تعديل: '+E(f.name_ar):'ميزة جديدة')+'</h3>'
  +'<label class="oam-l">اسم الميزة<input type="text" id="ofm_name" maxlength="'+LIM.name+'" value="'+E(f?f.name_ar:'')+'" autocomplete="off"></label>'
  +'<label class="oam-l">وصف مختصر <small>(اختياري)</small><textarea id="ofm_desc" rows="3" maxlength="'+LIM.desc+'">'+E(f&&f.description||'')+'</textarea></label>'
  +(f?'<label class="oam-ck"><input type="checkbox" id="ofm_active"'+(f.is_active!==false?' checked':'')+'><span>مفعّلة</span></label>':'')
  +'<p class="oam-err" id="ofm_e" role="alert"></p><div class="oam-act"><button type="button" class="oam-btn pri" data-act="save-feature">'+(f?'حفظ':'إضافة')+'</button><button type="button" class="oam-btn" data-act="sheet-close">إلغاء</button></div></div></div>';
 if(sh.kind==='shops'&&f){
  const rows=S.shops.map(shop=>{
   const a=S.assignments.find(x=>x.shop_id===shop.id&&x.feature_id===f.id&&x.is_granted);
   const L=root.orvexFeatLogic,canIcon=!!f.has_screen&&!!(L&&Array.isArray(L.CODES)&&L.CODES.includes(f.code));
   return '<div class="oam-shop-row"><b>'+E(shop.name)+'</b><label class="oam-ck"><input type="checkbox" id="ofm_shop_grant_'+E(shop.id)+'"'+(a?' checked':'')+'><span>منح الميزة</span></label>'
    +(canIcon?'<label class="oam-ck"><input type="checkbox" id="ofm_shop_pos_'+E(shop.id)+'"'+(a&&a.show_in_pos?' checked':'')+'><span>إظهارها في نقطة البيع</span></label>':'<small>لا توجد شاشة تشغيل لهذه الميزة بعد</small>')+'</div>';
  }).join('');
  return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><h3>تخصيص المحلات: '+E(f.name_ar)+'</h3><p class="oam-note">اختر المحلات التي تحصل على هذه الميزة. تفعيل أيقونة نقطة البيع مستقل عن منح الميزة.</p>'
   +(rows||'<p class="oam-empty">لا توجد محلات.</p>')+'<p class="oam-err" id="ofm_e" role="alert"></p><div class="oam-act"><button type="button" class="oam-btn pri" data-act="save-shop-assignments">حفظ تخصيص المحلات</button><button type="button" class="oam-btn" data-act="sheet-close">إلغاء</button></div></div></div>';
 }
 if(sh.kind==='link'&&f){
  const st=linkState(S.links,f.id);
  return '<div class="oam-sheet"><div class="oam-card" dir="rtl"><h3>ربط: '+E(f.name_ar)+'</h3>'
   +'<label class="oam-ck"><input type="checkbox" id="ofm_all"'+(st.all?' checked':'')+'><span>كل المحلات</span></label>'
   +'<p class="oam-note">أو اختر أنشطة محددة (يشمل أبناءها):</p>'+checklistHtml(S.tree,st.ids)
   +'<p class="oam-err" id="ofm_e" role="alert"></p><div class="oam-act"><button type="button" class="oam-btn pri" data-act="save-links">حفظ الربط</button><button type="button" class="oam-btn" data-act="sheet-close">إلغاء</button></div></div></div>';
 }
 return '';
}
async function onAction(act,id){
 const f=id?S.features.find(x=>x.id===id):null;
 switch(act){
  case 'close':close();return;
  case 'reload':S.loaded=false;paint();await load();paint();return;
  case 'sheet-close':S.sheet=null;paint();return;
  case 'add':S.sheet={kind:'add'};paint();return;
  case 'edit':if(f){S.sheet={kind:'edit',id:f.id};paint()}return;
  case 'link':if(f){S.sheet={kind:'link',id:f.id};paint()}return;
  case 'shops':if(f){S.sheet={kind:'shops',id:f.id};paint()}return;
  case 'delete':
   if(!f||f.is_builtin)return;
   if(!root.confirm('حذف الميزة «'+f.name_ar+'» وكل روابطها؟'))return;
   await run(()=>rq('/rest/v1/orvex_features?id=eq.'+encodeURIComponent(f.id)+'&is_builtin=eq.false',{method:'DELETE',headers:{Prefer:'return=minimal'}}),'تم الحذف');return;
  case 'save-feature':return saveFeature();
  case 'save-links':return saveLinks();
  case 'save-shop-assignments':return saveShopAssignments();
 }
}
async function saveFeature(){
 const f=S.sheet.id?S.features.find(x=>x.id===S.sheet.id):null;
 const v=validateFeature($q('ofm_name').value,$q('ofm_desc').value,S.features,f?f.id:null);
 if(!v.ok){setErr(v.error);return}
 const active=f?$q('ofm_active').checked:true;
 S.sheet=null;
 if(f){
  if(f.is_active!==false&&!active&&!root.confirm('تعطيل «'+f.name_ar+'» يخفيها عن كل المحلات مؤقتًا. متابعة؟')){S.sheet={kind:'edit',id:f.id};paint();return}
  await run(()=>rq('/rest/v1/orvex_features?id=eq.'+encodeURIComponent(f.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({name_ar:v.name,description:v.desc,is_active:active})}),'تم الحفظ');
 }else{
  const code=genCode(new Set(S.features.map(x=>x.code))),order=S.features.reduce((m,x)=>Math.max(m,x.sort_order||0),0)+10;
  await run(()=>rq('/rest/v1/orvex_features',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({code,name_ar:v.name,description:v.desc,sort_order:order,is_active:true,is_builtin:false,has_screen:false})}),'تمت الإضافة');
 }
}
async function saveLinks(){
 const f=S.features.find(x=>x.id===S.sheet.id);if(!f)return;
 const all=$q('ofm_all').checked,ids=Array.from(host.querySelectorAll('input[data-aid]:checked')).map(x=>x.getAttribute('data-aid'));
 S.sheet=null;
 await run(()=>rq('/rest/v1/rpc/orvex_set_feature_links',{method:'POST',body:JSON.stringify({p_feature:f.id,p_all:all,p_activities:ids})}),'حُفظ الربط');
}
async function saveShopAssignments(){
 const f=S.features.find(x=>x.id===S.sheet.id);if(!f)return;
 const calls=S.shops.map(shop=>{
  const grant=$q('ofm_shop_grant_'+shop.id);
  const pos=$q('ofm_shop_pos_'+shop.id);
  return {shop,granted:grant?grant.checked:false,show:pos?pos.checked:false};
 });
 S.sheet=null;
 await run(async()=>{
  for(const x of calls){
   await rq('/rest/v1/rpc/orvex_set_shop_feature',{method:'POST',body:JSON.stringify({
    p_shop:x.shop.id,p_feature:f.id,p_granted:x.granted,p_show_in_pos:x.granted&&x.show,p_sort_order:100
   })});
  }
 },'تم حفظ منح الميزة للمحلات المحددة');
}
function onClick(ev){
 const b=ev.target.closest&&ev.target.closest('[data-act]');if(!b||!host||!host.contains(b)||b.disabled)return;
 ev.preventDefault();onAction(b.getAttribute('data-act'),b.getAttribute('data-id')||'');
}
function onKey(ev){if(ev.key==='Escape'&&host){if(S.sheet){S.sheet=null;paint()}else close()}}
function close(){
 if(!host)return;document.removeEventListener('keydown',onKey);host.removeEventListener('click',onClick);
 host.remove();host=null;S.sheet=null;
}
async function open(){
 if(!founder()){say('ميزات الأنشطة للمؤسس فقط');return}
 if(typeof root.__orvexRequest!=='function'){say('خدمة المصادقة غير جاهزة');return}
 const am=root.__orvexActivityManager;if(!am||typeof am.injectStyle!=='function'){say('وحدة إدارة الأنشطة غير محمّلة');return}
 if(host)return;
 am.injectStyle();
 host=document.createElement('div');host.id='orvex-feat-mgr';document.body.appendChild(host);
 host.addEventListener('click',onClick);document.addEventListener('keydown',onKey);
 S.loaded=false;S.sheet=null;S.busy=false;paint();
 await load();paint();
}
root.orvexFeatureManager=open;
root.__orvexFeatureManager={open,close,logic:{genCode,validateFeature,linkState,scopeSummary,friendlyError,listHtml,checklistHtml}};
})();
