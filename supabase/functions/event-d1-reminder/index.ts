import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const kstDate=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const kstHour=(d:Date)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(d).replace(/[^0-9]/g,'').padStart(2,'0');

async function send(service:any, targets:any[], title:string, body:string, tag:string){
  let sent=0,failed=0,removed=0;
  await Promise.all(targets.map(async row=>{try{await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify({title,body,tag,url:'./',page:'event',icon:'./icon.svg',badge:'./icon.svg'}));sent++;}catch(error){const code=Number((error as {statusCode?:number})?.statusCode||0);if(code===404||code===410){await service.from('push_subscriptions').delete().eq('id',row.id);removed++;}else failed++;}}));
  return {sent,failed,removed};
}

Deno.serve(async(req)=>{
  if(req.method!=="POST"&&req.method!=="GET") return json({error:"GET or POST required"},405);
  const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
  try{
    const now=new Date(), todayKst=kstDate(now), tomorrow=new Date(now.getTime()+86400000), tomorrowKst=kstDate(tomorrow);
    const tomorrowStart=new Date(`${tomorrowKst}T00:00:00+09:00`).toISOString(), tomorrowEnd=new Date(`${tomorrowKst}T23:59:59.999+09:00`).toISOString();
    const todayStart=new Date(`${todayKst}T00:00:00+09:00`).toISOString(), todayEnd=new Date(`${todayKst}T23:59:59.999+09:00`).toISOString();
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!,Deno.env.get("VAPID_PUBLIC_KEY")!,Deno.env.get("VAPID_PRIVATE_KEY")!);
    const [{data:subs,error:se},{data:settings,error:ste},{data:members,error:me}]=await Promise.all([service.from('push_subscriptions').select('id,member_id,endpoint,p256dh,auth'),service.from('member_settings').select('member_id,notify_event_updates,notify_attendance_deadline'),service.from('club_members').select('id').eq('status','active')]);
    if(se)throw se;if(ste)throw ste;if(me)throw me;
    const active=new Set((members||[]).map((r:any)=>String(r.id))), setting=new Map((settings||[]).map((r:any)=>[String(r.member_id),r]));
    const eventTargets=(subs||[]).filter((r:any)=>active.has(String(r.member_id))&&setting.get(String(r.member_id))?.notify_event_updates!==false);
    const voteTargets=(subs||[]).filter((r:any)=>active.has(String(r.member_id))&&setting.get(String(r.member_id))?.notify_attendance_deadline!==false);
    const details:any[]=[];

    const {data:events,error:ee}=await service.from('club_events').select('id,title,starts_at,attendance_deadline,published').eq('published',true).gte('starts_at',tomorrowStart).lte('starts_at',tomorrowEnd).order('starts_at');if(ee)throw ee;
    for(const e of events||[]){
      const title=`[D-1] ${e.title}`, hour=kstHour(new Date(e.starts_at)), body=`내일 ${Number(hour)}시 대회 일정이 있습니다.`;
      const {data:claim,error:ce}=await service.from('event_reminder_log').insert({event_id:e.id,reminder_type:'D-1',reminder_date:tomorrowKst,title,target_count:eventTargets.length,sent_count:0,failed_count:0}).select('id').maybeSingle();
      if(ce&&String(ce.code)==='23505'){details.push({type:'event',title,skipped:'already sent'});continue;} if(ce)throw ce;
      const r=await send(service,eventTargets,title,body,`hf-event-d1-${e.id}`);await service.from('event_reminder_log').update({sent_count:r.sent,failed_count:r.failed,target_count:eventTargets.length,sent_at:new Date().toISOString()}).eq('id',claim!.id);details.push({type:'event',title,body,...r});
    }

    const {data:todayEvents,error:te}=await service.from('club_events').select('id,title,starts_at,published').eq('published',true).gte('starts_at',todayStart).lte('starts_at',todayEnd).order('starts_at');if(te)throw te;
    for(const e of todayEvents||[]){
      const title=`[D-Day] ${e.title}`, hour=kstHour(new Date(e.starts_at)), body=`오늘 ${Number(hour)}시 대회 일정이 있습니다.`;
      const {data:claim,error:ce}=await service.from('event_reminder_log').insert({event_id:e.id,reminder_type:'D-DAY',reminder_date:todayKst,title,target_count:eventTargets.length,sent_count:0,failed_count:0}).select('id').maybeSingle();
      if(ce&&String(ce.code)==='23505'){details.push({type:'event-day',title,skipped:'already sent'});continue;} if(ce)throw ce;
      const r=await send(service,eventTargets,title,body,`hf-event-dday-${e.id}`);await service.from('event_reminder_log').update({sent_count:r.sent,failed_count:r.failed,target_count:eventTargets.length,sent_at:new Date().toISOString()}).eq('id',claim!.id);details.push({type:'event-day',title,body,...r});
    }

    const deadlineStart=new Date(now.getTime()+86400000-5*60000).toISOString(), deadlineEnd=new Date(now.getTime()+86400000+5*60000).toISOString();
    const {data:deadlines,error:de}=await service.from('club_events').select('id,title,attendance_deadline,published').eq('published',true).not('attendance_deadline','is',null).gte('attendance_deadline',deadlineStart).lte('attendance_deadline',deadlineEnd);if(de)throw de;
    for(const e of deadlines||[]){
      const title='[D-1] 참석투표 마감 안내', body=`${e.title} 참석투표 마감이 하루 남았습니다.`, reminderDate=kstDate(new Date(e.attendance_deadline));
      const {data:claim,error:ce}=await service.from('event_reminder_log').insert({event_id:e.id,reminder_type:'VOTE-D-1',reminder_date:reminderDate,title,target_count:voteTargets.length,sent_count:0,failed_count:0}).select('id').maybeSingle();
      if(ce&&String(ce.code)==='23505'){details.push({type:'vote',title,skipped:'already sent'});continue;} if(ce)throw ce;
      const r=await send(service,voteTargets,title,body,`hf-vote-d1-${e.id}`);await service.from('event_reminder_log').update({sent_count:r.sent,failed_count:r.failed,target_count:voteTargets.length,sent_at:new Date().toISOString()}).eq('id',claim!.id);details.push({type:'vote',title,body,...r});
    }
    return json({ok:true,checked_at:now.toISOString(),details});
  }catch(error){console.error('[event-d1-reminder]',error);return json({error:error instanceof Error?error.message:String(error)},500);}
});