/* ================= بيانات تجريبية ================= */
function loadDemo(){
  if(!isAdmin()||!feat('demo'))return toast('للمدير فقط');
  if(db.products.length||db.sales.length)return askConfirm('سيتم استبدال بياناتك الحالية بالبيانات التجريبية. متابعة؟',()=>{wipeData();loadDemo()},'استبدال');
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
  const P=[['ماء معدني 600مل','6281001','مشروبات',.5,1],['عصير برتقال 1 لتر','6281002','مشروبات',3,5.5],['قهوة عربية 250غ','6281003','مشروبات',14,24],['شاي أخضر 100 كيس','6281004','مشروبات',9,16],['شيبس بطعم الملح','6281005','وجبات خفيفة',1.5,3],['شوكولاتة بالحليب','6281006','وجبات خفيفة',2.5,4.5],['تمر سكري 500غ','6281007','وجبات خفيفة',12,20],['سائل غسيل أطباق','6281008','منظفات',6,10.5],['مناديل ورقية','6281009','منظفات',4,7.5],['دفتر ملاحظات A5','6281010','أدوات مكتبية',3,6],['قلم حبر أزرق (علبة)','6281011','أدوات مكتبية',7,12],['حقيبة قماشية','6281012','أدوات مكتبية',5,9]];
  db.products=P.map(p=>({id:uid(),sku:p[1],name:p[0],cat:p[2],cost:p[3],price:p[4],wholesale:r2(p[4]*0.85),stock:150+Math.floor(rnd()*80),min:15}));
  db.customers=['شركة النور للتجارة','أحمد المطيري','سارة العتيبي','مؤسسة الأفق'].map((n,i)=>({id:uid(),name:n,phone:'9665000000'+i,balance:0,note:'',type:'retail'}));
  db.suppliers=['مورد المشروبات الوطني','شركة الواحة للتوزيع','مستلزمات المكتب الحديثة'].map((n,i)=>({id:uid(),name:n,phone:'',balance:0,note:''}));
  const M=['cash','card','transfer','cash'];
  const list=[];
  for(let i=0;i<70;i++){const off=Math.floor(Math.pow(rnd(),1.4)*30);const d=new Date();d.setDate(d.getDate()-off);list.push({d,r:rnd()})}
  list.sort((a,b)=>a.d-b.d);
  list.forEach(x=>{
    const n=1+Math.floor(rnd()*4),items=[];
    for(let k=0;k<n;k++){const p=db.products[Math.floor(rnd()*db.products.length)];if(items.some(i=>i.pid===p.id))continue;const q=1+Math.floor(rnd()*4);items.push({pid:p.id,name:p.name,qty:q,price:p.price,cost:p.cost});p.stock-=q}
    const sub=sum(items,i=>i.qty*i.price),disc=rnd()<.15?Math.round(sub*.05):0,net=sub-disc,tax=r2(net*db.settings.tax/100),total=r2(net+tax);
    const c=rnd()<.5?db.customers[Math.floor(rnd()*db.customers.length)]:null;let method=M[Math.floor(rnd()*M.length)],paid=total;
    if(c&&rnd()<.3){method='credit';paid=rnd()<.5?0:r2(total/2);c.balance=r2(c.balance+total-paid)}
    const at=new Date(x.d);at.setHours(9+Math.floor(rnd()*10),Math.floor(rnd()*60));
    db.sales.push({id:uid(),no:db.settings.prefix+db.settings.next++,at:at.toISOString(),date:ymd(at),cid:c?c.id:'',items,subtotal:sub,discount:disc,net,tax,total,paid,method,cost:sum(items,i=>i.cost*i.qty)});
  });
  db.products.forEach(p=>{if(p.stock<5)p.stock=5+Math.floor(rnd()*10)});
  db.products[2].stock=6;db.products[6].stock=0;
  [['إيجار',2500,1],['رواتب',4200,3],['كهرباء وماء',380,8],['تسويق',450,12],['مواصلات',160,5]].forEach(([c,a,o])=>{const d=new Date();d.setDate(d.getDate()-o);db.expenses.push({id:uid(),cat:c,amount:a,date:ymd(d),note:''})});
  const sp=db.suppliers[0];sp.balance=1200;
  db.purchases.push({id:uid(),no:'PO-'+db.settings.nextPo++,at:new Date().toISOString(),date:today(),sid:sp.id,lines:[{pid:db.products[0].id,name:db.products[0].name,qty:200,cost:.5}],total:100,paid:100});
  save();render();toast('تم تحميل البيانات التجريبية');
}

