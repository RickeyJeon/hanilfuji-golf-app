(function(){'use strict';
const style=document.createElement('style');
style.textContent=`
html,body{overscroll-behavior-y:none!important;-webkit-overflow-scrolling:touch}
.app{overscroll-behavior-y:none!important}
.hf-pull-refresh{position:fixed;top:10px;left:50%;z-index:2000;display:flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid rgba(13,59,46,.12);border-radius:999px;background:rgba(255,255,255,.96);box-shadow:0 5px 18px rgba(13,59,46,.14);color:#0d3b2e;font-size:12px;font-weight:700;pointer-events:none;opacity:0;transform:translate(-50%,-160%);transition:transform .18s ease,opacity .18s ease}
.hf-pull-refresh.visible{opacity:1;transform:translate(-50%,0)}
.hf-pull-refresh.refreshing{color:#1f7a5a}
.hf-pull-refresh .hf-pull-icon{font-size:16px;line-height:1}
`;
document.head.appendChild(style);
const indicator=document.createElement('div');
indicator.className='hf-pull-refresh';
indicator.setAttribute('aria-live','polite');
indicator.innerHTML='<span class="hf-pull-icon">↓</span><span class="hf-pull-text">아래로 당겨 새로고침</span>';
document.body.appendChild(indicator);

let startY=0,dragging=false,busy=false;
const text=indicator.querySelector('.hf-pull-text');
const icon=indicator.querySelector('.hf-pull-icon');
const canPull=()=>!busy&&window.scrollY<=2&&['home','event'].includes(window.currentPage||'home')&&!document.querySelector('.overlay:not(.hidden)');
const ignoredTarget=target=>!!target?.closest?.('input,textarea,select,button,a');

function reset(){
  dragging=false;
  indicator.classList.remove('visible');
  indicator.classList.remove('refreshing');
  indicator.style.removeProperty('--hf-distance');
  if(text)text.textContent='아래로 당겨 새로고침';
  if(icon)icon.textContent='↓';
}

document.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||!canPull()||ignoredTarget(event.target))return;
  startY=event.touches[0].clientY;
  dragging=true;
},{passive:true});

document.addEventListener('touchmove',event=>{
  if(!dragging||busy||event.touches.length!==1)return;
  const distance=event.touches[0].clientY-startY;
  if(distance<=0){reset();return}
  event.preventDefault();
  const shown=Math.min(92,Math.round(distance*.55));
  indicator.style.setProperty('--hf-distance',shown+'px');
  indicator.classList.add('visible');
  if(text)text.textContent=shown>=62?'놓으면 새로고침':'아래로 당겨 새로고침';
  if(icon)icon.textContent=shown>=62?'↻':'↓';
},{passive:false});

document.addEventListener('touchend',async event=>{
  if(!dragging)return;
  const distance=event.changedTouches?.[0]?.clientY-startY;
  const shouldRefresh=distance>=114;
  if(!shouldRefresh){reset();return}
  busy=true;
  indicator.classList.add('visible','refreshing');
  if(text)text.textContent='새로고침 중...';
  if(icon)icon.textContent='↻';
  try{
    if(typeof window.hfRefreshSharedData==='function')await window.hfRefreshSharedData();
  }catch(error){
    console.warn('[HANIL-FUJI] pull refresh failed',error);
  }finally{
    busy=false;
    if(text)text.textContent='새로고침 완료';
    if(icon)icon.textContent='✓';
    setTimeout(reset,650);
  }
},{passive:true});
})();