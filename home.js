/* ================= الرئيسية ================= */
function setPeriod(p){state.period=p;render()}
function vHome(){
  if(isAdmin())return vHomeAdmin();
  if(!can('reports'))return vHomeBasic();
  const p=state.period;
  const S=db.sales.filter(s=>!s.void&&inRange(s.date,p));
  const RT=db.returns.filter(r=>inRange(r.date,p));const rev=sum(S,s=>s.net)-sum(RT,r=>r.net),cost=sum(S,s=>s.cost)-sum(RT,r=>r.cost),gross=rev-cost;
  const exp=sum(db.expenses.filter(e=>inRange(e.date,p)),e=>e.amount);
  const recv=sum(db.customers.filter(c=>c.balance>0),c=>c.balance);
  const pay=sum(db.suppliers.filter(c=>c.balance>0),c=>c.balance);
  const inv=sum(db.products,x=>Math.max(0,x.stock)*x.cost);
  const low=db.products.filter(x=>x.stock<=x.min);
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=ymd(d);days.push({d,v:sum(db.sales.filter(s=>!s.void&&s.date===k),s=>s.net)})}
  const mx=Math.max(1,...days.map(x=>x.v));
  const bars=days.map((x,i)=>{const h=Math.max(3,x.v/mx*54),px=(6-i)*40+6;return `<rect x="${px}" y="${62-h}" width="28" height="${h}" rx="6" fill="currentColor" opacity="${i===6?1:.42}"/><text x="${px+14}" y="76" text-anchor="middle" font-size="8.5" fill="currentColor" opacity=".85">${x.d.toLocaleDateString('ar',{weekday:'short'})}</text>`}).join('');
  const tp={};S.forEach(s=>s.items.forEach(i=>{const o=tp[i.name]=tp[i.name]||{q:0,r:0};o.q+=i.qty;o.r+=i.qty*i.price}));
  const top=Object.entries(tp).sort((a,b)=>b[1].r-a[1].r).slice(0,5);
  const recent=db.sales.slice(-5).reverse();
  let h='';
  if(!db.products.length&&isAdmin())h+=`<div class="note">مرحباً بك. ابدأ بإضافة منتجاتك من تبويب المخزون، أو جرّب النظام ببيانات تجريبية جاهزة.<div class="actions"><button class="btn primary" onclick="loadDemo()">تحميل بيانات تجريبية</button><button class="btn" onclick="go('stock')">إضافة منتج</button></div></div>`;
  h+=`<section class="hero">${chips(PERIODS,p,'setPeriod')}<p class="lab">صافي المبيعات بعد المرتجعات</p><div class="big">${money(rev)}</div><p class="sub">عدد الفواتير: ${S.length} ، متوسط الفاتورة: ${money(S.length?rev/S.length:0)}</p><svg viewBox="0 0 280 82" role="img" aria-label="مبيعات آخر 7 أيام">${bars}</svg></section>`;
  h+=`<div class="grid2">
   ${can('see_cost')?`<div class="kpi"><span>الربح الإجمالي</span><b>${money(gross)}</b></div>`:''}
   <div class="kpi"><span>المصروفات</span><b>${money(exp)}</b></div>
   ${can('see_cost')?`<div class="kpi"><span>صافي الربح</span><b class="${gross-exp>=0?'good':'bad'}">${money(gross-exp)}</b></div>`:''}
   ${can('see_cost')?`<div class="kpi"><span>قيمة المخزون</span><b>${money(inv)}</b></div>`:''}
   <div class="kpi"><span>مستحق من العملاء</span><b>${money(recv)}</b></div>
   <div class="kpi"><span>مستحق للموردين</span><b>${money(pay)}</b></div></div>`;
  if(low.length)h+=`<div class="card"><h3>تنبيه نقص المخزون (${low.length})</h3>${low.slice(0,5).map(x=>`<div class="row"><div class="grow t">${esc(x.name)}</div><span class="badge ${x.stock<=0?'bad':'warn'}">${x.stock<=0?'نفد':'المتبقي '+x.stock}</span></div>`).join('')}<div class="actions">${can('purchases')?`<button class="btn" onclick="go('purchases');newPurchase()">تسجيل مشتريات</button>`:''}</div></div>`;
  if(top.length)h+=`<div class="card"><h3>الأكثر مبيعاً</h3>${top.map(([n,o])=>`<div class="row"><div class="grow t">${esc(n)}</div><small>${o.q} قطعة</small><b>${money(o.r)}</b></div>`).join('')}</div>`;
  if(recent.length)h+=`<div class="card"><h3>آخر الفواتير</h3>${recent.map(s=>saleRow(s)).join('')}</div>`;
  return h;
}
function saleRow(s){const c=cust(s.cid);const st=s.void?['ملغاة','grey']:(s.total-s.paid>0.005?(s.paid>0?['جزئي','warn']:['آجلة','bad']):['مدفوعة','']);
  return `<button class="row tap" onclick="showInvoice('${jsq(s.id)}')"><div class="grow"><div class="t">${esc(s.no)}</div><small>${esc(c?c.name:'عميل نقدي')} - ${fdate(s.date)}</small></div><div class="end"><b>${money(s.total)}</b><br><span class="badge ${st[1]}">${st[0]}</span></div></button>`}