function vHomeBasic(){
  const u=curUser();
  const q=[['pos','نقطة البيع','pos'],['invoices','الفواتير','invoices'],['stock','المخزون','stock_view'],['parties','العملاء','parties']].filter(x=>can(x[2]));
  return `<section class="hero"><p class="lab" style="margin-top:0">مرحباً</p><div class="big" style="font-size:26px">${esc(u.name)}</div><p class="sub">${esc(roleLabel(u))}</p></section>
  ${q.length?`<div class="menu">${q.map(([k,l])=>`<button onclick="go('${jsq(k)}')">${svg(k)}${l}</button>`).join('')}</div>`:'<div class="card empty">لا توجد صلاحيات مفعّلة لحسابك. تواصل مع المدير.</div>'}`}
function pfMargin(){
  const m=$('#pf_m'),ce=$('#pf_cost');if(!m||!ce)return;
  const c=num(ce.value),wh=$('#pf_wh'),w=wh?num(wh.value):0,p=num($('#pf_price').value);
  const f=v=>v>0&&c>0?fmt(v-c)+' ('+fmt((v-c)/c*100)+'%)':'-';
  m.textContent='ربح المفرد: '+f(p)+(wh?'     ربح الجملة: '+f(w):'');
}
function unitPrice(p){return p.price}
function retAvail(s){const o={};s.items.forEach(i=>{o[i.pid]=(o[i.pid]||0)+i.qty});db.returns.filter(r=>r.saleId===s.id).forEach(r=>r.items.forEach(i=>{o[i.pid]=(o[i.pid]||0)-i.qty}));return o}
function retStart(sid){
  if(!can('returns'))return toast('ليست لديك صلاحية المرتجعات');
  const s=db.sales.find(x=>x.id===sid);if(!s)return;
  if(s.void)return toast('هذه الفاتورة ملغاة');
  if(sum(Object.values(retAvail(s)),x=>x)<=0)return toast('أُرجعت كل مواد هذه الفاتورة');
  state.ret={sid,q:{},method:(s.cid&&s.total-s.paid>0.005)?'balance':'cash'};
  modal('مرتجع من '+s.no,retBody());
}
function retFactor(s){return s.subtotal>0?s.total/s.subtotal:1}
function retTotal(){const R=state.ret,s=db.sales.find(x=>x.id===R.sid);return r2(sum(s.items,i=>(R.q[i.pid]||0)*i.price)*retFactor(s))}
function retBody(){
  const R=state.ret,s=db.sales.find(x=>x.id===R.sid),av=retAvail(s);
  const rows=s.items.map(i=>{const a=av[i.pid]||0;
    return `<div class="row"><div class="grow"><div class="t">${esc(i.name)}</div><small>بيع ${i.qty} × ${fmt(i.price)} - المتاح للإرجاع: ${a}</small></div>${a>0?`<input type="number" inputmode="decimal" min="0" max="${a}" step="any" value="${R.q[i.pid]||''}" placeholder="0" style="width:80px" oninput="retQ('${i.pid}',this.value)" aria-label="كمية المرتجع">`:'<span class="badge grey">لا متاح</span>'}</div>`}).join('');
  const m=[['cash','ردّ نقدي']];if(s.cid)m.push(['balance','خصم من رصيد العميل']);
  return `<div class="card">${rows}</div><label>طريقة التعويض</label>${chips(m,R.method,'retMethod')}
  <div class="card" style="margin-top:8px"><div class="row"><span class="grow"><b>قيمة المرتجع</b></span><b id="rtTot" style="font-size:18px">${money(retTotal())}</b></div></div>
  <div class="actions"><button class="btn" onclick="retAll()">إرجاع الكل</button><button class="btn primary" onclick="doReturn()">تأكيد المرتجع</button></div>`;
}
function retQ(pid,v){
  const R=state.ret,s=db.sales.find(x=>x.id===R.sid),a=retAvail(s)[pid]||0;let q=Math.max(0,num(v));
  if(q>a){q=a;toast('المتاح للإرجاع: '+a);R.q[pid]=q;return setBody(retBody())}
  R.q[pid]=q;const e=$('#rtTot');if(e)e.textContent=money(retTotal());
}
function retMethod(m){state.ret.method=m;setBody(retBody())}
function retAll(){const R=state.ret,s=db.sales.find(x=>x.id===R.sid),av=retAvail(s);R.q={};s.items.forEach(i=>{if(av[i.pid]>0)R.q[i.pid]=av[i.pid]});setBody(retBody())}
function doReturn(){
  const R=state.ret,s=db.sales.find(x=>x.id===R.sid);if(!s)return;
  const av=retAvail(s),items=[];
  s.items.forEach(i=>{const q=Math.min(R.q[i.pid]||0,av[i.pid]||0);if(q>0)items.push({pid:i.pid,name:i.name,qty:q,price:i.price,cost:i.cost})});
  if(!items.length)return toast('أدخل كمية مرتجع لمادة واحدة على الأقل');
  if(R.method==='balance'&&!s.cid)return toast('اختر ردّ نقدي لأن الفاتورة بدون عميل');
  const gross=sum(items,i=>i.qty*i.price),f=s.subtotal>0?s.net/s.subtotal:1;
  const r={id:uid(),no:nextNo('rt'),at:new Date().toISOString(),date:today(),saleId:s.id,saleNo:s.no,cid:s.cid,items,total:r2(gross*retFactor(s)),net:r2(gross*f),cost:r2(sum(items,i=>i.qty*i.cost)),method:R.method,cashier:(curUser()||{}).name||''};
  items.forEach(i=>{const p=prod(i.pid);if(p)p.stock+=i.qty});
  if(window.orvexRestoreItems)orvexRestoreItems(items,r.no,'مرتجع',s);
  if(window.orvexLoyReverse)orvexLoyReverse(s,r);
  if(R.method==='balance'){const c=cust(s.cid);if(c)c.balance=r2(c.balance-r.total)}
  db.returns.push(r);save();state.ret=null;
  render();showReturn(r.id);toast('تم تسجيل المرتجع');
}
function showReturn(id){
  const r=db.returns.find(x=>x.id===id);if(!r)return;const st=db.settings,c=cust(r.cid);
  modal('مرتجع '+r.no,`<div class="inv" id="printArea"><h3>${esc(st.name)}</h3><small>إيصال مرتجع مبيعات</small>
  <hr style="border:0;border-top:1px dashed #bbb;margin:10px 0">
  <div class="tot"><span>رقم المرتجع</span><b>${esc(r.no)}</b></div><div class="tot"><span>الفاتورة الأصلية</span><span>${esc(r.saleNo)}</span></div>
  <div class="tot"><span>التاريخ</span><span>${fdate(r.date)}</span></div><div class="tot"><span>العميل</span><span>${esc(c?c.name:'عميل نقدي')}</span></div>
  <div class="table-wrap" style="margin-top:8px"><table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الإجمالي</th></tr>${r.items.map(i=>`<tr><td style="white-space:normal">${esc(i.name)}</td><td class="n">${i.qty}</td><td class="n">${fmt(i.price)}</td><td class="n">${fmt(i.qty*i.price)}</td></tr>`).join('')}</table></div>
  <div class="tot g"><span>قيمة المرتجع</span><span>${money(r.total)}</span></div>
  <div class="tot"><span>طريقة التعويض</span><span>${r.method==='cash'?'ردّ نقدي':'خصم من رصيد العميل'}</span></div>${r.cashier?`<div class="tot"><span>الكاشير</span><span>${esc(r.cashier)}</span></div>`:''}</div>
  <div class="actions no-print"><button class="btn primary" onclick="window.print()">طباعة</button></div>`);
}
function vReturns(){
  const l=db.returns.slice().reverse();
  return `<div class="card">${l.length?l.map(r=>{const c=cust(r.cid);return `<button class="row tap" onclick="showReturn('${jsq(r.id)}')"><div class="grow"><div class="t">${esc(r.no)}</div><small>من ${esc(r.saleNo)} - ${esc(c?c.name:'عميل نقدي')} - ${fdate(r.date)}</small></div><div class="end"><b>${money(r.total)}</b><br><span class="badge ${r.method==='cash'?'':'warn'}">${r.method==='cash'?'ردّ نقدي':'من الرصيد'}</span></div></button>`}).join(''):empty('لا توجد مرتجعات')}</div><button class="fab" onclick="returnModal()">+ مرتجع جديد</button>`}
