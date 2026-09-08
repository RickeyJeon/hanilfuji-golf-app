(function(){
'use strict';

function install(){
  if(typeof window.confirmGroups!=='function'||window.confirmGroups.__hfPushWrapped)return false;
  const original=window.confirmGroups;
  window.confirmGroups=async function(id){
    let wasConfirmed=false;
    let eventTitle='대회';
    try{
      const all=typeof window.getEventGroups==='function'?window.getEventGroups():{};
      wasConfirmed=!!all?.[id]?.confirmed;
      const events=typeof window.getClubEvents==='function'?window.getClubEvents():[];
      eventTitle=events.find(e=>String(e.id)===String(id))?.title||eventTitle;
    }catch(e){}

    const result=await original.apply(this,arguments);

    try{
      const all=typeof window.getEventGroups==='function'?window.getEventGroups():{};
      const isConfirmed=!!all?.[id]?.confirmed;
      if(!wasConfirmed&&isConfirmed&&typeof window.hfSendPush==='function'){
        const pushResult=await window.hfSendPush({
          notificationType:'event',
          sourceId:String(id),
          title:`[조편성 확정] ${eventTitle}`,
          body:'조편성이 확정되었습니다. EVENT > 조편성에서 확인해 주세요.'
        });
        console.info('[GROUP] confirm push result',pushResult);
      }
    }catch(error){
      console.warn('[GROUP] confirm push failed',error);
    }
    return result;
  };
  window.confirmGroups.__hfPushWrapped=true;
  return true;
}

if(!install()){
  const timer=setInterval(()=>{if(install())clearInterval(timer)},250);
  setTimeout(()=>clearInterval(timer),10000);
}
})();
