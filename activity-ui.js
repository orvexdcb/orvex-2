/* ORVEX Activity UI Foundation
 * Applies the shop's persisted main activity code to every authenticated screen.
 * Presentation-only: never writes shop, sales, inventory, or accounting data.
 */
(function(){
'use strict';
const root=window;
if(root.__orvexActivityUI)return;
const THEMES={
 general_trade:{name:'التجارة العامة',tone:'teal',vars:['#087f75','#e4f4f1','#123b38'],shape:'commerce'},
 food_consumer:{name:'المواد الغذائية والاستهلاكية',tone:'lime',vars:['#56851d','#eff6df','#2c4214'],shape:'fresh'},
 fashion:{name:'الملابس والأزياء',tone:'plum',vars:['#8153a5','#f2eafa','#39234c'],shape:'editorial'},
 electronics:{name:'الإلكترونيات والأجهزة الكهربائية',tone:'blue',vars:['#2563a8','#e8f1fb','#173455'],shape:'tech'},
 phones_telecom:{name:'الهواتف والاتصالات',tone:'cyan',vars:['#087e9b','#e4f5f9','#123d49'],shape:'tech'},
 automotive:{name:'السيارات وقطع الغيار',tone:'steel',vars:['#526579','#e9eef3','#263746'],shape:'industrial'},
 construction:{name:'البناء والإنشاءات',tone:'amber',vars:['#a96a18','#fbf0dc','#50330e'],shape:'industrial'},
 furniture:{name:'الأثاث والمفروشات',tone:'wood',vars:['#95623f','#f5ece4','#4a3020'],shape:'editorial'},
 health_pharma:{name:'الصحة والأدوية',tone:'green',vars:['#16835d','#e5f5ed','#164c38'],shape:'clinical'},
 restaurants:{name:'المطاعم والمأكولات',tone:'tomato',vars:['#c65332','#fff0e9','#5a291b'],shape:'hospitality'},
 perfume_beauty:{name:'العطور ومستحضرات التجميل',tone:'rose',vars:['#a64d77','#f9eaf1','#51243a'],shape:'editorial'},
 jewelry_gold:{name:'المجوهرات والذهب',tone:'gold',vars:['#9b7626','#f8f1d9','#4b3a12'],shape:'luxury'},
 stationery_books:{name:'القرطاسية والمكتبات',tone:'indigo',vars:['#515fa8','#eceefb','#292f5a'],shape:'editorial'},
 professional_services:{name:'الخدمات المهنية',tone:'navy',vars:['#315d87','#e9f0f7','#20364c'],shape:'services'},
 industrial:{name:'الأنشطة الصناعية',tone:'graphite',vars:['#59636d','#edf0f2','#303940'],shape:'industrial'},
 agricultural:{name:'الأنشطة الزراعية',tone:'leaf',vars:['#4e7d39','#edf5e7','#29451f'],shape:'fresh'},
 other:{name:'نشاط تجاري',tone:'teal',vars:['#0c6a64','#e4f0ee','#13272b'],shape:'commerce'}
};
const state={shop:'',code:'',label:'',loading:false,ready:false};
function currentShop(){try{return root.__orvexAcct&&typeof root.__orvexAcct.shop==='function'?root.__orvexAcct.shop():''}catch(e){return ''}}
function currentView(){try{return typeof state==='object'&&state?state.view:'home'}catch(e){return 'home'}}
function apply(){
 const code=state.code,theme=THEMES[code];
 const body=document.body,html=document.documentElement;
 if(!body||!html)return;
 Object.keys(THEMES).forEach(k=>body.classList.remove('orvex-act-'+k));
 if(!theme){delete html.dataset.orvexActivity;delete html.dataset.orvexShape;return}
 body.classList.add('orvex-act-'+code);
 html.dataset.orvexActivity=code;html.dataset.orvexShape=theme.shape;
 html.style.setProperty('--activity-brand',theme.vars[0]);
 html.style.setProperty('--activity-soft',theme.vars[1]);
 html.style.setProperty('--activity-ink',theme.vars[2]);
 const main=document.getElementById('main');
 if(main){
  main.dataset.activity=code;
  main.dataset.activityScreen=currentView();
  const page=main.querySelector('.od-page');
  if(page){
   page.dataset.activity=code;
   page.dataset.screen=currentView();
   let strip=page.querySelector('.orvex-activity-context');
   if(!strip){
    strip=document.createElement('div');strip.className='orvex-activity-context';
    const title=document.createElement('span');title.className='orvex-activity-context__name';title.textContent=theme.name;
    const marker=document.createElement('span');marker.className='orvex-activity-context__screen';marker.textContent=page.dataset.screen==='home'?'مساحة النشاط':'واجهة النشاط';
    strip.append(title,marker);
    const heading=page.querySelector('.od-pt');
    if(heading)heading.insertAdjacentElement('afterend',strip);else page.insertAdjacentElement('afterbegin',strip);
   }else strip.querySelector('.orvex-activity-context__screen').textContent=page.dataset.screen==='home'?'مساحة النشاط':'واجهة النشاط';
  }
 }
}
async function load(){
 const sid=currentShop();
 if(!sid){state.shop='';state.code='';state.label='';state.ready=true;apply();return}
 if(state.shop===sid&&state.ready){apply();return}
 if(state.loading&&state.shop===sid)return;
 state.shop=sid;state.code='';state.label='';state.ready=false;state.loading=true;
 try{
  const A=root.__orvexActivities;
  if(!A)throw new Error('activity module unavailable');
  const current=await A.getShopActivity(sid);
  const [m,s,p]=await Promise.all([A.loadMain(),A.loadSubs(),A.loadSpecs()]);
  const resolved=A.resolve(current,m.items,s,p);
  const main=resolved&&resolved.main;
  state.code=main&&THEMES[main.code]?main.code:'';
  state.label=[resolved.main,resolved.sub,resolved.spec].filter(Boolean).map(x=>x.name_ar).join(' ‹ ');
 }catch(e){state.code='';state.label=''}
 state.ready=true;state.loading=false;
 if(currentShop()===sid)apply();
}
const style=document.createElement('style');
style.id='orvexActivityUIStyle';
style.textContent=`

.orvex-activity-context{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--activity-brand) 24%,var(--line));border-inline-start:4px solid var(--activity-brand);border-radius:12px;background:var(--activity-soft);color:var(--activity-ink);font-size:12px}
.orvex-activity-context__name{font-weight:800}
.orvex-activity-context__screen{opacity:.72;font-size:11px}
#main[data-activity] .od-page .btn.primary{background:var(--activity-brand);border-color:var(--activity-brand)}
#main[data-activity] .od-page .badge:not(.bad):not(.warn){color:var(--activity-brand);background:var(--activity-soft)}
#main[data-activity] .od-page .card{border-radius:16px}

html[data-orvex-shape="luxury"] #main .od-page .card{border-radius:20px;box-shadow:0 5px 18px rgba(80,60,20,.07)}
html[data-orvex-shape="clinical"] #main .od-page .card{border-radius:10px}
html[data-orvex-shape="industrial"] #main .od-page .card{border-radius:8px}
html[data-orvex-shape="editorial"] #main .od-page .od-pt{letter-spacing:-.4px}
html[data-orvex-shape="hospitality"] #main .od-page .hero{border-radius:24px}
html[data-orvex-shape="tech"] #main .od-page .search{border-radius:8px}
@media(max-width:520px){.orvex-activity-context{padding:8px 10px;margin-bottom:10px}}
`;
document.head.appendChild(style);
const original=typeof root.render==='function'?root.render:null;
if(original){
 root.render=function(){const result=original.apply(this,arguments);try{load();apply()}catch(e){}return result};
}
root.__orvexActivityUI={themes:THEMES,state,refresh:()=>{state.shop='';state.ready=false;return load()},apply};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();