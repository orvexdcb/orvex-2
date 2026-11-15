/* ORVEX — لوحة المحل الرئيسية (بعد المرحلة 4 من تصنيف الأنشطة).
   لكل محل لوحة رئيسية تتشكل من إعدادات نشاطه المحفوظة في orvex_shop_settings (عبر orvexProfile):
   - نوع الواجهة (layout: retail | restaurant | services | manufacturing) يحدد البطاقات السريعة وترتيبها.
   - الإعدادات (inventory.track_expiry ...) تحدد المؤشرات.
   - tools تُعرض كميزات النشاط؛ ما لا شاشة له بعد يُوسَم «قيد التجهيز» (المرحلة 6).
   إضافية فقط: تُحقن فوق الرئيسية الحالية ولا تغيّر أي شاشة أو بيانات.
   المحل بلا إعدادات (محل قديم لم يُصنَّف) أو المؤسس خارج أي محل: لا تظهر اللوحة وتبقى الرئيسية كما كانت. */
(function(){
'use strict';
const root=typeof window!=='undefined'?window:globalThis;

const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* بطاقات سريعة: كلها شاشات موجودة فعلًا في النظام */
const TILE={
 pos:{l:'نقطة البيع',s:'فاتورة بيع جديدة',a:"go('pos')",ok:e=>e.can('pos'),c:'green'},
 stock:{l:'المخزون',s:'المنتجات والكميات',a:"go('stock')",ok:e=>e.canView('stock'),c:'blue'},
 purchases:{l:'المشتريات',s:'فواتير الموردين',a:"newPurchase()",ok:e=>e.canView('purchases')&&e.can('purchases'),c:'teal'},
 parties:{l:'العملاء والموردون',s:'الأرصدة والحسابات',a:"go('parties')",ok:e=>e.canView('parties'),c:'orange'},
 invoices:{l:'الفواتير',s:'سجل المبيعات',a:"go('invoices')",ok:e=>e.canView('invoices'),c:'slate'},
 returns:{l:'المرتجعات',s:'مرتجع مبيعات',a:"go('returns')",ok:e=>e.canView('returns'),c:'red'},
 closings:{l:'إغلاق الصندوق',s:'الجرد اليومي للصندوق',a:"go('closings')",ok:e=>e.canView('closings'),c:'red'},
 reports:{l:'التقارير',s:'المبيعات والأرباح',a:"go('reports')",ok:e=>e.canView('reports'),c:'purple'},
 quotes:{l:'عروض الأسعار',s:'إنشاء وإرسال عرض',a:"quotesModal()",ok:e=>e.can('pos')&&typeof e.hasQuotes==='function'&&e.hasQuotes(),c:'teal'}
};
/* لكل نوع واجهة: ترتيب البطاقات وتسمياتها الخاصة (تغلب الافتراضية) */
const LAYOUT={
 retail:{title:'متجر تجزئة',tiles:['pos','stock','purchases','parties','invoices','reports']},
 restaurant:{title:'مطعم',tiles:[['pos','طلب جديد','بيع سريع للأصناف'],['stock','المواد والمكونات','مخزون المطبخ'],'purchases','closings','reports']},
 services:{title:'خدمات',tiles:[['pos','فاتورة خدمة','إصدار فاتورة'],'quotes','parties','invoices','reports']},
 manufacturing:{title:'تصنيع',tiles:[['stock','المواد والمنتجات','الخامات والمنتجات النهائية'],'purchases','pos','parties','reports']}
};
/* ملفات واجهات مخصصة للأنشطة الرئيسية الـ17. لا تنشئ مسارات جديدة؛ تستخدم شاشات ORVEX الحالية فقط. */
const ACTIVITY_PROFILES={
 general_trade:{title:'التجارة العامة',subtitle:'إدارة البيع والشراء والمخزون اليومي',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','returns','reports'],focus:['barcode_scan']},
 food_consumer:{title:'المواد الغذائية والاستهلاكية',subtitle:'متابعة المواد سريعة الحركة والصلاحية والمشتريات',layout:'retail',tiles:['pos','stock','purchases','closings','invoices','reports'],focus:['expiry_alerts','weights','batches']},
 fashion:{title:'الملابس والأزياء',subtitle:'إدارة التشكيلات والمقاسات والألوان وحركة القطع',layout:'retail',tiles:['pos','stock','purchases','invoices','returns','reports'],focus:['sizes_colors','variants_matrix']},
 electronics:{title:'الإلكترونيات والأجهزة الكهربائية',subtitle:'متابعة الأجهزة والأرقام التسلسلية والضمان',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['serial_tracking','warranty']},
 phones_telecom:{title:'الهواتف والاتصالات',subtitle:'إدارة الهواتف وملحقاتها وأعمال الصيانة',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['serial_tracking','warranty','repair_orders']},
 automotive:{title:'السيارات وقطع الغيار',subtitle:'إدارة القطع وأرقامها وتوافقها مع المركبات',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['vehicle_fitment','part_number_search']},
 construction:{title:'البناء والإنشاءات',subtitle:'متابعة مواد البناء والكميات والتجهيز للمشاريع',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['delivery_orders','project_quotes','weights']},
 furniture:{title:'الأثاث والمفروشات',subtitle:'إدارة الأطقم والموديلات والتوصيل ومبيعات التقسيط',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['sizes_colors','variants_matrix','delivery_orders','installments']},
 health_pharma:{title:'الصحة والأدوية',subtitle:'متابعة التشغيلات والصلاحية وحركة المستلزمات',layout:'retail',tiles:['pos','stock','purchases','closings','invoices','reports'],focus:['batches','expiry_alerts','barcode_scan']},
 restaurants:{title:'المطاعم والمأكولات',subtitle:'إدارة الطاولات والطلبات ومتابعة تجهيز المطبخ',layout:'restaurant',tiles:['pos','stock','purchases','closings','reports'],focus:['tables','orders','kitchen_display']},
 perfume_beauty:{title:'العطور ومستحضرات التجميل',subtitle:'إدارة المنتجات والعلامات التجارية وتنبيهات الصلاحية',layout:'retail',tiles:['pos','stock','purchases','invoices','returns','reports'],focus:['expiry_alerts','variants_matrix']},
 jewelry_gold:{title:'المجوهرات والذهب',subtitle:'متابعة الوزن والعيار والتسعير والأرقام التسلسلية',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['gold_pricing','weights','serial_tracking']},
 stationery_books:{title:'القرطاسية والمكتبات',subtitle:'إدارة الكتب والقرطاسية والباركود وخدمات الطباعة',layout:'retail',tiles:['pos','stock','purchases','invoices','returns','reports'],focus:['barcode_scan','print_services']},
 professional_services:{title:'الخدمات المهنية',subtitle:'إدارة أوامر الخدمة وعروض الأسعار والعملاء',layout:'services',tiles:['pos','quotes','parties','invoices','reports'],focus:['service_orders','quotes','project_quotes']},
 industrial:{title:'الأنشطة الصناعية',subtitle:'متابعة المواد الخام والتشغيلات وأوامر الإنتاج',layout:'manufacturing',tiles:['stock','purchases','pos','parties','invoices','reports'],focus:['production_orders','bom','batches']},
 agricultural:{title:'الأنشطة الزراعية',subtitle:'إدارة المستلزمات الزراعية والكميات والصلاحية',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:['expiry_alerts','weights','batches']},
 other:{title:'نشاط تجاري',subtitle:'لوحة مرنة قابلة للتخصيص حسب طبيعة النشاط',layout:'retail',tiles:['pos','stock','purchases','parties','invoices','reports'],focus:[]}
};

/* أسماء الميزات (tools) وهل لها شاشة اليوم */
const TOOLS={
 tables:'الطاولات',orders:'الطلبات',kitchen_display:'شاشة المطبخ',
 weights:'الأوزان',expiry_alerts:'تنبيهات الصلاحية',barcode_scan:'مسح الباركود',
 sizes_colors:'المقاسات والألوان',variants_matrix:'مصفوفة الموديلات',
 serial_tracking:'الأرقام التسلسلية',warranty:'الضمان',repair_orders:'أوامر الصيانة',
 vehicle_fitment:'توافق القطع مع السيارات',part_number_search:'بحث برقم القطعة',
 delivery_orders:'أوامر التوصيل',project_quotes:'عروض المشاريع',installments:'التقسيط',
 batches:'التشغيلات',gold_pricing:'تسعير الذهب',print_services:'خدمات الطباعة',
 service_orders:'أوامر الخدمة',quotes:'عروض الأسعار',production_orders:'أوامر الإنتاج',bom:'قوائم المكونات'
};
/* ميزات لها دعم فعلي في النظام الحالي (الباقي قيد التجهيز) */
const READY={barcode_scan:1,batches:1,expiry_alerts:1,serial_tracking:1,quotes:1,production_orders:1,bom:1,warranty:0};

function defaultEnv(){
 /* can/canView/money/fmt/today/db معرّفة بـ const/let في سكربتات التطبيق فلا تظهر على window؛ نصل إليها بالاسم مع حراسة */
 const g=root,safe=(f,d)=>{try{return f()}catch(e){return d}};
 return {
  can:p=>safe(()=>typeof can==='function'?can(p):false,false),
  canView:v=>safe(()=>typeof canView==='function'?canView(v):false,false),
  money:n=>safe(()=>typeof money==='function'?money(n):String(n),String(n)),
  fmt:n=>safe(()=>typeof fmt==='function'?fmt(n):String(n),String(n)),
  hasQuotes:()=>typeof g.quotesModal==='function',
  db:safe(()=>typeof db==='object'?db:null,null),
  today:safe(()=>typeof today==='function'?today():new Date().toISOString().slice(0,10),new Date().toISOString().slice(0,10)),
  expiring:()=>{try{return g.ORVEX_INV2&&typeof g.ORVEX_INV2.expiring==='function'?g.ORVEX_INV2.expiring().length:0}catch(e){return 0}}
 };
}

/* البطاقات الظاهرة لهذا المستخدم حسب نوع الواجهة */
function tilesFor(layout,env){
 const L=LAYOUT[layout]||LAYOUT.retail,out=[];
 L.tiles.forEach(t=>{
  const key=Array.isArray(t)?t[0]:t,d=TILE[key];
  if(!d||!d.ok(env))return;
  out.push({key,label:Array.isArray(t)?t[1]:d.l,sub:Array.isArray(t)?t[2]:d.s,action:d.a,color:d.c});
 });
 return out;
}

/* مؤشرات اليوم؛ تُضاف مؤشرات خاصة حسب إعدادات النشاط */
function kpisFor(settings,env){
 const d=env.db||{sales:[],products:[]},t=env.today,k=[];
 const S=(d.sales||[]).filter(s=>!s.void&&s.date===t);
 const total=S.reduce((a,s)=>a+(+s.total||0),0);
 k.push({l:'مبيعات اليوم',v:env.money(total)});
 k.push({l:'فواتير اليوم',v:env.fmt(S.length)});
 const low=(d.products||[]).filter(p=>p.stock<=p.min).length;
 k.push({l:'تنبيهات المخزون',v:env.fmt(low),warn:low>0});
 const inv=settings&&settings.inventory||{};
 if(inv.track_expiry){const x=env.expiring();k.push({l:'قاربت صلاحيتها',v:env.fmt(x),warn:x>0})}
 return k;
}

/* ميزات النشاط: نظام الميزات (المرحلة 6) إن توفّر، مع tools القديمة غير المكرّرة؛ وإلا tools فقط كما كانت */
function toolList(settings,features){
 const F=root.orvexFeat,screen=c=>!!(F&&F.has(c)),opens=c=>!!(F&&F.has(c)&&!(F.NATIVE&&F.NATIVE[c]));
 const old=Array.isArray(settings&&settings.tools)?settings.tools.filter(x=>TOOLS[x]).map(x=>({code:x,name:TOOLS[x],ready:!!READY[x]||screen(x),open:opens(x)})):[];
 if(!Array.isArray(features))return old;
 const out=features.filter(f=>f&&f.code&&f.name_ar).map(f=>({code:f.code,name:f.name_ar,ready:!!f.has_screen||screen(f.code),open:opens(f.code)})),seen=new Set(out.map(x=>x.code));
 old.forEach(x=>{if(!seen.has(x.code))out.push(x)});
 return out;
}
function panelHtml(settings,info,env){
 env=env||defaultEnv();info=info||{};
 const fallback=LAYOUT[settings&&settings.layout]?settings.layout:'retail';
 const profile=ACTIVITY_PROFILES[info.activityCode]||null;
 const layout=profile&&LAYOUT[profile.layout]?profile.layout:fallback,L=LAYOUT[layout];
 const raw=tilesFor(layout,env),wanted=profile&&Array.isArray(profile.tiles)?profile.tiles:null;
 const ordered=wanted?wanted.map(k=>raw.find(t=>t.key===k)).filter(Boolean):raw;
 const tiles=ordered,kp=kpisFor(settings,env),allTools=toolList(settings,info.features);
 const focus=profile&&profile.focus||[],tools=allTools.slice().sort((a,b)=>(focus.indexOf(a.code)<0?999:focus.indexOf(a.code))-(focus.indexOf(b.code)<0?999:focus.indexOf(b.code)));
 const title=info.name?E(info.name):'لوحة المحل',act=info.activity?E(info.activity):L.title;
 const profileTitle=profile?profile.title:L.title,subtitle=profile?profile.subtitle:'إدارة عمليات المحل من مكان واحد';
 let h='<section id="shopHome" class="sh-wrap sh-profile-'+E(info.activityCode||layout)+'" data-activity="'+E(info.activityCode||layout)+'" aria-label="لوحة المحل">';
 h+='<div class="sh-hero"><div class="sh-hero-copy"><span class="sh-eyebrow">ORVEX · مساحة العمل</span><h2>'+title+'</h2><span class="sh-badge">'+act+'</span><p>'+E(subtitle)+'</p></div><div class="sh-hero-mark" aria-hidden="true">'+E(profileTitle.slice(0,1))+'</div></div>';
 h+='<div class="sh-section-head"><div><b>ملخص اليوم</b><small>مؤشرات الأداء الأساسية</small></div><span class="sh-type">'+E(profileTitle)+'</span></div>';
 h+='<div class="sh-kpis">'+kp.map(x=>'<div class="sh-kpi"><span>'+E(x.l)+'</span><b class="'+(x.warn?'warn':'')+'">'+E(x.v)+'</b></div>').join('')+'</div>';
 if(tiles.length)h+='<div class="sh-section-head"><div><b>العمليات الرئيسية</b><small>اختصارات حسب طبيعة النشاط</small></div></div><div class="sh-tiles">'+tiles.map(t=>'<button type="button" class="sh-tile '+E(t.color)+'" onclick="'+t.action+'"><b>'+E(t.label)+'</b><small>'+E(t.sub)+'</small><span class="sh-tile-arrow" aria-hidden="true">←</span></button>').join('')+'</div>';
 if(tools.length)h+='<div class="sh-tools"><div class="sh-section-head"><div><b>أدوات وتخصصات النشاط</b><small>الميزات المتاحة لهذا التصنيف</small></div></div><div class="sh-chips">'+tools.map(x=>x.open?'<button type="button" class="sh-chip on" onclick="orvexFeat.open(\''+E(x.code)+'\')">'+E(x.name)+'</button>':'<span class="sh-chip'+(x.ready?' on':'')+'">'+E(x.name)+(x.ready?'':' <i>قيد التجهيز</i>')+'</span>').join('')+'</div></div>';
 return h+'</section>';
}

const CSS='.sh-wrap{margin:0 0 16px;padding:clamp(12px,2vw,20px);border:1px solid var(--line,#d8e2e0);border-radius:20px;background:var(--surface,#fff);color:var(--ink,inherit);overflow:hidden}'
+'.sh-hero{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:clamp(14px,2.5vw,22px);border-radius:16px;background:linear-gradient(125deg,rgba(12,106,100,.13),rgba(12,106,100,.035));border:1px solid rgba(12,106,100,.15);margin-bottom:16px}'
+'.sh-eyebrow{font-size:10px;letter-spacing:.08em;color:var(--brand,#0c6a64);font-weight:800}.sh-hero h2{margin:5px 0;font-size:clamp(18px,3vw,24px)}.sh-hero p{margin:8px 0 0;color:var(--muted,#667);font-size:12px;line-height:1.7}'
+'.sh-badge,.sh-type{font-size:11px;padding:3px 10px;border-radius:99px;background:var(--brand,#0c6a64);color:#fff;display:inline-block}.sh-type{background:transparent;color:var(--muted,#667);border:1px solid var(--line,#d8e2e0);white-space:nowrap}'
+'.sh-hero-mark{width:62px;height:62px;flex:0 0 62px;border-radius:18px;display:grid;place-items:center;background:var(--brand,#0c6a64);color:#fff;font-size:30px;font-weight:800;box-shadow:0 8px 24px rgba(12,106,100,.2)}'
+'.sh-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0 8px}.sh-section-head>div{display:flex;flex-direction:column;gap:2px}.sh-section-head b{font-size:13px}.sh-section-head small{font-size:10.5px;color:var(--muted,#667)}'
+'.sh-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin-bottom:14px}.sh-kpi{padding:10px 12px;border-radius:13px;background:var(--bg,#f4f7f6);display:flex;flex-direction:column;gap:4px;min-width:0}.sh-kpi span{font-size:11px;color:var(--muted,#667)}.sh-kpi b{font-size:16px;overflow-wrap:anywhere}.sh-kpi b.warn{color:#c0392b}'
+'.sh-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:9px}.sh-tile{position:relative;border:1px solid var(--line,#d8e2e0);background:var(--surface,#fff);border-radius:14px;padding:13px 14px;text-align:start;display:flex;flex-direction:column;gap:5px;min-height:78px;color:inherit;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}.sh-tile:hover{transform:translateY(-2px);border-color:var(--brand,#0c6a64);box-shadow:0 6px 18px rgba(0,0,0,.06)}.sh-tile b{font-size:13px;padding-inline-end:18px}.sh-tile small{font-size:11px;color:var(--muted,#667)}.sh-tile-arrow{position:absolute;inset-inline-end:12px;top:12px;color:var(--brand,#0c6a64);font-size:16px}'
+'.sh-tools{margin-top:14px}.sh-chips{display:flex;flex-wrap:wrap;gap:7px}.sh-chip{font-size:11.5px;padding:5px 11px;border-radius:99px;border:1px dashed var(--line,#d8e2e0);color:var(--muted,#667)}button.sh-chip{background:none;font:inherit;cursor:pointer;min-height:34px}.sh-chip.on{border-style:solid;color:var(--brand,#0c6a64);background:rgba(12,106,100,.06)}.sh-chip i{font-style:normal;font-size:10px;opacity:.8}'
+'@media(max-width:520px){.sh-hero{padding:13px}.sh-hero-mark{width:48px;height:48px;flex-basis:48px;border-radius:14px;font-size:23px}.sh-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sh-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.sh-tile{min-height:74px;padding:11px}}';

/* ---- الربط بالبرنامج: بعد كل render للرئيسية ---- */
/* state/db معرّفتان بـ const/let في core.js فلا تظهران على window؛ نصل إليهما بالاسم مع حراسة */
function curState(){try{return typeof state==='object'?state:null}catch(e){return null}}
function shopName(){try{const s=typeof db==='object'&&db&&db.settings;return s?(s.shopName||s.name||''):''}catch(e){return ''}}
const S={sid:'',settings:null,info:null,done:false};
async function activityName(sid){
 const A=root.__orvexActivities;
 if(!A)return '';
 try{
  const cur=await A.getShopActivity(sid);if(!cur)return {label:'',code:''};
  const [m,s,p]=await Promise.all([A.loadMain(),A.loadSubs(),A.loadSpecs()]);
  const r=A.resolve(cur,m.items,s,p),main=r.main||r.sub||r.spec;
  return {label:[r.main,r.sub,r.spec].filter(Boolean).map(x=>x.name_ar).join(' ‹ '),code:main&&main.code||''};
 }catch(e){return {label:'',code:''}}
}
async function load(sid){
 S.sid=sid;S.done=false;S.settings=null;S.info=null;
 try{
  const P=root.orvexProfile;
  if(!P)return;
  const st=await P.load();
  if(st&&typeof st==='object'&&P.shop===sid){
   S.settings=st;
   const activity=await activityName(sid);
   S.info={name:shopName(),activity:activity.label,activityCode:activity.code,features:P.features};
  }
 }catch(e){}
 S.done=true;
 {const state=curState();if(S.settings&&typeof root.render==='function'&&state&&state.view==='home')root.render()}
}
function currentShop(){
 const b=root.__orvexAcct;
 try{return b&&typeof b.shop==='function'?b.shop():''}catch(e){return ''}
}
function inject(){
 const state=curState();
 if(typeof document==='undefined'||!state||state.view!=='home')return;
 const sid=currentShop();
 if(!sid){S.sid='';return}
 if(S.sid!==sid){load(sid);return}
 if(!S.done||!S.settings)return;
 const host=document.querySelector('#main .od-home-main')||document.querySelector('#main .od-page');
 if(!host)return;
 const old=document.getElementById('shopHome');if(old)old.remove();
 if(!document.getElementById('shopHomeCss')){const st=document.createElement('style');st.id='shopHomeCss';st.textContent=CSS;document.head.appendChild(st)}
 host.insertAdjacentHTML('afterbegin',panelHtml(S.settings,S.info));
}
if(typeof root.render==='function'){
 const _r=root.render;
 root.render=function(){const r=_r.apply(this,arguments);try{inject()}catch(e){}return r};
 /* render معرّفة كدالة عامة في core.js؛ إسناد window.render يغيّر الربط العام نفسه */
 try{render=root.render}catch(e){}
}
root.__orvexShopHome={defaultEnv,curState,shopName,toolList,tilesFor,kpisFor,panelHtml,LAYOUT,TOOLS,ACTIVITY_PROFILES,refresh:()=>{S.sid=''}};
})();
