(function(){
  'use strict';
  const db=()=>window.hfSupabase;
  const isAdmin=()=>!!window.currentUser&&['PRIMARY_ADMIN','ASSISTANT_ADMIN','primary_admin','assistant_admin'].includes(window.currentUser.role);
  let lastLocal='';
  let syncing=false;
  let sharedChannel=null;
  let sharedSubscribing=false;
  const shownNotificationKeys=new Set();

  window.hfRequestNotificationPermission=async function(){
    if(!('Notification' in window))throw new Error('이 브라우저는 시스템 알림을 지원하지 않습니다.');
    if(Notification.permission==='granted')return 'granted';
    if(Notification.permission==='denied')throw new Error('브라우저 설정에서 이 사이트의 알림 권한을 허용해 주세요.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('알림 권한이 허용되지 않았습니다.');
    return permission;
  };

  function notificationAllowed(){return !!window.currentUser&&window.currentUser.notifyEventUpdates!==false&&'Notification' in window&&Notification.permission==='granted'}
  function showForegroundNotification(kind,row){
    if(!notificationAllowed()||!row||row.eventType==='DELETE')return;
    const actorId=kind==='notice'?row.author_member_id:row.created_by_member_id;
    if(actorId&&window.currentUser?.dbId&&String(actorId)===String(window.currentUser.dbId))return;
    const key=kind+':'+String(row.id)+':'+String(row.updated_at||row.created_at||'');
    if(shownNotificationKeys.has(key))return;
    shownNotificationKeys.add(key);
    const title=kind==='notice'?'새 공지: '+(row.title||'새 공지'):'새 일정: '+(row.title||'새 일정');
    const body=kind==='notice'?(String(row.content||'새 공지가 등록되었습니다.').slice(0,100)):(row.starts_at?'일정이 등록되었습니다.':'새 일정이 등록되었습니다.');
    const notification=new Notification(title,{body,tag:'hf-'+kind+'-'+String(row.id)});
    notification.onclick=()=>{window.focus();window.eventMode=kind==='notice'?'NOTICE':'SCHEDULE';if(typeof window.go==='function')window.go('event',document.querySelector('[data-page="event"]'))};
  }

  async function subscribeSharedChanges(){
    if(!db()||!window.currentUser||sharedChannel||sharedSubscribing)return;
    sharedSubscribing=true;
    try{
      sharedChannel=db().channel('hf-shared-data')
        .on('postgres_changes',{event:'*',schema:'public',table:'club_notices'},async(payload)=>{if(payload?.eventType==='INSERT'&&payload?.new?.published!==false)showForegroundNotification('notice',payload.new);if(typeof window.loadSupabaseNotices==='function')await window.loadSupabaseNotices();if(typeof window.render==='function')window.render(window.currentPage||'home')})
        .on('postgres_changes',{event:'*',schema:'public',table:'club_events'},async(payload)=>{if(payload?.eventType==='INSERT'&&payload?.new?.published!==false)showForegroundNotification('event',payload.new);if(typeof window.loadSupabaseClubEvents==='function')await window.loadSupabaseClubEvents();if(typeof window.render==='function')window.render(window.currentPage||'home')})
        .on('postgres_changes',{event:'*',schema:'public',table:'event_attendance_responses'},async()=>{if(typeof window.loadSupabaseClubEvents==='function')await window.loadSupabaseClubEvents();if(typeof window.render==='function')window.render(window.currentPage||'home')})
        .subscribe();
    }catch(e){console.warn('[Supabase] realtime subscribe failed',e);sharedChannel=null}
    finally{sharedSubscribing=false}
  }

  function readLocal(){try{return localStorage.getItem('hf_score_events')||'{}'}catch(e){return '{}'}}

  async function pullScoresToLocal(){
    if(!db()||!window.currentUser||syncing)return;
    syncing=true;
    try{
      const [{data:events,error:e1},{data:scores,error:e2},{data:directory,error:e3}]=await Promise.all([
        db().from('club_events').select('id,legacy_key,title,event_type,starts_at,venue_name,course_name,event_status').order('starts_at',{ascending:true}),
        db().from('event_scorecards').select('event_id,member_id,gross_score,handicap_adjustment,rank_position,points_awarded'),
        db().from('member_score_directory').select('id,phone_e164')
      ]);
      if(e1||e2||e3||!events||!directory)return;
      const phoneByDbId=new Map(directory.map(x=>[x.id,x.phone_e164]));
      const next={};
      for(const event of events){
        const rows=(scores||[]).filter(s=>s.event_id===event.id).map(s=>{
          const phone=phoneByDbId.get(s.member_id);
          const member=(window.members||[]).find(m=>m.phone===phone);
          if(!member)return null;
          const gross=Number(s.gross_score||0), handicap=Number(s.handicap_adjustment||0);
          return {memberId:member.id,grossScore:gross,score:gross,handicap,adjusted:gross+handicap,rank:Number(s.rank_position||0),total:Number(s.points_awarded||0)};
        }).filter(Boolean);
        if(!rows.length)continue;
        const date=event.starts_at?String(event.starts_at).slice(0,10):new Date().toISOString().slice(0,10);
        const key=event.legacy_key||event.id;
        next[key]={year:Number(date.slice(0,4)),month:Number(date.slice(5,7)),type:event.event_type==='field'?'FIELD':'SCREEN',status:event.event_status==='completed'?'CONFIRMED':'DRAFT',eventDate:date,location:event.venue_name||'',courseName:event.course_name||'',title:event.title||'',results:rows};
      }
      if(Object.keys(next).length){
        const serialized=JSON.stringify(next);
        localStorage.setItem('hf_score_events',serialized);
        lastLocal=serialized;
        if(typeof window.render==='function')window.render(window.currentPage||'home');
      }
    }catch(e){console.warn('[Supabase] score pull failed',e)}
    finally{syncing=false}
  }

  // Legacy localStorage is a cache only; never push it back to Production automatically.
  async function pushScoresToSupabase(){return;}

  async function tick(){
    if(!window.currentUser||!db())return;
    await subscribeSharedChanges();
    await pullScoresToLocal();
  }

  window.addEventListener('load',()=>{
    setTimeout(()=>{lastLocal=readLocal();tick();setInterval(tick,1500)},500);
  });
})();
