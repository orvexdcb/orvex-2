/* ================= إغلاق الصندوق اليومي ================= */
IC.closings='<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 15v2"/>';
TITLES.closings='إغلاق الصندوق';
function dayReport(date){
  const S=db.sales.filter(s=>!s.void&&s.date===date),V=db.sales.filter(s=>s.void&&s.date===date);
  const RT=db.returns.filter(r=>r.date===date),E=db.expenses.filter(e=>e.date===date),P=db.purchases.filter(p=>p.date===date);
  const PC=db.payments.filter(p=>p.date===date&&p.type==='c'),PS=db.payments.filter(p=>p.date===date&&p.type!=='c');
  const rcv={cash:0,card:0,transfer:0};
  S.forEach(s=>{const k=s.method==='card'?'card':s.method==='transfer'?'transfer':'cash';rcv[k]+=Math.min(s.paid,s.total)});
  const agg={};S.forEach(s=>s.items.forEach(i=>{const o=agg[i.name]=agg[i.name]||{q:0,r:0};o.q+=i.qty;o.r+=i.qty*i.price}));
  const byU={};S.forEach(s=>{const k=s.cashier||'غير محدد';const o=byU[k]=byU[k]||{n:0,t:0};o.n++;o.t+=s.total});
  const r={date,count:S.length,voided:V.length,qty:sum(S,s=>sum(s.items,i=>i.qty)),
    gross:r2(sum(S,s=>s.subtotal+(s.lineDisc||0))),disc:r2(sum(S,s=>(s.discount||0)+(s.lineDisc||0))),net:r2(sum(S,s=>s.net)),tax:r2(sum(S,s=>s.tax||0)),total:r2(sum(S,s=>s.total)),
    retCount:RT.length,retTotal:r2(sum(RT,x=>x.total)),retNet:r2(sum(RT,x=>x.net)),cashRet:r2(sum(RT.filter(x=>x.method==='cash'),x=>x.total)),
    rcv:{cash:r2(rcv.cash),card:r2(rcv.card),transfer:r2(rcv.transfer)},credit:r2(sum(S,s=>Math.max(0,s.total-s.paid))),
    custPay:r2(sum(PC,p=>p.amount)),suppPay:r2(sum(PS,p=>p.amount)),exp:r2(sum(E,e=>e.amount)),purPaid:r2(sum(P,p=>p.paid||0)),
    cost:r2(sum(S,s=>s.cost)-sum(RT,x=>x.cost||0)),
    top:Object.entries(agg).sort((a,b)=>b[1].r-a[1].r).slice(0,10).map(([n,o])=>[n,o.q,r2(o.r)]),
    users:Object.entries(byU).map(([n,o])=>[n,o.n,r2(o.t)]),expRows:E.map(e=>[e.cat,e.amount])};
  r.afterRet=r2(r.total-r.retTotal);
  r.profit=r2(r.net-r.retNet-r.cost);
  r.cashIn=r2(r.rcv.cash+r.custPay);
  r.cashOut=r2(r.cashRet+r.exp+r.purPaid+r.suppPay);
  return r;
}
function closeDayModal(){
  if(!can('close_day'))return toast('ليست لديك صلاحية إغلاق الصندوق');
  const d=today(),R=dayReport(d),done=db.closings.find(c=>c.date===d);
  const opening=done?done.opening:0;
  state.cd={R};
  const row=(a,b,c)=>`<div class="row"><span class="grow">${a}</span><span class="${c||''}">${b}</span></div>`;
  modal('إغلاق صندوق اليوم',`${done?`<div class="note">تم إغلاق صندوق اليوم سابقاً (${esc(done.no)}). الإغلاق الجديد يحلّ محلّه.</div>`:''}
  <div class="card">${row('عدد الفواتير',R.count)}${row('إجمالي المبيعات',money(R.total))}${row('المرتجعات ('+R.retCount+')','- '+money(R.retTotal))}${row('صافي المبيعات',`<b>${money(R.afterRet)}</b>`)}${row('مقبوض نقداً من المبيعات',money(R.rcv.cash))}${row('دفعات العملاء',money(R.custPay))}${row('مرتجع نقدي',R.cashRet?'- '+money(R.cashRet):money(0))}${row('المصروفات والمشتريات المدفوعة',money(R.exp+R.purPaid+R.suppPay))}</div>
  <input id="cd_open" type="hidden" value="${opening}">
  <div class="row"><span class="grow"><b>رصيد الصندوق عند الإغلاق</b></span><b id="cd_exp"></b></div>
  <p class="muted" style="font-size:12.5px;margin:4px 0 0">بعد الإغلاق يُصفَّر رصيد الصندوق، ويُحفظ هذا المبلغ داخل تقرير الإغلاق.</p>
  <label>ملاحظات</label><input id="cd_note" placeholder="اختياري">
  <div class="actions"><button class="btn primary" onclick="doCloseDay()">إغلاق الصندوق وإصدار التقرير</button></div>`);
  cdCalc();
}
function cdCalc(){
  const R=state.cd.R,o=num($('#cd_open').value),exp=r2(o+R.cashIn-R.cashOut);
  $('#cd_exp').textContent=money(exp);
}
function doCloseDay(){
  if(!can('close_day'))return toast('ليست لديك صلاحية إغلاق الصندوق');
  const d=today(),R=dayReport(d),opening=num($('#cd_open').value),expected=r2(opening+R.cashIn-R.cashOut);
  const old=db.closings.find(c=>c.date===d);
  const c={id:old?old.id:uid(),no:old?old.no:'Z-'+(db.settings.nextZ||1),date:d,at:new Date().toISOString(),by:(curUser()||{}).name||'',opening,expected,note:$('#cd_note').value.trim(),R};
  if(old)db.closings[db.closings.indexOf(old)]=c;else{db.closings.push(c);db.settings.nextZ=(db.settings.nextZ||1)+1}
  save();render();showDayReport(c.id);toast('تم إغلاق الصندوق وتصفير الرصيد');
}
function showDayReport(id){
  const c=db.closings.find(x=>x.id===id);if(!c)return;
  const R=c.R,st=db.settings,sc=can('see_cost');
  const prev=db.closings.filter(x=>x.id!==c.id&&x.at<c.at).sort((a,b)=>a.at<b.at?-1:1).slice(-1)[0];
  const T=(a,b,cls)=>`<div class="tot ${cls||''}"><span>${a}</span><span>${b}</span></div>`;
  const H=t=>`<div style="font-weight:700;margin:14px 0 4px;border-bottom:1px solid #ddd;padding-bottom:3px">${t}</div>`;
  const tb=(heads,rows)=>rows.length?`<div class="table-wrap"><table><tr>${heads.map((h,i)=>`<th class="${i?'n':''}">${h}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map((x,i)=>`<td class="${i?'n':''}" style="${i?'':'white-space:normal'}">${x}</td>`).join('')}</tr>`).join('')}</table></div>`:'';
  const time=new Date(c.at).toLocaleTimeString('ar-SA-u-nu-latn',{hour:'2-digit',minute:'2-digit'});
  modal('تقرير '+c.no,`<div class="inv" id="printArea">
  <h3>${esc(st.name)}</h3><small>${esc(st.address||'')} ${st.phone?'- '+esc(st.phone):''}</small>
  <div style="text-align:center;font-weight:700;font-size:16px;margin:10px 0 2px">تقرير إغلاق الصندوق اليومي</div>
  <hr style="border:0;border-top:1px dashed #bbb;margin:8px 0">
  ${T('رقم التقرير','<b>'+esc(c.no)+'</b>')}${T('تاريخ اليوم',fdate(c.date))}${T('وقت الإغلاق',time)}${T('أُغلق بواسطة',esc(c.by||'-'))}
  ${prev?T('مبلغ آخر إغلاق سابق ('+esc(prev.no)+')',money(prev.expected)):''}
  ${H('المبيعات')}
  ${T('عدد الفواتير',R.count)}${T('عدد القطع المباعة',fmt(R.qty))}${T('مجموع المبيعات',money(R.gross))}${R.disc?T('الخصومات','- '+money(R.disc)):''}${R.tax?T('الضريبة',money(R.tax)):''}${T('إجمالي المبيعات',money(R.total),'g')}
  ${R.voided?T('فواتير ملغاة',R.voided):''}${T('المرتجعات ('+R.retCount+')','- '+money(R.retTotal))}${T('صافي المبيعات بعد المرتجعات','<b>'+money(R.afterRet)+'</b>')}
  ${sc?T('الربح الإجمالي',money(R.profit)):''}
  ${H('طرق الاستلام')}
  ${T('نقدي',money(R.rcv.cash))}${T('بطاقة',money(R.rcv.card))}${T('تحويل',money(R.rcv.transfer))}${T('آجل (دين على العملاء)',money(R.credit))}
  ${H('حركة النقد في الدرج')}
  ${T('رصيد بداية اليوم',money(c.opening))}${T('+ مبيعات نقدية',money(R.rcv.cash))}${T('+ دفعات مستلمة من العملاء',money(R.custPay))}
  ${T('- مرتجعات نقدية',money(R.cashRet))}${T('- مصروفات',money(R.exp))}${T('- مشتريات مدفوعة',money(R.purPaid))}${T('- دفعات للموردين',money(R.suppPay))}
  ${T('رصيد الصندوق عند الإغلاق (المبلغ المسلَّم)',money(c.expected),'g')}${T('رصيد الصندوق بعد الإغلاق',money(0))}
  ${R.expRows.length?H('المصروفات')+tb(['البند','المبلغ'],R.expRows.map(x=>[esc(x[0]),fmt(x[1])])):''}
  ${R.users.length?H('المبيعات حسب الكاشير')+tb(['الكاشير','الفواتير','الإجمالي'],R.users.map(x=>[esc(x[0]),x[1],fmt(x[2])])):''}
  ${R.top.length?H('أعلى المواد مبيعاً')+tb(['المادة','الكمية','المبيعات'],R.top.map(x=>[esc(x[0]),fmt(x[1]),fmt(x[2])])):''}
  ${c.note?H('ملاحظات')+`<div>${esc(c.note)}</div>`:''}
  <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:12.5px"><span>توقيع الكاشير: ______________</span><span>توقيع المدير: ______________</span></div>
  </div>
  <div class="actions no-print"><button class="btn primary" onclick="window.print()">طباعة التقرير</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`);
}
function vClosings(){
  const L=db.closings.slice().reverse(),last=lastClosing();
  return `${last?`<div class="card"><div class="row"><div class="grow"><div class="t">مبلغ آخر إغلاق</div><small>${esc(last.no)} - ${fdate(last.date)}</small></div><b style="font-size:18px">${money(last.expected)}</b></div></div>`:''}<div class="card">${L.length?L.map(c=>`<button class="row tap" onclick="showDayReport('${jsq(c.id)}')"><div class="grow"><div class="t">${esc(c.no)} - ${fdate(c.date)}</div><small>${esc(c.by||'')} - مبيعات ${money(c.R.afterRet)}</small></div><div class="end"><b>${money(c.expected)}</b><br><small>مبلغ الإغلاق</small></div></button>`).join(''):empty('لا توجد تقارير إغلاق بعد')}</div><button class="fab" onclick="closeDayModal()">إغلاق صندوق اليوم</button>`;
}

