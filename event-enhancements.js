(function(){
  'use strict';
  const BUCKET='event-notices';
  const db=()=>window.hfSupabase;
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const cacheKey='hf_notices';
  window.hfEventDbNotices=[];
  function cache(rows){try{localStorage.setItem(cacheKey,JSON.stringify(rows))}catch(e){}}
  function readCache(){try{return JSON.parse(localStorage.getItem(cacheKey)||'[]')}catch(e){return []}}
  async function syncNotices(){
    if(!db()||!window.currentUser)return [];
    try{
      const {data,error}=await db().from('club_notices').select('id,title,content,published,pinned,author_member_id,created_at,updated_at,image_path').eq('published',true).order('created_at',{ascending:false});
      if(error){console.warn('[EVENT] notice sync failed',error);window.hfEventDbNotices=[];return []}
      const rows=(data||[]).map(n=>({id:n.id,title:n.title,content:n.content,author:(window.members||[]).find(m=>m.dbId===n.author_member_id)?.name||'운영진',createdAt:n.created_at,updatedAt:n.updated_at,imagePath:n.image_path||null}));
      cache(rows);window.hfEventDbNotices=rows;
      if(window.currentPage==='event'&&window.eventMode==='NOTICE'&&typeof window.render==='function')window.render('event');
      if(window.currentPage==='home'&&typeof window.render==='function')window.render('home');
      return rows;
    }catch(e){console.warn('[EVENT] notice sync failed',e);return null}
  }
  window.syncClubNotices=syncNotices;
  function rows(){return Array.isArray(window.hfEventDbNotices)?window.hfEventDbNotices:[]}
  function isEventAdmin(){const role=String(window.currentUser?.role||'').toUpperCase();return ['PRIMARY_ADMIN','ASSISTANT_ADMIN'].includes(role)}
  function imageUrl(path){if(!path||!db())return '';return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
  const MAX_IMAGE_WIDTH=1500;
  const MAX_IMAGE_HEIGHT=844;
  const MAX_IMAGE_BYTES=1800000;
  function readImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('이미지를 읽을 수 없습니다.'))};img.src=url})}
  function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('이미지 변환을 지원하지 않는 브라우저입니다.')),type,quality))}
  async function optimizeImage(file){
    if(file?._hfOptimized)return file;
    const img=await readImage(file);
    const ratio=Math.min(1,MAX_IMAGE_WIDTH/img.naturalWidth,MAX_IMAGE_HEIGHT/img.naturalHeight);
    const width=Math.max(1,Math.round(img.naturalWidth*ratio));
    const height=Math.max(1,Math.round(img.naturalHeight*ratio));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이미지 변환을 시작할 수 없습니다.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
    let outputType='image/webp',quality=0.86,blob=await canvasBlob(canvas,outputType,quality);
    if(blob.type!=='image/webp'){outputType='image/jpeg';blob=await canvasBlob(canvas,outputType,quality)}
    while(blob.size>MAX_IMAGE_BYTES&&quality>0.5){quality-=0.08;blob=await canvasBlob(canvas,outputType,quality)}
    let currentCanvas=canvas;
    while(blob.size>MAX_IMAGE_BYTES&&currentCanvas.width>800){
      const next=document.createElement('canvas');next.width=Math.round(currentCanvas.width*0.88);next.height=Math.round(currentCanvas.height*0.88);
      const nextCtx=next.getContext('2d');nextCtx.fillStyle='#fff';nextCtx.fillRect(0,0,next.width,next.height);nextCtx.drawImage(currentCanvas,0,0,next.width,next.height);currentCanvas=next;quality=0.82;blob=await canvasBlob(currentCanvas,outputType,quality);
      while(blob.size>MAX_IMAGE_BYTES&&quality>0.5){quality-=0.08;blob=await canvasBlob(currentCanvas,outputType,quality)}
    }
    if(blob.size>MAX_IMAGE_BYTES)throw new Error('이미지를 1.8MB 이하로 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
    const ext=outputType==='image/webp'?'webp':'jpg';
    const output=new File([blob],'notice.'+ext,{type:outputType,lastModified:Date.now()});
    Object.defineProperty(output,'_hfOptimized',{value:true});
    return output;
  }
  async function uploadImage(file){
    if(!db()||!file)throw new Error('이미지 업로드 환경을 찾을 수 없습니다.');
    if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.');
    const optimized=await optimizeImage(file);
    const ext=optimized.type==='image/webp'?'webp':'jpg';
    const path=window.currentUser.dbId+'/'+crypto.randomUUID()+'.'+ext;
    const {error}=await db().storage.from(BUCKET).upload(path,optimized,{contentType:optimized.type,upsert:false});
    if(error)throw error;return path;
  }
  async function removeImage(path){if(!path||!db())return;await db().storage.from(BUCKET).remove([path])}
  const style=document.createElement('style');style.textContent='.event-image-frame,.notice-thumb,.notice-detail-image{width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:14px;background:var(--green3);margin-top:9px}.event-image-frame img,.notice-thumb img,.notice-detail-image img{width:100%;height:100%;display:block;object-fit:cover}.notice-detail-image{margin:0 0 14px;border-radius:16px}';document.head.appendChild(style);
  window.eventImagePreview=async function(input){
    const file=input?.files?.[0],box=document.getElementById('eventImagePreview');if(!box)return;
    input._optimizedFile=null;if(!file){box.innerHTML='';return}
    box.innerHTML='<div class="hint">사진을 화면에 맞게 자동 최적화하는 중...</div>';
    try{const optimized=await optimizeImage(file);input._optimizedFile=optimized;const url=URL.createObjectURL(optimized);box.innerHTML=`<div class="event-image-frame"><img src="${url}" alt="최적화된 공지 이미지 미리보기"></div><div class="hint">업로드 파일: ${(optimized.size/1024/1024).toFixed(2)}MB · ${optimized.type}</div>`}
    catch(e){box.innerHTML='<div class="hint" style="color:#b42318">'+esc(e?.message||e)+'</div>'}
  };
  const originalSetComposerType=window.setComposerType;
  window.setComposerType=function(type){
    if(type!=='NOTICE')return originalSetComposerType(type);
    window.composerType.value=type;
    ['Notice','Schedule','Group'].forEach(k=>document.getElementById('ct'+k)?.classList.remove('active'));
    document.getElementById('ctNotice')?.classList.add('active');
    window.composerFields.innerHTML=`<div class="inputgroup"><label>공지 제목</label><input id="composeTitle" placeholder="예: 9월 스크린대회 안내"></div><div class="inputgroup"><label>내용</label><textarea id="composeContent" class="textarea" placeholder="회원들에게 전달할 내용을 입력해 주세요."></textarea></div><div class="inputgroup"><label>사진 선택</label><input id="composeNoticeImage" type="file" accept="image/jpeg,image/png,image/webp" onchange="eventImagePreview(this)"><div id="eventImagePreview"></div><div class="hint">16:9 화면 기준 최대 1500×844, 1.8MB 이하로 자동 최적화 후 Supabase Storage에 저장됩니다.</div></div><button class="btn primary full" onclick="submitEventComposer()">공지 등록</button>`;
  };
  const originalSubmit=window.submitEventComposer;
  window.submitEventComposer=async function(){
    const type=window.composerType?.value;
    if(type!=='NOTICE')return originalSubmit();
    const admin=isEventAdmin();
    if(!admin){alert('관리자 권한을 확인할 수 없습니다.');return}
    const title=document.getElementById('composeTitle')?.value.trim();
    const content=document.getElementById('composeContent')?.value.trim();
    const imageInput=document.getElementById('composeNoticeImage'),file=imageInput?._optimizedFile||imageInput?.files?.[0];
    if(!title||!content){alert('제목과 내용을 입력해 주세요.');return}
    const button=document.querySelector('#composerFields button[onclick*="submitEventComposer"]');
    if(button){button.disabled=true;button.textContent='공지 올리는 중...'}
    let path=null;
    try{
      if(!db())throw new Error('Supabase 연결을 찾을 수 없습니다.');
      const {data:{session}}=await db().auth.getSession();
      if(!session)throw new Error('관리자 인증 세션이 없습니다. 로그아웃 후 관리자 계정으로 다시 로그인해 주세요.');
      let memberId=window.currentUser.dbId;
      if(!memberId){
        const {data:member,error:memberError}=await db().from('club_members').select('id,role,status').eq('phone_e164',normalizePhone(window.currentUser.phone)).maybeSingle();
        if(memberError)throw memberError;
        if(!member||!['primary_admin','assistant_admin'].includes(member.role)||member.status!=='active')throw new Error('관리자 회원정보 연결을 확인할 수 없습니다.');
        memberId=member.id;window.currentUser.dbId=memberId;
      }
      if(file)path=await uploadImage(file);
      const {data,error}=await db().from('club_notices').insert({title,content,published:true,pinned:false,author_member_id:memberId,image_path:path}).select('id,title,content,created_at,updated_at,image_path').single();
      if(error)throw error;
      try{
        if(typeof window.hfSendPush==='function')await window.hfSendPush({notificationType:'notice',sourceId:data.id,title:'새 공지: '+data.title,body:content});
      }catch(pushError){console.warn('[EVENT] notice push failed',pushError)}
      const n={id:data.id,title:data.title,content:data.content,author:window.currentUser.name,createdAt:data.created_at,updatedAt:data.updated_at,imagePath:data.image_path||null};
      const next=[n,...rows().filter(x=>x.id!==n.id)];cache(next);window.hfEventDbNotices=next;
      closeModal();window.eventMode='NOTICE';render('event');await syncNotices();alert('공지 등록이 완료되었습니다.');
    }catch(e){if(path)await removeImage(path).catch(()=>{});alert('공지 등록에 실패했습니다.\n'+(e?.message||e));}
    finally{if(button){button.disabled=false;button.textContent='공지 등록'}}
  };
  const originalHomeNoticeRender=window.renderHomeNotices;
  window.renderHomeNotices=function(){
    const dbRows=window.hfEventDbNotices;if(!Array.isArray(dbRows))return originalHomeNoticeRender();
    const list=dbRows.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,2);
    return `<div class="card">${list.map(n=>`<div class="notice" onclick="openNotice('${esc(n.id)}')"><strong>${esc(n.title)}</strong><small>${formatShortDate(n.createdAt)} · ${esc(n.author||'운영진')}</small></div>`).join('')||'<div class="empty">등록된 공지가 없습니다.</div>'}</div>`;
  };
  const originalEnterApp=window.enterApp;
  if(typeof originalEnterApp==='function'){window.enterApp=async function(){const result=await originalEnterApp();await syncNotices();return result}}
  window.renderEventNotices=function(){const list=rows().slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));if(!list.length)return `<div class="card"><div class="empty">등록된 공지가 없습니다.</div></div>`;return list.map(n=>`<div class="room-card notice-card" onclick="openNotice('${esc(n.id)}')"><div class="notice-head"><span class="notice-tag">NOTICE</span><div class="notice-title">${esc(n.title)}</div><span class="chev">›</span></div>${n.imagePath?`<div class="notice-thumb"><img src="${imageUrl(n.imagePath)}" alt="공지 이미지"></div>`:''}<div class="notice-meta">${formatShortDate(n.createdAt)} · ${esc(n.author||'운영진')}</div></div>`).join('')};
  window.openNotice=async function(id){const n=rows().find(x=>String(x.id)===String(id));if(!n)return;openModal(`<div class="detail-head"><div><h3>${esc(n.title)}</h3><div class="small">${formatShortDate(n.createdAt)} · ${esc(n.author||'운영진')}</div></div>${isEventAdmin()?`<div style="display:flex;gap:6px"><button class="edit-mini" onclick="editNotice('${esc(n.id)}')">수정</button><button class="edit-mini" style="color:#b42318;border-color:#f1b7b1" onclick="deleteNotice('${esc(n.id)}')">삭제</button></div>`:''}</div><div class="divider"></div>${n.imagePath?`<div class="notice-detail-image"><img src="${imageUrl(n.imagePath)}" alt="공지 이미지"></div>`:''}<div style="font-size:13px;line-height:1.7;white-space:pre-line">${esc(n.content)}</div>`) };
  window.editNotice=function(id){if(!isEventAdmin())return;const n=rows().find(x=>String(x.id)===String(id));if(!n)return;openModal(`<h3>공지 수정</h3><div class="inputgroup"><label>공지 제목</label><input id="editNoticeTitle" value="${esc(n.title)}"></div><div class="inputgroup"><label>내용</label><textarea id="editNoticeContent" class="textarea">${esc(n.content)}</textarea></div><div class="inputgroup"><label>사진 변경</label><input id="editNoticeImage" type="file" accept="image/jpeg,image/png,image/webp" onchange="eventImagePreview(this)"><div id="eventImagePreview">${n.imagePath?`<div class="event-image-frame"><img src="${imageUrl(n.imagePath)}" alt="현재 이미지"></div>`:''}</div></div><button class="btn primary full" onclick="saveNoticeEdit('${esc(n.id)}')">수정 저장</button>`)};
  window.saveNoticeEdit=async function(id){if(!isEventAdmin())return;const n=rows().find(x=>String(x.id)===String(id));if(!n)return;const title=document.getElementById('editNoticeTitle')?.value.trim(),content=document.getElementById('editNoticeContent')?.value.trim(),imageInput=document.getElementById('editNoticeImage'),file=imageInput?._optimizedFile||imageInput?.files?.[0];if(!title||!content){alert('제목과 내용을 입력해 주세요.');return}let newPath=n.imagePath||null;try{if(file)newPath=await uploadImage(file);if(db()){const {error}=await db().from('club_notices').update({title,content,image_path:newPath,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error}if(file&&n.imagePath&&n.imagePath!==newPath)await removeImage(n.imagePath).catch(()=>{});const next=rows().map(x=>String(x.id)===String(id)?{...x,title,content,updatedAt:new Date().toISOString(),imagePath:newPath}:x);cache(next);window.hfEventDbNotices=next;closeModal();render('event');await syncNotices()}catch(e){if(file&&newPath!==n.imagePath)await removeImage(newPath).catch(()=>{});alert('공지 수정에 실패했습니다.\n'+(e?.message||e))}};
  window.deleteNotice=async function(id){if(!isEventAdmin())return;const n=rows().find(x=>String(x.id)===String(id));if(!n)return;if(!confirm(`공지 \"${n.title}\"을(를) 삭제하시겠습니까?\n삭제 후에는 목록과 HOME 최근 공지에서 사라집니다.`))return;try{if(db()){const {error}=await db().from('club_notices').delete().eq('id',id);if(error)throw error}if(n.imagePath)await removeImage(n.imagePath).catch(()=>{});const next=rows().filter(x=>String(x.id)!==String(id));cache(next);window.hfEventDbNotices=next;closeModal();render('event');await syncNotices()}catch(e){alert('공지 삭제에 실패했습니다.\n'+(e?.message||e))}};
  window.upcomingEvents=function(){const all=(typeof getClubEvents==='function'?getClubEvents():[]).slice();const now=new Date();return all.sort((a,b)=>{const ad=eventDateTime(a),bd=eventDateTime(b),ae=ad<now,be=bd<now;if(ae!==be)return ae?1:-1;return ae?(bd-ad):(ad-bd)})};
  window.addEventListener('load',()=>{setTimeout(()=>{if(window.currentUser)syncNotices()},200)});
  if(window.currentUser)setTimeout(syncNotices,0);
})();