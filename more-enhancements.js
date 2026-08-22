(function(){
  'use strict';
  let deferredInstallPrompt=null;

  function safe(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
  function isIosSafari(){
    const ua=navigator.userAgent||'';
    const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const safari=/Safari/.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return ios&&safari;
  }
  function isStandalone(){return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;}

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredInstallPrompt=e;
    window.hfPwaInstallAvailable=true;
    if(window.currentPage==='more'&&typeof window.render==='function')window.render('more');
  });
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;window.hfPwaInstallAvailable=false;});

  async function loadMemberDirectory(){
    if(!window.hfSupabase||!window.members)return;
    try{
      const {data,error}=await window.hfSupabase.from('member_directory').select('id,full_name,nickname,company_name,department_name,position_title,role,status');
      if(error||!Array.isArray(data))return;
      const byId=new Map(data.map(x=>[x.id,x]));
      data.forEach(row=>{
        let m=window.members.find(x=>String(x.dbId||'')===String(row.id));
        if(!m&&window.currentUser?.dbId===row.id)m=window.currentUser;
        if(!m)return;
        m.dbId=row.id;
        m.name=row.full_name||m.name;
        m.nick=row.nickname||'';
        m.company=row.company_name||m.company;
        m.dept=row.department_name||m.dept;
        m.position=row.position_title||m.position;
        m.status=row.status==='paused'?'PAUSED':row.status==='inactive'?'INACTIVE':'ACTIVE';
      });
      if(window.currentUser?.dbId&&byId.has(window.currentUser.dbId)){
        const row=byId.get(window.currentUser.dbId);
        window.currentUser.name=row.full_name||window.currentUser.name;
        window.currentUser.nick=row.nickname||'';
        window.currentUser.company=row.company_name||window.currentUser.company;
        window.currentUser.dept=row.department_name||window.currentUser.dept;
        window.currentUser.position=row.position_title||window.currentUser.position;
      }
    }catch(e){console.warn('[HANIL-FUJI] member directory sync failed',e)}
  }

  async function loadSettings(){
    if(!window.hfSupabase||!window.currentUser?.dbId)return;
    try{
      const {data,error}=await window.hfSupabase.from('member_settings').select('nickname,notify_event_updates').eq('member_id',window.currentUser.dbId).maybeSingle();
      if(error)return;
      window.currentUser.nick=data?.nickname||'';
      window.currentUser.notifyEventUpdates=data?.notify_event_updates!==false;
      const m=window.members?.find(x=>x.id===window.currentUser.id||x.phone===window.currentUser.phone);
      if(m){m.nick=window.currentUser.nick;m.dbId=window.currentUser.dbId;}
    }catch(e){console.warn('[HANIL-FUJI] member settings load failed',e)}
  }

  async function saveNotificationSetting(value){
    if(!window.currentUser?.dbId||!window.hfSupabase)return;
    const {error}=await window.hfSupabase.from('member_settings').upsert({member_id:window.currentUser.dbId,notify_event_updates:!!value},{onConflict:'member_id'});
    if(error){alert('알림 설정 저장에 실패했습니다.\n'+error.message);return;}
    window.currentUser.notifyEventUpdates=!!value;
    closeModal();
    if(typeof window.render==='function')window.render('more');
  }
  window.saveNotificationSetting=saveNotificationSetting;

  window.notificationSettings=function(){
    const on=window.currentUser?.notifyEventUpdates!==false;
    openModal(`<h3>🔔 알림 설정</h3><p class="small" style="line-height:1.55">공지 · 일정 · 조편성 · 경기결과 알림을 한 번에 설정합니다.</p><div class="toggle-row" style="border-bottom:0"><div><strong>알림 받기</strong><div class="small">${on?'현재 ON':'현재 OFF'}</div></div><button class="btn ${on?'primary':'ghost'}" onclick="saveNotificationSetting(${!on})">${on?'ON':'OFF'}</button></div>`);
  };

  function pwaMenu(){
    const ios=isIosSafari();
    const installed=isStandalone();
    const canInstall=!!deferredInstallPrompt;
    let body='';
    if(installed){
      body='<div class="pill">✓ 이미 앱으로 실행 중입니다.</div>';
    }else if(canInstall){
      body='<p class="small" style="line-height:1.55">Android · Chrome에서 브라우저 설치창을 바로 열 수 있습니다.</p><button class="btn primary full" onclick="installPwa()">📲 앱 설치</button>';
    }else if(ios){
      body='<p class="small" style="line-height:1.65"><b>iPhone · Safari</b><br>1. Safari 하단의 <b>공유</b> 버튼을 누릅니다.<br>2. <b>홈 화면에 추가</b>를 선택합니다.<br>3. 오른쪽 위 <b>추가</b>를 누르면 홈 화면에 앱 아이콘이 생성됩니다.</p>';
    }else{
      body='<p class="small" style="line-height:1.65">브라우저가 설치 이벤트를 아직 제공하지 않았습니다. Chrome 메뉴에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택해 주세요.</p>';
    }
    openModal(`<h3>📲 홈 화면에 앱 설치</h3><p class="small" style="line-height:1.55">모바일에서는 브라우저 대신 앱처럼 실행할 수 있습니다.</p>${body}`);
  }
  window.openPwaInstall=pwaMenu;
  window.installPwa=async function(){
    if(!deferredInstallPrompt){pwaMenu();return;}
    const prompt=deferredInstallPrompt;deferredInstallPrompt=null;
    try{await prompt.prompt();await prompt.userChoice;}catch(e){console.warn('[HANIL-FUJI] PWA install prompt failed',e)}
  };

  function enhancedMorePage(){
    const u=window.currentUser;
    if(!u)return '';
    return `<div class="section-title"><h2>MY PAGE</h2><span>${u.role==='PRIMARY_ADMIN'?'최고관리자':'회원'}</span></div>
      <div class="card"><div class="member-row"><div class="avatar">${safe(u.name?.[0]||'회')}</div><div class="who"><strong>${safe(nameOf(u))}${u.role!=='USER'?'<span class="admin-badge">ADMIN</span>':''}</strong><small>${safe(u.company)}<br>${safe(u.dept)} · ${safe(u.position)}</small></div></div></div>
      <div class="card list-menu">
        <div class="item" onclick="profileSettings()"><span>⚙️</span><div><strong>개인설정</strong><div class="small">비밀번호 · 닉네임 변경</div></div><span class="chev">›</span></div>
        <div class="item" onclick="notificationSettings()"><span>🔔</span><div><strong>알림 설정</strong><div class="small">공지 · 일정 · 조편성 · 경기결과 · ${u.notifyEventUpdates===false?'OFF':'ON'}</div></div><span class="chev">›</span></div>
        <div class="item" onclick="openPwaInstall()"><span>📲</span><div><strong>홈 화면에 앱 설치</strong><div class="small">모바일에서 앱처럼 실행</div></div><span class="chev">›</span></div>
        <div class="item" onclick="go('record',document.querySelector('[data-page=record]'))"><span>📈</span><div><strong>개인기록</strong><div class="small">최근 5경기 · 실력비교 · 베스트</div></div><span class="chev">›</span></div>
        <div class="item" onclick="membersView()"><span>👥</span><div><strong>MEMBERS</strong><div class="small">회원 기본정보</div></div><span class="chev">›</span></div>
        <div class="item" onclick="myFeeDetails()"><span>💰</span><div><strong>MEMBERSHIP FEE</strong><div class="small">2026년 ${myFeeLabel()}</div></div><span class="chev">›</span></div>
        ${u.role!=='USER'?`<div class="item" onclick="adminMenu()"><span>🛠️</span><div><strong>ADMIN</strong><div class="small">회원·스코어·권한 관리</div></div><span class="chev">›</span></div>`:''}
        <div class="item" onclick="logout()"><span>↪</span><div><strong>로그아웃</strong></div><span class="chev">›</span></div>
      </div>`;
  }

  async function refreshProfileData(){
    await loadSettings();
    await loadMemberDirectory();
    if(window.currentPage==='more'&&typeof window.render==='function')window.render('more');
  }

  const originalEnterApp=window.enterApp;
  if(typeof originalEnterApp==='function'){
    window.enterApp=async function(){
      await originalEnterApp.apply(this,arguments);
      await refreshProfileData();
    };
  }

  window.addEventListener('load',async()=>{
    if('serviceWorker' in navigator){
      try{await navigator.serviceWorker.register('./sw.js',{scope:'./'});}catch(e){console.warn('[HANIL-FUJI] service worker registration failed',e)}
    }
    if(window.currentUser)await refreshProfileData();
    if(typeof window.morePage==='function')window.morePage=enhancedMorePage;
    if(window.currentPage==='more'&&typeof window.render==='function')window.render('more');
  });
})();
