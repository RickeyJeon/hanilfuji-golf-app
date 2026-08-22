(function(){
  'use strict';
  const BUCKET='event-notices';
  const db=()=>window.hfSupabase;
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const cacheKey='hf_notices';
  function cache(rows){try{localStorage.setItem(cacheKey,JSON.stringify(rows))}catch(e){}}
  function readCache(){try{return JSON.parse(localStorage.getItem(cacheKey)||'[]')}catch(e){return []}}
  async function syncNotices(){
    if(!db()||!window.currentUser)return;
    try{
      const {data,error}=await db().from('club_notices').select('id,title,content,published,pinned,author_member_id,created_at,updated_at,image_path').eq('published',true).order('created_at',{ascending:false});
      if(error||!data||!data.length)return;
      const rows=data.map(n=>({id:n.id,title:n.title,content:n.content,author:(window.members||[]).find(m=>m.dbId===n.author_member_id)?.name||window.currentUser?.name||'운영진',createdAt:n.created_at,updatedAt:n.updated_at,imagePath:n.image_path||null}));
      cache(rows); window.hfEventDbNotices=rows; if(window.currentPage==='event'&&window.eventMode==='NOTICE'&&typeof window.render==='function')window.render('event');
    }catch(e){console.warn('[EVENT] notice sync failed',e)}
  }
  function rows(){return window.hfEventDbNotices||readCache()}
  function imageUrl(path){if(!path||!db())return '';return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl}
  async function uploadImage(file){
    if(!db()||!file)throw new Error('이미지 업로드 환경을 찾을 수 없습니다.');
    if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.');
    if(file.size>10*1024*1024)throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.');
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`${window.currentUser.dbId}/${crypto.randomUUID()}.${ext}`;
    const {error}=await db().storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if(error)throw error; return path;
  }
  async function removeImage(path){if(!path||!db())return;await db().storage.from(BUCKET).remove([path]);}

  const style=document.createElement('style');style.textContent='.event-image-frame,.notice-thumb,.notice-detail-image{width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:14px;background:var(--green3);margin-top:9px}.event-image-frame img,.notice-thumb img,.notice-detail-image img{width:100%;height:100%;display:block;object-fit:cover}.notice-detail-image{margin:0 0 14px;border-radius:16px}';document.head.appendChild(style);

  window.eventImagePreview=function(input){
    const file=input?.files?.[0],box=document.getElementById('eventImagePreview'); if(!box)return;
    if(!file){box.innerHTML='';return}
    const url=URL.createObjectURL(file);box.innerHTML=`<div class="event-image-frame"><img src="${url}" alt="공지 이미지 미리보기"></div>`;
  };

  const originalSetComposerType=window.setComposerType;
  window.setComposerType=function(type){
    if(type!=='NOTICE')return originalSetComposerType(type);
    window.composerType.value=type;
    ['Notice','Schedule','Group'].forEach(k=>document.getElementById('ct'+k)?.classList.remove('active'));
    document.getElementById('ctNotice')?.classList.add('active');
    window.composerFields.innerHTML=`<div class="inputgroup"><label>공지 제목</label><input id="composeTitle" placeholder="예: 9월 스크린대회 안내"></div><div class="inputgroup"><label>내용</label><textarea id="composeContent" class="textarea" placeholder="회원들에게 전달할 내용을 입력해 주세요."></textarea></div><div class="inputgroup"><label>사진 선택</label><input id="composeNoticeImage" type="file" accept="image/jpeg,image/png,image/webp" onchange="eventImagePreview(this)"><div id="eventImagePreview"></div><div class="hint">16:9 비율로 표시되며 이미지 파일은 DB가 아닌 Supabase Storage에 저장됩니다.</div></div><button class="btn primary full" onclick="submitEventComposer()">공지 등록</button>`;
  };

  const originalSubmit=window.submitEventComposer;
  window.submitEventComposer=async function(){
    const type=window.composerType?.value;
    if(type!=='NOTICE')return originalSubmit();
    if(!window.isAdmin?.() || !window.currentUser)return;
    const title=document.getElementById('composeTitle')?.value.trim(),content=document.getElementById('composeContent')?.value.trim(),file=document.getElementById('composeNoticeImage')?.files?.[0];
    if(!title||!content){alert('제목과 내용을 입력해 주세요.');return}
    let path=null;
    try{
      if(file)path=await uploadImage(file);
      if(db()&&window.currentUser?.dbId){
        const {data,error}=await db().from('club_notices').insert({title,content,published:true,pinned:false,author_member_id:window.currentUser.dbId,image_path:path}).select('id,title,content,created_at,updated_at,image_path').single();
        if(error)throw error;
        const n={id:data.id,title:data.title,content:data.content,author:window.currentUser.name,createdAt:data.created_at,updatedAt:data.updated_at,imagePath:data.image_path||null};
        const next=[n,...rows().filter(x=>x.id!==n.id)];cache(next);window.hfEventDbNotices=next;
      }else{
        const next=readCache();next.push({id:`notice-${Date.now()}`,title,content,author:window.currentUser.name,createdAt:new Date().toISOString(),imagePath:path});cache(next);
      }
      closeModal();window.eventMode='NOTICE';render('event');
    }catch(e){if(path)await removeImage(path).catch(()=>{});alert('공지 등록에 실패했습니다.\n'+(e?.message||e));}
  };

  window.renderEventNotices=function(){
    const list=rows().slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    if(!list.length)return `<div class="card"><div class="empty">등록된 공지가 없습니다.</div></div>`;
    return list.map(n=>`<div class="room-card notice-card" onclick="openNotice('${esc(n.id)}')"><div class="notice-head"><span class="notice-tag">NOTICE</span><div class="notice-title">${esc(n.title)}</div><span class="chev">›</span></div>${n.imagePath?`<div class="notice-thumb"><img src="${imageUrl(n.imagePath)}" alt="공지 이미지"></div>`:''}<div class="notice-meta">${formatShortDate(n.createdAt)} · ${esc(n.author||'운영진')}</div></div>`).join('');
  };

  window.openNotice=async function(id){
    const n=rows().find(x=>String(x.id)===String(id));if(!n)return;
    openModal(`<div class="detail-head"><div><h3>${esc(n.title)}</h3><div class="small">${formatShortDate(n.createdAt)} · ${esc(n.author||'운영진')}</div></div>${window.isAdmin?.()?`<div style="display:flex;gap:6px"><button class="edit-mini" onclick="editNotice('${esc(n.id)}')">수정</button><button class="edit-mini" style="color:#b42318;border-color:#f1b7b1" onclick="deleteNotice('${esc(n.id)}')">삭제</button></div>`:''}</div><div class="divider"></div>${n.imagePath?`<div class="notice-detail-image"><img src="${imageUrl(n.imagePath)}" alt="공지 이미지"></div>`:''}<div style="font-size:13px;line-height:1.7;white-space:pre-line">${esc(n.content)}</div>`);
  };

  window.editNotice=function(id){
    if(!window.isAdmin?.())return;const n=rows().find(x=>String(x.id)===String(id));if(!n)return;
    openModal(`<h3>공지 수정</h3><div class="inputgroup"><label>공지 제목</label><input id="editNoticeTitle" value="${esc(n.title)}"></div><div class="inputgroup"><label>내용</label><textarea id="editNoticeContent" class="textarea">${esc(n.content)}</textarea></div><div class="inputgroup"><label>사진 변경</label><input id="editNoticeImage" type="file" accept="image/jpeg,image/png,image/webp" onchange="eventImagePreview(this)"><div id="eventImagePreview">${n.imagePath?`<div class="event-image-frame"><img src="${imageUrl(n.imagePath)}" alt="현재 이미지"></div>`:''}</div></div><button class="btn primary full" onclick="saveNoticeEdit('${esc(n.id)}')">수정 저장</button>`);
  };

  window.saveNoticeEdit=async function(id){
    if(!window.isAdmin?.())return;const n=rows().find(x=>String(x.id)===String(id));if(!n)return;
    const title=document.getElementById('editNoticeTitle')?.value.trim(),content=document.getElementById('editNoticeContent')?.value.trim(),file=document.getElementById('editNoticeImage')?.files?.[0];if(!title||!content){alert('제목과 내용을 입력해 주세요.');return}
    let newPath=n.imagePath||null;
    try{
      if(file)newPath=await uploadImage(file);
      if(db()){
        const {error}=await db().from('club_notices').update({title,content,image_path:newPath,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;
      }
      if(file&&n.imagePath&&n.imagePath!==newPath)await removeImage(n.imagePath).catch(()=>{});
      const next=rows().map(x=>String(x.id)===String(id)?{...x,title,content,updatedAt:new Date().toISOString(),imagePath:newPath}:x);cache(next);window.hfEventDbNotices=next;closeModal();render('event');
    }catch(e){if(file&&newPath!==n.imagePath)await removeImage(newPath).catch(()=>{});alert('공지 수정에 실패했습니다.\n'+(e?.message||e));}
  };

  window.deleteNotice=async function(id){
    if(!window.isAdmin?.())return;const n=rows().find(x=>String(x.id)===String(id));if(!n)return;if(!confirm(`공지 "${n.title}"을(를) 삭제하시겠습니까?\n삭제 후에는 목록과 HOME 최근 공지에서 사라집니다.`))return;
    try{
      if(db()){const {error}=await db().from('club_notices').delete().eq('id',id);if(error)throw error;}
      if(n.imagePath)await removeImage(n.imagePath).catch(()=>{});
      const next=rows().filter(x=>String(x.id)!==String(id));cache(next);window.hfEventDbNotices=next;closeModal();render('event');
    }catch(e){alert('공지 삭제에 실패했습니다.\n'+(e?.message||e));}
  };

  window.upcomingEvents=function(){
    const all=(typeof getClubEvents==='function'?getClubEvents():[]).slice();
    const now=new Date();
    return all.sort((a,b)=>{
      const ad=eventDateTime(a),bd=eventDateTime(b),ae=ad<now,be=bd<now;
      if(ae!==be)return ae?1:-1;
      return ae?(bd-ad):(ad-bd);
    });
  };

  window.addEventListener('load',()=>{setTimeout(syncNotices,200);});
  if(window.currentUser)setTimeout(syncNotices,0);
})();
