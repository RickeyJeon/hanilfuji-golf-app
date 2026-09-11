(function(){
'use strict';

function isAdmin(){
  return !!window.currentUser && ['PRIMARY_ADMIN','ASSISTANT_ADMIN','primary_admin','assistant_admin'].includes(window.currentUser.role);
}
function readJson(key,fallback){
  try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch(e){return fallback}
}
function latestConfirmedScoreEvent(){
  const all=readJson('hf_score_events',{});
  return Object.entries(all)
    .filter(([,e])=>e&&e.status==='CONFIRMED'&&Array.isArray(e.results)&&e.results.length)
    .sort((a,b)=>String(b[1].confirmedAt||'').localeCompare(String(a[1].confirmedAt||'')))[0]||null;
}
function validUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
async function persistLatestScoreEvent(pair){
  if(!pair||!isAdmin()||!window.hfSupabase||!window.currentUser?.dbId)return;
  const [,event]=pair;
  if(!validUuid(event.eventId))throw new Error('연결된 대회 정보를 찾지 못했습니다. EVENT 일정에서 해당 대회를 확인해 주세요.');

  const localMembers=readJson('hf_members',[]);
  const {data:directory,error:dirError}=await window.hfSupabase.from('member_score_directory').select('id,phone_e164');
  if(dirError)throw dirError;
  const dbIdByPhone=new Map((directory||[]).map(x=>[String(x.phone_e164||''),x.id]));

  const cards=(event.results||[]).map(row=>{
    const member=localMembers.find(m=>String(m.id)===String(row.memberId));
    const dbMemberId=member&&dbIdByPhone.get(String(member.phone||''));
    if(!dbMemberId)return null;
    return {
      event_id:event.eventId,
      member_id:dbMemberId,
      gross_score:Number(row.grossScore??row.score),
      handicap_adjustment:Number(row.handicap||0),
      rank_position:Number(row.rank||0)||null,
      points_awarded:Number(row.total||0),
      created_by_member_id:window.currentUser.dbId
    };
  }).filter(Boolean);

  if(cards.length!==(event.results||[]).length)throw new Error('일부 회원의 DB 연결 정보를 찾지 못했습니다.');
  if(!cards.length)throw new Error('저장할 스코어가 없습니다.');

  const {error:upsertError}=await window.hfSupabase.from('event_scorecards').upsert(cards,{onConflict:'event_id,member_id'});
  if(upsertError)throw upsertError;

  const keep=new Set(cards.map(x=>String(x.member_id)));
  const {data:existing,error:existingError}=await window.hfSupabase.from('event_scorecards').select('member_id').eq('event_id',event.eventId);
  if(existingError)throw existingError;
  const stale=(existing||[]).map(x=>x.member_id).filter(id=>!keep.has(String(id)));
  if(stale.length){
    const {error:deleteError}=await window.hfSupabase.from('event_scorecards').delete().eq('event_id',event.eventId).in('member_id',stale);
    if(deleteError)throw deleteError;
  }

  const {error:eventError}=await window.hfSupabase.from('club_events').update({event_status:'completed'}).eq('id',event.eventId);
  if(eventError)throw eventError;

  window.dispatchEvent(new CustomEvent('hf:scores-saved',{detail:{eventId:event.eventId,count:cards.length}}));
}

function install(){
  const original=window.confirmScoreEvent;
  if(typeof original!=='function'||original.__hfSupabaseWrapped)return false;
  async function wrappedConfirmScoreEvent(){
    if(!isAdmin())return original.apply(this,arguments);
    const before=latestConfirmedScoreEvent();
    const beforeStamp=before?.[1]?.confirmedAt||'';
    original.apply(this,arguments);
    const after=latestConfirmedScoreEvent();
    const afterStamp=after?.[1]?.confirmedAt||'';
    if(!after||afterStamp===beforeStamp)return;
    try{
      await persistLatestScoreEvent(after);
    }catch(error){
      console.error('[HF] score Supabase save failed',error);
      alert('스코어는 기기에 임시 저장됐지만 서버 저장에 실패했습니다.\n\n'+(error?.message||error)+'\n\n다시 결과 확정을 눌러 주세요.');
    }
  }
  wrappedConfirmScoreEvent.__hfSupabaseWrapped=true;
  window.confirmScoreEvent=wrappedConfirmScoreEvent;
  return true;
}

if(!install()){
  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer)},100);
}
})();
