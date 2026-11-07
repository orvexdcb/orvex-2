/* ORVEX — مدير المجمع التجاري (المرحلة 1 + 2)
   1) واجهة المؤسس: إنشاء/تعديل/تعطيل/حذف حساب مدير مجمع، وتحديد المحلات المصرّح بها.
   2) لوحة مدير المجمع (قراءة فقط): محلاته المصرّح بها، مبيعات اليوم/الشهر، وتفاصيل كل محل.
   كل التحقق الفعلي في قاعدة البيانات (migrations/20261103_mall_manager_phase1.sql).
   يُحمَّل بعد server.js. */
(function(){
'use strict';
const SB=()=>window.__orvexSync.SB;
const rq=(p,o)=>window.__orvexRequest(p,o);
const rpc=(n,a)=>rq('/rest/v1/rpc/'+n,{method:'POST',body:JSON.stringify(a||{})});
const fn=b=>rq('/functions/v1/orvex-mall-admin',{method:'POST',body:JSON.stringify(b)});
const UN=/^[a-z0-9_.-]{3,30}$/;
const FOUNDER=()=>!!(window.orvexRole&&window.orvexRole.founder());
let MALLS=[],SHOPS=[];

/* ---------------- واجهة المؤسس ---------------- */
async function loadMalls(){
  const b=$('#mallBox');if(!b||!FOUNDER())return;
  try{
    MALLS=await rpc('mall_admin_list');
    b.innerHTML='<h3>مدراء المجمعات التجارية</h3><p class="muted" style="margin-top:0;font-size:13px">حساب للقراءة فقط يطّلع على مبيعات المحلات التي تحددها له.</p>'
      +(MALLS.length?MALLS.map(m=>{const g=m.manager;
        return `<button class="row tap" onclick="mallMenu('${jsq(m.id)}')"><div class="grow"><div class="t">${esc(m.name)}</div><small>المدير: ${g?esc(g.full_name)+' (@'+esc(g.username)+')':'-'} · ${m.shop_ids.length} محل</small></div><span class="badge ${m.active?'':'grey'}">${m.active?'فعّال':'معطّل'}</span></button>`}).join('')
        :'<p class="muted">لا توجد مجمعات بعد.</p>')
      +'<div class="actions"><button class="btn primary" onclick="mallForm()">+ مجمع جديد</button><button class="btn" onclick="mallAudit()">فحص الأمان</button></div>';
  }catch(e){b.innerHTML='<h3>مدراء المجمعات التجارية</h3><p class="muted">'+esc(/mall_admin_list|PGRST202|Could not find/i.test(e.message)?'نفّذ ملف قاعدة البيانات الخاص بالمجمعات أولًا.':e.message)+'</p>'}
}
const _vs=VIEWS.studio;
VIEWS.studio=function(){
  const h=_vs.apply(this,arguments);
  if(typeof h==='string'&&h.includes('id="shopList"')){
    setTimeout(loadMalls,110);
    return h.replace('<button class="fab"','<div class="card" id="mallBox"><p class="muted">جارٍ التحميل…</p></div><button class="fab"');
  }
  return h;
};

window.mallForm=function(){
  modal('مجمع جديد',`<label>اسم المجمع التجاري</label><input id="ml_n">
  <label>اسم المدير</label><input id="ml_fn">
  <div class="f2"><div><label>اسم المستخدم</label><input id="ml_u" autocapitalize="off" autocomplete="off" style="direction:ltr;text-align:left"></div><div><label>كلمة المرور (8+)</label><input id="ml_p" type="password" autocomplete="new-password"></div></div>
  <label>هاتف المدير (اختياري)</label><input id="ml_h" type="tel">
  <p class="muted" style="font-size:12.5px">بعد الإنشاء تحدد المحلات التي يحق له الاطلاع عليها.</p>
  <div class="actions"><button class="btn primary" id="ml_go" onclick="mallCreate()">إنشاء</button></div>`);
};
window.mallCreate=async function(){
  const name=$('#ml_n').value.trim(),full=$('#ml_fn').value.trim(),un=$('#ml_u').value.trim().toLowerCase(),pw=$('#ml_p').value,phone=$('#ml_h').value.trim();
  if(!name)return toast('أدخل اسم المجمع');
  if(!full)return toast('أدخل اسم المدير');
  if(!UN.test(un))return toast('اسم المستخدم 3-30 حرفًا إنجليزيًا/أرقام بدون مسافات');
  if(pw.length<8)return toast('كلمة المرور 8 أحرف على الأقل');
  const btn=$('#ml_go');btn.disabled=true;
  try{
    const r=await fn({action:'create',mall_name:name,full_name:full,username:un,password:pw,phone});
    await loadMalls();toast('تم إنشاء حساب مدير المجمع');mallShops(r.mall_id);
  }catch(e){btn.disabled=false;toast(e.message)}
};
const getMall=id=>MALLS.find(m=>m.id===id);

window.mallMenu=function(id){
  const m=getMall(id);if(!m)return;const g=m.manager||{};
  modal('إدارة المجمع',`<label>اسم المجمع</label><input id="mm_n" value="${esc(m.name)}">
  <label>اسم المدير</label><input id="mm_fn" value="${esc(g.full_name||'')}">
  <div class="f2"><div><label>اسم المستخدم</label><input id="mm_u" value="${esc(g.username||'')}" autocapitalize="off" style="direction:ltr;text-align:left"></div><div><label>كلمة مرور جديدة</label><input id="mm_p" type="password" autocomplete="new-password" placeholder="اتركها فارغة"></div></div>
  <label>هاتف المدير</label><input id="mm_h" type="tel" value="${esc(g.phone||'')}">
  <label class="pchk" style="border:0"><input type="checkbox" id="mm_a" ${m.active?'checked':''}> الحساب فعّال (إلغاؤه يمنع الدخول وقراءة البيانات فورًا)</label>
  <div class="actions"><button class="btn primary" id="mm_go" onclick="mallSave('${jsq(id)}')">حفظ</button></div>
  <div class="actions"><button class="btn" onclick="mallShops('${jsq(id)}')">المحلات المصرّح بها (${m.shop_ids.length})</button></div>
  <div class="actions"><button class="btn danger" onclick="mallDel('${jsq(id)}')">حذف المجمع وحساب المدير</button></div>`);
};
window.mallSave=async function(id){
  const m=getMall(id);if(!m)return;const g=m.manager||{};
  const name=$('#mm_n').value.trim(),full=$('#mm_fn').value.trim(),un=$('#mm_u').value.trim().toLowerCase(),pw=$('#mm_p').value,phone=$('#mm_h').value.trim(),act=$('#mm_a').checked;
  if(!name)return toast('أدخل اسم المجمع');
  if(!full)return toast('أدخل اسم المدير');
  if(!UN.test(un))return toast('اسم المستخدم 3-30 حرفًا إنجليزيًا/أرقام بدون مسافات');
  if(pw&&pw.length<8)return toast('كلمة المرور 8 أحرف على الأقل');
  const b={action:'update',mall_id:id};
  if(name!==m.name)b.mall_name=name;
  if(full!==g.full_name)b.full_name=full;
  if(un!==g.username)b.username=un;
  if(phone!==(g.phone||''))b.phone=phone;
  if(pw)b.password=pw;
  if(act!==m.active)b.active=act;
  if(Object.keys(b).length<3){closeModal();return}
  const btn=$('#mm_go');btn.disabled=true;
  try{await fn(b);closeModal();await loadMalls();toast('تم الحفظ')}catch(e){btn.disabled=false;toast(e.message)}
};
window.mallDel=function(id){
  const m=getMall(id);if(!m)return;
  askConfirm('حذف المجمع «'+m.name+'» وحساب مديره نهائيًا؟ لن تتأثر المحلات ولا بياناتها.',async()=>{
    try{await fn({action:'delete',mall_id:id});toast('تم الحذف');loadMalls()}catch(e){toast(e.message)}
  },'حذف');
};

/* تحديد المحلات: كل تبديل يُحفظ فورًا ويسري في أي وقت */
window.mallShops=async function(id){
  const m=getMall(id);if(!m)return;
  modal('محلات «'+m.name+'»','<p class="muted">جارٍ التحميل…</p>');
  try{
    SHOPS=await rq('/rest/v1/shops?select=id,name&order=name');
    const ids=new Set(m.shop_ids);
    setBody(`<p class="muted" style="margin-top:0;font-size:13px">المحلات المحددة فقط يستطيع المدير الاطلاع عليها (قراءة فقط). يُحفظ كل تغيير فورًا.</p>
    <input id="ms_q" placeholder="بحث باسم المحل" oninput="mallFilter()">
    <p class="muted" style="font-size:13px" id="ms_c"></p>
    <div class="card" id="ms_l" style="padding:4px 12px">${SHOPS.length?SHOPS.map(s=>`<label class="pchk" data-n="${esc(s.name.toLowerCase())}"><input type="checkbox" ${ids.has(String(s.id))?'checked':''} onchange="mallToggle('${jsq(id)}','${jsq(String(s.id))}',this)"> ${esc(s.name)}</label>`).join(''):'<p class="muted">لا توجد محلات.</p>'}</div>
    <div class="actions"><button class="btn" onclick="mallMenu('${jsq(id)}')">رجوع</button></div>`);
    mallCount(id);
  }catch(e){setBody('<p class="muted">'+esc(e.message)+'</p>')}
};
window.mallFilter=function(){const q=($('#ms_q').value||'').trim().toLowerCase();document.querySelectorAll('#ms_l label').forEach(l=>{l.style.display=!q||l.dataset.n.includes(q)?'':'none'})};
function mallCount(id){const m=getMall(id),c=$('#ms_c');if(m&&c)c.textContent='المحلات المصرّح بها: '+m.shop_ids.length}
window.mallToggle=async function(id,shop,el){
  const m=getMall(id);if(!m)return;const want=el.checked;el.disabled=true;
  try{
    await rpc('mall_set_shop',{p_mall:id,p_shop:shop,p_allowed:want});
    m.shop_ids=want?[...new Set([...m.shop_ids,shop])]:m.shop_ids.filter(x=>x!==shop);
    mallCount(id);loadMalls();
  }catch(e){el.checked=!want;toast(e.message)}
  finally{el.disabled=false}
};

/* فحص الأمان: يكشف ما لا يستطيع حاجز المجمع سدّه وحده (جداول بلا RLS، views، دوال definer) */
window.mallAudit=async function(){
  modal('فحص أمان المجمعات','<p class="muted">جارٍ الفحص…</p>');
  try{
    const a=await rpc('mall_security_audit');
    const sec=(ok,title,why,items)=>`<div class="card" style="padding:10px 12px"><div class="row"><div class="grow"><div class="t" style="white-space:normal">${title}</div><small>${why}</small></div><span class="badge ${ok?'':'grey'}">${ok?'سليم':items.length}</span></div>${ok?'':`<div style="margin-top:6px;direction:ltr;text-align:left;font-size:12.5px;word-break:break-all">${items.map(esc).join('<br>')}</div>`}</div>`;
    const risky=a.functions.filter(f=>!f.self_check).map(f=>f.name+'('+f.args+')');
    setBody(`<p class="muted" style="margin-top:0;font-size:13px">الحاجز يمنع مدير المجمع من كل جدول عليه RLS. البنود التالية تحتاج مراجعتك لأن الحاجز لا يغطيها.</p>
    ${sec(!a.tables_no_rls.length,'جداول بلا RLS','يقرؤها أي حساب مسجّل. فعّل RLS ثم أعد تنفيذ ملف المرحلة 3.',a.tables_no_rls)}
    ${sec(!a.tables_unguarded.length,'جداول بلا حاجز المجمع','أعد تنفيذ ملف قاعدة بيانات المرحلة 3.',a.tables_unguarded)}
    ${sec(!a.views.length,'Views تتجاوز RLS','اجعلها security_invoker أو اسحب صلاحية SELECT منها.',a.views)}
    ${sec(!risky.length,'دوال security definer بلا تحقق من المستخدم','أضف السطر perform public.mall_deny(); في أولها.',risky)}
    <p class="muted" style="font-size:12.5px">دوال تتحقق من المستخدم داخليًا: ${a.functions.length-risky.length}</p>`);
  }catch(e){setBody('<p class="muted">'+esc(/mall_security_audit|PGRST202|Could not find/i.test(e.message)?'نفّذ ملف قاعدة بيانات المرحلة 3 أولًا.':e.message)+'</p>')}
};

/* ---------------- لوحة مدير المجمع (قراءة فقط) ---------------- */
const st=document.createElement('style');
st.textContent=`#mallapp{position:fixed;inset:0;z-index:90;background:#f4f8f5;color:#12372a;overflow:auto;-webkit-overflow-scrolling:touch}
:root[data-theme="dark"] #mallapp{background:#0b1512;color:#e8f3ec}
#mallapp .mh{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border-bottom:1px solid #d9e8df}
:root[data-theme="dark"] #mallapp .mh{background:#10291d;border-color:#294237}
#mallapp .mh img{width:34px;height:34px;border-radius:9px}
#mallapp .mh .grow{min-width:0}
#mallapp .mh .t{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mallapp .mh small,#mallapp .upd{color:#647c70}
:root[data-theme="dark"] #mallapp .mh small,:root[data-theme="dark"] #mallapp .upd{color:#9ab2a4}
#mallapp .mb{max-width:860px;margin:0 auto;padding:14px 14px 40px}
#mallapp .row{display:flex;align-items:center;gap:10px}
#mallapp .mk{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px}
#mallapp .mk>.card{margin:0;min-width:0}
#mallapp .mk small{display:block;color:#647c70}
:root[data-theme="dark"] #mallapp .mk small{color:#9ab2a4}
#mallapp .mk b{display:block;font-size:clamp(16px,4.6vw,21px);margin:4px 0;overflow-wrap:anywhere}
#mallapp .bar{height:5px;border-radius:3px;background:#087a43;margin-top:4px;min-width:2px;margin-inline-start:auto}
#mallapp h3{border:0;padding:0}
#mallapp td{vertical-align:middle}
:root[data-theme="dark"] #mallapp .bar{background:#54d28b}
#mallapp .upd{font-size:12px;text-align:center;margin:8px 0 0}
#mallapp select,#mallapp input[type=date]{width:100%}
@media(max-width:480px){#mallapp .mh{flex-wrap:wrap}#mallapp .mh .grow{flex:1 1 calc(100% - 50px)}#mallapp .mh .btn{flex:1;padding:8px 10px;white-space:nowrap}}`;
document.head.appendChild(st);

const MN=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const nf=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2});
const V={day:'',month:'',view:'home',shop:null,mode:'day',dm:'',dy:'',seq:0,timer:null};
const monthSel=(id,val,fn)=>`<select id="${id}" onchange="${fn}">${MN.map((n,i)=>{const v=String(i+1).padStart(2,'0');return `<option value="${v}" ${v===val?'selected':''}>${n}</option>`}).join('')}</select>`;
const yearSel=(id,val,fn)=>{const y=+today().slice(0,4),a=[];for(let k=y;k>=y-5;k--)a.push(k);return `<select id="${id}" onchange="${fn}">${a.map(k=>`<option ${String(k)===val?'selected':''}>${k}</option>`).join('')}</select>`};
/* إجماليات حسب العملة (لا نجمع عملات مختلفة معًا) */
function byCur(shops,tk,ck){const o={};shops.forEach(s=>{const x=o[s.currency]=o[s.currency]||{t:0,n:0};x.t+=+s[tk]||0;x.n+=+s[ck]||0});return o}
const curTxt=o=>Object.entries(o).map(([c,x])=>nf(x.t)+' '+esc(c)).join(' + ')||'0';
const cntTxt=o=>Object.values(o).reduce((a,x)=>a+x.n,0);
const gd=(k,o)=>new Date(k+'T12:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',o);
const hhmm=()=>new Date().toLocaleTimeString('ar-SA-u-nu-latn',{hour:'2-digit',minute:'2-digit'});
const errBox=e=>`<div class="card"><p>${esc(e.message||'تعذّر التحميل')}</p><div class="actions"><button class="btn" onclick="orvexMall.refresh()">إعادة المحاولة</button></div></div>`;
const stamp=()=>{const u=$('#mk_upd');if(u)u.textContent='آخر تحديث '+hhmm()+' · يتحدث تلقائيًا كل 30 ثانية'};

