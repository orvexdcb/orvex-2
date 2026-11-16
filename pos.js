/* ================= نقطة البيع (واجهة الكاشير) ================= */
const newCo=()=>({cid:'',disc:0,method:'cash',paid:null,rep:'',priceType:'retail'});
state.co=newCo();Object.assign(state,{kp:'',sel:-1,held:[]});
let _clk=null;
const ONES=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const TENS=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
const HUND=['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'];
function below1000(n){const h=Math.floor(n/100),r=n%100,p=[];if(h)p.push(HUND[h]);if(r){if(r<20)p.push(ONES[r]);else{const u=r%10,t=Math.floor(r/10);p.push(u?ONES[u]+' و'+TENS[t]:TENS[t])}}return p.join(' و')}
function toWords(v){
  const a=Math.abs(v);if(a>=1e9)return fmt(v);
  const n=Math.floor(a+1e-9),dec=Math.round((a-n)*100);
  if(n===0&&dec===0)return 'صفر';
  const m=Math.floor(n/1e6),k=Math.floor((n%1e6)/1000),r=n%1000,p=[];
  if(m)p.push(m===1?'مليون':m===2?'مليونان':below1000(m)+(m<=10?' ملايين':' مليون'));
  if(k)p.push(k===1?'ألف':k===2?'ألفان':below1000(k)+(k<=10?' آلاف':' ألف'));
  if(r)p.push(below1000(r));
  let s=p.join(' و')||'صفر';
  if(dec)s+=' و'+dec+' من مئة';
  return s;
}

function calcCart(){
  const co=state.co;let gross=0,sub=0,qty=0;
  state.cart.forEach(l=>{const eff=r2(l.price*(1-(l.dp||0)/100));gross+=l.qty*l.price;sub+=l.qty*eff;qty+=l.qty});
  gross=r2(gross);sub=r2(sub);
  const disc=Math.min(Math.max(num(co.disc),0),sub),net=r2(sub-disc),tax=r2(net*db.settings.tax/100);
  return{gross,sub,lineDisc:r2(gross-sub),disc,net,tax,total:r2(net+tax),qty};
}

function openPos(){
  if($('#pos'))return;
  if(!can('pos'))return toast('ليست لديك صلاحية استخدام نقطة البيع');
  const d=document.createElement('div');d.id='pos';d.setAttribute('data-t',db.settings.posTheme||'orvex');document.body.appendChild(d);
  posRender();tick();_clk=setInterval(tick,1000);focusEntry();
}
function closePos(){clearInterval(_clk);const e=$('#pos');if(e)e.remove();render()}
function posRender(){const e=$('#pos');if(e)e.innerHTML=posHtml()}
function focusEntry(){if(window.matchMedia&&window.matchMedia('(pointer:fine)').matches){const e=$('#posEntry');if(e)e.focus()}}
function tick(){const e=$('#pClock');if(!e)return;const d=new Date(),p=n=>String(n).padStart(2,'0');
  e.textContent=p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())+'   '+d.toLocaleDateString('ar',{weekday:'long'})+'   '+p(d.getDate())+'-'+p(d.getMonth()+1)+'-'+d.getFullYear()}

