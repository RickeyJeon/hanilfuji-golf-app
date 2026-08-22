(function(){'use strict';
const isAdmin=()=>typeof currentUser!=='undefined'&&currentUser&&['PRIMARY_ADMIN','ASSISTANT_ADMIN'].includes(currentUser.role);
const esc2=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
async function deleteMember(target){
 if(!isAdmin()){alert('관리자 권한이 없습니다.');return}
 if(!target?.dbId){alert('회원 정보를 확인할 수 없습니다.');return}
 const name=target.name||'해당 회원';
 if(!confirm(`${name} 회원을 삭제하시겠습니까?\n\n회원의 과거 경기 기록과 포인트는 유지됩니다.\n삭제 후 해당 회원은 로그인할 수 없습니다.`))return;
 try{
  const{data,error}=await hfSupabase.rpc('admin_delete_member',{p_member_id:target.dbId,p_admin_member_id:currentUser.dbId});
  if(error||!data?.ok)throw new Error(error?.message||'회원 삭제 처리에 실패했습니다.');
  alert(`${name} 회원이 삭제되었습니다.\n과거 경기 기록과 포인트는 유지됩니다.`);
  const local=members.find(m=>m.dbId===target.dbId);
  if(local)local.status='INACTIVE';
  closeModal();
  if(typeof syncMemberDirectory==='function')await syncMemberDirectory();
  if(typeof membersView==='function')setTimeout(()=>membersView(),50);
 }catch(e){alert(`회원 삭제에 실패했습니다.\n${e?.message||e}`)}
}
function addDeleteButton(){
 if(!isAdmin())return;
 const sheet=document.querySelector('#sheet');
 if(!sheet||sheet.querySelector('[data-delete-member]'))return;
 const text=sheet.textContent||'';
 if(/승인관리|가입 신청|임시 비밀번호 발급 완료/.test(text))return;
 let target=null;
 const phone=(text.match(/01[0-9][\s-]?[0-9]{3,4}[\s-]?[0-9]{4}/)||[])[0]?.replace(/\D/g,'');
 if(phone)target=members.find(m=>String(m.phone||'').replace(/\D/g,'')===phone);
 if(!target){const candidates=members.filter(m=>m?.dbId&&m?.name&&text.includes(m.name)&&m.status!=='INACTIVE');if(candidates.length===1)target=candidates[0]}
 if(!target?.dbId||target.role==='PRIMARY_ADMIN'||target.role==='primary_admin')return;
 const btn=document.createElement('button');btn.className='btn danger full';btn.dataset.deleteMember='1';btn.textContent='🗑️ 회원 삭제';btn.style.marginTop='8px';btn.onclick=()=>deleteMember(target);sheet.appendChild(btn);
}
const obs=new MutationObserver(addDeleteButton);window.addEventListener('load',addDeleteButton);obs.observe(document.body,{childList:true,subtree:true});window.adminDeleteMember=deleteMember;
})();