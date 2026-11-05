/* ================= الفاتورة ================= */
function invoiceText(s){const st=db.settings,c=cust(s.cid);
  return `${st.name}\nفاتورة رقم ${s.no}\nالتاريخ: ${fdate(s.date)}\n`+(c?`العميل: ${c.name}\n`:'')+'--------------\n'+s.items.map(i=>`${i.name} × ${i.qty} = ${fmt(i.qty*i.price)}`).join('\n')+'\n--------------\n'+(s.discount?`الخصم: ${fmt(s.discount)}\n`:'')+(s.tax?`الضريبة: ${fmt(s.tax)}\n`:'')+`الإجمالي: ${money(s.total)}\nالمدفوع: ${money(s.paid)}\nالمتبقي: ${money(s.total-s.paid)}\nشكراً لتعاملكم معنا`}
function showInvoice(id,change){
  const s=db.sales.find(x=>x.id===id);if(!s)return;const st=db.settings,c=cust(s.cid);
  const phone=c&&c.phone?c.phone.replace(/\D/g,''):'';
  const wa=`https://wa.me/${phone}?text=${encodeURIComponent(invoiceText(s))}`;
  const M={cash:'نقدي',card:'بطاقة',transfer:'تحويل',credit:'آجل'};
  modal('فاتورة '+s.no,`${change>0?`<div class="note no-print">الباقي للزبون: <b>${money(change)}</b></div>`:''}<div class="inv" id="printArea">
    <h3>${esc(st.name)}</h3><small>${esc(st.address||'')} ${st.phone?'- '+esc(st.phone):''}</small>${st.taxNo?`<br><small>الرقم الضريبي: ${esc(st.taxNo)}</small>`:''}
    <hr style="border:0;border-top:1px dashed #bbb;margin:10px 0">
    <div class="tot"><span>رقم الفاتورة</span><b>${esc(s.no)}</b></div>
    <div class="tot"><span>التاريخ</span><span>${fdate(s.date)}</span></div>
    <div class="tot"><span>العميل</span><span>${esc(c?c.name:'عميل نقدي')}</span></div>
    <div class="tot"><span>طريقة الدفع</span><span>${M[s.method]||''}</span></div>
    ${s.rep?`<div class="tot"><span>المندوب</span><span>${esc(s.rep)}</span></div>`:''}${s.cashier?`<div class="tot"><span>الكاشير</span><span>${esc(s.cashier)}</span></div>`:''}
    <div class="table-wrap" style="margin-top:8px"><table><tr><th>الصنف</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الإجمالي</th></tr>${s.items.map(i=>`<tr><td style="white-space:normal">${esc(i.name)}${i.dp?` <small>(خصم ${i.dp}%)</small>`:''}</td><td class="n">${i.qty}</td><td class="n">${fmt(i.price)}</td><td class="n">${fmt(i.qty*i.price)}</td></tr>`).join('')}</table></div>
    <div style="margin-top:8px"><div class="tot"><span>المجموع</span><span>${money(s.subtotal+(s.lineDisc||0))}</span></div>
    ${s.lineDisc?`<div class="tot"><span>خصم الأصناف</span><span>- ${money(s.lineDisc)}</span></div>`:''}
    ${s.discount?`<div class="tot"><span>الخصم</span><span>- ${money(s.discount)}</span></div>`:''}
    ${s.tax?`<div class="tot"><span>الضريبة (${st.tax}%)</span><span>${money(s.tax)}</span></div>`:''}
    <div class="tot g"><span>الإجمالي</span><span>${money(s.total)}</span></div>
    <div class="tot"><span>المدفوع</span><span>${money(s.paid)}</span></div>
    ${s.total-s.paid>0.005?`<div class="tot"><span>المتبقي</span><b>${money(s.total-s.paid)}</b></div>`:''}</div>
    ${db.returns.filter(r=>r.saleId===s.id).map(r=>`<div class="tot" style="color:#b23f2d;margin-top:6px"><span>مرتجع ${esc(r.no)}</span><span>- ${money(r.total)}</span></div>`).join('')}${s.void?'<p style="color:#b23f2d;text-align:center;font-weight:700;margin:10px 0 0">فاتورة ملغاة</p>':'<p style="text-align:center;margin:12px 0 0"><small>شكراً لتعاملكم معنا</small></p>'}
  </div>
  <div class="actions no-print"><button class="btn primary" onclick="window.print()">طباعة</button><a class="btn" href="${wa}" target="_blank" rel="noopener">إرسال واتساب</a>${s.void?'':(can('returns')?`<button class="btn" onclick="retStart('${jsq(s.id)}')">مرتجع</button>`:'')+(can('void')&&!db.returns.some(r=>r.saleId===s.id)?`<button class="btn danger" onclick="voidSale('${jsq(s.id)}')">إلغاء الفاتورة</button>`:'')}</div>`);
}
function voidSale(id){
  if(!can('void'))return toast('ليست لديك صلاحية إلغاء الفواتير');
  if(db.returns.some(r=>r.saleId===id))return toast('لا يمكن إلغاء فاتورة عليها مرتجعات');
  askConfirm('سيتم إلغاء الفاتورة وإرجاع الكميات للمخزون وتعديل رصيد العميل. متابعة؟',()=>{
    const s=db.sales.find(x=>x.id===id);if(!s||s.void)return;
    s.items.forEach(i=>{const p=prod(i.pid);if(p)p.stock+=i.qty});
    if(window.orvexRestoreItems)orvexRestoreItems(s.items,s.no,'إلغاء فاتورة',s);
    const c=cust(s.cid);if(c)c.balance=r2(c.balance-(s.total-s.paid));
    s.void=true;if(window.orvexAudit)orvexAudit(s,'void',{total:s.total});if(window.orvexLog)orvexLog('sale_void',s.no,'الإجمالي '+s.total);if(window.orvexLoyReverse)orvexLoyReverse(s,null);save();render();toast('تم إلغاء الفاتورة')},'إلغاء الفاتورة')}

