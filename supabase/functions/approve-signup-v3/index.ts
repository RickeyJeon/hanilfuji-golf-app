import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const digits=(v:string|null|undefined)=>(v??"").replace(/\D/g,"");
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors}); if(req.method!=='POST')return json({error:'POST required'},405);
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}});
 const token=(req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,''); if(!token)return json({error:'Unauthorized'},401);
 const{data:au,error:ae}=await service.auth.getUser(token); if(ae||!au.user)return json({error:'Unauthorized'},401);
 const body=await req.json().catch(()=>({})); const requestId=body?.request_id as string; if(!requestId)return json({error:'request_id is required'},400);
 const{data:admin,error:adminError}=await service.from('club_members').select('id,role,status,auth_user_id').eq('auth_user_id',au.user.id).maybeSingle();
 if(adminError||!admin||admin.status!=='active'||!['primary_admin','assistant_admin'].includes(admin.role))return json({error:'관리자 권한이 없습니다.'},403);
 const{data:r,error:rError}=await service.from('signup_requests').select('*').eq('id',requestId).maybeSingle(); if(rError||!r)return json({error:rError?.message??'가입 신청을 찾을 수 없습니다.'},400); if(r.status!=='pending')return json({error:'이미 처리된 가입 신청입니다.'},409);
 const phone=digits(r.phone_e164); if(phone.length<10)return json({error:'휴대폰 번호가 올바르지 않습니다.'},400);
 const requestedEmail=r.email?.trim().toLowerCase()||null; const authEmail=requestedEmail||`${phone}@hanilfuji.local`;
 const{data:list,error:listError}=await service.auth.admin.listUsers({page:1,perPage:1000}); if(listError)return json({error:listError.message},500);
 const existingAuth=list.users.find(u=>(requestedEmail&&u.email?.toLowerCase()===requestedEmail)||u.phone===phone||u.user_metadata?.phone===phone);
 let authUserId:string; let createdAuth=false;
 if(existingAuth){
   authUserId=existingAuth.id;
   const{data:linked}=await service.from('club_members').select('id,full_name,auth_user_id').eq('auth_user_id',authUserId).maybeSingle();
   if(linked)return json({error:'기존 Auth 계정이 이미 다른 회원정보에 연결되어 있습니다. 기존 계정은 변경하지 않습니다.'},409);
 } else {
   const{data:created,error:createError}=await service.auth.admin.createUser({email:authEmail,password:phone.slice(-8),email_confirm:true,user_metadata:{full_name:r.full_name,phone,signup_request_id:r.id}});
   if(createError||!created.user)return json({error:`Auth 사용자 생성 실패: ${createError?.message??'unknown error'}`},500); authUserId=created.user.id; createdAuth=true;
 }
 try{
   const{error:requestEmailError}=await service.from('signup_requests').update({email:authEmail}).eq('id',r.id).eq('status','pending'); if(requestEmailError)throw new Error(`가입 신청 계정정보 저장 실패: ${requestEmailError.message}`);
   const{data:existingMember}=await service.from('club_members').select('id,full_name,auth_user_id,status').eq('phone_e164',r.phone_e164).maybeSingle();
   if(existingMember?.auth_user_id && existingMember.auth_user_id!==authUserId)throw new Error('동일 휴대폰 번호의 회원에게 다른 Auth 계정이 연결되어 있습니다. 기존 계정은 변경하지 않습니다.');
   const{data:result,error:dbError}=await service.rpc('approve_signup_request_db',{p_request_id:r.id,p_admin_member_id:admin.id,p_auth_user_id:authUserId});
   if(dbError||!result?.ok)throw new Error(dbError?.message??'회원 승인 DB 처리에 실패했습니다.');
   return json({ok:true,message:`승인이 완료되었습니다. ${result.full_name||'회원'}님의 회원정보가 등록되었습니다.`,result});
 }catch(e){if(createdAuth){try{await service.auth.admin.deleteUser(authUserId)}catch(_e){}} return json({error:e instanceof Error?e.message:String(e)},500)}
});
