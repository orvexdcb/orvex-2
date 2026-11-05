/* ORVEX — المرحلة 5 / بند 15: الأصول الثابتة (assets3.js). للمدير فقط. يحل محل دوال assets2.js دون حذفه.
   - القسط الثابت كما كان: (التكلفة − الخردة) ÷ العمر بالأشهر من شهر الشراء (يُحتسب شهر الشراء كاملًا).
   - الربط بالدفتر (ledger.js) اختياري لكل أصل عبر «مصدر التمويل»: لا شيء (الافتراضي، فلا يتغير أي رصيد قائم) | صندوق | بنك | موردون | رأس مال.
     الأصل المربوط تُشتق له قيود: الشراء، إهلاك شهري (مدين 5400 / دائن 1219)، والاستبعاد (مجمع الإهلاك + المتحصل ± 5450 ← الأصل).
     القيود تُشتق عند الطلب ولا تُخزَّن، فلا تكرار ولا تعارض بين الأجهزة.
   - نقل الأصل (موقع/عهدة) سجل إلحاقي لا أثر محاسبي له. البيع/الشطب بتاريخ ومبلغ وسبب، والتراجع عنه للمدير بسبب ويُدقَّق.
   - بيانات الأصول القديمة (بلا fund) تعمل كما كانت وتظهر في قائمة الدخل كما كانت، ولا تدخل الدفتر. */
