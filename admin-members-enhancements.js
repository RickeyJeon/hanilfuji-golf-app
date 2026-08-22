(function(){
'use strict';
const admins=()=>typeof currentUser!=='undefined'&&['PRIMARY_ADMIN','ASSISTANT_ADMIN'].includes(currentUser?.role);
const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
function hideMembersForNormalUser(){
  if(admins())return;
  document.querySelectorAll('.list-menu .item,.navitem,[data-page]').forEach(el=>{
    const t=(el.textContent||'').replace(/\s+/g,'');
    if(t.includes('MEMBERS')||t.includes('회원목록')) el.style.display='none';
  });
}
async function findSelectedMember(){
  const sheet=document.querySelector('#sheet'); if(!sheet||!admins()||typeof members==='undefined')return null;
  const text=sheet.textContent||'';
  const phone=(text.match(/01[0-9][\s-]?[0-9]{3,4}[\s-]?[0-9]{4}/)||[])[0]?.replace(/\D/g,'');
  if(phone){const m=members.find(x=>String(x.phone||'').replace(/\D/g,'')===phone);if(m?.dbId)return m;}
  const matches=members.filter(m=>m?.dbId&&m?.name&&text.includes(m.name));
  return matches.length===1?matches[0]:null;
}
async function addAdminMemberActions(){
  if(!admins())return;
  const sheet=document.querySelector('#sheet'); if(!sheet||sheet.querySelector('[data-member-admin-actions]'))return;
  const m=await findSelectedMember(); if(!m)return;
  const wrap=document.createElement('div');wrap.dataset.memberAdminActions='1';wrap.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px';
  const pw=document.createElement('button');pw.className='btn secondary';pw.textContent='🔑 임시 비밀번호 발급';pw.onclick=()=>window.issueTemporaryPassword(m.dbId);
  const del=document.createElement('button');del.className='btn ghost';del.style.color='#b42318';del.textContent='🗑️ 회원 비활성화';del.onclick=async()=>{
    if(!confirm(`${m.name}님의 회원을 비활성화하시겠습니까?\n회원의 경기기록은 삭제되지 않습니다.`))return;
    try{
      const{data,error}=await hfSupabase.rpc('admin_delete_member',{p_member_id:m.dbId,p_admin_member_id:currentUser.dbId});
      if(error)throw error;if(!data?.ok)throw new Error('회원 비활성화에 실패했습니다.');
      alert(`${m.name}님의 회원 상태가 비활성화되었습니다.`);closeModal();if(typeof syncMemberDirectory==='function')await syncMemberDirectory();if(typeof render==='function')render('more');
    }catch(e){alert('회원 비활성화에 실패했습니다.\n'+(e?.message||e))}
  };
  wrap.append(pw,del);sheet.appendChild(wrap);
}
const oldMorePage=window.morePage;
if(typeof oldMorePage==='function')window.morePage=function(){const html=oldMorePage.apply(this,arguments);if(admins())return html;return html.replace(/<div class="item" onclick="membersView\(\)">[\s\S]*?<\/div>/,'');};
window.addEventListener('load',()=>{hideMembersForNormalUser();setTimeout(addAdminMemberActions,300)});
new MutationObserver(()=>{hideMembersForNormalUser();setTimeout(addAdminMemberActions,30)}).observe(document.body,{childList:true,subtree:true});
})();