function posHtmlClassic(){
  const st=db.settings,t=calcCart(),c=cust(state.co.cid),n=state.cart.length;
  const B=(cls,label,fn)=>`<button class="pb ${cls}" onclick="${fn}">${label}</button>`;
  const rows=state.cart.map((l,i)=>{const p=prod(l.pid);return `<tr data-i="${i}" class="${i===state.sel?'sel':''}" onclick="selLine(${i})"><td>${i+1}</td><td class="nm">${esc(p?p.name:'')}</td>
    <td><input type="number" inputmode="decimal" step="any" value="${l.qty}" onchange="setQty(${i},this.value)" aria-label="العدد"></td>
    <td><input type="number" inputmode="decimal" step="any" value="${l.price}" ${can('price_edit')?'':'disabled'} onchange="setPrice(${i},this.value)" aria-label="الافرادي"></td>
    <td id="lt${i}">${fmt(l.qty*l.price)}</td>
    <td><input type="number" inputmode="decimal" step="any" value="${l.dp||0}" ${can('discount')?'':'disabled'} onchange="setDp(${i},this.value)" aria-label="حسم %"></td>
    <td id="ld${i}">${fmt(l.qty*l.price*(l.dp||0)/100)}</td></tr>`}).join('');
  const K=(area,label,cls,fn)=>`<button class="k ${cls}" style="grid-area:${area}" onclick="${fn}">${label}</button>`;
  return `
  <div class="ph"><div class="ph-r">رقم الفاتورة<span class="invno">${esc(st.prefix)}${st.next}</span></div><div class="ph-t">نقطة مبيع</div><div class="ph-l"><a style="cursor:pointer" onclick="switchUser()">${esc((curUser()||{}).name||'')}</a></div></div>
  <div class="pinfo"><span class="logo">${esc(st.name)}</span></div>
  <div class="pbody">
    <div class="pright">
      <div class="bgrid">
        ${B('grey','إضافة سطر',"pickModal('add')")}${B('red','حسم الفاتورة','discModal()')}
        ${B('red','الغاء الفاتورة','cancelInvoice()')}${B('red','مرتجع مبيعات','returnModal()')}
        ${B('green','فتح الدرج','openDrawer()')}${B('cyan','تبديل مستخدم','switchUser()')}
        ${B('orange','صورة مادة','itemImage()')}${B('orange','فحص سعر مادة',"pickModal('check')")}
        ${B('yellow','تعديل كمية المادة','applyKpQty()')}${B('white','شاشة الحماية','lockScreen()')}
      </div>
      <div class="b3">${B('red','إغلاق الصندوق (تقرير اليوم)','closeDayModal()')}${B('white','اختيار عميل','pickCustomer()')}${B('white','اختيار مندوب','pickRep()')}${B('white','الغاء مادة','removeLine()')}</div>
    </div>
    <div class="pmain">
      <div class="ptable"><table><thead><tr><th style="width:36px">#</th><th>المادة</th><th>العدد</th><th>الافرادي</th><th>اجمالي</th><th>حسم%</th><th>حسم</th></tr></thead><tbody>${rows}
        <tr class="entry"><td>${n+1}</td><td class="nm"><input id="posEntry" type="text" autocomplete="off" placeholder="اكتب اسم المادة أو الباركود ثم Enter" oninput="sugUpdate()" onkeydown="entryKey(event)"></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
        <div id="posSug" class="sugs"></div></div>
      <div class="pbot">
        <div class="pcust">${c?`<div class="msg">${esc(c.name)}</div><div>الرصيد الحالي: <b>${money(c.balance)}</b></div>${c.phone?`<div style="color:var(--muted2)">${esc(c.phone)}</div>`:''}`:'<div class="msg">الرجاء تحديد العميل</div>'}${state.co.rep?`<div>المندوب: <b>${esc(state.co.rep)}</b></div>`:''}${state.co.disc>0?`<div>حسم الفاتورة: <b>${money(t.disc)}</b></div>`:''}<div class="place">${esc(st.name)} / 1</div></div>
        <div class="pad">
          ${['7','8','9','4','5','6','1','2','3','0','00','.'].map((k,i)=>K('k'+(k==='.'?'d':k),k,'',`kp('${k}')`)).join('')}
          ${K('kc','C','red','kpClear()')}${K('kca','CA','red','kpAll()')}${K('ke','ENT','ent','kpEnter()')}
          ${K('kn','نقدا','pur',"quickPay('cash')")}${K('ka','آجل','pur',"quickPay('credit')")}${K('kt','المجموع<br>F6','tot','openPay()')}
        </div>
        <div class="stats">
          <div class="st"><span>الكمية الاجمالية</span><b id="stQty">${fmt(t.qty)}</b></div>
          <div class="st"><span>حسم الأقلام</span><b id="stLD">${fmt(t.lineDisc)}</b></div>
          <div class="st"><span>حسم الفاتورة</span><b id="stID">${fmt(t.disc)}</b></div>
          <div class="st"><span>مجموع الأقلام</span><b id="stGross">${fmt(t.gross)}</b></div>
          <div class="big"><small id="bigLbl">${state.kp?'إدخال':'المجموع'}</small><div id="bigNum">${state.kp?esc(state.kp):fmt(t.total)}</div><small id="bigTax">${t.tax?'شامل الضريبة '+fmt(t.tax):''}</small></div>
        </div>
      </div>
    </div>
  </div>
  <div class="pbar"><div class="tw"><b>الاجمالي</b><span id="words">${toWords(t.total)}</span></div>
    <div class="ibtns"><button class="ib" onclick="holdInvoice()" title="تعليق الفاتورة وبدء فاتورة جديدة" aria-label="تعليق الفاتورة"><svg class="ic" viewBox="0 0 24 24" style="stroke:#1a9a2e;stroke-width:3"><path d="M12 5v14M5 12h14"/></svg></button>
    <button class="ib ${state.held.length?'rd':''}" onclick="heldModal()" title="الفواتير المعلقة" aria-label="الفواتير المعلقة">${state.held.length}</button>
    <button class="ib" onclick="layoutModal()" title="ترتيب الشاشة" aria-label="ترتيب الشاشة">▦</button>
    <button class="ib" onclick="themeModal()" title="ألوان الشاشة" aria-label="ألوان الشاشة">🎨</button>
    <button class="ib" onclick="clearEntry()" title="مسح" aria-label="مسح">⌫</button>
    <button class="ib" onclick="closePos()">إغلاق</button></div></div>
  <div class="pst"><span id="pClock"></span><span>NUM</span></div>`;
}