(function(root){
'use strict';
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const A=()=>db.assets||(db.assets=[]);
const L=(a,r,d,ba)=>{try{if(root.orvexLog)root.orvexLog(a,r,d,ba)}catch(e){}};
const lockD=()=>{try{return(root.ORVEX_FIN&&root.ORVEX_FIN.lockDate&&root.ORVEX_FIN.lockDate())||''}catch(e){return''}};
const mon=(a,b)=>{const x=String(a).slice(0,7).split('-'),y=String(b).slice(0,7).split('-');return(+y[0]-+x[0])*12+(+y[1]-+x[1])};
const addM=(m,n)=>{const [y,mo]=m.split('-').map(Number),t=y*12+(mo-1)+n;return Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0')};
const lastDay=m=>{const [y,mo]=m.split('-').map(Number);return m+'-'+String(new Date(Date.UTC(y,mo,0)).getUTCDate()).padStart(2,'0')};
const FUND={none:'بلا ربط بالدفتر',cash:'مدفوع من الصندوق',bank:'مدفوع من البنك',ap:'آجل (ذمم موردين)',capital:'مساهمة رأس مال'};
const FUNDKEY={cash:'cash',bank:'bank',ap:'ap',capital:'capital'};
const PROC={cash:'الصندوق',bank:'البنك',ar:'ذمة على المشتري'};
const PROCKEY={cash:'cash',bank:'bank',ar:'ar'};
const CATS=['مبانٍ','سيارات','معدات وآلات','أثاث','أجهزة حاسوب','أخرى'];
const posted=a=>!!a.fund&&a.fund!=='none'&&!!FUNDKEY[a.fund];

function calc(a,on){
  const cost=num(a.cost),salv=Math.min(num(a.salvage),cost),life=Math.max(1,Math.round(num(a.lifeYears)*12));
  const cur=on||today();
  const end=a.disposed&&a.disposedAt&&a.disposedAt<cur?a.disposedAt:cur;
  const used=Math.max(0,Math.min(life,mon(a.date,end)+1)),per=r2((cost-salv)/life),acc=r2(Math.min(cost-salv,per*used));
  return{per,acc,book:r2(cost-acc),life,used}}

/* جدول الإهلاك الشهري: [{m,amt,acc}] من شهر الشراء حتى الشهر الحالي أو شهر الاستبعاد أو نهاية العمر */
function schedule(a,untilM){
  const out=[];if(!a||!ISO.test(String(a.date||'')))return out;
  const lim=untilM||today().slice(0,7);let m=a.date.slice(0,7),prev=0,guard=0;
  while(m<=lim&&guard++<1200){
    const c=calc(a,m+'-28'),amt=r2(c.acc-prev);
    if(a.disposed&&a.disposedAt&&m>a.disposedAt.slice(0,7))break;
    if(amt>0)out.push({m,amt,acc:c.acc});prev=c.acc;
    if(c.used>=c.life&&amt<=0)break;m=addM(m,1)}
  return out}

/* ===== القيود المشتقة (يستدعيها ledger.entries) ===== */
function entries(keyId,bankId){
  const out=[],acct=k=>k==='bank'?bankId:keyId[k];
  A().forEach(a=>{
    if(!posted(a)||!(num(a.cost)>0)||!ISO.test(String(a.date||'')))return;
    const fa=keyId.fixed_assets,ad=keyId.acc_dep,dp=keyId.depreciation;
    out.push({key:'asset:'+a.id,src:'asset',date:a.date,memo:'شراء أصل ثابت — '+a.name,lines:[{a:fa,d:r2(a.cost),c:0},{a:acct(FUNDKEY[a.fund]),d:0,c:r2(a.cost)}]});
    schedule(a).forEach(x=>{
      const cm=today().slice(0,7),date=x.m===cm?today():lastDay(x.m);
      out.push({key:'dep:'+a.id+':'+x.m,src:'asset_dep',date,memo:'إهلاك '+x.m+' — '+a.name,lines:[{a:dp,d:x.amt,c:0},{a:ad,d:0,c:x.amt}]})});
    if(a.disposed&&a.disposal&&ISO.test(String(a.disposedAt||''))){
      const d=a.disposal,acc=calc(a,a.disposedAt).acc,P=r2(d.proceeds),gl=r2(P-r2(num(a.cost)-acc)),ln=[];
      if(acc>0)ln.push({a:ad,d:acc,c:0});
      if(P>0)ln.push({a:acct(PROCKEY[d.to]||'cash'),d:P,c:0});
      if(gl<0)ln.push({a:keyId.asset_disposal,d:-gl,c:0});
      ln.push({a:fa,d:0,c:r2(a.cost)});
      if(gl>0)ln.push({a:keyId.asset_disposal,d:0,c:gl});
      out.push({key:'assetdisp:'+a.id,src:'asset_disposal',date:a.disposedAt,memo:(d.mode==='sale'?'بيع أصل — ':'شطب أصل — ')+a.name,lines:ln})}});
  return out}

/* ربح/خسارة الاستبعاد في شهر (لقائمة الدخل) — يشمل كل أصل له سجل استبعاد */
function disposalPL(m){
  return r2(A().reduce((s,a)=>{if(!a.disposed||!a.disposal||String(a.disposedAt||'').slice(0,7)!==m)return s;return s+num(a.disposal.gl)},0))}

/* ===== العمليات (تُعيد {ok}|{err}) ===== */
function gate(){return isAdmin()?null:{err:'للمدير فقط'}}
function check(o,old){
  if(!o.name)return'أدخل اسم الأصل';if(!(o.cost>0))return'أدخل تكلفة صحيحة';if(!(o.lifeYears>0))return'العمر يجب أن يكون أكبر من صفر';
  if(o.lifeYears>100)return'العمر غير معقول';if(o.salvage<0||o.salvage>o.cost)return'قيمة الخردة غير صحيحة';
  if(!ISO.test(o.date||''))return'أدخل تاريخ الشراء';if(o.date>today())return'تاريخ الشراء في المستقبل';
  if(!FUND[o.fund])return'مصدر تمويل غير صحيح';
  const lk=lockD();
  if(o.fund!=='none'&&lk&&o.date<=lk&&!(old&&old.fund===o.fund&&old.date===o.date&&num(old.cost)===o.cost))return'تاريخ الشراء يقع في فترة مقفلة حتى '+lk+' فلا يُربط بالدفتر';
  return''}
function save(id,v){
  const g=gate();if(g)return g;
  const o={name:String(v.name||'').trim(),cat:String(v.cat||'').trim(),cost:r2(num(v.cost)),date:String(v.date||''),lifeYears:num(v.lifeYears),salvage:r2(num(v.salvage)),
    fund:v.fund||'none',loc:String(v.loc||'').trim(),custodian:String(v.custodian||'').trim(),note:String(v.note||'').trim()};
  const old=id?A().find(x=>x.id===id):null;if(id&&!old)return{err:'الأصل غير موجود'};
  if(old&&old.disposed)return{err:'لا يُعدَّل أصل مستبعد'};
  if(A().some(x=>x.id!==id&&String(x.name).trim().toLowerCase()===o.name.toLowerCase()&&!x.disposed))return{err:'اسم الأصل مستخدم'};
  /* أصل مربوط بالدفتر وقد دخلت فترة مقفلة: لا تُغيَّر أرقامه المالية */
  if(old&&posted(old)){const lk=lockD();
    if(lk&&old.date<=lk&&(o.cost!==num(old.cost)||o.date!==old.date||o.lifeYears!==num(old.lifeYears)||o.salvage!==num(old.salvage)||o.fund!==old.fund))
      return{err:'الأصل مربوط بالدفتر وفي فترة مقفلة: لا تُعدَّل التكلفة أو التاريخ أو العمر أو الخردة أو التمويل'}}
  const e=check(o,old);if(e)return{err:e};
  if(old){const b={cost:old.cost,date:old.date,life:old.lifeYears,salv:old.salvage,fund:old.fund||'none'};
    Object.assign(old,o);L('asset_edit',o.name,'التكلفة '+o.cost,{b,a:{cost:o.cost,date:o.date,life:o.lifeYears,salv:o.salvage,fund:o.fund}});return{ok:old}}
  const a=Object.assign({id:uid(),moves:[]},o);
  if(o.loc||o.custodian)a.moves.push({id:uid(),date:o.date,from:'',to:o.loc,cust:o.custodian,note:'تسجيل أولي',by:(curUser()||{}).name||'',at:new Date().toISOString()});
  A().push(a);L('asset_add',o.name,'التكلفة '+o.cost+' | '+FUND[o.fund]);return{ok:a}}

function move(id,v){
  const g=gate();if(g)return g;const a=A().find(x=>x.id===id);if(!a)return{err:'الأصل غير موجود'};
  if(a.disposed)return{err:'الأصل مستبعد'};
  const to=String(v.to||'').trim(),cust=String(v.custodian||'').trim(),date=v.date||today();
  if(!to&&!cust)return{err:'حدّد الموقع الجديد أو المسؤول'};if(!ISO.test(date))return{err:'تاريخ غير صحيح'};if(date>today())return{err:'تاريخ النقل في المستقبل'};
  if(date<a.date)return{err:'تاريخ النقل أقدم من الشراء'};
  const last=(a.moves||[]).reduce((m,x)=>x.date>m?x.date:m,'');if(last&&date<last)return{err:'تاريخ النقل أقدم من آخر نقل ('+last+')'};
  const nl=to||a.loc||'',nc=cust||a.custodian||'';
  if(nl===(a.loc||'')&&nc===(a.custodian||''))return{err:'لا تغيير في الموقع أو المسؤول'};
  a.moves=a.moves||[];a.moves.push({id:uid(),date,from:a.loc||'',to:nl,fromCust:a.custodian||'',cust:nc,note:String(v.note||'').trim(),by:(curUser()||{}).name||'',at:new Date().toISOString()});
  const b={loc:a.loc||'',cust:a.custodian||''};a.loc=nl;a.custodian=nc;
  L('asset_move',a.name,(b.loc||'—')+' ← '+nl,{b,a:{loc:nl,cust:nc}});return{ok:a}}

function dispose(id,v){
  const g=gate();if(g)return g;const a=A().find(x=>x.id===id);if(!a)return{err:'الأصل غير موجود'};
  if(a.disposed)return{err:'الأصل مستبعد مسبقًا'};
  const mode=v.mode==='sale'?'sale':'writeoff',date=v.date||today(),reason=String(v.reason||'').trim();
  if(!ISO.test(date))return{err:'تاريخ غير صحيح'};if(date>today())return{err:'تاريخ الاستبعاد في المستقبل'};if(date<a.date)return{err:'تاريخ الاستبعاد أقدم من الشراء'};
  if(posted(a)&&lockD()&&date<=lockD())return{err:'التاريخ يقع في فترة مقفلة حتى '+lockD()};
  if(!reason)return{err:'اكتب سبب الاستبعاد'};
  const P=mode==='sale'?r2(num(v.proceeds)):0,to=mode==='sale'?(v.to||'cash'):'';
  if(mode==='sale'){if(!(P>0))return{err:'أدخل مبلغ البيع'};if(!PROC[to])return{err:'جهة التحصيل غير صحيحة'}}
  const c=calc(a,date),gl=r2(P-c.book);
  a.disposed=true;a.disposedAt=date;a.disposal={mode,proceeds:P,to,reason,book:c.book,acc:c.acc,gl,by:(curUser()||{}).name||'',at:new Date().toISOString()};
  L('asset_dispose',a.name,(mode==='sale'?'بيع ':'شطب ')+'| دفترية '+c.book+' | متحصل '+P+' | '+(gl>=0?'ربح ':'خسارة ')+Math.abs(gl),{b:{disposed:false},a:{mode,date,proceeds:P,gl}});
  return{ok:a,gl,book:c.book}}

function undispose(id,reason){
  const g=gate();if(g)return g;const a=A().find(x=>x.id===id);if(!a||!a.disposed)return{err:'الأصل غير مستبعد'};
  if(!String(reason||'').trim())return{err:'اكتب سبب التراجع'};
  if(posted(a)&&lockD()&&a.disposedAt<=lockD())return{err:'الاستبعاد في فترة مقفلة حتى '+lockD()};
  const b={disposedAt:a.disposedAt,mode:(a.disposal||{}).mode||'',proceeds:(a.disposal||{}).proceeds||0};
  a.disposed=false;delete a.disposedAt;delete a.disposal;L('asset_undispose',a.name,reason,{b,a:{disposed:false}});return{ok:a}}

/* ===== الواجهة ===== */
const Q={f:'live'};
const sel=(id,map,cur)=>`<select id="${id}">${Object.keys(map).map(k=>`<option value="${esc(k)}" ${k===cur?'selected':''}>${esc(map[k])}</option>`).join('')}</select>`;
const val=id=>{const e=document.getElementById(id);return e?e.value:''};
root.assetsOpen=function(f){
  if(!isAdmin())return toast('للمدير فقط');if(typeof f==='string')Q.f=f;
  const all=A().slice().sort((a,b)=>(!!a.disposed)-(!!b.disposed)||String(b.date).localeCompare(String(a.date)));
  const live=all.filter(a=>!a.disposed),L2=Q.f==='gone'?all.filter(a=>a.disposed):live;
  const tc=r2(live.reduce((s,a)=>s+num(a.cost),0)),tb=r2(live.reduce((s,a)=>s+calc(a).book,0)),cm=today().slice(0,7);
  const dm=r2(live.reduce((s,a)=>{const x=schedule(a).find(y=>y.m===cm);return s+(x?x.amt:0)},0));
  modal('الأصول الثابتة',`${chips([['live','قائمة'],['gone','المستبعدة']],Q.f,'assetsOpen')}<div class="card">${L2.length?L2.map(a=>{const c=calc(a);
    return`<div class="row" onclick="assetView('${jsq(a.id)}')"><div class="grow"><div class="t">${esc(a.name)} ${a.disposed?`<span class="badge">${a.disposal&&a.disposal.mode==='sale'?'مباع':'مستبعد'}</span>`:''}${posted(a)?' <span class="badge">بالدفتر</span>':''}</div><small>${esc(a.cat||'')}${a.cat?' — ':''}اشتُري ${esc(fdate(a.date))}${a.loc?' — '+esc(a.loc):''}${a.custodian?' — '+esc(a.custodian):''}</small><br><small>إهلاك شهري ${money(c.per)} — مجمّع ${money(c.acc)}</small></div><div class="end"><b>${money(c.book)}</b><br><small>الدفترية</small></div></div>`}).join(''):'<p class="muted">'+(Q.f==='gone'?'لا توجد أصول مستبعدة.':'لا توجد أصول مسجّلة.')+'</p>'}</div>
  <p class="muted">إجمالي التكلفة: <b>${money(tc)}</b> — القيمة الدفترية: <b>${money(tb)}</b> — إهلاك هذا الشهر: <b>${money(dm)}</b></p>
  <div class="actions"><button class="btn primary" onclick="assetForm()">+ أصل</button><button class="btn" onclick="assetDepRep()">جدول الإهلاك</button></div>`)};
root.assetForm=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const a=id?A().find(x=>x.id===id):{name:'',cat:'',cost:'',date:today(),lifeYears:5,salvage:0,fund:'none',loc:'',custodian:'',note:''};if(!a)return;
  const lk=lockD(),frozen=id&&posted(a)&&lk&&a.date<=lk,dis=frozen?' disabled':'';
  modal(id?'تعديل أصل':'أصل جديد',`<label>اسم الأصل</label><input id="as_n" value="${esc(a.name)}"><label>الفئة</label><input id="as_k" list="as_kl" value="${esc(a.cat||'')}"><datalist id="as_kl">${CATS.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  <div class="f2"><div><label>تكلفة الشراء</label><input id="as_c" type="number" inputmode="decimal" value="${a.cost??''}"${dis}></div><div><label>تاريخ الشراء</label><input id="as_d" type="date" value="${esc(a.date||today())}"${dis}></div></div>
  <div class="f2"><div><label>العمر (سنوات)</label><input id="as_l" type="number" step="any" value="${a.lifeYears}"${dis}></div><div><label>قيمة الخردة</label><input id="as_s" type="number" inputmode="decimal" value="${a.salvage||0}"${dis}></div></div>
  <label>الربط بالدفتر (مصدر التمويل)</label>${sel('as_f',FUND,a.fund||'none').replace('<select','<select'+dis)}
  <small class="muted">«بلا ربط» لا يُنشئ قيودًا. غيره يُنشئ قيد الشراء والإهلاك الشهري والاستبعاد في الدفتر.${frozen?' الأرقام مقفلة لأن الفترة مقفلة.':''}</small>
  <div class="f2"><div><label>الموقع</label><input id="as_o" value="${esc(a.loc||'')}"></div><div><label>المسؤول (العهدة)</label><input id="as_u" value="${esc(a.custodian||'')}"></div></div>
  <label>ملاحظة</label><input id="as_t" value="${esc(a.note||'')}">
  <div class="actions"><button class="btn primary" onclick="assetSave('${jsq(id||'')}')">حفظ</button><button class="btn ghost" onclick="${id?`assetView('${jsq(id)}')`:'assetsOpen()'}">رجوع</button></div>`)};
root.assetSave=function(id){
  const old=id?A().find(x=>x.id===id):null,keep=old&&posted(old)&&lockD()&&old.date<=lockD();
  const v={name:val('as_n'),cat:val('as_k'),cost:keep?old.cost:val('as_c'),date:keep?old.date:val('as_d'),lifeYears:keep?old.lifeYears:val('as_l'),salvage:keep?old.salvage:val('as_s'),
    fund:keep?old.fund:(val('as_f')||'none'),loc:val('as_o'),custodian:val('as_u'),note:val('as_t')};
  /* تغيير الموقع/العهدة من النموذج يمر عبر سجل النقل ليبقى أثره */
  const keepLoc=old?{loc:old.loc||'',custodian:old.custodian||''}:null;
  if(old){v.loc=keepLoc.loc;v.custodian=keepLoc.custodian}
  const r=save(id,v);if(r.err)return toast(r.err);
  if(old&&(val('as_o').trim()!==keepLoc.loc||val('as_u').trim()!==keepLoc.custodian)){const m=move(id,{to:val('as_o'),custodian:val('as_u')});if(m.err)toast(m.err)}
  root.save();toast('تم الحفظ');assetView(r.ok.id)};
root.assetView=function(id){
  if(!isAdmin())return toast('للمدير فقط');const a=A().find(x=>x.id===id);if(!a)return assetsOpen();
  const c=calc(a),sc=schedule(a),mv=(a.moves||[]).slice().reverse();
  modal(a.name,`<div class="card"><div class="row"><div class="grow">التكلفة</div><div class="end">${money(a.cost)}</div></div><div class="row"><div class="grow">الإهلاك المجمّع</div><div class="end">${money(c.acc)}</div></div><div class="row"><div class="grow"><b>القيمة الدفترية</b></div><div class="end"><b>${money(c.book)}</b></div></div>
  <div class="row"><div class="grow">القسط الشهري (${c.life} شهرًا، خردة ${money(a.salvage||0)})</div><div class="end">${money(c.per)}</div></div><div class="row"><div class="grow">الدفتر</div><div class="end">${esc(FUND[a.fund||'none']||'')}</div></div>
  <div class="row"><div class="grow">الموقع / المسؤول</div><div class="end">${esc(a.loc||'—')} / ${esc(a.custodian||'—')}</div></div></div>
  ${a.disposed&&a.disposal?`<div class="card" style="margin-top:8px"><b>${a.disposal.mode==='sale'?'بيع':'شطب'} بتاريخ ${esc(fdate(a.disposedAt))}</b><br><small>المتحصل ${money(a.disposal.proceeds)} — دفترية ${money(a.disposal.book)} — ${a.disposal.gl>=0?'ربح':'خسارة'} ${money(Math.abs(a.disposal.gl))}<br>السبب: ${esc(a.disposal.reason)} — ${esc(a.disposal.by)}</small></div>`:a.disposed?'<p class="muted">استُبعد (سجل قديم بلا تفاصيل).</p>':''}
  <h3 style="margin:12px 0 4px">سجل النقل</h3><div class="card">${mv.length?mv.map(m=>`<div class="row"><div class="grow"><small>${esc(fdate(m.date))} — ${esc(m.from||'—')} ← ${esc(m.to||'—')}${m.cust?' | '+esc(m.cust):''}${m.note?'<br>'+esc(m.note):''}<br>${esc(m.by||'')}</small></div></div>`).join(''):'<p class="muted">لا توجد حركات.</p>'}</div>
  <h3 style="margin:12px 0 4px">آخر أقساط الإهلاك</h3><div class="card">${sc.length?sc.slice(-6).reverse().map(x=>`<div class="row"><div class="grow">${esc(x.m)}</div><div class="end">${money(x.amt)}</div></div>`).join(''):'<p class="muted">لا إهلاك بعد.</p>'}</div>
  <div class="actions">${a.disposed?`<button class="btn" onclick="assetUndisposeForm('${jsq(id)}')">تراجع عن الاستبعاد</button>`:`<button class="btn primary" onclick="assetForm('${jsq(id)}')">تعديل</button><button class="btn" onclick="assetMoveForm('${jsq(id)}')">نقل</button><button class="btn" onclick="assetDisposeForm('${jsq(id)}')">بيع / شطب</button>`}<button class="btn ghost" onclick="assetsOpen()">رجوع</button></div>`)};
root.assetMoveForm=function(id){const a=A().find(x=>x.id===id);if(!a||!isAdmin())return;
  modal('نقل أصل',`<p><b>${esc(a.name)}</b><br><small>الحالي: ${esc(a.loc||'—')} / ${esc(a.custodian||'—')}</small></p><label>الموقع الجديد</label><input id="am_o" value="${esc(a.loc||'')}"><label>المسؤول الجديد</label><input id="am_u" value="${esc(a.custodian||'')}"><label>التاريخ</label><input id="am_d" type="date" value="${today()}"><label>ملاحظة</label><input id="am_t">
  <div class="actions"><button class="btn primary" onclick="assetMoveOk('${jsq(id)}')">تأكيد النقل</button><button class="btn ghost" onclick="assetView('${jsq(id)}')">رجوع</button></div>`)};
root.assetMoveOk=function(id){const r=move(id,{to:val('am_o'),custodian:val('am_u'),date:val('am_d'),note:val('am_t')});if(r.err)return toast(r.err);root.save();toast('تم النقل');assetView(id)};
root.assetDisposeForm=function(id){const a=A().find(x=>x.id===id);if(!a||!isAdmin())return;const c=calc(a);
  modal('بيع / شطب أصل',`<p><b>${esc(a.name)}</b><br><small>القيمة الدفترية اليوم ${money(c.book)}</small></p><label>النوع</label><select id="ad_m" onchange="document.getElementById('ad_b').style.display=this.value==='sale'?'':'none'"><option value="sale">بيع</option><option value="writeoff">شطب (بلا متحصل)</option></select>
  <div id="ad_b"><label>مبلغ البيع</label><input id="ad_p" type="number" inputmode="decimal"><label>جهة التحصيل</label>${sel('ad_t',PROC,'cash')}</div><label>التاريخ</label><input id="ad_d" type="date" value="${today()}"><label>السبب</label><input id="ad_r">
  <div class="actions"><button class="btn danger" onclick="assetDisposeOk('${jsq(id)}')">تأكيد</button><button class="btn ghost" onclick="assetView('${jsq(id)}')">رجوع</button></div>`)};
root.assetDisposeOk=function(id){const a=A().find(x=>x.id===id);if(!a)return;const v={mode:val('ad_m'),proceeds:val('ad_p'),to:val('ad_t'),date:val('ad_d'),reason:val('ad_r')};
  const c=calc(a,v.date&&ISO.test(v.date)?v.date:undefined),gl=r2((v.mode==='sale'?num(v.proceeds):0)-c.book);
  askConfirm('استبعاد «'+a.name+'»: '+(gl>=0?'ربح ':'خسارة ')+money(Math.abs(gl))+'. لا يمكن التعديل بعدها إلا بالتراجع.',()=>{const r=dispose(id,v);if(r.err){toast(r.err);return assetDisposeForm(id)}root.save();toast('تم الاستبعاد');assetView(id)},'تأكيد')};
root.assetUndisposeForm=function(id){const a=A().find(x=>x.id===id);if(!a||!isAdmin())return;
  modal('التراجع عن الاستبعاد',`<p><b>${esc(a.name)}</b></p><label>السبب</label><input id="au_r"><div class="actions"><button class="btn danger" onclick="assetUndisposeOk('${jsq(id)}')">تراجع</button><button class="btn ghost" onclick="assetView('${jsq(id)}')">رجوع</button></div>`)};
root.assetUndisposeOk=function(id){const r=undispose(id,val('au_r'));if(r.err)return toast(r.err);root.save();toast('تم التراجع');assetView(id)};
root.assetDepRep=function(m){if(!isAdmin())return toast('للمدير فقط');m=m||today().slice(0,7);
  const rows=A().map(a=>{const x=schedule(a,m).find(y=>y.m===m);return x?{a,amt:x.amt}:null}).filter(Boolean),tot=r2(rows.reduce((s,x)=>s+x.amt,0));
  modal('جدول الإهلاك',`<input type="month" value="${esc(m)}" onchange="assetDepRep(this.value)"><div class="card" style="margin-top:8px">${rows.length?rows.map(x=>`<div class="row"><div class="grow">${esc(x.a.name)} ${posted(x.a)?'<span class="badge">بالدفتر</span>':''}</div><div class="end">${money(x.amt)}</div></div>`).join(''):'<p class="muted">لا إهلاك في هذا الشهر.</p>'}</div><p><b>الإجمالي ${money(tot)}</b></p><div class="actions"><button class="btn ghost" onclick="assetsOpen()">رجوع</button></div>`)};
root.assetDispose=function(id){assetDisposeForm(id)};

root.ORVEX_ASSETS={calc,A,schedule,entries,disposalPL,save,move,dispose,undispose,posted,FUND,PROC};
})(typeof window!=='undefined'?window:globalThis);
