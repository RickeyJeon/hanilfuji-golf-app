(function(){
  'use strict';
  const db=()=>window.hfSupabase;
  const isAdmin=()=>!!window.currentUser&&['PRIMARY_ADMIN','ASSISTANT_ADMIN','primary_admin','assistant_admin'].includes(window.currentUser.role);
  let lastLocal='';
  let syncing=false;

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

  async function pushScoresToSupabase(){
    if(!isAdmin()||typeof window.syncLegacyDataToSupabase!=='function'||syncing)return;
    const current=readLocal();
    if(!current||current===lastLocal)return;
    syncing=true;
    try{
      await window.syncLegacyDataToSupabase();
      lastLocal=current;
    }catch(e){console.warn('[Supabase] score push failed',e)}
    finally{syncing=false}
  }

  async function tick(){
    if(!window.currentUser||!db())return;
    if(isAdmin())await pushScoresToSupabase();
    else await pullScoresToLocal();
  }

  window.addEventListener('load',()=>{
    setTimeout(()=>{lastLocal=readLocal();tick();setInterval(tick,1500)},500);
  });
})();