function rm(){clearInterval(V.timer);V.timer=null;const o=document.getElementById('mallapp');if(o)o.remove()}
function shell(name){
  const S=SB(),me=S.me||{};
  rm();const d=document.createElement('div');d.id='mallapp';
  d.innerHTML=`<div class="mh"><img src="icon-192.png" alt="ORVEX"><div class="grow"><div class="t">${esc(name||'مدير المجمع')}</div><small>${esc(me.name||'')} · @${esc(me.username||'')}</small></div><button class="btn" onclick="pwModal()">كلمة المرور</button><button class="btn" onclick="orvexMall.logout()">خروج</button></div><div class="mb" id="mall_b"></div>`;
  document.body.appendChild(d);
  V.timer=setInterval(()=>{if(!document.hidden&&document.getElementById('mallapp')&&SB().sess)load(true)},30000);
}

/* ----- الرئيسية: كل المحلات ----- */
function showHome(){
  V.view='home';V.seq++;
  const [y,m]=V.month.split('-');
  $('#mall_b').innerHTML=`<div class="card no-print"><label>يوم محدد</label><input type="date" id="mf_d" value="${esc(V.day)}" onchange="orvexMall.setDay(this.value)">
  <label>شهر محدد</label><div class="f2">${monthSel('mf_m',m,'orvexMall.setMonth()')}${yearSel('mf_y',y,'orvexMall.setMonth()')}</div></div>
  <div id="mk_data"><p class="muted">جارٍ التحميل…</p></div><p class="upd" id="mk_upd"></p>`;
  load();
}
function fillHome(r){
  const sh=r.shops,box=$('#mk_data');if(!box)return;
  if(!sh.length){box.innerHTML='<div class="note">حساب للقراءة فقط.</div>'+empty('لم يحدد المؤسس أي محل بعد.');return}
  const d=byCur(sh,'day_total','day_count'),mo=byCur(sh,'month_total','month_count'),[y,m]=r.month.split('-');
  box.innerHTML=`<div class="mk"><div class="card"><small>مبيعات ${esc(gd(r.day,{day:'numeric',month:'long',year:'numeric'}))}</small><b>${curTxt(d)}</b><small>${cntTxt(d)} فاتورة · كل المحلات</small></div>
  <div class="card"><small>مبيعات ${MN[+m-1]} ${y}</small><b>${curTxt(mo)}</b><small>${cntTxt(mo)} فاتورة · كل المحلات</small></div></div>
  <div class="card"><div class="row" style="margin-bottom:6px"><h3 class="grow" style="margin:0">المحلات المصرّح بها</h3><span class="badge">${sh.length}</span></div>
  ${sh.map(s=>`<button class="row tap" onclick="orvexMall.openShop('${jsq(s.id)}')"><div class="grow" style="min-width:0"><div class="t">${esc(s.name)}</div><small>اليوم: ${nf(s.day_total)} ${esc(s.currency)} (${s.day_count}) · الشهر: ${nf(s.month_total)} ${esc(s.currency)} (${s.month_count})</small></div><span class="muted">‹</span></button>`).join('')}</div>`;
  V.data=r;stamp();
}

