/* ================= العملاء والموردون ================= */
function vParties(){
  const c=state.partyTab==='c',L=c?db.customers:db.suppliers;
  return `<div class="seg"><button class="${c?'on':''}" onclick="state.partyTab='c';render()">العملاء (${db.customers.length})</button><button class="${!c?'on':''}" onclick="state.partyTab='s';render()">الموردون (${db.suppliers.length})</button></div>
  <div class="card">${L.length?L.map(x=>`<button class="row tap" onclick="partyDetail('${jsq(state.partyTab)}','${jsq(x.id)}')"><div class="grow"><div class="t">${esc(x.name)}</div><small>${esc(x.phone||'بدون هاتف')}</small></div><div class="end">${x.balance>0.005?`<b class="${c?'good':'bad'}">${money(x.balance)}</b><br><small>${c?'مستحق لنا':'مستحق عليك'}</small>`:'<small>لا يوجد رصيد</small>'}</div></button>`).join(''):empty(c?'لا يوجد عملاء بعد':'لا يوجد موردون بعد')}</div>
  <button class="fab" onclick="partyForm('${jsq(state.partyTab)}')">+ ${c?'عميل جديد':'مورد جديد'}</button>`}
function partyForm(t,id){
  if(!can('parties'))return toast('ليست لديك صلاحية إدارة العملاء والموردين');
  const L=t==='c'?db.customers:db.suppliers;const x=id?L.find(y=>y.id===id):{name:'',phone:'',note:'',type:'retail'};
  modal((id?'تعديل ':'')+(t==='c'?'عميل':'مورد'),`<label>الاسم</label><input id="pt_name" value="${esc(x.name)}"><label>الهاتف (مع رمز الدولة لاستخدام واتساب)</label><input id="pt_phone" inputmode="tel" value="${esc(x.phone)}">
  
  <label>ملاحظات</label><input id="pt_note" value="${esc(x.note||'')}">${t==='c'?`<label>حد الائتمان (فارغ أو 0 = بدون حد)</label><input id="pt_cl" type="number" inputmode="decimal" min="0" step="any" value="${x.creditLimit>0?esc(x.creditLimit):''}">`:''}
  <div class="actions"><button class="btn primary" onclick="saveParty('${jsq(t)}','${jsq(id||'')}')">حفظ</button></div>`)}
function saveParty(t,id){const name=$('#pt_name').value.trim();if(!name)return toast('أدخل الاسم');const L=t==='c'?db.customers:db.suppliers;const o={name,phone:$('#pt_phone').value.trim(),note:$('#pt_note').value.trim()};
  if(t==='c'){const cl=num($('#pt_cl')?$('#pt_cl').value:0);o.creditLimit=cl>0?r2(cl):0}
  if(id)Object.assign(L.find(y=>y.id===id),o);else L.push({id:uid(),balance:0,...o});save();closeModal();render();toast('تم الحفظ')}
