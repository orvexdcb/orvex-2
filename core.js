
/* ================= البيانات ================= */
const SEED=(()=>{try{const e=document.getElementById('seed');return e?JSON.parse(e.textContent):null}catch(e){return null}})();
const KEY=SEED&&SEED.key?SEED.key:'sales_system_v1';
function fresh(){return{settings:{name:'متجري',currency:'د.ع',tax:0,prefix:'INV-',next:1001,nextPo:501,nextRt:1,phone:'',address:'',taxNo:'',cashier:'',reps:[],posTheme:'orvex',posLayout:'grid'},users:[],products:[],customers:[],suppliers:[],sales:[],purchases:[],expenses:[],payments:[],returns:[],shops:[],closings:[],audit:[],employees:[],payroll:[],attendance:[],leaves:[],advances:[],empPay:[],assets:[],coupons:[],quotes:[],warehouses:[],transfers:[],stocktakes:[],approvals:[],journals:[],coa:[],bankAccts:[],bankRecs:[],loyTx:[],boms:[],prodOrders:[],repScheds:[],repRuns:[],preturns:[]}}
/* يُعرَّف هنا (لا في demo.js): load() أدناه تُنفَّذ عند تحميل هذا الملف، قبل بقية الملفات */
function normalize(d){const o=Object.assign(fresh(),d,{settings:Object.assign(fresh().settings,d.settings||{})});{const tx=parseFloat(o.settings.tax);o.settings.tax=(o.settings.taxOn===true&&isFinite(tx)&&tx>0&&tx<=100)?Math.round(tx*100)/100:0;if(o.settings.tax===0&&o.settings.taxOn!==true)o.settings.taxOn=false}if(!o.settings.posTheme||o.settings.posTheme==='emerald')o.settings.posTheme='orvex';if(!Array.isArray(o.shops))o.shops=[];if(!Array.isArray(o.closings))o.closings=[];
  if(!o.edition){const a=(o.users||[]).find(u=>u.admin);if(a&&!o.users.some(u=>u.designer))a.designer=true;o.edition='studio'}
  return o}
/* db مؤقتة إلى أن يكتمل initData() (تُستدعى من boot قبل أي واجهة). التخزين: انظر storage.js */
let db=normalize(fresh());
function save(){Store.save((typeof state!=='undefined'&&state.prevKey)||KEY,db)}
Store.onError=()=>toast('تعذّر الحفظ في المتصفح. انسخ نسخة احتياطية من الإعدادات');
async function initData(){
  let r=null;
  try{await Store.init();r=await Store.loadDb(KEY)}
  catch(e){Store.lock();toast('تعذّر فتح التخزين المحلي. لن تُحفظ التغييرات على هذا الجهاز حتى تعيد تحميل الصفحة.');return}
  let loaded=null;
  if(r&&r.data){try{loaded=normalize(r.data)}catch(e){r={corrupt:true,raw:JSON.stringify(r.data)}}}
  if(r&&r.corrupt){
    try{await Store.putBackup('corrupt_'+Date.now(),r.raw||'')}catch(e){}
    if(!r.legacy){ /* تلف في سجلات IDB نفسها: لا نكتب فوق ما بقي. وضع قراءة فقط، والنسخة الكاملة محفوظة */
      Store.lock();
      toast('بعض بيانات التخزين المحلي مفقودة أو تالفة. أوقفنا الحفظ كي لا نكتب فوق ما بقي، وحُفظت نسخة كاملة. لا تُدخل بيانات جديدة؛ تواصل مع الدعم لاستعادتها.');
      return;
    }
    toast('تعذّرت قراءة البيانات المحلية فبدأنا ببيانات جديدة. حُفظت نسخة من البيانات التالفة.');
  }
  if(loaded)db=loaded;
  else if(SEED&&SEED.db){try{db=normalize(JSON.parse(JSON.stringify(SEED.db)))}catch(e){}}
  if(loaded&&r.legacy){try{await Store.migrateLegacy(KEY,db,r.raw)}catch(e){toast('تعذّر ترحيل البيانات إلى التخزين الجديد. بياناتك القديمة سليمة؛ أعد تحميل الصفحة للمحاولة مجددًا.')}}
  Store.enable();
  Store.cleanup().catch(()=>{});
}

/* ================= أدوات ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// jsq: نص آمن داخل '...' في onclick (المتصفح يفك كيانات HTML قبل JS، فلا يكفي esc هناك). الناتج [\w-] وتهريبات \xHH/\uHHHH فقط.
const jsq=s=>String(s??'').replace(/[^\w-]/g,c=>{const n=c.charCodeAt(0);return n<256?'\\x'+n.toString(16).padStart(2,'0'):'\\u'+n.toString(16).padStart(4,'0')});
// safeImg: يقبل data:image أو https فقط؛ غير ذلك يعاد '' (فلا يُرسم الوسم)
const safeImg=u=>{u=String(u??'');return /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+|https:\/\/[^\s"'<>\\]+)$/.test(u)?u:''};
const num=v=>{const n=parseFloat(String(v??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫]/g,'.'));return isNaN(n)?0:n};
const r2=n=>{n=+n;if(!isFinite(n))return 0;const s=n<0?-1:1;return s*Math.round(Math.abs(n)*100*(1+4*Number.EPSILON))/100};
const fmt=n=>r2(n).toLocaleString('en-US',{maximumFractionDigits:2});
const money=n=>fmt(n)+' '+db.settings.currency;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
/* ترقيم المستندات: أرقام محجوزة من الخادم (بلا تكرار بين الأجهزة). بدون خادم يُستخدم العداد المحلي كما كان. */
function nextNo(kind){const F={inv:'next',po:'nextPo',rt:'nextRt'}[kind],pre={inv:db.settings.prefix,po:'PUR-',rt:'RT-'}[kind],P=window.__numPool=window.__numPool||{},a=P[kind];
 if(a&&a.length){const n=a.shift();if(window.__numSave)window.__numSave();if(window.__numRefill)window.__numRefill();return pre+n}
 if(!window.__numOnline)return pre+db.settings[F]++;
 let d='';try{d=(localStorage.getItem(KEY+'_devid')||'').slice(0,3)}catch(e){}
 return pre+'L'+d+'-'+db.settings[F]++}