/* ----- تفاصيل محل ----- */
function showShop(){
  V.view='shop';V.seq++;
  const [y,m]=V.dm.split('-');
  const per=V.mode==='day'?`<div class="f2">${monthSel('sd_m',m,'orvexMall.setDM()')}${yearSel('sd_y',y,'orvexMall.setDM()')}</div>`:yearSel('sd_y',V.dy,'orvexMall.setDY()');
  $('#mall_b').innerHTML=`<div class="row" style="margin-bottom:10px"><button class="btn" onclick="orvexMall.back()">‹ رجوع</button><h3 class="grow" style="margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(V.shop.name)}</h3></div>
  <div class="card no-print">${chips([['day','حسب اليوم'],['month','حسب الشهر']],V.mode,'orvexMall.setMode')}<label>${V.mode==='day'?'الشهر':'السنة'}</label>${per}</div>
  <div id="mk_data"><p class="muted">جارٍ التحميل…</p></div><p class="upd" id="mk_upd"></p>`;
  load();
}
function keysFor(r){ /* كل الأيام/الأشهر في الفترة (حتى اليوم إن كانت الحالية) مع الأصفار */
  const t=today(),ks=[];
  if(r.mode==='day'){const [y,m]=r.period.split('-').map(Number),n=new Date(y,m,0).getDate();for(let d=1;d<=n;d++){const k=r.period+'-'+String(d).padStart(2,'0');if(k<=t)ks.push(k)}}
  else for(let m=1;m<=12;m++){const k=r.period+'-'+String(m).padStart(2,'0');if(k<=t.slice(0,7))ks.push(k)}
  return ks.reverse();
}
function fillShop(r){
  const box=$('#mk_data');if(!box)return;const c=esc(r.shop.currency),by={};r.rows.forEach(x=>by[x.k]=x);
  const rows=keysFor(r).map(k=>by[k]||{k,total:0,count:0,avg:0}),mx=Math.max(1,...rows.map(x=>+x.total||0));
  const lab=k=>r.mode==='day'?gd(k,{weekday:'short',day:'numeric'}):MN[+k.slice(5,7)-1];
  box.innerHTML=`<div class="mk"><div class="card"><small>إجمالي المبيعات</small><b>${nf(r.total)} ${c}</b></div><div class="card"><small>عدد الفواتير</small><b>${r.count}</b></div><div class="card"><small>متوسط الفاتورة</small><b>${nf(r.avg)} ${c}</b></div></div>
  ${rows.length?`<div class="table-wrap"><table><tr><th>${r.mode==='day'?'اليوم':'الشهر'}</th><th class="n">الفواتير</th><th class="n">المبيعات</th><th class="n">المتوسط</th></tr>${rows.map(x=>`<tr><td>${esc(lab(x.k))}</td><td class="n">${x.count}</td><td class="n">${nf(x.total)}${+x.total>0?`<div class="bar" style="width:${Math.round((+x.total||0)/mx*100)}%"></div>`:''}</td><td class="n">${nf(x.avg)}</td></tr>`).join('')}</table></div>`:empty('لا توجد بيانات في هذه الفترة')}`;
  stamp();
}