function partyDetail(t,id){
  const c=t==='c',x=(c?cust:supp)(id);
  const hist=[];
  if(c)db.sales.filter(s=>s.cid===id&&!s.void).forEach(s=>hist.push({d:s.at,l:'فاتورة '+s.no,v:s.total,r:s.total-s.paid}));
  else db.purchases.filter(p=>p.sid===id).forEach(p=>hist.push({d:p.at,l:'أمر شراء '+p.no,v:p.total,r:p.total-p.paid}));
  db.payments.filter(p=>p.type===t&&p.pid===id).forEach(p=>hist.push({d:p.at,l:c?'دفعة مستلمة':'دفعة مسدّدة',v:p.amount,pay:true}));
  if(c)db.returns.filter(r=>r.cid===id).forEach(r=>hist.push({d:r.at,l:'مرتجع '+r.no,v:r.total,pay:true}));
  hist.sort((a,b)=>b.d.localeCompare(a.d));
  modal(x.name,`<div class="card"><div class="row"><span class="grow">الهاتف</span><span>${esc(x.phone||'-')}</span></div><div class="row"><span class="grow">${c?'المستحق على العميل':'المستحق للمورد'}</span><b class="${x.balance>0.005?(c?'good':'bad'):''}" style="font-size:18px">${money(x.balance)}</b></div>${c&&x.creditLimit>0?`<div class="row"><span class="grow">حد الائتمان / المتاح</span><span>${money(x.creditLimit)} / <b class="${x.creditLimit-x.balance<0?'bad':'good'}">${money(Math.max(0,r2(x.creditLimit-x.balance)))}</b></span></div>`:''}</div>
  <label>${c?'تسجيل دفعة مستلمة':'تسجيل دفعة مسدّدة'}</label><div style="display:flex;gap:8px"><input id="payAmt" type="number" inputmode="decimal" placeholder="المبلغ" value="${x.balance>0?r2(x.balance):''}"><button class="btn primary" onclick="recordPayment('${jsq(t)}','${jsq(id)}')">تسجيل</button></div>
  <div class="card" style="margin-top:14px"><h3>السجل</h3>${hist.length?hist.slice(0,12).map(h=>`<div class="row"><div class="grow"><div class="t">${esc(h.l)}</div><small>${fdate(h.d.slice(0,10))}</small></div><div class="end"><b class="${h.pay?'good':''}">${h.pay?'':''}${money(h.v)}</b>${h.r>0.005?`<br><small>متبقي ${money(h.r)}</small>`:''}</div></div>`).join(''):empty('لا توجد حركات')}</div>
  <div class="actions"><button class="btn" onclick="partyForm('${jsq(t)}','${jsq(id)}')">تعديل البيانات</button><button class="btn danger" onclick="delParty('${jsq(t)}','${jsq(id)}')">حذف</button></div>`)}
function recordPayment(t,id){const a=num($('#payAmt').value);if(a<=0)return toast('أدخل مبلغاً صحيحاً');const x=(t==='c'?cust:supp)(id);x.balance=r2(x.balance-a);
  db.payments.push({id:uid(),type:t,pid:id,amount:a,at:new Date().toISOString(),date:today()});save();partyDetail(t,id);render();toast('تم تسجيل الدفعة')}
function delParty(t,id){askConfirm('حذف هذا السجل؟ لن يتأثر سجل الفواتير.',()=>{if(t==='c')db.customers=db.customers.filter(x=>x.id!==id);else db.suppliers=db.suppliers.filter(x=>x.id!==id);save();render()},'حذف')}

/* ================= المزيد ================= */
function vMore(){
  const u=curUser();
  const M=[['invoices','الفواتير'],['returns','المرتجعات'],['purchases','المشتريات'],['expenses','المصروفات'],['reports','التقارير'],['closings','إغلاق الصندوق'],['site','الموقع الإلكتروني'],['settings','الإعدادات'],['users','المستخدمون']].filter(m=>canView(m[0]));
  return `<div class="card"><div class="row"><div class="grow"><div class="t">${esc(u.name)}</div><small>@${esc(u.username)} - ${esc(roleLabel(u))}${u.email?' - '+esc(u.email):''}</small></div></div><div class="actions" style="margin-top:6px"><button class="btn" onclick="pwModal()">تغيير كلمة المرور</button><button class="btn danger" onclick="logout()">تسجيل الخروج</button></div></div>
  <div class="menu">${M.map(([k,l])=>`<button onclick="go('${jsq(k)}')">${svg(k)}${l}</button>`).join('')}</div>`}

/* ================= الفواتير ================= */
function vInvoices(){return `<input class="search" type="search" placeholder="ابحث برقم الفاتورة أو اسم العميل" value="${esc(state.invQ)}" oninput="state.invQ=this.value;$('#invList').innerHTML=invList()"><div class="card" id="invList">${invList()}</div>`}
function invList(){const q=state.invQ.trim().toLowerCase();const l=db.sales.filter(s=>{const c=cust(s.cid);return !q||s.no.toLowerCase().includes(q)||(c&&c.name.toLowerCase().includes(q))}).slice().reverse();
  return l.length?l.slice(0,100).map(saleRow).join(''):empty('لا توجد فواتير')}

