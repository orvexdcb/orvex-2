/* ORVEX — المقاسات والألوان (sizes_colors + variants_matrix).
   تصميم مدمج: كل متغير = منتج عادي مستقل (مخزونه وباركوده وسعره) فلا يتغير شيء في البيع والمخزون والتقارير،
   مع تعريف واحد للمجموعة وتوليد تلقائي للمتغيرات وشاشة مصفوفة (مقاس × لون) وبيع بالضغط على الخلية.
   بيانات المتغير في product.extra: _vg (معرّف المجموعة)، _base (الاسم الأساسي)، _size، _color. لا مجموعات ولا جداول جديدة. */
(function(root){
'use strict';
const MAX=200;
const parseList=t=>{const seen=new Set(),out=[];String(t==null?'':t).split(/[,،;\n]+/).forEach(x=>{x=x.trim();const k=x.toLowerCase();if(x&&!seen.has(k)){seen.add(k);out.push(x)}});return out};
/* التركيبات: بلا ألوان أو بلا مقاسات تُستعمل البعد الآخر وحده؛ وبلا الاثنين لا شيء */
function combos(sizes,colors){
  if(!sizes.length&&!colors.length)return[];
  if(!colors.length)return sizes.map(s=>({size:s,color:''}));
  if(!sizes.length)return colors.map(c=>({size:'',color:c}));
  const o=[];sizes.forEach(s=>colors.forEach(c=>o.push({size:s,color:c})));return o;
}
const variantName=(base,size,color)=>[base,size,color].filter(Boolean).join(' - ');
/* الباركود لاتيني فقط (الماسحات والطابعات): الحروف العربية تُستبدل برمز ثابت X### مشتق من النص */
const slug=s=>{const t=String(s||'').trim();if(!t)return'';const l=t.toUpperCase().replace(/[^A-Z0-9]+/g,'');if(l&&!/[^\x00-\x7F]/.test(t))return l;let h=0;for(const ch of t)h=(h*31+ch.codePointAt(0))%1000;return l+'X'+String(h).padStart(3,'0')};
/* باركود مقترح: بادئة-مقاس-لون؛ يضيف رقمًا عند التكرار؛ فارغ إن لم تُحدَّد بادئة */
function variantSku(prefix,size,color,taken){
  const p=String(prefix||'').trim();if(!p)return'';
  const base=[p,slug(size),slug(color)].filter(Boolean).join('-');let sku=base,n=2;
  while(taken.has(sku))sku=base+'-'+(n++);
  taken.add(sku);return sku;
}
function groupsOf(products){
  const m={};
  (products||[]).forEach(p=>{const e=p.extra;if(!e||!e._vg)return;(m[e._vg]=m[e._vg]||{id:e._vg,base:e._base||p.name,items:[]}).items.push(p)});
  return Object.values(m).sort((a,b)=>String(a.base).localeCompare(String(b.base)));
}
const same=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
function find(group,size,color){return group.items.find(p=>same(p.extra._size,size)&&same(p.extra._color,color))||null}
function axes(group){
  const seen=(k)=>{const s=new Set(),o=[];group.items.forEach(p=>{const v=p.extra[k]||'';const lk=v.toLowerCase();if(v&&!s.has(lk)){s.add(lk);o.push(v)}});return o};
  return{sizes:seen('_size'),colors:seen('_color')};
}
/* التركيبات الناقصة عند إضافة مقاسات/ألوان لمجموعة قائمة */
function missing(group,sizes,colors){
  const a=axes(group),S=[...a.sizes],C=[...a.colors];
  sizes.forEach(x=>{if(!S.some(y=>same(x,y)))S.push(x)});colors.forEach(x=>{if(!C.some(y=>same(x,y)))C.push(x)});
  return combos(S,C).filter(c=>!find(group,c.size,c.color));
}
/* معاينة تطبيق سعر على المجموعة: المتغيرات التي يتغير سعرها فقط */
function pricePreview(group,price){
  const n=parseFloat(price);if(!(n>=0))return[];
  return group.items.filter(p=>(+p.price||0)!==n).map(p=>({id:p.id,name:p.name,old:+p.price||0,price:n}));
}
const V={MAX,parseList,combos,variantName,variantSku,groupsOf,find,axes,missing,pricePreview};
root.ORVEX_VARIANTS=V;
if(typeof module!=='undefined'&&module.exports)module.exports=V;
if(typeof document==='undefined'||typeof db==='undefined')return;

const E=s=>esc(s);
if(root.ORVEX_ACT&&root.ORVEX_ACT.SCREENS){const S=root.ORVEX_ACT.SCREENS;S.sizes_colors={fn:'variantsModal',label:'المقاسات والألوان'};S.variants_matrix={fn:'variantsModal',label:'مصفوفة المتغيرات'}}
let mode='edit';
const canEdit=()=>typeof can==='function'?can('stock_edit'):true;
root.variantsModal=function(){
  if(!(canEdit()||(typeof can!=='function'||can('pos'))))return toast('ليست لديك صلاحية');
  const G=groupsOf(db.products);
  modal('المقاسات والألوان',`<div class="card">${G.length?G.map(g=>`<button class="row tap" onclick="variantGroup('${jsq(g.id)}')"><div class="grow"><div class="t">${E(g.base)}</div><small>${g.items.length} متغير</small></div><div class="end"><b>${g.items.reduce((s,p)=>s+(+p.stock||0),0)}</b><small>إجمالي المخزون</small></div></button>`).join(''):empty('لا مجموعات بعد. أنشئ مجموعة ليولَّد لها متغيرات.')}</div>
  <div class="actions">${canEdit()?'<button class="btn primary" onclick="variantNew()">+ مجموعة متغيرات</button>':''}</div>`);
};
root.variantNew=function(){
  if(!canEdit())return toast('ليست لديك صلاحية التعديل');
  modal('مجموعة متغيرات جديدة',`<label>الاسم الأساسي</label><input id="vn_n" placeholder="مثال: قميص رجالي">
  <div class="f2"><div><label>سعر البيع</label><input id="vn_p" type="number" inputmode="decimal" step="any"></div><div><label>سعر الشراء</label><input id="vn_c" type="number" inputmode="decimal" step="any"></div></div>
  <div class="f2"><div><label>التصنيف</label><input id="vn_cat" value="عام"></div><div><label>الحد الأدنى للتنبيه</label><input id="vn_m" type="number" inputmode="numeric" value="2"></div></div>
  <label>بادئة الباركود (اختياري — يُولَّد باركود لكل متغير)</label><input id="vn_s" style="direction:ltr;text-align:left">
  <label>المقاسات (افصل بفاصلة)</label><input id="vn_sz" placeholder="S, M, L, XL" oninput="variantCount()">
  <label>الألوان (افصل بفاصلة)</label><input id="vn_cl" placeholder="أحمر, أزرق" oninput="variantCount()">
  <div id="vn_c2" class="note" style="margin-top:8px">—</div>
  <p class="muted" style="font-size:12.5px">تُنشأ المتغيرات بمخزون صفر؛ أضف الكميات من المشتريات أو الجرد كالمعتاد.</p>
  <div class="actions"><button class="btn primary" onclick="variantCreate()">توليد المتغيرات</button><button class="btn ghost" onclick="variantsModal()">رجوع</button></div>`);
};
root.variantCount=function(){
  const n=combos(parseList(document.getElementById('vn_sz').value),parseList(document.getElementById('vn_cl').value)).length;
  document.getElementById('vn_c2').textContent=n?(n+' متغير'+(n>MAX?' — أكثر من الحد الأقصى '+MAX:'')):'—';
};
root.variantCreate=function(){
  if(!canEdit())return;
  const v=id=>document.getElementById(id).value.trim(),base=v('vn_n');
  if(!base)return toast('أدخل الاسم الأساسي');
  const C=combos(parseList(v('vn_sz')),parseList(v('vn_cl')));
  if(!C.length)return toast('أدخل مقاسات أو ألوانًا');if(C.length>MAX)return toast('الحد الأقصى '+MAX+' متغير');
  const price=num(v('vn_p'));if(!(price>=0))return toast('سعر غير صالح');
  if(groupsOf(db.products).some(g=>same(g.base,base)))return toast('توجد مجموعة بهذا الاسم');
  const vg=uid(),taken=new Set(db.products.map(p=>p.sku).filter(Boolean)),mk=[];
  for(const c of C){
    const name=variantName(base,c.size,c.color);
    if(db.products.some(p=>same(p.name,name)))return toast('يوجد منتج بالاسم «'+name+'» — غيّر الاسم الأساسي');
    mk.push({id:uid(),name,sku:variantSku(v('vn_s'),c.size,c.color,taken),cat:v('vn_cat')||'عام',cost:num(v('vn_c'))||0,wholesale:0,price,stock:0,min:num(v('vn_m'))||0,extra:{_vg:vg,_base:base,_size:c.size,_color:c.color}});
  }
  db.products.push.apply(db.products,mk);save();toast('تم توليد '+mk.length+' متغير');variantGroup(vg);
};
function grp(id){return groupsOf(db.products).find(g=>g.id===id)}
root.variantGroup=function(id){
  const g=grp(id);if(!g)return variantsModal();
  const a=axes(g),cols=a.colors.length?a.colors:[''],rows=a.sizes.length?a.sizes:[''];
  const cell=(s,c)=>{const p=find(g,s,c);if(!p)return'<td>—</td>';
    return `<td><button class="chip" style="min-width:52px;${p.stock<=0?'opacity:.5':''}" onclick="variantTap('${jsq(g.id)}','${jsq(p.id)}')">${p.stock}</button></td>`};
  modal(g.base,`<div class="chips"><button class="chip ${mode==='edit'?'on':''}" onclick="variantMode('edit','${jsq(g.id)}')">تعديل</button><button class="chip ${mode==='sell'?'on':''}" onclick="variantMode('sell','${jsq(g.id)}')">بيع</button></div>
  <p class="muted" style="margin:4px 0;font-size:12.5px">${mode==='sell'?'اضغط خلية لإضافة قطعة إلى سلة البيع.':'اضغط خلية لتعديل المتغير. الأرقام = المخزون.'}</p>
  <div style="overflow-x:auto"><table class="tbl"><tr><th></th>${cols.map(c=>`<th>${E(c)}</th>`).join('')}</tr>${rows.map(s=>`<tr><th>${E(s)}</th>${cols.map(c=>cell(s,c)).join('')}</tr>`).join('')}</table></div>
  ${canEdit()?`<label>إضافة مقاسات (فاصلة)</label><input id="vg_sz"><label>إضافة ألوان (فاصلة)</label><input id="vg_cl"><div class="actions"><button class="btn" onclick="variantAdd('${jsq(g.id)}')">توليد الناقص</button><button class="btn" onclick="variantPrice('${jsq(g.id)}')">تطبيق سعر على الكل</button></div>`:''}
  <div class="actions"><button class="btn ghost" onclick="variantsModal()">رجوع</button></div>`);
};
root.variantMode=(m,id)=>{mode=m;variantGroup(id)};
root.variantTap=function(gid,pid){
  if(mode==='sell'){
    if(typeof can==='function'&&!can('pos'))return toast('ليست لديك صلاحية البيع');
    return typeof addCart==='function'?addCart(pid,1,true):0;
  }
  if(!canEdit())return toast('ليست لديك صلاحية التعديل');
  if(typeof productForm==='function')productForm(pid);
};
root.variantAdd=function(gid){
  if(!canEdit())return;const g=grp(gid);if(!g)return;
  const M=missing(g,parseList(document.getElementById('vg_sz').value),parseList(document.getElementById('vg_cl').value));
  if(!M.length)return toast('لا يوجد ناقص لتوليده');if(g.items.length+M.length>MAX)return toast('الحد الأقصى '+MAX+' متغير');
  const t=g.items[0],taken=new Set(db.products.map(p=>p.sku).filter(Boolean)),mk=[];
  for(const c of M){const name=variantName(g.base,c.size,c.color);
    if(db.products.some(p=>same(p.name,name)))return toast('يوجد منتج بالاسم «'+name+'»');
    mk.push({id:uid(),name,sku:'',cat:t.cat,cost:t.cost,wholesale:0,price:t.price,stock:0,min:t.min,extra:{_vg:g.id,_base:g.base,_size:c.size,_color:c.color}})}
  db.products.push.apply(db.products,mk);save();toast('تم توليد '+mk.length);variantGroup(gid);
};
root.variantPrice=function(gid){
  modal('تطبيق سعر على المجموعة',`<label>سعر البيع الجديد</label><input id="vp_p" type="number" inputmode="decimal" step="any"><div class="actions"><button class="btn primary" onclick="variantPricePrev('${jsq(gid)}')">معاينة</button><button class="btn ghost" onclick="variantGroup('${jsq(gid)}')">رجوع</button></div>`);
};
root.variantPricePrev=function(gid){
  const g=grp(gid),pr=num(document.getElementById('vp_p').value),P=g?pricePreview(g,pr):[];
  if(!(pr>=0))return toast('سعر غير صالح');
  modal('معاينة السعر',P.length?`<p>سيتغير سعر <b>${P.length}</b> متغير إلى ${money(pr)} (لا يُغيَّر سعر الشراء).</p><div class="card">${P.slice(0,60).map(x=>`<div class="row"><div class="grow">${E(x.name)}</div><small>${fmt(x.old)} ←</small> <b>${fmt(x.price)}</b></div>`).join('')}</div><div class="actions"><button class="btn primary" onclick="variantPriceApply('${jsq(gid)}',${pr})">اعتماد</button><button class="btn ghost" onclick="variantGroup('${jsq(gid)}')">رجوع</button></div>`:'<p class="muted">كل المتغيرات بهذا السعر بالفعل.</p><div class="actions"><button class="btn ghost" onclick="variantGroup(\''+jsq(gid)+'\')">رجوع</button></div>');
};
root.variantPriceApply=function(gid,pr){
  if(!canEdit())return;const g=grp(gid);if(!g)return;let n=0;
  pricePreview(g,pr).forEach(x=>{const p=prod(x.id);if(!p)return;const old=p.price;p.price=x.price;n++;if(window.orvexLog)orvexLog('price_change',p.name,'السعر '+old+'←'+p.price+' (مجموعة متغيرات)')});
  save();toast('تم تحديث '+n);variantGroup(gid);
};
})(typeof window!=='undefined'?window:globalThis);
