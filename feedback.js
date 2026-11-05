/* ORVEX: اقتراحات وأخطاء ودعم فني — محفوظة في Supabase ومربوطة بالمحل وحساب المؤسس. */
(function(){
 const sync=()=>window.__orvexSync&&window.__orvexSync.SB;
 const types=[['suggestion','اقتراح للتطوير'],['bug','الإبلاغ عن خطأ'],['support','طلب دعم فني']];
 const areas=['عام','نقطة البيع','المخزون','الفواتير','المشتريات','العملاء والموردون','التقارير','الحسابات والدخول','العمل دون إنترنت والمزامنة','الباركود والكاميرا'];
 window.orvexFeedbackForm=function(){
  const sb=sync();if(!sb||!sb.sess||(!sb.shop&&sb.prof?.role!=='founder'))return toast('سجّل الدخول أولاً حتى يصل طلبك إلى حساب المؤسس.');
  modal('شاركونا اقتراحاتكم',`<p class="muted">أرسل اقتراحًا أو بلّغ عن مشكلة. سيصل الطلب إلى حساب مؤسس ORVEX، مع ربطه بالمحل عند توفره.</p>
   <label>نوع الطلب</label><select id="ofType">${types.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select>
   <label>القسم</label><select id="ofArea">${areas.map(x=>`<option>${x}</option>`).join('')}</select>
   <label>وصف الطلب أو المشكلة *</label><textarea id="ofMessage" rows="5" maxlength="5000" placeholder="اشرح اقتراحك أو المشكلة والخطوات التي سببتها…"></textarea>
   <label>الاسم (اختياري)</label><input id="ofName" maxlength="120" value="${esc(sb.prof?.full_name||sb.me?.name||'')}">
   <label>البريد الإلكتروني (اختياري)</label><input id="ofEmail" type="email" maxlength="254" autocomplete="email">
   <label>رقم الهاتف (اختياري)</label><input id="ofPhone" type="tel" maxlength="40">
   <div class="actions"><button class="btn primary" id="ofSend" onclick="orvexFeedbackSend()">إرسال إلى المؤسس</button><button class="btn" onclick="closeModal()">إلغاء</button></div>`);
 };
 window.orvexFeedbackSend=async function(){
  const sb=sync(),btn=document.getElementById('ofSend');if(!sb||!sb.sess)return toast('انتهت الجلسة؛ سجّل الدخول مجددًا.');
  if(navigator.onLine===false)return toast('لا يوجد إنترنت. احتفظ بنص الطلب وأرسله عند عودة الاتصال.');
  const message=(document.getElementById('ofMessage')?.value||'').trim();if(message.length<5)return toast('اكتب وصفًا أوضح (5 أحرف على الأقل).');
  const type=document.getElementById('ofType').value,area=document.getElementById('ofArea').value;
  const email=(document.getElementById('ofEmail').value||'').trim();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return toast('تحقق من البريد الإلكتروني أو اتركه فارغًا.');
  const payload={shop_id:sb.shop||null,submitted_by:sb.me?.id||sb.sess?.uid||null,request_type:type,area,message,contact_name:(document.getElementById('ofName').value||'').trim()||null,contact_email:email||null,contact_phone:(document.getElementById('ofPhone').value||'').trim()||null,status:'new'};
  if(btn)btn.disabled=true;
  try{await window.__orvexRequest('/rest/v1/feedback_requests',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});closeModal();toast('تم إرسال طلبك إلى حساب المؤسس بنجاح.');}
  catch(e){toast('تعذّر إرسال الطلب: '+e.message+'. تأكد من تطبيق ترحيل feedback_requests على Supabase.');if(btn)btn.disabled=false;}
 };
 const oldHome=window.vHome;if(typeof oldHome==='function')window.vHome=function(){return oldHome()+'<div class="card orvex-feedback-card"><h3>💬 شاركونا اقتراحاتكم</h3><p class="muted">اقتراح تطوير، بلاغ عن خطأ، أو طلب دعم فني — يصل مباشرةً إلى مؤسس ORVEX.</p><button class="btn primary" onclick="orvexFeedbackForm()">إرسال اقتراح أو طلب دعم</button></div>'};
 const oldStudio=window.vStudio;if(typeof oldStudio==='function')window.vStudio=function(){const h=oldStudio();return typeof h==='string'&&h.includes('id="shopList"')?h.replace('<div class="card" id="shopList"','<div class="card" id="feedbackInbox"><h3>طلبات المستخدمين</h3><p class="muted">جارٍ تحميل الطلبات…</p></div><div class="card" id="shopList"'):h};
 const oldRender=window.render;if(typeof oldRender==='function')window.render=function(){const r=oldRender.apply(this,arguments);setTimeout(loadInbox,120);return r};
 async function loadInbox(){const sb=sync(),box=document.getElementById('feedbackInbox');if(!box||!sb?.sess||sb.prof?.role!=='founder'||sb.shop)return;try{const rows=await window.__orvexRequest('/rest/v1/feedback_requests?select=id,shop_id,request_type,area,message,contact_name,contact_email,contact_phone,status,created_at&order=created_at.desc&limit=100');box.innerHTML='<h3>طلبات المستخدمين (آخر 100)</h3>'+(rows.length?rows.map(r=>`<div class="row" style="align-items:flex-start"><div class="grow" style="min-width:0"><b>${esc(({suggestion:'اقتراح تطوير',bug:'بلاغ خطأ',support:'طلب دعم'})[r.request_type]||r.request_type)} · ${esc(r.area)}</b><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.message)}</p><small>${esc(r.contact_name||'بدون اسم')}${r.contact_email?' · '+esc(r.contact_email):''}${r.contact_phone?' · '+esc(r.contact_phone):''} · ${esc(new Date(r.created_at).toLocaleString('ar-IQ'))}</small></div><select aria-label="حالة الطلب" onchange="orvexFeedbackStatus('${jsq(r.id)}',this.value)"><option value="new" ${r.status==='new'?'selected':''}>جديد</option><option value="in_progress" ${r.status==='in_progress'?'selected':''}>قيد المعالجة</option><option value="resolved" ${r.status==='resolved'?'selected':''}>تم الحل</option></select></div>`).join(''):'<p class="muted">لا توجد طلبات حتى الآن.</p>')}catch(e){box.innerHTML='<h3>طلبات المستخدمين</h3><p class="muted">تعذر تحميل الطلبات: '+esc(e.message)+'</p>'}}
 window.orvexFeedbackStatus=async function(id,status){if(!['new','in_progress','resolved'].includes(status))return;try{await window.__orvexRequest('/rest/v1/feedback_requests?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status})});toast('تم تحديث حالة الطلب');loadInbox()}catch(e){toast('تعذر تحديث الحالة: '+e.message)}};
 const st=document.createElement('style');st.textContent='.orvex-feedback-card{border:1px solid var(--line);margin-top:14px}.orvex-feedback-card h3{margin-top:0}#ofMessage{width:100%;resize:vertical;box-sizing:border-box}#feedbackInbox .row{border-bottom:1px solid var(--line);padding:12px 0}#feedbackInbox select{max-width:130px}';document.head.appendChild(st);

 // ضمان ظهور خيار الاقتراحات حتى لو كانت بطاقة الصفحة الرئيسية خارج الجزء المرئي.
 function mountFeedbackShortcut(){
   if(!document.body)return;
   const state=sync();
   const existing=document.getElementById('orvexFeedbackShortcut');
   if(!state||!state.sess){if(existing)existing.remove();return;}
   if(existing)return;
   const b=document.createElement('button');b.id='orvexFeedbackShortcut';b.type='button';
   b.textContent='💬 شاركونا اقتراحاتكم';
   b.setAttribute('aria-label','شاركونا اقتراحاتكم');
   b.style.cssText='position:fixed;left:16px;bottom:calc(84px + env(safe-area-inset-bottom, 0px));z-index:99999;border:1px solid #27e060;border-radius:999px;background:#07140e;color:#fff;padding:10px 13px;font:700 13px Cairo,Tahoma,sans-serif;box-shadow:0 4px 18px #0008;cursor:pointer;max-width:min(250px,calc(100vw - 32px));white-space:normal';
   b.onclick=()=>window.orvexFeedbackForm&&window.orvexFeedbackForm();document.body.appendChild(b);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountFeedbackShortcut,{once:true});else mountFeedbackShortcut();
 const _ofRender=window.render;if(typeof _ofRender==='function')window.render=function(){const v=_ofRender.apply(this,arguments);setTimeout(mountFeedbackShortcut,0);return v};

})();
