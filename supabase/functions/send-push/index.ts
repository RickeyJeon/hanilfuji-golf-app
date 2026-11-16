import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...cors,"Content-Type":"application/json"}
});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"POST required"},405);

  const service=createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {auth:{autoRefreshToken:false,persistSession:false}}
  );

  try{
    const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
    if(!token)return json({error:"Unauthorized"},401);
    const {data:userData,error:userError}=await service.auth.getUser(token);
    if(userError||!userData.user)return json({error:"Unauthorized"},401);

    const {data:actor,error:actorError}=await service
      .from("club_members")
      .select("id,role,status")
      .eq("auth_user_id",userData.user.id)
      .maybeSingle();
    if(actorError||!actor||actor.status!=="active"||!["primary_admin","assistant_admin"].includes(actor.role)){
      return json({error:"관리자 권한이 없습니다."},403);
    }

    const input=await req.json().catch(()=>({}));
    const notificationType=String(input.notification_type||"").trim();
    if(!["notice","event"].includes(notificationType)){
      return json({error:"notification_type은 notice 또는 event만 허용됩니다."},400);
    }
    const testOnly=input.test_only===true;
    const sourceId=input.source_id?String(input.source_id):"";
    const title=String(input.title||"").trim();
    const body=String(input.body||"").trim();
    if(!title)return json({error:"title이 필요합니다."},400);

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!
    );

    const [{data:subscriptions,error:subscriptionError},{data:settings,error:settingsError}]=await Promise.all([
      service.from("push_subscriptions").select("id,member_id,endpoint,p256dh,auth"),
      service.from("member_settings").select("member_id,notify_event_updates")
    ]);
    if(subscriptionError)throw subscriptionError;
    if(settingsError)throw settingsError;

    const settingByMember=new Map((settings||[]).map(row=>[String(row.member_id),row.notify_event_updates!==false]));
    const targets=(subscriptions||[]).filter(row=>String(row.member_id)===(testOnly?String(actor.id):String(row.member_id)) && (testOnly || settingByMember.get(String(row.member_id))!==false));
    let sent=0,removed=0,failed=0;
    const failureStatuses:Record<string,number>={};

    const results=await Promise.allSettled(targets.map(async row=>{
      try{
        await webpush.sendNotification(
          {endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},
          JSON.stringify({
            title,
            body:body||"새로운 소식이 있습니다.",
            tag:"hf-"+notificationType+"-"+(sourceId||Date.now()),
            url:"./",
            page:"event",
            icon:"./icon.svg",
            badge:"./icon.svg"
          })
        );
        sent++;
      }catch(error){
        const statusCode=Number((error as {statusCode?:number})?.statusCode||0);
        const key=String(statusCode||"unknown");
        failureStatuses[key]=(failureStatuses[key]||0)+1;
        if(statusCode===404||statusCode===410){
          await service.from("push_subscriptions").delete().eq("id",row.id);
          removed++;
        }else{
          failed++;
        }
      }
    }));
    results.forEach(result=>{
      if(result.status==="rejected"){
        failed++;
        failureStatuses.rejected=(failureStatuses.rejected||0)+1;
      }
    });

    const result={ok:true,test_only:testOnly,target_count:targets.length,sent,removed,failed,failure_statuses:failureStatuses,actor_member_id:actor.id};
    console.log("[send-push] result",JSON.stringify(result));
    return json(result);
  }catch(error){
    console.error("[send-push] error",error);
    return json({error:error instanceof Error?error.message:String(error)},500);
  }
});