/* ----- التحميل (يتجاهل الردود المتأخرة) ----- */
async function load(silent){
  const my=++V.seq,view=V.view;
  try{
    if(view==='home'){const r=await rpc('mall_sales_overview',{p_day:V.day,p_month:V.month});if(my===V.seq)fillHome(r)}
    else{const r=await rpc('mall_shop_sales',{p_shop:V.shop.id,p_mode:V.mode,p_period:V.mode==='day'?V.dm:V.dy});if(my===V.seq)fillShop(r)}
  }catch(e){
    if(my!==V.seq)return;
    if(silent){const u=$('#mk_upd');if(u)u.textContent='تعذّر التحديث: '+(e.message||'');return}
    const b=$('#mk_data')||$('#mall_b');if(b)b.innerHTML=errBox(e);
  }
}

async function enter(){
  const r=await rpc('mall_my_shops'); /* يرمي خطأ إن لم يكن الحساب صالحًا فيبقى المستخدم في شاشة الدخول */
  const a=document.getElementById('auth');if(a)a.remove();
  V.day=today();V.month=V.day.slice(0,7);V.dm=V.month;V.dy=V.month.slice(0,4);V.shop=null;V.mode='day';
  shell(r.mall.name);showHome();
}
function logout(){
  /* لا نستخدم logout() العام عمدًا: لا نريد مسح بيانات محل محفوظة على الجهاز لم تُزامَن */
  const S=SB();clearTimeout(S.retryTimer);
  S.sess=S.prof=S.me=S.shop=null;S.authExpired=false;S.authWarned=false;
  rm();showAuth();
}
window.addEventListener('online',()=>{if(document.getElementById('mallapp')&&SB().sess)load(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('mallapp')&&SB().sess)load(true)});
const _sa=showAuth;showAuth=function(){rm();return _sa.apply(this,arguments)};
window.orvexMall={enter,logout,refresh:()=>load(),
  setDay(v){if(!v)return;V.day=v;load()},
  setMonth(){V.month=$('#mf_y').value+'-'+$('#mf_m').value;load()},
  openShop(id){const s=((V.data||{}).shops||[]).find(x=>x.id===id);if(!s)return;V.shop=s;V.mode='day';V.dm=V.month;V.dy=V.month.slice(0,4);showShop()},
  back(){showHome()},
  setMode(m){V.mode=m;showShop()},
  setDM(){V.dm=$('#sd_y').value+'-'+$('#sd_m').value;load()},
  setDY(){V.dy=$('#sd_y').value;load()}};

/* حراسة: إدارة المجمعات للمؤسس فقط (التحقق الفعلي في الخادم؛ هذه طبقة إضافية) */
['mallForm','mallCreate','mallMenu','mallSave','mallDel','mallShops','mallToggle','mallAudit'].forEach(n=>{
  const f=window[n];if(typeof f!=='function')return;
  window[n]=function(){if(!FOUNDER()){toast('هذه الوظيفة للمؤسس فقط');return}return f.apply(this,arguments)}});
})();
