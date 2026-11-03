/* Admin-only, self-targeted push test; no event/notice created. */
(function(){
  function isAdmin(){return !!window.currentUser && ['PRIMARY_ADMIN','ASSISTANT_ADMIN'].includes(window.currentUser.role)}
  window.hfAdminTestPush=async function(){
    if(!isAdmin()){alert('관리자 전용 기능입니다.');return}
    const button=document.getElementById('hf-admin-push-test');
    if(button){button.disabled=true;button.textContent='테스트 발송 중...'}
    try{
      if(!('Notification' in window)){alert('이 기기는 웹 알림을 지원하지 않습니다.');return}
      if(Notification.permission!=='granted'){alert('알림 권한이 허용되지 않았습니다. 앱 알림 설정을 먼저 확인해 주세요.');return}
      const {data,error}=await hfSupabase.functions.invoke('send-push',{body:{
        notification_type:'event',test_only:true,title:'⛳ HANIL-FUJI 알림 테스트',
        body:'관리자 휴대폰 푸시 수신 확인용 테스트입니다.'
      }});
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.error||'발송 실패');
      alert('테스트 전송 결과: 대상 '+data.target_count+'개 / 푸시 서비스 접수 '+data.sent+'개 / 실패 '+data.failed+'개 / 만료 삭제 '+data.removed+'개\n실제 알림 표시 여부는 휴대폰에서 확인해 주세요.');
    }catch(e){alert('알림 테스트 실패: '+(e?.message||e))}
    finally{if(button){button.disabled=false;button.textContent='🔔 내 휴대폰 알림 테스트'}}
  };
  function inject(){
    if(!isAdmin())return;
    const sheet=document.querySelector('#sheet .list-menu');
    if(!sheet||document.getElementById('hf-admin-push-test'))return;
    const el=document.createElement('div');el.className='item';el.id='hf-admin-push-test';el.setAttribute('role','button');el.tabIndex=0;
    el.innerHTML='<span>🔔</span><div><strong>내 휴대폰 알림 테스트</strong><div class="small">관리자 본인에게만 발송 · 일정 생성 없음</div></div><span class="chev">›</span>';
    el.onclick=window.hfAdminTestPush;
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();window.hfAdminTestPush()}};
    sheet.appendChild(el);
  }
  const watcher=new MutationObserver(()=>{if(document.querySelector('#sheet .list-menu')&&!document.getElementById('hf-admin-push-test'))inject()});
  watcher.observe(document.getElementById('sheet')||document.body,{childList:true,subtree:true});
    const original=window.adminMenu;
  if(typeof original==='function')window.adminMenu=function(){const r=original.apply(this,arguments);setTimeout(inject,50);return r};
})();
