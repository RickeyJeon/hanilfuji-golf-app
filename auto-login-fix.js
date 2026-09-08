(function(){
const KEY='hf_auto_login_enabled';

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
    window.logout=async function(){
      localStorage.removeItem(KEY);
      return oldLogout.apply(this,arguments);
    };
    window.logout.__autoFixed=true;
  }

  const box=document.getElementById('autoLogin');
  if(box&&localStorage.getItem(KEY)==='1')box.checked=true;
}

async function restore(){
  if(localStorage.getItem(KEY)!=='1'||!window.hfSupabase?.auth)return;

  try{
    if(typeof window.setLoginLoading==='function')window.setLoginLoading(true,'자동 로그인 중입니다.');

    const sessionResult=await window.hfSupabase.auth.getSession();
    const authUser=sessionResult?.data?.session?.user;
    if(!authUser){
      localStorage.removeItem(KEY);
      return;
    }

    const {data:member,error:memberError}=await window.hfSupabase
      .from('club_members')
      .select('id,full_name,email,phone_e164,company_name,department_name,position_title,role,status,must_change_password')
      .eq('auth_user_id',authUser.id)
      .maybeSingle();

    if(memberError)throw memberError;
    if(!member||member.status==='inactive'){
      localStorage.removeItem(KEY);
      await window.hfSupabase.auth.signOut();
      return;
    }

    const {data:memberSettings}=await window.hfSupabase
      .from('member_settings')
      .select('nickname')
      .eq('member_id',member.id)
      .maybeSingle();

    let legacyMember=null;
    try{
      if(typeof members!=='undefined'&&Array.isArray(members)){
        legacyMember=members.find(item=>item.phone===member.phone_e164)||null;
      }
    }catch(e){}

    const mappedUser={
      id:legacyMember?.id||member.id,
      dbId:member.id,
      name:member.full_name,
      nick:memberSettings?.nickname||'',
      phone:member.phone_e164,
      company:member.company_name,
      dept:member.department_name||'',
      position:member.position_title||'',
      role:member.role==='primary_admin'?'PRIMARY_ADMIN':member.role==='assistant_admin'?'ASSISTANT_ADMIN':'USER',
      status:member.status==='paused'?'PAUSED':'ACTIVE',
      email:member.email||'',
      mustChangePassword:!!member.must_change_password
    };

    try{currentUser=mappedUser}catch(e){}
    window.currentUser=mappedUser;

    if(typeof window.loadSupabaseScoreEvents==='function')await window.loadSupabaseScoreEvents();
    if(typeof window.loadSupabaseNotices==='function')await window.loadSupabaseNotices();
    if(typeof window.loadSupabaseClubEvents==='function')await window.loadSupabaseClubEvents();
    if(typeof window.hfRefreshSharedData==='function'){
      try{await window.hfRefreshSharedData()}catch(e){}
    }

    if(typeof window.enterApp==='function')await window.enterApp();

    if(mappedUser.mustChangePassword){
      if(typeof window.showForcedPasswordChange==='function')window.showForcedPasswordChange();
      else if(typeof window.showRequiredPasswordChange==='function')window.showRequiredPasswordChange();
    }
  }catch(e){
    console.error('[auto-login]',e);
  }finally{
    if(typeof window.setLoginLoading==='function')window.setLoginLoading(false);
  }
}

async function boot(){
  install();
  await restore();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
