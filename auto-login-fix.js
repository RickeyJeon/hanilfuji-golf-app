(function(){
const KEY='hf_auto_login_enabled';
function normalizeMember(row){
  if(!row)return null;
  return {
    ...row,
    id: row.id,
    name: row.name || row.full_name || '',
    fullName: row.fullName || row.full_name || row.name || '',
    full_name: row.full_name || row.name || '',
    phone: row.phone || row.phone_e164 || '',
    phoneE164: row.phoneE164 || row.phone_e164 || row.phone || '',
    email: row.email || '',
    company: row.company || row.company_name || '',
    companyName: row.companyName || row.company_name || row.company || '',
    dept: row.dept || row.department_name || '',
    department: row.department || row.department_name || row.dept || '',
    departmentName: row.departmentName || row.department_name || row.department || row.dept || '',
    position: row.position || row.position_title || '',
    positionTitle: row.positionTitle || row.position_title || row.position || '',
    role: row.role || 'member',
    status: row.status || 'active',
    authUserId: row.authUserId || row.auth_user_id || '',
    auth_user_id: row.auth_user_id || row.authUserId || '',
    mustChangePassword: !!(row.mustChangePassword || row.must_change_password),
    must_change_password: !!(row.must_change_password || row.mustChangePassword)
  };
}
function install(){
  if(typeof window.login==='function'&&!window.login.__autoFixed){
    const oldLogin=window.login;
    window.login=async function(){
      const checked=!!document.getElementById('autoLogin')?.checked;
      const out=await oldLogin.apply(this,arguments);
      if(checked&&window.currentUser)localStorage.setItem(KEY,'1');
      else if(!checked)localStorage.removeItem(KEY);
      return out;
    };
    window.login.__autoFixed=true;
  }
  if(typeof window.logout==='function'&&!window.logout.__autoFixed){
    const oldLogout=window.logout;
    window.logout=async function(){localStorage.removeItem(KEY);return oldLogout.apply(this,arguments)};
    window.logout.__autoFixed=true;
  }
  const box=document.getElementById('autoLogin');
  if(box&&localStorage.getItem(KEY)==='1')box.checked=true;
}
async function restore(){
  if(localStorage.getItem(KEY)!=='1'||!window.hfSupabase?.auth)return;
  try{
    if(typeof window.setLoginLoading==='function')window.setLoginLoading(true,'자동 로그인 중입니다.');
    const result=await window.hfSupabase.auth.getSession();
    const user=result?.data?.session?.user;
    if(!user){localStorage.removeItem(KEY);return}
    let member=null;
    try{
      if(typeof members!=='undefined'&&Array.isArray(members)){
        member=members.find(m=>String(m.authUserId||m.auth_user_id||'')===String(user.id))||null;
      }
    }catch(e){}
    if(!member){
      const q=await window.hfSupabase.from('club_members').select('*').eq('auth_user_id',user.id).maybeSingle();
      if(q.error)throw q.error;
      const row=q.data;
      if(row){
        try{
          if(typeof members!=='undefined'&&Array.isArray(members)){
            member=members.find(m=>String(m.id)===String(row.id))||null;
          }
        }catch(e){}
        member=member||row;
      }
    }
    if(!member)return;
    member=normalizeMember(member);
    try{currentUser=member}catch(e){}
    window.currentUser=member;
    if(typeof window.hfRefreshSharedData==='function')try{await window.hfRefreshSharedData()}catch(e){}
    if(typeof window.enterApp==='function')await window.enterApp();
    if(member.mustChangePassword||member.must_change_password){
      if(typeof window.showForcedPasswordChange==='function')window.showForcedPasswordChange();
      else if(typeof window.showRequiredPasswordChange==='function')window.showRequiredPasswordChange();
    }
  }catch(e){
    console.error('[auto-login]',e);
  }finally{
    if(typeof window.setLoginLoading==='function')window.setLoginLoading(false);
  }
}
async function boot(){install();await restore()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
