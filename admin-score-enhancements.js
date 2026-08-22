(function(){
'use strict';
const db=()=>window.hfSupabase;
const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
function isAdmin(){return !!window.currentUser && ['PRIMARY_ADMIN','ASSISTANT_ADMIN','primary_admin','assistant_admin'].includes(window.currentUser.role);}
function adminId(){return window.currentUser?.dbId||window.currentUser?.id||null;}
function ensureAdmin(){if(!isAdmin()){alert('관리자 권한이 필요합니다.');return false}return true}
async function completedEvents(){
 const {data,error}=await db().from('club_events').select('id,title,starts_at,event_status').eq('event_status','completed').order('starts_at',{ascending:false});
 if(error)throw error;return data||[];
}
async function countsByEvent(ids){
 if(!ids.length)return new Map();
 const {data,error}=await db().from('event_scorecards').select('event_id').in('event_id',ids);
 if(error)throw error;const m=new Map();(data||[]).forEach(x=>m.set(x.event_id,(m.get(x.event_id)||0)+1));return m;
}
function fmtDate(v){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v))}
window.openAdminScoreManagement=async function(){
 if(!ensureAdmin())return;
 try{
  const events=await completedEvents(), counts=await countsByEvent(events.map(e=>e.id));
  const now=new Date(), year=now.getFullYear(), month=now.getMonth()+1;
  const years=[...new Set(events.map(e=>new Date(e.starts_at).getFullYear()))]; if(!years.includes(year))years.unshift(year);
  openModal(`<h3>🏆 ADMIN · 스코어 관리</h3><div class="card" style="margin:10px 0"><strong>월 전체 결과 초기화</strong><p class="small">해당 월의 확정 경기결과와 그 결과에서 발생한 포인트가 제거됩니다. 경기/회원정보는 삭제되지 않습니다.</p><div style="display:flex;gap:6px"><select id="scoreResetYear" class="input">${years.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}년</option>`).join('')}</select><select id="scoreResetMonth" class="input">${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${m===month?'selected':''}>${m}월</option>`).join('')}</select><button class="btn danger" onclick="resetScoreMonth()">월 전체 결과 초기화</button></div></div><div class="small" style="margin:12px 0 6px">확정 경기 결과</div><div id="adminScoreEventList">${events.length?events.map(e=>`<div class="item" style="display:flex;align-items:center;gap:8px"><div style="flex:1"><strong>${esc(e.title)}</strong><div class="small">${fmtDate(e.starts_at)} · 결과 ${counts.get(e.id)||0}건</div></div><button class="btn danger" onclick="deleteScoreResult('${e.id}','${esc(e.title)}')">결과 삭제</button></div>`).join(''):'<div class="empty">확정된 경기 결과가 없습니다.</div>'}</div>`);
 }catch(e){alert('스코어 관리 정보를 불러오지 못했습니다.\n'+(e?.message||e))}
};
window.deleteScoreResult=async function(eventId,title){
 if(!ensureAdmin())return;
 if(!confirm('해당 경기 결과를 삭제하시겠습니까?\n\n이 결과에서 발생한 포인트 및 기록이 다시 계산됩니다.'))return;
 try{
  const {data,error}=await db().rpc('admin_delete_event_results',{p_event_id:eventId,p_admin_member_id:adminId()});
  if(error)throw error;if(!data?.ok)throw new Error('결과 삭제가 완료되지 않았습니다.');
  alert(`${title} 경기 결과가 삭제되었습니다.\n삭제된 결과: ${data.deleted_scorecards||0}건`);await window.openAdminScoreManagement();
 }catch(e){alert('결과 삭제에 실패했습니다.\n'+(e?.message||e))}
};
window.resetScoreMonth=async function(){
 if(!ensureAdmin())return;
 const y=Number(document.getElementById('scoreResetYear')?.value),m=Number(document.getElementById('scoreResetMonth')?.value);
 if(!y||!m)return;
 if(!confirm(`${y}년 ${m}월 경기결과와 해당 결과에서 발생한 포인트가 제거됩니다.\n\n계속하시겠습니까?`))return;
 try{
  const {data,error}=await db().rpc('admin_reset_month_results',{p_year:y,p_month:m,p_admin_member_id:adminId()});
  if(error)throw error;if(!data?.ok)throw new Error('월 초기화가 완료되지 않았습니다.');
  alert(`${y}년 ${m}월 경기결과 초기화가 완료되었습니다.\n삭제된 결과: ${data.deleted_scorecards||0}건`);await window.openAdminScoreManagement();
 }catch(e){alert('월 전체 결과 초기화에 실패했습니다.\n'+(e?.message||e))}
};
function injectButton(){
 if(!isAdmin()||document.getElementById('adminScoreResetEntry'))return;
 const candidates=[...document.querySelectorAll('button,.item,.menu-item,.card')];
 const target=candidates.find(x=>/스코어|점수|결과 관리|score/i.test(x.textContent||''));
 if(!target)return;
 const b=document.createElement('button');b.id='adminScoreResetEntry';b.className='btn ghost full';b.style.marginTop='8px';b.textContent='🏆 스코어 결과 관리';b.onclick=window.openAdminScoreManagement;
 (target.closest('.card')||target.parentElement||target).appendChild(b);
}
const oldRender=window.render;if(typeof oldRender==='function')window.render=function(){const r=oldRender.apply(this,arguments);setTimeout(injectButton,30);return r};
window.addEventListener('load',()=>setTimeout(injectButton,250));
})();
