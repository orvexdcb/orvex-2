/* ================= المشتريات ================= */
function vPurchases(){const l=db.purchases.slice().reverse();
  return `<div class="card">${l.length?l.map(p=>{const s=supp(p.sid);return `<button class="row tap" onclick="showPurchase('${jsq(p.id)}')"><div class="grow"><div class="t">${esc(p.no)}</div><small>${esc(s?s.name:'مورد غير محدد')} - ${fdate(p.date)}</small></div><div class="end"><b>${money(p.total)}</b>${p.total-p.paid>0.005?`<br><span class="badge warn">متبقي ${money(p.total-p.paid)}</span>`:''}</div></button>`}).join(''):empty('لم تسجّل أي مشتريات بعد')}</div><button class="fab" onclick="newPurchase()">+ فاتورة مشتريات</button>`}
function showPurchase(id){const p=db.purchases.find(x=>x.id===id),s=supp(p.sid);
  const R=(a,b)=>`<div class="row"><span class="grow">${a}</span><span>${b}</span></div>`;
  modal('فاتورة مشتريات '+p.no,`<div class="card">${R('المورد',esc(s?s.name:'-'))}${R('التاريخ',fdate(p.date))}${R('طريقة الدفع',p.method==='credit'?'آجل':'نقداً')}${p.note?R('البيان',esc(p.note)):''}</div><div class="card">${p.lines.map(l=>`<div class="row"><div class="grow t">${esc(l.name)}</div><small>${l.uq||l.qty}${l.uf?' '+esc(l.unit||'')+' (='+l.qty+' قطعة)':''} × ${fmt(l.cost)}${l.disc?' - حسم '+fmt(l.disc):''}</small><b>${fmt(l.net!==undefined?l.net:l.qty*l.cost)}</b></div>`).join('')}${p.disc?R('حسم الفاتورة','- '+money(p.disc)):''}${p.extra?R('إضافي','+ '+money(p.extra)):''}<div class="row"><span class="grow"><b>الإجمالي</b></span><b>${money(p.total)}</b></div>${R('المدفوع',money(p.paid))}${p.total-p.paid>0.005?R('الباقي',money(p.total-p.paid)):''}</div>`)}

/* ---- فاتورة مشتريات: نافذة بنمط Phenix ---- */
function pinvRow(){return{code:'',pid:'',name:'',unit:'قطعة',qty:'',cost:'',dp:'',d:'',note:'',sell:''}}
function pinvFresh(){return{sid:'',method:'cash',date:today(),note:'',rep:'',receipt:'',cc:'',level:'low',discP:'',disc:'',extra:'',paid:null,rows:Array.from({length:14},pinvRow),cur:0,navIdx:null,mode:'new',editId:null}}
function newPurchase(){
  if(!can('purchases'))return toast('ليست لديك صلاحية المشتريات');
  state.pinv=pinvFresh();
  const o=$('#pinv');if(o)o.remove();
  const e=document.createElement('div');e.id='pinv';document.body.appendChild(e);
  document.body.classList.add('noscroll','haspinv');
  if(!window._pinvKey){window._pinvKey=1;document.addEventListener('keydown',ev=>{if(state.pinv&&ev.key==='F3'){ev.preventDefault();const q=$('#pwQuick');if(q)q.focus()}})}
  pinvRender();
}
function pinvClose(){const o=$('#pinv');if(o)o.remove();document.body.classList.remove('noscroll','haspinv');state.pinv=null}
function pinvHas(){return state.pinv.rows.some(r=>r.code||r.name||r.qty||r.cost)}
function pinvAskClose(){if(!pinvHas()||state.pinv.mode==='view')return pinvClose();askConfirm('إغلاق الفاتورة دون حفظ؟ ستضيع المواد المدخلة.',pinvClose,'إغلاق دون حفظ')}
function pinvAskReset(){const P=state.pinv;if(P.mode==='view')return;if(P.mode==='edit')return askConfirm('إلغاء التعديل والرجوع للفاتورة المحفوظة؟',()=>pinvLoad(P.navIdx),'إلغاء التعديل');if(!pinvHas())return;askConfirm('إلغاء الفاتورة الحالية ومسح كل موادها؟',()=>{state.pinv=pinvFresh();pinvRender()},'إلغاء الأمر')}
function pinvAskNew(){if(!pinvHas()||state.pinv.mode==='view'){state.pinv=pinvFresh();return pinvRender()}askConfirm('بدء فاتورة جديدة؟ ستضيع المواد المدخلة.',()=>{state.pinv=pinvFresh();pinvRender()},'فاتورة جديدة')}
function pinvFull(){const o=$('#pinv');if(o)o.classList.toggle('full')}
function pinvDisc(r){const g=num(r.qty)*num(r.cost);return r2(num(r.dp)>0?g*Math.min(num(r.dp),100)/100:Math.min(num(r.d),g))}
function pinvCalc(){const P=state.pinv;let sub=0,dis=0,qt=0;P.rows.forEach(r=>{sub+=num(r.qty)*num(r.cost);dis+=pinvDisc(r);qt+=num(r.qty)});sub=r2(sub);dis=r2(dis);
  const net=r2(sub-dis),dv=r2(num(P.discP)>0?net*Math.min(num(P.discP),100)/100:Math.min(num(P.disc),net)),ex=r2(num(P.extra));
  const total=r2(Math.max(0,net-dv+ex));
  const paid=P.paid===null||P.paid===''?(P.method==='credit'?0:total):Math.min(Math.max(num(P.paid),0),total);
  return{sub,dis,net,dv,ex,total,paid,qty:qt,rest:r2(total-paid)}}
