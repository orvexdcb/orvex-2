/* ORVEX — إعدادات ضريبة المبيعات (للمدير). الضريبة مضافة فوق السعر (غير شاملة) وتُحسب على صافي الفاتورة بعد الخصم.
   تُفعَّل فقط بمفتاح taxOn الصريح (بيانات المحلات القديمة تبقى بلا ضريبة حتى لو وُجدت قيمة قديمة). تؤثر على الفواتير الجديدة فقط؛
   الفواتير السابقة لا تتغير، والمرتجع يردّ حصة الضريبة بنسبة الفاتورة الأصلية. ضريبة المشتريات (المدخلات) غير مدعومة بعد. */
(function(){
  'use strict';
  if(typeof vSettings!=='function')return;
  const _v=vSettings;
  vSettings=function(){
    let h=_v();if(!isAdmin())return h;
    const s=db.settings;
    return h+`<div class="card"><h3>ضريبة المبيعات</h3>
      <label style="display:flex;gap:8px;align-items:center"><input id="tx_on" type="checkbox" style="width:auto" ${s.taxOn===true&&s.tax>0?'checked':''}> تفعيل ضريبة المبيعات</label>
      <div class="f2"><div><label>النسبة %</label><input id="tx_rate" type="number" inputmode="decimal" min="0" max="100" step="any" value="${s.tax>0?esc(s.tax):''}" placeholder="مثال: 15"></div>
      <div><label>الرقم الضريبي (يظهر في الفاتورة)</label><input id="tx_no" value="${esc(s.taxNo||'')}"></div></div>
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">تُضاف فوق السعر وتُحسب بعد الخصم، وتظهر في الفاتورة والإغلاق. تسري على الفواتير الجديدة فقط.</p>
      <div class="actions"><button class="btn primary" onclick="saveTax()">حفظ الضريبة</button></div></div>`;
  };
  window.saveTax=function(){
    if(!isAdmin())return toast('للمدير فقط');
    const on=$('#tx_on').checked,raw=parseFloat(String($('#tx_rate').value||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if(on&&!(isFinite(raw)&&raw>0&&raw<=100))return toast('أدخل نسبة بين 0 و100');
    const s=db.settings;s.taxOn=!!on;s.tax=on?Math.round(raw*100)/100:0;s.taxNo=($('#tx_no').value||'').trim();
    save();render();toast(on?'تم تفعيل الضريبة '+s.tax+'%':'تم إيقاف الضريبة');
  };
})();
