/* ORVEX — الأصول الثابتة (assets2.js). للمدير فقط. يتزامن عبر records بنوع assets.
   إهلاك بالقسط الثابت: (التكلفة − الخردة) ÷ العمر بالأشهر، يُحسب من شهر الشراء حتى اليوم ولا يُرحَّل كمصروف تلقائيًا. */
(function(){
'use strict';
const A=()=>db.assets||(db.assets=[]);
const L=(a,r,d)=>{if(window.orvexLog)orvexLog(a,r,d)};
const mon=(a,b)=>{const x=String(a).slice(0,7).split('-'),y=String(b).slice(0,7).split('-');return (+y[0]-+x[0])*12+(+y[1]-+x[1])};
function calc(a,on){
  const cost=num(a.cost),salv=Math.min(num(a.salvage),cost),life=Math.max(1,Math.round(num(a.lifeYears)*12));
  const end=a.disposed&&a.disposedAt&&a.disposedAt<(on||today())?a.disposedAt:(on||today());
  const used=Math.max(0,Math.min(life,mon(a.date,end)+1)),per=r2((cost-salv)/life),acc=r2(Math.min(cost-salv,per*used));
  return{per,acc,book:r2(cost-acc),life,used}}
window.assetsOpen=function(){
  if(!isAdmin())return toast('للمدير فقط');
  const L2=A().slice().sort((a,b)=>(!!a.disposed)-(!!b.disposed)||String(b.date).localeCompare(String(a.date)));
  const live=L2.filter(a=>!a.disposed),tc=r2(live.reduce((s,a)=>s+num(a.cost),0)),tb=r2(live.reduce((s,a)=>s+calc(a).book,0));
  modal('الأصول الثابتة',`<div class="card">${L2.length?L2.map(a=>{const c=calc(a);return`<div class="row" onclick="assetForm('${jsq(a.id)}')"><div class="grow"><div class="t">${esc(a.name)} ${a.disposed?'<span class="badge">مستبعد</span>':''}</div><small>اشتُري ${esc(fdate(a.date))} — إهلاك شهري ${money(c.per)} — مجمّع ${money(c.acc)}</small></div><div class="end"><b>${money(c.book)}</b><br><small>الدفترية</small></div></div>`}).join(''):'<p class="muted">لا توجد أصول مسجّلة.</p>'}</div>
  <p class="muted">إجمالي التكلفة: <b>${money(tc)}</b> — إجمالي القيمة الدفترية: <b>${money(tb)}</b></p>
  <div class="actions"><button class="btn primary" onclick="assetForm()">+ أصل</button></div>`)};
window.assetForm=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const a=id?A().find(x=>x.id===id):{name:'',cost:'',date:today(),lifeYears:5,salvage:0,note:''};if(!a)return;
  modal(id?'تعديل أصل':'أصل جديد',`<label>اسم الأصل</label><input id="as_n" value="${esc(a.name)}"><label>تكلفة الشراء</label><input id="as_c" type="number" inputmode="decimal" value="${a.cost??''}">
  <label>تاريخ الشراء</label><input id="as_d" type="date" value="${esc(a.date||today())}"><div class="f2"><div><label>العمر (سنوات)</label><input id="as_l" type="number" step="any" value="${a.lifeYears}"></div><div><label>قيمة الخردة</label><input id="as_s" type="number" inputmode="decimal" value="${a.salvage||0}"></div></div>
  <label>ملاحظة</label><input id="as_t" value="${esc(a.note||'')}">
  <div class="actions"><button class="btn primary" onclick="assetSave('${jsq(id||'')}')">حفظ</button>${id&&!a.disposed?`<button class="btn" onclick="assetDispose('${jsq(id)}')">استبعاد</button>`:''}<button class="btn ghost" onclick="assetsOpen()">رجوع</button></div>`)};
window.assetSave=function(id){
  if(!isAdmin())return toast('للمدير فقط');
  const name=$('#as_n').value.trim(),cost=r2(num($('#as_c').value)),life=num($('#as_l').value),salv=r2(num($('#as_s').value)),date=$('#as_d').value;
  if(!name)return toast('أدخل اسم الأصل');if(!(cost>0))return toast('أدخل تكلفة صحيحة');if(!(life>0))return toast('العمر يجب أن يكون أكبر من صفر');
  if(salv<0||salv>cost)return toast('قيمة الخردة غير صحيحة');if(!date)return toast('أدخل تاريخ الشراء');
  const o={name,cost,date,lifeYears:life,salvage:salv,note:$('#as_t').value.trim()};
  if(id){const a=A().find(x=>x.id===id);if(!a)return;Object.assign(a,o);L('asset_edit',name,'التكلفة '+cost)}
  else{A().push(Object.assign({id:uid()},o));L('asset_add',name,'التكلفة '+cost)}
  save();toast('تم الحفظ');assetsOpen()};
window.assetDispose=function(id){
  const a=A().find(x=>x.id===id);if(!a||!isAdmin())return;
  askConfirm('استبعاد الأصل «'+a.name+'»؟ يتوقف إهلاكه من اليوم.',()=>{a.disposed=true;a.disposedAt=today();L('asset_dispose',a.name,'القيمة الدفترية '+calc(a).book);save();toast('تم الاستبعاد');assetsOpen()})};
const _vp=vParties;vParties=function(){return _vp()+(isAdmin()?`<div class="actions"><button class="btn" onclick="assetsOpen()">🏗 الأصول الثابتة</button></div>`:'')};
window.ORVEX_ASSETS={calc,A};
})();
