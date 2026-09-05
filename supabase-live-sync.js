(function(){
  'use strict';
  const db=()=>window.hfSupabase;
  const isAdmin=()=>!!window.currentUser&&['PRIMARY_ADMIN','ASSISTANT_ADMIN','primary_admin','assistant_admin'].includes(window.currentUser.role);
  let lastLocal='';
  let syncing=false;
  let sharedChannel=null;
  let sharedSubscribing=false;
  const shownNotificationKeys=new Set();
  const PUSH_PUBLIC_KEY=window.HF_PUSH_PUBLIC_KEY||'BCU4AL489NN-UOVOQofWt4_OHRaDU62h_YsAOtTTq4gnXhHTegDbmTxCc9Apl1gbzkcz6q1B-uYt08lQP7iKot4';

  function pushKeyBytes(value){
    const base64=(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=base64+'='.repeat((4-base64.length%4)%4);
    const raw=atob(padded);
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }

  async function getPushServiceWorker(){
    if(!('serviceWorker' in navigator))throw new Error('이 브라우저는 백그라운드 알림을 지원하지 않습니다.');
    if(window.hfServiceWorkerRegistration)return window.hfServiceWorkerRegistration;
    window.hfServiceWorkerRegistration=await navigator.serviceWorker.register('./sw.js');
    return window.hfServiceWorkerRegistration;
  }

  window.hfRegisterPushSubscription=async function(){
    if(!window.currentUser?.dbId)throw new Error('회원 정보를 확인할 수 없습니다.');
    if(!('PushManager' in window))throw new Error('이 브라우저는 백그라운드 알림을 지원하지 않습니다.');
    if(!('Notification' in window)||Notification.permission!=='granted')throw new Error('먼저 이 사이트의 알림 권한을 허용해 주세요.');
    const registration=await getPushServiceWorker();
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      const options={userVisibleOnly:true};
      if(PUSH_PUBLIC_KEY)options.applicationServerKey=pushKeyBytes(PUSH_PUBLIC_KEY);
      subscription=await registration.pushManager.subscribe(options);
    }
    const json=subscription.toJSON();
    const endpoint=json.endpoint||subscription.endpoint;
    const p256dh=json.keys?.p256dh;
    const auth=json.keys?.auth;
    if(!endpoint||!p256dh||!auth)throw new Error('기기 알림 구독 정보를 읽을 수 없습니다.');
    const {error}=await db().from('push_subscriptions').upsert({
      member_id:window.currentUser.dbId,
      endpoint,
      p256dh,
      auth,
      user_agent:navigator.userAgent
    },{onConflict:'member_id,endpoint'});
    if(error)throw error;
    return subscription;
  };

  window.hfRemovePushSubscription=async function(){
    if(!('serviceWorker' in navigator)||!window.currentUser?.dbId||!db())return;
    const registration=await getPushServiceWorker();
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription)return;
    const endpoint=subscription.endpoint;
    await subscription.unsubscribe();
    const {error}=await db().from('push_subscriptions').delete().eq('member_id',window.currentUser.dbId).eq('endpoint',endpoint);
    if(error)throw error;
  };


  window.hfSendPush=async function({notificationType,sourceId,title,body}={}){
    if(!db()||!window.currentUser?.dbId)return {skipped:true};
    const {data:{session}}=await db().auth.getSession();
    if(!session)return {skipped:true};
    const {data,error}=await db().functions.invoke('send-push',{body:{notification_type:notificationType,source_id:sourceId,title,body}});
    if(error)throw error;
    if(data?.ok===false)throw new Error(data.error||'Push 발송에 실패했습니다.');
    return data||{ok:true};
  };

  let groupReloadTimer=null;
  function scheduleGroupReload(){
    clearTimeout(groupReloadTimer);
    groupReloadTimer=setTimeout(async()=>{
      try{
        if(typeof window.hfLoadSupabaseEventGroups==='function')await window.hfLoadSupabaseEventGroups();
        if(window.currentPage==='event'&&window.eventMode==='GROUP'&&typeof window.render==='function')window.render('event');
      }catch(error){console.warn('[Supabase] group realtime refresh failed',error)}
    },250);
  }

  window.hfLoadSupabaseEventGroups=async function(){
    if(!db()||!window.currentUser)return {};
    const [{data:groups,error:groupError},{data:links,error:linkError}]=await Promise.all([
      db().from('event_groups').select('id,event_id,title,display_order,created_by_member_id,created_at,updated_at').order('display_order',{ascending:true}),
      db().from('event_group_members').select('group_id,member_id')
    ]);
    if(groupError||linkError)throw groupError||linkError;
    const legacyByDbId=new Map((window.members||[]).filter(member=>member.dbId).map(member=>[String(member.dbId),member.id]));
    const roomByGroupId=new Map();
    const byEvent=new Map();
    (groups||[]).forEach(row=>{
      const eventKey=String(row.event_id);
      const data=byEvent.get(eventKey)||{eventId:row.event_id,createdAt:row.created_at,confirmed:true,confirmedAt:row.updated_at,groupSize:0,groupMode:'RANDOM',rooms:[]};
      const room={room:Number(row.display_order||data.rooms.length+1),memberIds:[]};
      data.rooms.push(room);
      data.groupSize=Math.max(data.groupSize,room.room);
      byEvent.set(eventKey,data);
      roomByGroupId.set(String(row.id),room);
    });
    (links||[]).forEach(link=>{
      const room=roomByGroupId.get(String(link.group_id));
      const legacyId=legacyByDbId.get(String(link.member_id));
      if(room&&legacyId!==undefined)room.memberIds.push(legacyId);
    });
    const cache=Object.fromEntries(byEvent.entries());
    localStorage.setItem('hf_event_groups',JSON.stringify(cache));
    window.hfSupabaseEventGroups=cache;
    return cache;
  };

  window.hfSaveConfirmedEventGroups=async function(eventId,groupData){
    if(!db()||!window.currentUser?.dbId)throw new Error('회원 인증 정보를 확인할 수 없습니다.');
    const rooms=(groupData?.rooms||[]).filter(room=>Array.isArray(room.memberIds)&&room.memberIds.length);
    if(!rooms.length)throw new Error('저장할 조편성이 없습니다.');
    const legacyMembers=window.members||[];
    const dbMemberIds=[];
    for(const room of rooms){
      for(const legacyId of room.memberIds){
        const member=legacyMembers.find(candidate=>String(candidate.id)===String(legacyId));
        if(!member?.dbId)throw new Error('조편성 회원의 Supabase 연결 정보를 확인할 수 없습니다.');
        dbMemberIds.push(String(member.dbId));
      }
    }
    const {data:oldGroups,error:oldError}=await db().from('event_groups').select('id,display_order').eq('event_id',eventId).order('display_order',{ascending:true});
    if(oldError)throw oldError;
    const oldByOrder=new Map((oldGroups||[]).map(row=>[Number(row.display_order),row.id]));
    const oldIds=(oldGroups||[]).map(row=>row.id);
    if(oldIds.length){
      const {error:memberDeleteError}=await db().from('event_group_members').delete().in('group_id',oldIds);
      if(memberDeleteError)throw memberDeleteError;
    }
    const rows=rooms.map((room,index)=>({
      id:oldByOrder.get(Number(room.room))||crypto.randomUUID(),
      event_id:eventId,
      title:'ROOM '+String(room.room),
      display_order:Number(room.room)||index+1,
      created_by_member_id:window.currentUser.dbId
    }));
    const keepIds=new Set(rows.map(row=>row.id));
    const removeIds=oldIds.filter(id=>!keepIds.has(id));
    if(removeIds.length){
      const {error:groupDeleteError}=await db().from('event_groups').delete().in('id',removeIds);
      if(groupDeleteError)throw groupDeleteError;
    }
    const {error:groupUpsertError}=await db().from('event_groups').upsert(rows,{onConflict:'id'});
    if(groupUpsertError)throw groupUpsertError;
    const links=rooms.flatMap((room,index)=>room.memberIds.map(legacyId=>{
      const member=legacyMembers.find(candidate=>String(candidate.id)===String(legacyId));
      return {group_id:rows[index].id,member_id:member.dbId};
    }));
    if(links.length){
      const {error:linkInsertError}=await db().from('event_group_members').insert(links);
      if(linkInsertError)throw linkInsertError;
    }
    return window.hfLoadSupabaseEventGroups();
  };

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
        .on('postgres_changes',{event:'*',schema:'public',table:'event_groups'},scheduleGroupReload)
        .on('postgres_changes',{event:'*',schema:'public',table:'event_group_members'},scheduleGroupReload)
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