function pinvRowHtml(i){const r=state.pinv.rows[i],t=num(r.qty)*num(r.cost)-pinvDisc(r);
  const n=(f,extra)=>`<input id="pi_${i}_${f}" type="number" inputmode="decimal" step="any" value="${esc(r[f])}" oninput="pinvSet(${i},'${f}',this.value)" onfocus="pinvFocus(${i})" ${extra||''}>`;
  return `<tr data-i="${i}" class="${i===state.pinv.cur?'sel':''}"><td class="pn">${i+1}</td>
  <td><input id="pi_${i}_code" list="pinvCodes" value="${esc(r.code)}" onchange="pinvCode(${i},this.value)" onfocus="pinvFocus(${i})" onkeydown="pinvKey(event,${i},'code')"></td>
  <td>${n('qty',`onkeydown="pinvKey(event,${i},'qty')"`)}</td>
  <td><input id="pi_${i}_unit" value="${esc(r.unit)}" oninput="pinvSet(${i},'unit',this.value)" onfocus="pinvFocus(${i})"></td>
  <td><input class="nm" id="pi_${i}_name" list="pinvNames" value="${esc(r.name)}" onchange="pinvName(${i},this.value)" onfocus="pinvFocus(${i})" onkeydown="pinvKey(event,${i},'name')"></td>
  <td>${n('cost',`onkeydown="pinvKey(event,${i},'cost')"`)}</td>
  <td class="pt" id="pi_${i}_tot">${t?fmt(t):''}</td>
  <td><input id="pi_${i}_note" value="${esc(r.note)}" oninput="pinvSet(${i},'note',this.value)" onfocus="pinvFocus(${i})"></td>
  <td>${n('dp')}</td><td>${n('d')}</td><td class="sp">${n('sell')}</td>
  <td style="width:34px"><button class="pdel" onclick="pinvDel(${i})" aria-label="حذف السطر">✕</button></td></tr>`}
