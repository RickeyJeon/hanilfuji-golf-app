/* Manual group assignment. Draft is local; existing confirmation persists to Supabase. */
(function(){
'use strict';
let editing=null;
const admin=()=>!!window.currentUser&&['PRIMARY_ADMIN','ASSISTANT_ADMIN'].includes(window.currentUser.role);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attendeeIds=e=>attendingMembers(e).map(m=>m.id);
function draw(){
 if(!editing)return;
 const el=document.getElementById('hf-manual-editor');if(!el)return;
 const used=new Set(editing.rooms.flatMap(r=>r.memberIds.map(String)));
 const all=editing.attendees;
 el.innerHTML='<p class="small">이름을 선택하고 이동할 ROOM을 누르세요. 조당 1~4명까지 배치할 수 있습니다.</p>'+
 '<div class="group-summary"><div><b>'+all.length+'</b><span>참석 인원</span></div><div><b>'+editing.rooms.length+'</b><span>조 / 방</span></div><div><b>'+used.size+'/'+all.length+'</b><span>배치 완료</span></div></div>'+
 '<div class="card"><strong>회원 선택</strong><div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">'+all.map(id=>{const m=members.find(x=>String(x.id)===String(id));return '<button type="button" class="btn '+(String(editing.selected)===String(id)?'primary':'secondary')+'" style="padding:8px" data-person="'+safe(id)+'">'+safe(m?.name||id)+'</button>'}).join('')+'</div></div>'+
 editing.rooms.map((room,i)=>'<div class="card" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><strong>ROOM '+(i+1)+' · '+room.memberIds.length+'명</strong><button type="button" class="btn secondary" data-target="'+i+'" '+(editing.selected==null?'disabled':'')+'>이 조로 이동</button></div><div class="small" style="margin-top:8px">'+(room.memberIds.map(id=>safe(members.find(m=>String(m.id)===String(id))?.name||id)).join(' · ')||'빈 조')+'</div></div>').join('')+
 '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn secondary" id="hf-add-room">+ 조 추가</button><button type="button" class="btn secondary" id="hf-remove-room">마지막 조 삭제</button></div>'+
 '<button type="button" class="btn primary full" style="margin-top:14px" id="hf-save-manual">미리보기 저장</button>'+
 '<p class="small" style="margin-top:8px">저장 후 EVENT → 조편성에서 ‘조편성 확정’을 눌러야 회원에게 공개되고 알림 발송이 시도됩니다.</p>';
 el.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{editing.selected=b.dataset.person;draw()});
 el.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.target),id=editing.selected;if(id==null)return;if(!editing.rooms[i].memberIds.some(x=>String(x)===String(id))&&editing.rooms[i].memberIds.length>=4){alert('한 조에는 최대 4명까지 배치할 수 있습니다.');return}editing.rooms.forEach(r=>r.memberIds=r.memberIds.filter(x=>String(x)!==String(id)));editing.rooms[i].memberIds.push(editing.attendees.find(x=>String(x)===String(id)));editing.selected=null;draw()});
 el.querySelector('#hf-add-room').onclick=()=>{if(editing.rooms.length>=20){alert('최대 20개 조까지 만들 수 있습니다.');return}editing.rooms.push({room:editing.rooms.length+1,memberIds:[]});draw()};
 el.querySelector('#hf-remove-room').onclick=()=>{if(editing.rooms.length<=1)return;if(editing.rooms.at(-1).memberIds.length){alert('마지막 조의 회원을 먼저 다른 조로 이동해 주세요.');return}editing.rooms.pop();draw()};
 el.querySelector('#hf-save-manual').onclick=save;
}
window.hfOpenManualGroups=function(id){
 if(!admin()){alert('관리자만 직접 편성할 수 있습니다.');return}
 const e=getClubEvents().find(x=>String(x.id)===String(id));if(!e)return;
 const attendees=attendeeIds(e);if(!attendees.length){alert('참석 회원이 없습니다.');return}
 const existing=getEventGroups()[id];
 const valid=new Set(attendees.map(String));
 let rooms=existing?.rooms?.length?existing.rooms.map(r=>({memberIds:r.memberIds.filter(x=>valid.has(String(x)))})):[];
 if(!rooms.length){const count=Math.max(1,Math.ceil(attendees.length/3));rooms=Array.from({length:count},()=>({memberIds:[]}));}
 const used=new Set(rooms.flatMap(r=>r.memberIds.map(String)));
 attendees.filter(x=>!used.has(String(x))).forEach(id=>{let room=rooms.find(r=>r.memberIds.length<3)||rooms.find(r=>r.memberIds.length<4);if(!room){room={memberIds:[]};rooms.push(room)}room.memberIds.push(id)});
 editing={id,attendees,selected:null,rooms};
 openModal('<h3>직접 조편성</h3><div id="hf-manual-editor"></div>');draw();
};
function save(){
 const rooms=editing.rooms.filter(r=>r.memberIds.length);
 const assigned=rooms.flatMap(r=>r.memberIds.map(String));
 if(assigned.length!==editing.attendees.length||new Set(assigned).size!==editing.attendees.length){alert('참석 회원 전원을 중복 없이 배치해야 합니다.');return}
 if(rooms.some(r=>r.memberIds.length>4)){alert('조당 최대 4명까지 가능합니다.');return}
 const all=getEventGroups();const old=all[editing.id]||{};
 all[editing.id]={...old,eventId:editing.id,createdAt:new Date().toISOString(),confirmed:false,groupMode:'MANUAL',groupSize:Math.max(...rooms.map(r=>r.memberIds.length)),rooms:rooms.map((r,i)=>({room:i+1,memberIds:r.memberIds.slice()}))};
 saveEventGroups(all);editing=null;closeModal();render('event');alert('직접 편성 미리보기를 저장했습니다. 회원에게 공개하려면 조편성 확정을 눌러 주세요.');
}
const original=window.renderEventGroups;
if(typeof original==='function')window.renderEventGroups=function(){
 let html=original.apply(this,arguments);
 if(!admin())return html;
 const id=typeof groupEventId!=='undefined'?groupEventId:null;
 html=html.replace('<button disabled title="추후 추가">직접 편성</button>','<button class="active" onclick="hfOpenManualGroups(\''+safe(id)+'\')">직접 편성</button>');
 if(!html.includes('hfOpenManualGroups(')){
  html=html.replace('<div class="group-summary">','<div style="margin:10px 0"><button class="btn secondary full" onclick="hfOpenManualGroups(\''+safe(id)+'\')">✎ 직접 조편성</button></div><div class="group-summary">');
 }
 return html;
};
})();