/* تحديث الأرقام بدون إعادة رسم الشاشة (للحفاظ على التركيز داخل الحقول) */
function posUpdate(){
  const t=calcCart(),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  set('#stQty',fmt(t.qty));set('#stLD',fmt(t.lineDisc));set('#stID',fmt(t.disc));set('#stGross',fmt(t.gross));
  set('#bigNum',state.kp?state.kp:fmt(t.total));set('#bigLbl',state.kp?'إدخال':'المجموع');
  set('#bigTax',t.tax&&!state.kp?'شامل الضريبة '+fmt(t.tax):'');set('#words',toWords(t.total));
  state.cart.forEach((l,i)=>{set('#lt'+i,fmt(l.qty*l.price));set('#ld'+i,fmt(l.qty*l.price*(l.dp||0)/100))});
}

/* ---- إدخال المواد ---- */
function matchProds(q){q=q.toLowerCase();return db.products.filter(p=>p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q))}
function entryKey(e){if(e.key==='Enter'){e.preventDefault();doEntry(e.target.value.trim())}}
function doEntry(q){
  if(!q)return;
  const ex=db.products.find(p=>p.sku&&p.sku.toLowerCase()===q.toLowerCase());
  const m=ex?[ex]:matchProds(q);
  if(!m.length)return toast('المادة غير موجودة');
  if(m.length>1&&!ex)return toast('اختر المادة من القائمة أسفل الجدول');
  addCart(m[0].id);
}
function sugUpdate(){
  const q=$('#posEntry').value.trim(),b=$('#posSug');
  if(!q){b.innerHTML='';return}
  const m=matchProds(q).slice(0,8);
  b.innerHTML=m.length?m.map(p=>`<button class="sg" onmousedown="event.preventDefault()" onclick="addCart('${jsq(p.id)}')">${esc(p.name)} <small>${money(p.price)}</small></button>`).join(''):'<span style="color:var(--muted2);padding:4px">لا توجد نتائج</span>';
}
function addCart(id,q,keep){
  const p=prod(id);if(!p)return;
  q=q||(state.kp!==''?num(state.kp):1);if(q<=0)q=1;
  let i=state.cart.findIndex(l=>l.pid===id);const have=i>=0?state.cart[i].qty:0;
  if(have+q>p.stock){toast('المتوفر من «'+p.name+'»: '+p.stock);return}
  if(i>=0)state.cart[i].qty+=q;else{state.cart.push({pid:id,qty:q,price:unitPrice(p),dp:0});i=state.cart.length-1}
  state.sel=i;state.kp='';posRender();
  if(keep)toast('تمت إضافة: '+p.name);else focusEntry();
}
function selLine(i){state.sel=i;document.querySelectorAll('#pos [data-i]').forEach(r=>r.classList.toggle('sel',+r.dataset.i===i))}
function setQty(i,v){
  const l=state.cart[i];if(!l)return;const p=prod(l.pid);v=num(v);
  if(v<=0){state.cart.splice(i,1);state.sel=-1;return posRender()}
  if(v>p.stock){toast('المتوفر من «'+p.name+'»: '+p.stock);l.qty=p.stock;return posRender()}
  l.qty=v;posUpdate();
}
function setPrice(i,v){if(!can('price_edit')){toast('ليست لديك صلاحية تعديل السعر');return posRender()}state.cart[i].price=Math.max(0,num(v));posUpdate()}
function setDp(i,v){if(!can('discount')){toast('ليست لديك صلاحية منح الخصومات');return posRender()}state.cart[i].dp=Math.min(100,Math.max(0,num(v)));posUpdate()}
function removeLine(){if(!state.cart.length)return toast('لا توجد مواد');const i=state.sel>=0?state.sel:state.cart.length-1;state.cart.splice(i,1);state.sel=-1;posRender()}
function resetInvoice(){state.cart=[];state.co=newCo();state.kp='';state.sel=-1;posRender()}
function cancelInvoice(){if(!state.cart.length)return toast('الفاتورة فارغة');askConfirm('إلغاء الفاتورة الحالية ومسح كل موادها؟',resetInvoice,'الغاء الفاتورة')}
function clearEntry(){state.kp='';const e=$('#posEntry');if(e){e.value='';sugUpdate()}posUpdate()}

/* ---- لوحة الأرقام ---- */
function kp(k){
  if(state.kp.length>10)return;
  if(k==='.'){if(state.kp.includes('.'))return;if(!state.kp)k='0.'}
  if(k==='00'&&!state.kp)return;
  state.kp+=k;posUpdate();
}
function kpClear(){state.kp='';posUpdate()}
function kpAll(){if(!state.cart.length){state.kp='';return posUpdate()}cancelInvoice()}
function applyKpQty(){
  if(state.kp==='')return toast('اكتب الكمية بلوحة الأرقام ثم اضغط تعديل كمية المادة');
  const i=state.sel>=0?state.sel:state.cart.length-1;
  if(i<0)return toast('لا توجد مادة محددة');
  const q=num(state.kp);state.kp='';setQty(i,q);posRender();
}
function kpEnter(){
  const e=$('#posEntry');
  if(e&&e.value.trim())return doEntry(e.value.trim());
  if(state.kp==='')return toast('اكتب الكمية أو ابحث عن مادة');
  applyKpQty();
}