function pinvNo(){const P=state.pinv;return P.navIdx===null?db.settings.nextPo:(parseInt(String(db.purchases[P.navIdx].no).replace(/\D/g,''),10)||0)}
function pinvAcct(){return state.pinv.method==='credit'?'ذمم الموردين':'القاصة'}
function pinvRender(){const P=state.pinv,o=$('#pinv');if(!o)return;
  const c=pinvCalc(),d=new Date(),p2=n=>String(n).padStart(2,'0');
  const stamp=p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  const po0=P.editId?db.purchases.find(x=>x.id===P.editId):null,V=P.mode==='view',fs=iso=>{const q=new Date(iso);return q.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})+' '+(q.getMonth()+1)+'/'+q.getDate()+'/'+q.getFullYear()};
  const mg=svg('search'),opt=(v,l,cur)=>`<option value="${v}" ${v===cur?'selected':''}>${l}</option>`;
  o.innerHTML=`<div class="pw" onkeydown="if(event.key==='Escape')event.stopPropagation()">
  <div class="pw-t">${orvexLogo('p')}<span>فاتورة مشتريات</span><div class="wb"><button onclick="pinvFull()" aria-label="تصغير">—</button><button onclick="pinvFull()" aria-label="تكبير">☐</button><button onclick="pinvAskClose()" class="x" aria-label="إغلاق">✕</button></div></div>
  <div class="pw-b">
   <div class="pw-top">
    <div class="gbx ga">
     <div class="fr"><label>طريقة الدفع</label><div class="fx"><select class="gy" onchange="pinvMethod(this.value)">${opt('cash','نقداً',P.method)}${opt('credit','آجل',P.method)}</select></div></div>
     <div class="fr"><label>تاريخ الفاتورة</label><div class="fx"><input type="date" value="${esc(P.date)}" onchange="state.pinv.date=this.value||today()"></div></div>
     <div class="fr"><label>العملة</label><div class="fx"><input value="1" readonly style="width:46px;flex:none;text-align:center"><input value="${esc(db.settings.currency)}" readonly></div></div>
     <div class="fr"><label>رقم الإيصال</label><div class="fx"><input value="${esc(P.receipt)}" oninput="state.pinv.receipt=this.value"></div></div>
    </div>
    <div class="gb2"><div class="r1"><div class="ty"><span>نوع الفاتورة</span><b>فاتورة مشتريات</b></div></div>
     <div class="gbx">
      <div class="fr"><label>المورد</label><div class="fx"><button class="mg" onclick="$('#pwSupp').focus()" aria-label="بحث">${mg}</button><select id="pwSupp" onchange="state.pinv.sid=this.value"><option value="">بدون مورد</option>${db.suppliers.map(s=>`<option value="${esc(s.id)}" ${P.sid===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div></div>
      <div class="fr"><label>اسم المندوب</label><div class="fx"><input value="${esc(P.rep)}" oninput="state.pinv.rep=this.value"></div></div>
      <div class="fr"><label>المستودع</label><div class="fx"><input value="المستودع الرئيسي" readonly></div></div>
     </div></div>
    <div class="gc"><div class="r1"><div class="nv"><button onclick="pinvNav('first')" aria-label="الأول">«</button><button onclick="pinvNav('prev')" aria-label="السابق">‹</button><input id="pwNo" value="${pinvNo()}" readonly><button onclick="pinvNav('next')" aria-label="التالي">›</button><button onclick="pinvNav('last')" aria-label="الأخير">»</button></div></div>
     <div class="gbx">
      <div class="fr"><label>مركز الكلفة</label><div class="fx"><input value="${esc(P.cc)}" oninput="state.pinv.cc=this.value"></div></div>
      <div class="fr"><label>حساب المورد</label><div class="fx"><input id="pwAcct" value="${pinvAcct()}" readonly></div></div>
      <div class="fr"><label>حساب البضاعة</label><div class="fx"><input value="المشتريات" readonly></div></div>
     </div></div>
    <div class="gn"><div class="gbx" style="display:flex;align-items:center;gap:10px"><div class="fr" style="flex:1;margin:0"><label style="width:56px">البيان</label><div class="fx"><input value="${esc(P.note)}" oninput="state.pinv.note=this.value"></div></div>
      <div class="sec" style="margin:0"><label style="margin:0;font-size:13px;color:var(--pm)">درجة السرية</label><select onchange="state.pinv.level=this.value"><option value="low" ${P.level==='low'?'selected':''}>منخفضة</option><option value="mid" ${P.level==='mid'?'selected':''}>متوسطة</option><option value="high" ${P.level==='high'?'selected':''}>عالية</option></select><span class="lvl"></span></div></div></div>
   </div>
   <div class="tabs"><button class="on" id="pwTab1" onclick="pinvTab(1)">معلومات الفاتورة</button><button id="pwTab2" onclick="pinvTab(2)">الحسم و الإضافي</button></div>
   <div id="pwP1" style="display:flex;flex-direction:column;gap:6px;flex:none">
    <div class="tb"><button class="ib2" onclick="pinvAddRow()" aria-label="إضافة سطر" title="إضافة سطر"><svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button><button class="ib2" onclick="pinvDel(state.pinv.cur)" aria-label="حذف السطر الحالي" title="حذف السطر الحالي"><svg class="ic" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
     <div class="qs">${mg}<input id="pwQuick" list="pinvNames" placeholder="(F3) بحث سريع" onkeydown="if(event.key==='Enter'){event.preventDefault();pinvQuick(this)}"></div>
     <button class="ib2" onclick="pinvRender()" aria-label="تحديث" title="تحديث"><svg class="ic" viewBox="0 0 24 24">${IC.refresh}</svg></button><button class="ib2" onclick="pinvFull()" aria-label="ملء الشاشة" title="ملء الشاشة"><svg class="ic" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div>
    <datalist id="pinvCodes">${db.products.filter(p=>p.sku).map(p=>`<option value="${esc(p.sku)}">${esc(p.name)}</option>`).join('')}</datalist>
    <datalist id="pinvNames">${db.products.map(p=>`<option value="${esc(p.name)}"></option>`).join('')}</datalist>
    <div class="pgrid"><table><thead><tr><th>#</th><th>الرمز</th><th>الكمية</th><th>الواحدة</th><th>المادة</th><th>الإفرادي</th><th>الاجمالي</th><th>البيان</th><th>حسم %</th><th>حسم</th><th class="sp">سعر البيع (للكاشير)</th><th></th></tr></thead><tbody id="pinvBody">${P.rows.map((r,i)=>pinvRowHtml(i)).join('')}</tbody></table></div>
    <div class="gnav"><button onclick="pinvMove('prev')" aria-label="السطر السابق">▲</button><button onclick="pinvMove('next')" aria-label="السطر التالي">▼</button><button onclick="pinvMove('first')" aria-label="أول سطر">⏮</button><button onclick="pinvMove('prev')" aria-label="السابق">◀</button><span id="pwRowNo">سطر ${P.cur+1} من ${P.rows.length}</span><button onclick="pinvMove('next')" aria-label="التالي">▶</button><button onclick="pinvMove('last')" aria-label="آخر سطر">⏭</button></div>
   </div>
   <div id="pwP2" class="pan" style="display:none">
    <div><label>حسم الفاتورة %</label><input id="pv_dp" type="number" inputmode="decimal" step="any" value="${esc(P.discP)}" oninput="pinvHead('discP',this.value)"></div>
    <div><label>حسم الفاتورة (مبلغ)</label><input id="pv_disc" type="number" inputmode="decimal" step="any" value="${esc(P.disc)}" oninput="pinvHead('disc',this.value)"></div>
    <div><label>إضافي (مبلغ)</label><input id="pv_extra" type="number" inputmode="decimal" step="any" value="${esc(P.extra)}" oninput="pinvHead('extra',this.value)"></div>
   </div>
   <div class="pfw"><div class="pf">
    <div class="c"><label>قيمة الحسم</label><div class="bx" id="pf_dv">${fmt(c.dv)}</div></div><div class="c"><label>قيمة الإضافي</label><div class="bx" id="pf_ex">${fmt(c.ex)}</div></div><div></div>
    <div class="c"><label>مجموع الأقلام</label><div class="bx" id="pf_sub">${fmt(c.sub)}</div></div><div class="c"><label>حسم الأقلام</label><div class="bx" id="pf_dis">${fmt(c.dis)}</div></div><div class="c"><label>صافي الأقلام</label><div class="bx" id="pf_net">${fmt(c.net)}</div></div>
    <div class="c"><label>قيمة الفاتورة</label><div class="bx" id="pf_total">${fmt(c.total)}</div></div><div class="c"><label>قيمة الدفعة</label><input id="pv_paid" type="number" inputmode="decimal" step="any" placeholder="${fmt(c.paid)}" value="${P.paid===null?'':esc(P.paid)}" oninput="pinvHead('paid',this.value)"></div><div class="c"><label>الباقي</label><div class="bx" id="pf_rest">${fmt(c.rest)}</div></div>
    <div class="c"><label>إجمالي المدفوع</label><div class="bx" id="pf_paid">${fmt(c.paid)}</div></div><div class="c"><label>الباقي</label><div class="bx" id="pf_rest2">${fmt(c.rest)}</div></div><div class="c"><button class="st ${c.rest>0.005?'no':''}" id="pf_st" type="button">${c.rest>0.005?'غير محصل':'محصل'}</button></div>
   </div><div class="mk">منشأ من قبل ${esc(po0?(po0.by||'المدير'):((curUser()||{}).name||''))} في ${po0?fs(po0.at):stamp}${po0&&po0.editedAt?`<br>معدلة من قبل ${esc(po0.editedBy||'')} في ${fs(po0.editedAt)}`:''}</div></div>
   <div class="words"><span>اجمالي الكمية : <b id="pf_qty">${fmt(c.qty)}</b></span><span id="pf_words">${toWords(c.total)}</span><i></i></div>
  </div>
  <div class="pw-bb"><button onclick="pinvAskClose()"><svg class="ic" viewBox="0 0 24 24">${IC.exit}</svg>إغلاق</button><button onclick="window.print()"><svg class="ic" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg>الطباعة</button><button onclick="pinvAskReset()" ${V?'disabled':''}><span class="rd">⊗</span>إلغاء الأمر</button><button onclick="pinvSave()" ${V?'disabled':''}><span class="gr"><svg class="ic" viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg></span>حفظ</button><button onclick="pinvDelete()" ${V?'':'disabled'}>حذف</button><button onclick="pinvEdit()" ${V?'':'disabled'}>تعديل</button><button onclick="pinvAskNew()">جديد</button><button disabled>الأصل</button><button disabled>السند</button></div></div>`;
  if(V){o.querySelectorAll('.pw-b input,.pw-b select').forEach(e=>{if(e.id!=='pwNo')e.disabled=true});o.querySelectorAll('.pdel,.tb>.ib2:nth-child(-n+2)').forEach(e=>e.disabled=true)}
}
function pinvTab(n){$('#pwP1').style.display=n===1?'flex':'none';$('#pwP2').style.display=n===2?'grid':'none';$('#pwTab1').classList.toggle('on',n===1);$('#pwTab2').classList.toggle('on',n===2)}
function pinvTotals(){const c=pinvCalc();
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  set('#pf_dv',fmt(c.dv));set('#pf_ex',fmt(c.ex));set('#pf_sub',fmt(c.sub));set('#pf_dis',fmt(c.dis));set('#pf_net',fmt(c.net));set('#pf_total',fmt(c.total));set('#pf_rest',fmt(c.rest));set('#pf_paid',fmt(c.paid));set('#pf_rest2',fmt(c.rest));set('#pf_words',toWords(c.total));set('#pf_qty',fmt(c.qty));
  const st=$('#pf_st');if(st){st.textContent=c.rest>0.005?'غير محصل':'محصل';st.classList.toggle('no',c.rest>0.005)}
  const e=$('#pv_paid');if(e)e.placeholder=fmt(c.paid)}
function pinvHead(f,v){const P=state.pinv;P[f]=(f==='paid'&&v==='')?null:v;
  if(f==='discP'){P.disc='';pinvTotals();const e=$('#pv_disc');if(e)e.value=num(v)>0?pinvCalc().dv:'';return}
  if(f==='disc'){P.discP='';const e=$('#pv_dp');if(e)e.value=''}
  pinvTotals()}
function pinvMethod(m){const P=state.pinv;P.method=m;P.paid=null;const e=$('#pv_paid');if(e)e.value='';const a=$('#pwAcct');if(a)a.value=pinvAcct();pinvTotals()}
function pinvAddRow(){const R=state.pinv.rows;R.push(pinvRow());const b=$('#pinvBody');if(b)b.insertAdjacentHTML('beforeend',pinvRowHtml(R.length-1));pinvCount()}
function pinvCount(){const e=$('#pwRowNo');if(e)e.textContent='سطر '+(state.pinv.cur+1)+' من '+state.pinv.rows.length}
function pinvFocus(i){state.pinv.cur=i;document.querySelectorAll('#pinvBody tr').forEach(tr=>tr.classList.toggle('sel',+tr.dataset.i===i));pinvCount()}
function pinvMove(k){const P=state.pinv,n=P.rows.length;let i=k==='first'?0:k==='last'?n-1:k==='prev'?P.cur-1:P.cur+1;i=Math.max(0,Math.min(n-1,i));const t=$('#pi_'+i+'_code');if(t)t.focus();else pinvFocus(i)}
function pinvEnsureRow(){const R=state.pinv.rows,l=R[R.length-1];
  if(l&&(l.code||l.name||l.qty||l.cost)){R.push(pinvRow());const b=$('#pinvBody');if(b)b.insertAdjacentHTML('beforeend',pinvRowHtml(R.length-1));pinvCount()}}
function pinvRefresh(i){const r=state.pinv.rows[i],t=num(r.qty)*num(r.cost)-pinvDisc(r),e=$('#pi_'+i+'_tot');
  if(e)e.textContent=t?fmt(t):'';pinvEnsureRow();pinvTotals()}
function pinvSet(i,f,v){const r=state.pinv.rows[i];r[f]=v;
  if(f==='dp'){r.d='';const e=$('#pi_'+i+'_d');if(e)e.value=num(v)>0?pinvDisc(r):''}
  if(f==='d'){r.dp='';const e=$('#pi_'+i+'_dp');if(e)e.value=''}
  pinvRefresh(i)}
function pinvPut(i,f,v){const e=$('#pi_'+i+'_'+f);if(e)e.value=v}
function pinvApply(i,p){const r=state.pinv.rows[i];
  r.pid=p.id;r.name=p.name;r.code=p.sku||r.code;if(!num(r.cost))r.cost=p.cost||'';r.sell=p.price||'';if(!num(r.qty))r.qty=1;
  pinvPut(i,'code',r.code);pinvPut(i,'name',r.name);pinvPut(i,'cost',r.cost);pinvPut(i,'sell',r.sell);pinvPut(i,'qty',r.qty);pinvRefresh(i)}
function pinvCode(i,v){const r=state.pinv.rows[i];v=v.trim();r.code=v;
  const p=v&&db.products.find(x=>x.sku&&x.sku.toLowerCase()===v.toLowerCase());
  if(p)pinvApply(i,p);else{if(r.pid){r.pid='';r.name='';pinvPut(i,'name','')}pinvRefresh(i)}}
function pinvName(i,v){const r=state.pinv.rows[i];v=v.trim();
  const p=v&&db.products.find(x=>x.name.toLowerCase()===v.toLowerCase());
  if(p)return pinvApply(i,p);
  if(r.pid){r.pid='';r.code='';pinvPut(i,'code','')}
  r.name=v;pinvRefresh(i)}
function pinvQuick(el){const v=(el.value||'').trim().toLowerCase();if(!v)return;
  const L=db.products,p=L.find(x=>(x.sku||'').toLowerCase()===v)||L.find(x=>x.name.toLowerCase()===v)||L.find(x=>x.name.toLowerCase().includes(v)||(x.sku||'').toLowerCase().includes(v));
  if(!p)return toast('لا توجد مادة بهذا الاسم أو الرمز');
  const R=state.pinv.rows,ex=R.findIndex(r=>r.pid===p.id);
  if(ex>=0){R[ex].qty=num(R[ex].qty)+1;pinvPut(ex,'qty',R[ex].qty);pinvRefresh(ex)}
  else{let i=R.findIndex(r=>!r.code&&!r.name&&!r.qty);if(i<0){pinvAddRow();i=R.length-1}pinvApply(i,p)}
  el.value=''}
function pinvKey(e,i,f){if(e.key!=='Enter')return;e.preventDefault();
  if(f==='code')pinvCode(i,e.target.value);if(f==='name')pinvName(i,e.target.value);
  const nx={code:['qty',i],qty:['cost',i],cost:['code',i+1],name:['qty',i]}[f];
  pinvEnsureRow();if(nx[1]>=state.pinv.rows.length)pinvAddRow();const t=$('#pi_'+nx[1]+'_'+nx[0]);if(t){t.focus();if(t.select)t.select()}}
function pinvDel(i){const R=state.pinv.rows;if(i<0||i>=R.length)return;R.splice(i,1);if(!R.length)R.push(pinvRow());state.pinv.cur=Math.min(state.pinv.cur,R.length-1);pinvRender()}
function pinvNav(k){const P=state.pinv,n=db.purchases.length;if(!n)return toast('لا توجد فواتير مشتريات محفوظة');
  let i=P.navIdx===null?n:P.navIdx;i=k==='first'?0:k==='prev'?i-1:k==='next'?i+1:n-1;if(i<0)i=0;
  const go=()=>{if(i>=n){state.pinv=pinvFresh();pinvRender()}else pinvLoad(i)};
  if(P.mode!=='view'&&pinvHas())return askConfirm('الانتقال لفاتورة أخرى؟ ستضيع التعديلات غير المحفوظة.',go,'انتقال');
  go()}
function pinvLoad(i){const po=db.purchases[i];if(!po)return;
  const rows=po.lines.map(l=>{const p=prod(l.pid);return{code:l.code||'',pid:l.pid,name:l.name,unit:l.unit||'قطعة',qty:l.uq||l.qty,cost:l.cost,dp:l.dp>0?l.dp:'',d:l.dp>0?'':(l.disc>0?l.disc:''),note:l.note||'',sell:p?p.price:''}});
  if(!rows.length)rows.push(pinvRow());
  state.pinv={sid:po.sid||'',method:po.method||'cash',date:po.date,note:po.note||'',rep:po.rep||'',receipt:po.receipt||'',cc:po.cc||'',level:'low',discP:'',disc:po.disc>0?po.disc:'',extra:po.extra>0?po.extra:'',paid:(po.paid>=po.total-0.005?null:po.paid),rows,cur:0,navIdx:i,mode:'view',editId:po.id};
  pinvRender()}
function pinvEdit(){const P=state.pinv;if(P.mode!=='view')return;P.mode='edit';for(let k=0;k<3;k++)P.rows.push(pinvRow());pinvRender()}
function pinvRevert(po){po.lines.forEach(l=>{const p=prod(l.pid);if(p)p.stock=r2(p.stock-l.qty)});const sp=supp(po.sid);if(sp&&po.total-po.paid>0)sp.balance=r2(sp.balance-(po.total-po.paid))}
function pinvDelete(){const P=state.pinv,po=db.purchases[P.navIdx];if(!po||P.mode!=='view')return;
  const bad=po.lines.find(l=>{const p=prod(l.pid);return p&&p.stock<l.qty-0.0001});
  if(bad)return toast('لا يمكن الحذف: كمية «'+bad.name+'» في المخزون أقل من كمية الفاتورة');
  askConfirm('حذف فاتورة المشتريات '+po.no+'؟ ستُخصم موادها من المخزون.',()=>{pinvRevert(po);db.purchases.splice(P.navIdx,1);save();render();state.pinv=pinvFresh();pinvRender();toast('تم حذف الفاتورة')},'حذف')}
function pinvResolve(r){let p=r.pid?prod(r.pid):null;
  if(!p&&r.code)p=db.products.find(x=>x.sku&&x.sku.toLowerCase()===r.code.toLowerCase());
  if(!p&&r.name)p=db.products.find(x=>x.name.toLowerCase()===r.name.toLowerCase());
  return p||null}
function pinvSave(){
  const P=state.pinv,c=pinvCalc();if(P.mode==='view')return;
  const used=P.rows.filter(r=>(r.code||r.name)&&num(r.qty)>0);
  if(P.rows.some(r=>(r.code||r.name)&&!(num(r.qty)>0)))return toast('أدخل الكمية لكل مادة مضافة');
  if(!used.length)return toast('أضف مادة واحدة على الأقل مع الكمية');
  if(c.rest>0.005&&!P.sid)return toast('اختر المورد لتسجيل المبلغ المتبقي');
  for(const r of used){
    if(pinvResolve(r))continue;
    const n=P.rows.indexOf(r)+1;
    if(!(r.name||'').trim())return toast('اكتب اسم المادة في السطر '+n);
    if(!can('stock_edit'))return toast('ليست لديك صلاحية إضافة مواد جديدة: '+r.name);
    if(!(num(r.sell)>0))return toast('أدخل سعر البيع للمادة الجديدة: '+r.name);
  }
  const old=P.editId?db.purchases.find(x=>x.id===P.editId):null;if(old)pinvRevert(old);
  const lines=[];
  used.forEach(r=>{
    let p=pinvResolve(r);
    if(!p){p={id:uid(),name:r.name.trim(),sku:(r.code||'').trim(),cat:'عام',cost:0,wholesale:0,price:num(r.sell),stock:0,min:5};db.products.push(p)}
    else if(num(r.sell)>0&&can('stock_edit'))p.price=num(r.sell);
    const q0=num(r.qty),uf=window.orvexUnitF?window.orvexUnitF(p,r.unit):1,q=r2(q0*uf),d=pinvDisc(r),net=r2(q0*num(r.cost)-d);
    const _ld=window.orvexLandedShare?window.orvexLandedShare(net,c):0,tot=Math.max(0,net+_ld),cb=p.cost,sb=Math.max(0,num(p.stock));
    p.stock=r2(p.stock+q);
    /* تقييم المخزون: آخر تكلفة (الافتراضي) أو المتوسط المرجّح حسب إعداد المخزون المتقدم */
    p.cost=(db.settings.valuation==='wac'&&sb>0)?Math.round((sb*num(cb)+tot)/(sb+q)*10000)/10000:Math.round(tot/q*10000)/10000;
    const ln={pid:p.id,name:p.name,code:p.sku||'',unit:(r.unit||'').trim(),qty:q,cost:num(r.cost),dp:num(r.dp),disc:d,net,note:(r.note||'').trim(),cb:num(cb),ca:p.cost};
    if(uf>1){ln.uq=q0;ln.uf=uf}lines.push(ln);
  });
  const po={id:old?old.id:uid(),no:old?old.no:nextNo('po'),at:old?old.at:new Date().toISOString(),by:old?old.by:((curUser()||{}).name||''),date:P.date||today(),sid:P.sid,method:P.method,note:(P.note||'').trim(),rep:(P.rep||'').trim(),receipt:(P.receipt||'').trim(),cc:(P.cc||'').trim(),lines,linesTotal:c.sub,linesDisc:c.dis,disc:c.dv,extra:c.ex,total:c.total,paid:c.paid};
  if(P.sid&&c.rest>0)supp(P.sid).balance=r2(supp(P.sid).balance+c.rest);
  if(old){po.editedAt=new Date().toISOString();po.editedBy=(curUser()||{}).name||'';const ix=db.purchases.findIndex(x=>x.id===old.id);if(old.landed&&old.landed.length&&window.orvexLandedReapply)window.orvexLandedReapply(po,old);db.purchases[ix]=po;save();render();pinvLoad(ix);toast('تم حفظ التعديل');return}
  db.purchases.push(po);save();render();
  state.pinv=pinvFresh();pinvRender();toast('تم حفظ الفاتورة '+po.no+' وإضافة المواد للمخزون');
}