/* ================= واجهة المدير الرئيسية ================= */
IC.backup='<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>';
IC.exit='<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>';
IC.refresh='<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>';
IC.min='<path d="M5 12h14"/>';
IC.search='<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>';
state.homeTab='acc';state.pm={};state.recent=[];
function pushRecent(v){if(v==='home'||!TITLES[v])return;state.recent=[v].concat(state.recent.filter(x=>x!==v)).slice(0,4)}
function setHomeTab(t){state.homeTab=t;render()}
function togglePanel(k){state.pm[k]=!state.pm[k];render()}
function lastClosing(){return db.closings.slice().sort((a,b)=>a.at<b.at?-1:1).slice(-1)[0]||null}
function cashBalance(){
  const last=lastClosing();
  const af=x=>!last||(x.at?x.at>last.at:x.date>last.date);
  const sales=sum(db.sales.filter(s=>!s.void&&af(s)&&s.method!=='card'&&s.method!=='transfer'),s=>Math.min(s.paid,s.total));
  const cp=sum(db.payments.filter(p=>af(p)&&p.type==='c'),p=>p.amount),sp=sum(db.payments.filter(p=>af(p)&&p.type!=='c'),p=>p.amount);
  const rt=sum(db.returns.filter(r=>af(r)&&r.method==='cash'),r=>r.total);
  const ex=sum(db.expenses.filter(e=>af(e)),e=>e.amount),pu=sum(db.purchases.filter(p=>af(p)),p=>p.paid||0);
  return r2(sales+cp-sp-rt-ex-pu);
}
IC.bell='<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>';
IC.trend='<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>';
IC.cube='<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>';
IC.cubeplus='<path d="M20 12V8l-8-5-8 5v8l8 5 3-2"/><path d="M4 8l8 5 8-5M12 13v8M19 16v6M16 19h6"/>';
IC.userc='<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3.5"/><path d="M5.5 19a7.5 7.5 0 0 1 13 0"/>';
IC.userplus='<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M19 8v6M16 11h6"/>';
IC.chev='<path d="M6 9l6 6 6-6"/>';
IC.doc='<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>';
IC.cartplus='<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/><path d="M12 8v5M9.5 10.5h5"/>';
IC.chartbar='<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>';
function orvexLogo(k){return `<img class="lg" src="icon-512.png" alt="ORVEX" loading="eager" decoding="async">`}
const dashNice=m=>{if(m<=0)return 4;const e=Math.pow(10,Math.floor(Math.log10(m))),f=m/e;return(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e};
function dashChart(days){
  const W=700,H=250,pl=66,pr=18,pt=14,pb=30,mx=Math.max(0,...days.map(d=>d.v)),top=dashNice(mx);
  const X=i=>pl+i*(W-pl-pr)/(days.length-1),Y=v=>pt+(1-v/top)*(H-pt-pb);
  const pts=days.map((d,i)=>[X(i),Y(d.v)]),f=n=>n.toFixed(1);
  const line=pts.map((p,i)=>(i?'L':'M')+f(p[0])+' '+f(p[1])).join(' ');
  const area=line+' L'+f(pts[pts.length-1][0])+' '+(H-pb)+' L'+f(pts[0][0])+' '+(H-pb)+' Z';
  let g='';for(let k=0;k<=4;k++){const v=top*k/4,y=Y(v);g+=`<line x1="${pl}" x2="${W-pr}" y1="${f(y)}" y2="${f(y)}" stroke="#14452b" stroke-opacity=".55"/><text x="${pl-8}" y="${f(y+4)}" text-anchor="end" fill="#a9c7b8" font-size="11">${fmt(v)}</text>`}
  const xl=days.map((d,i)=>`<text x="${f(X(i))}" y="${H-8}" text-anchor="middle" fill="#a9c7b8" font-size="11">${d.d.slice(5).replace('-','/')}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="المبيعات خلال آخر 7 أيام"><defs><linearGradient id="chA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27e060" stop-opacity=".55"/><stop offset="1" stop-color="#27e060" stop-opacity=".02"/></linearGradient></defs>${g}<line x1="${pl}" x2="${pl}" y1="${pt}" y2="${H-pb}" stroke="#2a6a45"/><path d="${area}" fill="url(#chA)"/><path d="${line}" fill="none" stroke="#2cf06a" stroke-width="3" stroke-linejoin="round"/>${pts.map(p=>`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="4.5" fill="#27e060"/>`).join('')}${xl}</svg>`;
}
function dashTrend(a,b){if(!(b>0))return '<em class="tr fl">—</em>';const p=Math.round((a-b)/b*100);return p>=0?`<em class="tr">↑ ${p}%</em>`:`<em class="tr dn">↓ ${Math.abs(p)}%</em>`}
function odShell(content){
  const now=new Date(),t=today(),p2=n=>String(n).padStart(2,'0'),u=curUser(),low=db.products.filter(p=>p.stock<=p.min),act=state.view,rec=state.recent.filter(canView);
  const side=[['لوحة المحلات','studio',"go('studio')",isDesigner()],['نقطة مبيع','pos',"go('pos')",can('pos')],['فاتورة المبيعات','invoices',"go('invoices')",canView('invoices')],['فاتورة مشتريات','purchases',"newPurchase()",canView('purchases')&&can('purchases')],['مرتجع مبيعات','returns',"go('returns')",canView('returns')],['سند صرف (مصروفات)','expenses',"go('expenses')",canView('expenses')],['كشف حساب عميل','parties',"go('parties')",canView('parties')],['جرد المستودعات','stock',"go('stock')",canView('stock')],['التقارير والأرباح','reports',"go('reports')",canView('reports')],['إغلاق الصندوق','closings',"closeDayModal()",can('close_day')],['تقارير الإغلاق','closings',"go('closings')",canView('closings')],['الدفتر المحاسبي','closings',"ledOpen()",isAdmin()||can('reports')],['الرقابة المالية والموافقات','closings',"finOpen()",isAdmin()],['المستخدمون','users',"go('users')",canView('users')],['الموقع الإلكتروني','site',"go('site')",canView('site')],['الإعدادات','settings',"go('settings')",canView('settings')],['النسخ الاحتياطي','backup',"backupModal()",isAdmin()&&feat('backup')],['تسمية الخانات','settings',"navNamesModal()",isAdmin()],['خروج','exit',"logout()",true]].filter(x=>x[3]);
  return `<div class="odash">
  <header class="od-h">
    <div class="od-clock"><b id="dClk">${p2(now.getHours())}:${p2(now.getMinutes())}</b><span>${t.replace(/-/g,'/')}</span></div>
    <button class="od-user" onclick="dashUser()" aria-label="الحساب"><span class="av">${svg('userc')}</span><div class="nm"><b>${esc(u.name)}</b><span>${esc(roleLabel(u))}</span></div><svg class="ic cv" viewBox="0 0 24 24">${IC.chev}</svg></button>
    <button class="od-bell" onclick="dashBell()" aria-label="التنبيهات">${svg('bell')}${low.length?'<i></i>':''}</button>
    <div class="od-search">${svg('search')}<input class="sr" id="dSearch" placeholder="ابحث عن منتج أو عميل ..." onkeydown="if(event.key==='Enter')dashSearch(this.value)"></div>
    <div class="od-brand">${orvexLogo('h')}<div class="tx"><span class="ow">ORVE<i>X</i></span><small>نظام المبيعات الذكي</small></div></div>
  </header>
  <aside class="od-side">
    <button class="od-mi ${act==='home'?'on':''}" onclick="go('home')">${svg('home')}${esc(navNm('الرئيسية'))}</button>
    ${side.map(([l,ic,a])=>`<button class="od-mi ${a==='go(\''+act+'\')'?'on':''}" onclick="${a}">${svg(ic)}${esc(navNm(l))}</button>`).join('')}
    ${rec.length?`<h4>آخر النوافذ المستخدمة</h4>${rec.map(v=>`<button class="od-mi sm" onclick="go('${jsq(v)}')">${esc(navNm(TITLES[v]))}</button>`).join('')}`:''}
    <div class="od-sb">${orvexLogo('s')}<span class="ow">ORVE<i>X</i></span><small>نظام المبيعات الذكي</small></div>
  </aside>
${content}
  <footer class="od-f"><span>مع ORVEX .. مبيعاتك أسهل وأسرع</span><span class="st">${typeof navigator!=='undefined'&&navigator.onLine===false?'يعمل دون اتصال':'النظام متصل'}</span></footer></div>`;
}
function vHomeAdmin(){
  const u=curUser(), now=new Date(), t=today(), low=db.products.filter(p=>p.stock<=p.min);
  const inStock=db.products.filter(p=>p.stock>0).length;
  const mon=db.sales.filter(s=>!s.void&&s.date.slice(0,7)===t.slice(0,7));
  const salesTotal=sum(mon,s=>s.total);
  const tiles=[
    ['pos','المبيعات','إضافة فاتورة بيع',"go('pos')",can('pos'),'green'],
    ['stock','المخزون','المنتجات والمستودعات',"go('stock')",canView('stock'),'blue'],
    ['parties','الموظفون والعملاء','إدارة العملاء والمستخدمين',"go('parties')",can('parties')||canView('users'),'orange'],
    ['reports','التقارير','المبيعات والأرباح والإحصائيات',"go('reports')",canView('reports'),'purple'],
    ['purchases','المشتريات','فواتير الموردين والمشتريات',"newPurchase()",can('purchases')&&canView('purchases'),'teal'],
    ['expenses','الحسابات','الصندوق والمصروفات',"go('closings')",can('close_day')||can('reports'),'red'],
    ['settings','الإعدادات','إعدادات النظام والمستخدمين',"go('settings')",canView('settings'),'slate'],
    ['more','إدارة المتاجر','إدارة الفروع والمتاجر',"go('studio')",isDesigner(),'green']
  ].filter(x=>x[4]);
  const nav=[
    ['home','الرئيسية',"go('home')",true],
    ['pos','المبيعات',"go('pos')",can('pos')],
    ['stock','المخزون',"go('stock')",canView('stock')],
    ['parties','العملاء',"go('parties')",canView('parties')],
    ['purchases','الموردون',"go('purchases')",canView('purchases')],
    ['reports','التقارير',"go('reports')",canView('reports')],
    ['settings','الإعدادات',"go('settings')",canView('settings')]
  ].filter(x=>x[3]);
  const date=now.toLocaleDateString('ar-IQ',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const time=now.toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'});
  return `<div class="odash odash-home">
    <header class="od-h">
      <div class="od-brand"><span class="ow">ORVEX</span></div>
      <div class="od-store">${svg('studio')}<span>${esc(db.settings.shopName||'المتجر الرئيسي')}</span></div>
      <div class="od-search">${svg('search')}<input class="sr" id="dSearch" placeholder="ابحث عن منتج أو عميل ..." onkeydown="if(event.key==='Enter')dashSearch(this.value)"></div>
      <button class="od-bell" onclick="dashBell()" aria-label="التنبيهات">${svg('bell')}${low.length?'<i></i>':''}</button>
      <button class="od-user" onclick="dashUser()" aria-label="الحساب"><span class="av">${svg('userc')}</span><div class="nm"><b>${esc(u.name)}</b><span>${esc(roleLabel(u))}</span></div></button>
    </header>
    <main class="od-main od-home-main">
      <section class="od-welcome">
        <div><h1>مرحباً بك في <b>ORVEX</b></h1><p>إدارة أسهل .. أعمال أفضل</p></div>
        <div class="od-date"><b>${time}</b><span>${date}</span></div>
      </section>
      <section class="od-home-tiles">
        ${tiles.map(([ic,l,sub,a,,color])=>`<button class="od-home-tile ${color}" onclick="${a}"><span class="od-home-icon">${svg(ic)}</span><b>${esc(l)}</b><small>${esc(sub)}</small></button>`).join('')}
      </section>
      <section class="od-home-summary">
        <div><span>مبيعات هذا الشهر</span><b>${money(salesTotal)}</b></div>
        <div><span>منتجات متوفرة</span><b>${fmt(inStock)}</b></div>
        <div><span>تنبيهات المخزون</span><b>${fmt(low.length)}</b></div>
      </section>
    </main>
    <footer class="od-f"><span>ORVEX v1.0.0 · نظام إدارة متكامل</span><span class="st">${typeof navigator!=='undefined'&&navigator.onLine===false?'يعمل دون اتصال':'متصل بالإنترنت'}</span></footer>
  </div>`;
}
function dashSearch(v){v=(v||'').trim().toLowerCase();if(!v)return;
  const P=db.products.filter(p=>p.name.toLowerCase().includes(v)||(p.sku||'').toLowerCase().includes(v)).slice(0,10);
  const C=db.customers.filter(c=>c.name.toLowerCase().includes(v)||(c.phone||'').includes(v)).slice(0,10);
  modal('نتائج البحث',(P.length||C.length)?(P.length?`<h3 style="margin:0 0 6px;font-size:14px">المنتجات</h3><div class="card">${P.map(p=>`<button class="row tap" onclick="productForm('${jsq(p.id)}')"><div class="grow t">${esc(p.name)}</div><small>${p.stock} في المخزون</small><b>${money(p.price)}</b></button>`).join('')}</div>`:'')+(C.length?`<h3 style="margin:0 0 6px;font-size:14px">العملاء</h3><div class="card">${C.map(c=>`<button class="row tap" onclick="partyDetail('c','${jsq(c.id)}')"><div class="grow t">${esc(c.name)}</div><small>${esc(c.phone||'')}</small></button>`).join('')}</div>`:''):empty('لا توجد نتائج'))}
function dashBell(){const low=db.products.filter(p=>p.stock<=p.min);
  if(!low.length)return toast('لا توجد تنبيهات');
  modal('تنبيه نقص المخزون ('+low.length+')',`<div class="card">${low.slice(0,30).map(x=>`<div class="row"><div class="grow t">${esc(x.name)}</div><span class="badge ${x.stock<=0?'bad':'warn'}">${x.stock<=0?'نفد':'متبقي '+x.stock}</span></div>`).join('')}</div>${canView('purchases')?`<div class="actions"><button class="btn primary" onclick="closeModal();newPurchase()">فاتورة مشتريات</button></div>`:''}`)}
function dashUser(){const u=curUser();modal(u.name,`<p class="muted" style="margin-top:0">${esc(roleLabel(u))}</p><div class="actions"><button class="btn" onclick="closeModal();pwModal()">تغيير كلمة المرور</button><button class="btn danger" onclick="closeModal();logout()">تسجيل الخروج</button></div>`)}
setInterval(()=>{const e=$('#dClk');if(e){const d=new Date(),p=n=>String(n).padStart(2,'0');e.textContent=p(d.getHours())+':'+p(d.getMinutes())}},15000);