/* ---- الدفع ---- */
function quickPay(method){
  if(!state.cart.length)return toast('لا توجد مواد في الفاتورة');
  const t=calcCart();
  if(method==='credit'&&!can('credit'))return toast('ليست لديك صلاحية البيع الآجل');
  if(method==='credit'&&!state.co.cid){toast('اختر العميل أولاً للبيع الآجل');return pickCustomer()}
  const paid=state.kp!==''?num(state.kp):(method==='credit'?0:t.total);
  finalize(method,paid);
}
function openPay(){if(!state.cart.length)return toast('لا توجد مواد في الفاتورة');modal('إتمام البيع',payBody())}
function payBody(){
  const co=state.co,t=calcCart();
  if(!state.cart.length)return empty('لا توجد مواد في الفاتورة');
  const paid=co.paid===null?t.total:num(co.paid);
  const M=[['cash','نقدي'],['card','بطاقة'],['transfer','تحويل']].concat(can('credit')?[['credit','آجل']]:[]);
  return `<label>العميل</label><select onchange="state.co.cid=this.value;posRender()"><option value="">عميل نقدي</option>${db.customers.map(c=>`<option value="${esc(c.id)}" ${co.cid===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
  <div class="f2"><div><label>حسم الفاتورة (${esc(db.settings.currency)})</label><input type="number" inputmode="decimal" value="${co.disc||''}" placeholder="0" ${can('discount')?'':'disabled'} oninput="state.co.disc=this.value;refreshTotals()"></div>
  <div><label>المدفوع الآن</label><input type="number" inputmode="decimal" id="cPaid" value="${fmt(paid)}" oninput="state.co.paid=this.value;refreshTotals(true)"></div></div>
  <label>طريقة الدفع</label>${chips(M,co.method,'setMethod')}
  <div class="card" style="margin-top:8px"><div class="row"><span class="grow">المجموع</span><b id="cSub">${money(t.sub)}</b></div>
  ${db.settings.tax>0?`<div class="row"><span class="grow">ضريبة القيمة المضافة ${db.settings.tax}%</span><b id="cTax">${money(t.tax)}</b></div>`:''}
  <div class="row"><span class="grow"><b>الإجمالي</b></span><b id="cTotal" style="font-size:19px">${money(t.total)}</b></div>
  <div class="row"><span class="grow">المتبقي (آجل)</span><b id="cRemain">${money(Math.max(0,t.total-paid))}</b></div></div>
  <div class="actions"><button class="btn primary" onclick="checkout()">تأكيد وإصدار الفاتورة</button></div>`;
}
function refreshTotals(fromPaid){
  const t=calcCart(),co=state.co,paid=co.paid===null?t.total:num(co.paid),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  set('#cSub',money(t.sub));set('#cTax',money(t.tax));set('#cTotal',money(t.total));set('#cRemain',money(Math.max(0,t.total-paid)));
  if(!fromPaid&&co.paid===null&&$('#cPaid'))$('#cPaid').value=fmt(t.total);
  posUpdate();
}
function setMethod(m){state.co.method=m;state.co.paid=m==='credit'?0:null;setBody(payBody())}
function checkout(){const t=calcCart(),co=state.co;finalize(co.method,co.paid===null?t.total:num(co.paid))}
function finalize(method,paidIn){
  if(!state.cart.length)return toast('لا توجد مواد في الفاتورة');
  const co=state.co,t=calcCart();let ovr=false;
  let paid=Math.max(0,paidIn);const change=r2(Math.max(0,paid-t.total));paid=Math.min(paid,t.total);
  const remain=r2(t.total-paid);
  if(remain>0.005){if(!can('credit')){toast('ليست لديك صلاحية البيع الآجل');return}if(!co.cid){toast('اختر العميل لتسجيل المبلغ المتبقي كدين');return}
    {const cu=cust(co.cid),lim=+cu.creditLimit||0;   /* حد الائتمان: الكاشير يُمنع، والمدير يتجاوز بتأكيد صريح ويُعلَّم على الفاتورة */
     if(lim>0&&r2((cu.balance||0)+remain)>lim+0.005){const over=r2((cu.balance||0)+remain-lim);
       if(!isAdmin()){toast('تجاوز حد الائتمان للعميل بمقدار '+money(over)+' - يلزم موافقة المدير');return}
       if(!confirm('العميل يتجاوز حد الائتمان بمقدار '+money(over)+'. متابعة بصلاحية المدير؟'))return;ovr=true}}}
  const items=state.cart.map(l=>{const p=prod(l.pid);return{pid:l.pid,name:p.name,qty:l.qty,price:r2(l.price*(1-(l.dp||0)/100)),listPrice:l.price,dp:l.dp||0,cost:p.cost}});
  const s={id:uid(),no:nextNo('inv'),at:new Date().toISOString(),date:today(),cid:co.cid,rep:co.rep||'',cashier:(curUser()||{}).name||'',items,subtotal:t.sub,lineDisc:t.lineDisc,discount:t.disc,net:t.net,tax:t.tax,total:t.total,paid,method,cost:sum(items,i=>i.cost*i.qty)};if(ovr)s.creditOverride=true;
  items.forEach(i=>{prod(i.pid).stock-=i.qty});
  if(co.cid&&remain>0)cust(co.cid).balance=r2(cust(co.cid).balance+remain);
  db.sales.push(s);save();
  state.cart=[];state.co=newCo();state.kp='';state.sel=-1;
  posRender();if(noInv()){toast('تم حفظ الفاتورة '+s.no+(change>0?' - الباقي للزبون '+money(change):''));return}showInvoice(s.id,change);
}

/* ---- أزرار الجانب ---- */
function pickModal(mode){
  modal(mode==='add'?'إضافة مادة':'فحص سعر مادة',`<input class="search" id="pq" type="search" placeholder="ابحث بالاسم أو الباركود" oninput="pickList('${mode}')"><div class="card" id="pList">${pickHtml(mode)}</div>${mode==='add'?'<div class="actions"><button class="btn primary" onclick="closeModal();focusEntry()">تم</button></div>':''}`);
}
function pickHtml(mode){
  const q=($('#pq')?$('#pq').value:'').trim().toLowerCase();
  const l=db.products.filter(p=>!q||p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)).slice(0,60);
  if(!l.length)return empty(db.products.length?'لا توجد نتائج':'لا توجد مواد. أضفها من تبويب المخزون.');
  return l.map(p=>{const inner=`<div class="grow"><div class="t">${esc(p.name)}</div><small>${esc(p.sku||p.cat||'')}</small></div><div class="end"><b>${money(p.price)}</b><small>المتوفر: ${p.stock}</small></div>`;
    return mode==='add'?`<button class="row tap" onclick="addCart('${jsq(p.id)}',1,true)">${inner}</button>`:`<div class="row">${inner}</div>`}).join('');
}
function pickList(mode){$('#pList').innerHTML=pickHtml(mode)}
function discModal(){
  if(!can('discount'))return toast('ليست لديك صلاحية منح الخصومات');
  if(!state.cart.length)return toast('لا توجد مواد في الفاتورة');
  const t=calcCart();
  modal('حسم الفاتورة',`<p>مجموع الفاتورة: <b>${money(t.sub)}</b></p><div class="f2"><div><label>نسبة %</label><input id="dpct" type="number" inputmode="decimal" placeholder="0"></div><div><label>مبلغ (${esc(db.settings.currency)})</label><input id="damt" type="number" inputmode="decimal" placeholder="0" value="${state.co.disc||''}"></div></div><p class="muted" style="font-size:12.5px">إذا أدخلت نسبة فسيتم استخدامها بدل المبلغ.</p><div class="actions"><button class="btn primary" onclick="applyDisc()">تطبيق</button><button class="btn ghost" onclick="state.co.disc=0;closeModal();posRender()">إزالة الحسم</button></div>`);
}
function applyDisc(){const t=calcCart(),p=num($('#dpct').value),a=num($('#damt').value);state.co.disc=p>0?r2(t.sub*Math.min(p,100)/100):a;closeModal();posRender()}
function returnModal(){
  if(!can('returns'))return toast('ليست لديك صلاحية المرتجعات');
  modal('مرتجع مبيعات',`<p class="muted" style="margin-top:0">اختر الفاتورة التي يريد الزبون إرجاع مواد منها.</p><input class="search" id="rq" type="search" placeholder="رقم الفاتورة أو اسم المنتج أو العميل" oninput="retList()"><div class="card" id="rList">${retHtml()}</div>`);
}
function retHtml(){
  const q=($('#rq')?$('#rq').value:'').trim().toLowerCase();
  const l=db.sales.filter(s=>{const c=cust(s.cid);return !s.void&&(!q||s.no.toLowerCase().includes(q)||(c&&c.name.toLowerCase().includes(q))||s.items.some(i=>i.name.toLowerCase().includes(q)))}).slice().reverse().slice(0,40);
  return l.length?l.map(s=>{const left=sum(Object.values(retAvail(s)),x=>x),c=cust(s.cid);
    return `<button class="row tap" onclick="retStart('${jsq(s.id)}')"><div class="grow"><div class="t">${esc(s.no)}</div><small>${esc(c?c.name:'عميل نقدي')} - ${fdate(s.date)}${q?(()=>{const m=s.items.filter(i=>i.name.toLowerCase().includes(q)).map(i=>i.name);return m.length?' - '+esc(m.join('، ')):''})():''}</small></div><div class="end"><b>${money(s.total)}</b>${left<=0?'<br><span class="badge grey">أُرجعت بالكامل</span>':''}</div></button>`}).join(''):empty('لا توجد فواتير');
}
function retList(){$('#rList').innerHTML=retHtml()}
function openDrawer(){toast('لا يوجد درج نقدية متصل بهذا الجهاز')}
function switchUser(){askConfirm('تسجيل الخروج وتبديل المستخدم؟',logout,'تبديل المستخدم')}

function itemImage(){
  const i=state.sel>=0?state.sel:state.cart.length-1,l=state.cart[i];
  if(!l)return toast('اختر مادة من الفاتورة أولاً');
  const p=prod(l.pid);
  modal('بطاقة المادة',`<div class="card" style="text-align:center"><div style="height:140px;display:flex;align-items:center;justify-content:center;background:var(--soft);border-radius:12px;font-size:44px">📦</div><h3 style="margin:10px 0 2px">${esc(p.name)}</h3><div class="muted">${esc(p.cat||'')} ${p.sku?'- '+esc(p.sku):''}</div></div><div class="card"><div class="row"><span class="grow">السعر</span><b>${money(p.price)}</b></div><div class="row"><span class="grow">المتوفر</span><b>${p.stock}</b></div></div><p class="muted" style="font-size:12.5px">رفع صور المواد غير متاح في هذه النسخة.</p>`);
}
function lockScreen(){const d=document.createElement('div');d.id='plock';d.innerHTML='<div><h2>الشاشة مقفلة</h2><p>اضغط للمتابعة</p><button class="btn primary" onclick="document.getElementById(\'plock\').remove()">فتح القفل</button></div>';document.body.appendChild(d)}
function pickCustomer(){modal('اختيار عميل',`<input class="search" id="cq" type="search" placeholder="ابحث بالاسم أو الهاتف" oninput="custList()"><div class="card" id="cList">${custHtml()}</div>${can('parties')?'<div class="actions"><button class="btn" onclick="partyForm(\'c\')">+ عميل جديد</button></div>':''}`)}
function custHtml(){const q=($('#cq')?$('#cq').value:'').trim().toLowerCase();const l=db.customers.filter(c=>!q||c.name.toLowerCase().includes(q)||(c.phone||'').includes(q));
  return `<button class="row tap" onclick="setCust('')"><div class="grow t">عميل نقدي (بدون عميل)</div></button>`+l.map(c=>`<button class="row tap" onclick="setCust('${jsq(c.id)}')"><div class="grow"><div class="t">${esc(c.name)}</div><small>${esc(c.phone||'')}</small></div><div class="end">${c.balance>0.005?`<small>عليه ${money(c.balance)}</small>`:''}</div></button>`).join('')}
function custList(){$('#cList').innerHTML=custHtml()}
function setCust(id){state.co.cid=id;const c=cust(id);closeModal();posRender()}
function pickRep(){const R=db.settings.reps||[];modal('اختيار مندوب',`<div class="card">${R.map((r,i)=>`<button class="row tap" onclick="setRep(${i})"><div class="grow t">${esc(r)}</div></button>`).join('')}<button class="row tap" onclick="setRep(-1)"><div class="grow t muted">بدون مندوب</div></button></div><label>إضافة مندوب جديد</label><div style="display:flex;gap:8px"><input id="repn" placeholder="اسم المندوب"><button class="btn primary" onclick="addRep()">إضافة</button></div>`)}
function setRep(i){state.co.rep=i<0?'':db.settings.reps[i];closeModal();posRender()}
function addRep(){const n=$('#repn').value.trim();if(!n)return;if(!db.settings.reps)db.settings.reps=[];db.settings.reps.push(n);state.co.rep=n;save();closeModal();posRender()}
function holdInvoice(){if(!state.cart.length)return toast('الفاتورة فارغة');state.held.push({cart:state.cart,co:state.co});resetInvoice();toast('تم تعليق الفاتورة')}
function heldModal(){
  if(!state.held.length)return toast('لا توجد فواتير معلقة');
  modal('الفواتير المعلقة',`<div class="card">${state.held.map((h,i)=>`<button class="row tap" onclick="recallHeld(${i})"><div class="grow"><div class="t">فاتورة معلقة ${i+1}</div><small>${sum(h.cart,l=>l.qty)} قطعة</small></div><b>${money(sum(h.cart,l=>l.qty*l.price*(1-(l.dp||0)/100)))}</b></button>`).join('')}</div><p class="muted" style="font-size:12.5px">الفواتير المعلقة تُحفظ على هذا الجهاز حتى بعد تحديث الصفحة.</p>`);
}
function recallHeld(i){const h=state.held.splice(i,1)[0];if(state.cart.length)state.held.push({cart:state.cart,co:state.co});state.cart=h.cart;state.co=h.co;state.sel=-1;state.kp='';closeModal();posRender()}
/* ================= ترتيب «شبكة المواد» ================= */
const cats=()=>['الكل',...new Set(db.products.map(p=>p.cat||'عام'))];
function setCat(c){state.posCat=c;posRender()}
function posHtml(){return (db.settings.posLayout||'grid')==='classic'?posHtmlClassic():posHtmlGrid()}
function posHead(){const st=db.settings;
  return `<div class="ph"><div class="ph-r">رقم الفاتورة<span class="invno">${esc(st.prefix)}${st.next}</span></div><div class="ph-t">نقطة مبيع</div><div class="ph-l"><a style="cursor:pointer" onclick="switchUser()">${esc((curUser()||{}).name||'')}</a></div></div>
  <div class="pinfo"><span class="logo">${esc(st.name)}</span></div>`}
function posFoot(){const t=calcCart();
  return `<div class="pbar"><div class="tw"><b>الاجمالي</b><span id="words">${toWords(t.total)}</span></div>
    <div class="ibtns"><button class="ib" onclick="holdInvoice()" title="تعليق الفاتورة" aria-label="تعليق الفاتورة"><svg class="ic" viewBox="0 0 24 24" style="stroke:#1a9a2e;stroke-width:3"><path d="M12 5v14M5 12h14"/></svg></button>
    <button class="ib ${state.held.length?'rd':''}" onclick="heldModal()" title="الفواتير المعلقة" aria-label="الفواتير المعلقة">${state.held.length}</button>
    <button class="ib" onclick="layoutModal()" title="ترتيب الشاشة" aria-label="ترتيب الشاشة">▦</button>
    <button class="ib" onclick="themeModal()" title="ألوان الشاشة" aria-label="ألوان الشاشة">🎨</button>
    <button class="ib" onclick="closePos()">إغلاق</button></div></div>
  <div class="pst"><span id="pClock"></span><span>NUM</span></div>`}
function gridTiles(){
  const q=(state.posQ||'').trim().toLowerCase();
  const l=db.products.filter(p=>(state.posCat==='الكل'||(p.cat||'عام')===state.posCat)&&(!q||p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)));
  if(!l.length)return `<div class="gl-empty">${db.products.length?'لا توجد نتائج':'لا توجد مواد. أضفها من تبويب المخزون.'}</div>`;
  return l.map(p=>{const n=(state.cart.find(x=>x.pid===p.id)||{}).qty||0;
    return `<button class="pt ${p.stock<=0?'out':''}" onclick="addCart('${jsq(p.id)}')">${n?`<span class="pt-b">${n}</span>`:''}<b>${esc(p.name)}</b><span class="pt-p">${money(unitPrice(p))}</span><small>${p.stock>0?'المتوفر: '+p.stock:'نفد المخزون'}</small></button>`}).join('');
}
function gridSearch(v){state.posQ=v;$('#pgrid').innerHTML=gridTiles()}
function gridKey(e){
  if(e.key!=='Enter')return;e.preventDefault();
  const before=calcCart().qty;doEntry(e.target.value.trim());
  if(calcCart().qty!==before){state.posQ='';posRender();focusEntry()}
}
function stepQty(i,d){const l=state.cart[i];if(!l)return;setQty(i,l.qty+d);posRender()}
function removeAt(i){state.cart.splice(i,1);state.sel=-1;posRender()}
function posHtmlGrid(){
  const t=calcCart(),c=cust(state.co.cid);
  const lines=state.cart.map((l,i)=>{const p=prod(l.pid),eff=r2(l.price*(1-(l.dp||0)/100));
    return `<div class="gl ${i===state.sel?'sel':''}" data-i="${i}" onclick="selLine(${i})"><div class="gl-n"><b>${esc(p?p.name:'')}</b><small>${fmt(eff)}${l.dp?' (خصم '+l.dp+'%)':''}</small></div>
    <div class="stepper"><button onclick="stepQty(${i},-1)" aria-label="إنقاص">−</button><span>${l.qty}</span><button onclick="stepQty(${i},1)" aria-label="زيادة">+</button></div>
    <b class="gl-t" id="lt${i}">${fmt(l.qty*l.price)}</b><button class="gl-x" onclick="removeAt(${i})" aria-label="حذف المادة">✕</button></div>`}).join('')||'<div class="gl-empty">اضغط على أي مادة لإضافتها إلى الفاتورة</div>';
  return posHead()+`
  <div class="gbody">
    <div class="gprod">
      <input class="gsearch" id="posEntry" type="search" autocomplete="off" placeholder="ابحث بالاسم أو امسح الباركود ثم Enter" value="${esc(state.posQ||'')}" oninput="gridSearch(this.value)" onkeydown="gridKey(event)">
      <div class="gchips">${cats().map(x=>`<button class="gchip ${x===state.posCat?'on':''}" onclick="setCat(this.dataset.c)" data-c="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="pgrid" id="pgrid">${gridTiles()}</div>
    </div>
    <div class="ginv">
      <div class="gi-head"><button class="gi-cust" onclick="pickCustomer()">${c?esc(c.name)+(c.balance>0.005?' - عليه '+money(c.balance):''):'عميل نقدي (اضغط لاختيار عميل)'}</button><button class="gi-sm" onclick="pickRep()">${state.co.rep?esc(state.co.rep):'مندوب'}</button></div>
      <div class="gi-lines">${lines}</div>
      <div class="gi-tot">
        <div class="st"><span>الكمية الاجمالية</span><b id="stQty">${fmt(t.qty)}</b></div>
        <div class="st"><span>مجموع الأقلام</span><b id="stGross">${fmt(t.gross)}</b></div>
        <div class="st"><span>حسم الأقلام</span><b id="stLD">${fmt(t.lineDisc)}</b></div>
        <div class="st"><span>حسم الفاتورة</span><b id="stID">${fmt(t.disc)}</b></div>
        <div class="gi-big"><span id="bigLbl">المجموع</span><b id="bigNum">${fmt(t.total)}</b></div>
        <small id="bigTax" class="gi-tax">${t.tax?'شامل الضريبة '+fmt(t.tax):''}</small>
      </div>
      <div class="gi-act"><button class="pb ent" onclick="quickPay('cash')">نقدا</button><button class="pb pur" onclick="quickPay('credit')">آجل</button><button class="pb tot" onclick="openPay()">دفع F6</button></div>
      <div class="gi-act2"><button class="pb orange" onclick="discModal()">حسم</button><button class="pb red" onclick="cancelInvoice()">إلغاء الفاتورة</button><button class="pb white" onclick="pickModal('add')">بحث عن مادة</button><button class="pb white" onclick="moreModal()">المزيد</button></div>
    </div>
  </div>`+posFoot();
}
function moreModal(){
  const A=[...(isAdmin()?[['عرض الفاتورة بعد البيع','noInvModal()'],['إدارة التصنيفات','catModal()']]:[]),['حفظ كعرض سعر','saveQuote()'],['عروض الأسعار','quotesModal()'],['مرتجع مبيعات','returnModal()'],['فحص سعر مادة',"pickModal('check')"],['صورة مادة','itemImage()'],['تبديل مستخدم','switchUser()'],['فتح الدرج','openDrawer()'],['إغلاق الصندوق','closeDayModal()'],['شاشة الحماية','lockScreen()'],['ترتيب الشاشة','layoutModal()'],['ألوان الشاشة','themeModal()']];
  modal('المزيد',`<div class="menu">${A.map(a=>`<button onclick="closeModal();${a[1]}">${a[0]}</button>`).join('')}</div>`);
}
function layoutModal(){
  const cur=db.settings.posLayout||'grid';
  const L=[['grid','شبكة المواد','المواد كبطاقات تُلمس للإضافة، والفاتورة في جانب مستقل. الأنسب للمس والجوال.'],['classic','كاشير كلاسيكي','جدول الفاتورة ولوحة الأرقام والأزرار الملونة كما في الصورة.']];
  modal('ترتيب شاشة البيع',`<div class="themes" style="grid-template-columns:1fr">${L.map(l=>`<button class="${l[0]===cur?'on':''}" onclick="setPosLayout('${jsq(l[0])}')"><span style="font-size:15px">${l[1]}</span><span class="muted" style="font-weight:400;font-size:13px">${l[2]}</span></button>`).join('')}</div>`);
}
function setPosLayout(k){db.settings.posLayout=k;save();closeModal();posRender()}

const POS_THEMES=[['orvex','ORVEX',['#0b2418','#27e060','#f5c518']],['emerald','زمردي',['#14786e','#34a367','#e69b3b']],['night','ليلي',['#14232f','#2f9e63','#cf8a3a']],['violet','بنفسجي',['#5a43b0','#9a82e6','#f0ac55']],['sunset','غروب',['#e47a2c','#3fa352','#ecc22c']],['classic','كلاسيكي',['#cfe2f3','#3aa83a','#e8636e']]];
function themeModal(){const cur=db.settings.posTheme||'orvex';modal('ألوان شاشة البيع',`<div class="themes">${POS_THEMES.map(t=>`<button class="${t[0]===cur?'on':''}" onclick="setPosTheme('${jsq(t[0])}')"><i>${t[2].map(c=>`<b style="background:${c}"></b>`).join('')}</i>${t[1]}</button>`).join('')}</div>`)}
function setPosTheme(k){db.settings.posTheme=k;save();const e=$('#pos');if(e)e.setAttribute('data-t',k);closeModal()}
document.addEventListener('keydown',e=>{if(e.key==='F6'&&$('#pos')){e.preventDefault();openPay()}});