const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
const ymd=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const today=()=>ymd(new Date());
const prod=id=>db.products.find(p=>p.id===id);
const cust=id=>db.customers.find(c=>c.id===id);
const supp=id=>db.suppliers.find(c=>c.id===id);
const fdate=d=>new Date(d+'T12:00:00').toLocaleDateString('ar-SA-u-nu-latn',{day:'numeric',month:'short',year:'numeric'});
function inRange(d,p){if(p==='all')return true;const now=new Date(),t=ymd(now);if(p==='today')return d===t;if(p==='week'){const s=new Date(now);s.setDate(s.getDate()-6);return d>=ymd(s)&&d<=t}if(p==='month')return d.slice(0,7)===t.slice(0,7);return true}
const PERIODS=[['today','اليوم'],['week','آخر 7 أيام'],['month','هذا الشهر'],['all','الكل']];
const chips=(items,cur,fn)=>`<div class="chips">${items.map(([k,l])=>`<button class="chip ${k===cur?'on':''}" onclick="${fn}('${jsq(k)}')">${esc(l)}</button>`).join('')}</div>`;
const empty=(m,a='')=>`<div class="empty">${m}${a?'<div style="margin-top:12px">'+a+'</div>':''}</div>`;
function toast(m){document.querySelectorAll('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function modal(title,body){closeModal();const m=document.createElement('div');m.id='modal';m.innerHTML=`<div class="scrim" onclick="closeModal()"></div><div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sh-head"><h2>${esc(title)}</h2><button class="x no-print" onclick="closeModal()" aria-label="إغلاق">✕</button></div><div class="sh-body">${body}</div></div>`;document.body.appendChild(m);document.body.classList.add('noscroll','hasmodal')}
function closeModal(){const m=$('#modal');if(m)m.remove();document.body.classList.remove('noscroll','hasmodal')}
function setBody(h){$('#modal .sh-body').innerHTML=h}
let _cf=null;
function askConfirm(msg,fn,label){_cf=fn;modal('تأكيد',`<p>${esc(msg)}</p><div class="actions"><button class="btn danger" onclick="const f=_cf;closeModal();if(f)f()">${label||'تأكيد'}</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`)}

/* ================= الحالة والتنقل ================= */
const state={view:'home',period:'month',partyTab:'c',cart:[],posQ:'',posCat:'الكل',co:{cid:'',disc:0,method:'cash',paid:null},invQ:'',stockQ:'',expPeriod:'month',rep:{from:today().slice(0,8)+'01',to:today()},pur:null};
const IC={
 home:'<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 22V12h6v10"/>',
 pos:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
 stock:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
 parties:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M17 4.5a3.5 3.5 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6"/>',
 more:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 invoices:'<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
 purchases:'<path d="M3 7h13v10H3zM16 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
 expenses:'<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>',
 reports:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
IC.site='<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>';
const svg=k=>`<svg class="ic" viewBox="0 0 24 24">${IC[k]}</svg>`;
const NAV=[['home','الرئيسية'],['pos','البيع'],['stock','المخزون'],['parties','العملاء'],['studio','المصمم'],['more','المزيد']];
const TITLES={pos:'نقطة البيع',stock:'المخزون',parties:'العملاء والموردون',more:'المزيد',invoices:'الفواتير',purchases:'المشتريات',expenses:'المصروفات',reports:'التقارير',settings:'الإعدادات',returns:'المرتجعات',users:'المستخدمون',site:'الموقع الإلكتروني'};
function go(v){
  if(!canView(v)){toast('ليست لديك صلاحية للوصول إلى هذه الشاشة');return}
  pushRecent(v);
  if(v==='pos'){openPos();return}
  state.view=v;render();window.scrollTo(0,0);
}
function render(){
  if(!curUser())return;
  if(!canView(state.view))state.view='home';
  const isTab=NAV.some(n=>n[0]===state.view);
  $('#title').textContent=state.view==='home'?db.settings.name:TITLES[state.view];
  $('#back').style.display=isTab?'none':'flex';
  $('#today').textContent=curUser().name+' - '+new Date().toLocaleDateString('ar-SA-u-nu-latn',{weekday:'long',day:'numeric',month:'long'});
  const act=isTab?state.view:'more';
  $('#nav').innerHTML=navItems().map(([k,l])=>`<button class="${k===act?'on':''}" onclick="go('${jsq(k)}')">${svg(k)}${l}</button>`).join('');
  document.body.classList.toggle('deskhome',state.view==='home'&&isAdmin());
  const inner=(state.view==='home'&&isAdmin())?VIEWS.home():`<section class="od-page"><h2 class="od-pt">${esc(state.view==='home'?db.settings.name:TITLES[state.view])}</h2>${VIEWS[state.view]()}</section>`;
  $('#main').innerHTML=previewBar()+odShell(inner);document.body.classList.add('odapp');
  if($('#pos'))posRender();
}