/* ================= المخزون ================= */
function vStock(){
  return `<input class="search" type="search" placeholder="ابحث في المنتجات" value="${esc(state.stockQ)}" oninput="state.stockQ=this.value;$('#stockList').innerHTML=stockList()">
  <div class="card" id="stockList">${stockList()}</div>${can('stock_edit')?'<button class="fab" onclick="productForm()">+ منتج جديد</button>':''}`}
function stockList(){
  const q=state.stockQ.trim().toLowerCase();
  const l=db.products.filter(p=>!q||p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q));
  if(!l.length)return empty(db.products.length?'لا توجد نتائج':'لا توجد منتجات بعد. اضغط «منتج جديد» للبدء.');
  return l.map(p=>`<button class="row tap" onclick="productForm('${jsq(p.id)}')"><div class="grow"><div class="t">${esc(p.name)}</div><small>${esc(p.cat||'عام')} ${p.sku?'- '+esc(p.sku):''}</small></div><div class="end"><b>${money(p.price)}</b><span class="badge ${p.stock<=0?'bad':p.stock<=p.min?'warn':''}">المخزون ${p.stock}</span></div></button>`).join('')}
function productForm(id){
  const ed=can('stock_edit'),sc=can('see_cost'),dis=ed?'':'disabled';
  if(!id&&!ed)return toast('ليست لديك صلاحية إضافة المواد');
  const p=id?prod(id):{name:'',sku:'',cat:'',cost:'',wholesale:'',price:'',stock:'',min:5};
  const fld=(i,l,v,x)=>`<div><label>${l}</label><input id="${i}" type="number" inputmode="decimal" step="any" ${dis} value="${v}" ${x||''}></div>`;
  const F=[sc?fld('pf_cost','سعر الشراء (التكلفة)',p.cost,'oninput="pfMargin()"'):'',(!id&&isAdmin()?fld('pf_wh','سعر الجملة (للمدير فقط)','','oninput="pfMargin()"'):''),fld('pf_price','سعر المبيع (مفرد)',p.price,'oninput="pfMargin()"'),fld('pf_stock','الكمية في المخزون',p.stock),fld('pf_min','حد التنبيه',p.min)].filter(Boolean);
  let rows='';for(let i=0;i<F.length;i+=2)rows+=`<div class="f2">${F[i]}${F[i+1]||''}</div>`;
  modal(id?(ed?'تعديل مادة':'بيانات المادة'):'مادة جديدة',`<label>اسم المادة</label><input id="pf_name" ${dis} value="${esc(p.name)}">
  <div class="f2"><div><label>الباركود / الرمز</label><input id="pf_sku" ${dis} value="${esc(p.sku)}"></div><div><label>التصنيف</label><input id="pf_cat" ${dis} list="catlist" value="${esc(p.cat)}"><datalist id="catlist">${cats().slice(1).map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div></div>
  ${rows}${siteOn()?`<label class="pchk" style="border:0;margin-top:8px"><input type="checkbox" id="pf_web" ${dis} ${p.web===false?'':'checked'}> عرض في الموقع الإلكتروني</label>`:''}${sc?'<p id="pf_m" class="muted" style="font-size:12.5px;margin:8px 0 0"></p>':''}
  <p class="muted" style="font-size:12.5px;margin:8px 0 0">${!id&&isAdmin()?'سعر الجملة يُسجَّل هنا عند إدخال المادة فقط، ولا يظهر في المبيعات ولا لغير المدير.':''}</p>
  ${ed?`<div class="actions"><button class="btn primary" onclick="saveProduct('${jsq(id||'')}')">حفظ</button>${id?`<button class="btn danger" onclick="delProduct('${jsq(id)}')">حذف</button>`:''}</div>`:''}`);
  pfMargin();
}
function saveProduct(id){
  if(!can('stock_edit'))return toast('ليست لديك صلاحية التعديل');
  const name=$('#pf_name').value.trim();if(!name)return toast('أدخل اسم المادة');
  const sku=$('#pf_sku').value.trim();if(sku&&db.products.some(p=>p.sku===sku&&p.id!==id))return toast('هذا الباركود مستخدم لمادة أخرى');
  const old=id?prod(id):null,ce=$('#pf_cost');
  const o={name,sku,cat:$('#pf_cat').value.trim()||'عام',cost:ce?num(ce.value):(old?old.cost:0),wholesale:$('#pf_wh')?num($('#pf_wh').value):(old?(old.wholesale||0):0),price:num($('#pf_price').value),stock:num($('#pf_stock').value),min:num($('#pf_min').value)};if($('#pf_web'))o.web=$('#pf_web').checked;
  if(id)Object.assign(old,o);else db.products.push({id:uid(),...o});
  save();closeModal();render();toast('تم الحفظ');
}
function delProduct(id){if(!can('stock_edit'))return toast('ليست لديك صلاحية الحذف');askConfirm('حذف هذه المادة؟ الفواتير السابقة ستبقى كما هي.',()=>{const _dp=prod(id);if(window.orvexLog&&_dp)orvexLog('product_delete',_dp.name,'المخزون '+_dp.stock+' | السعر '+_dp.price);db.products=db.products.filter(p=>p.id!==id);state.cart=state.cart.filter(l=>l.pid!==id);save();render()},'حذف')}

