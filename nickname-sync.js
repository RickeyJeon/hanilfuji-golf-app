(function(){
  'use strict';
  async function syncLatestMemberNames(){
    try{
      if(!window.hfSupabase || !Array.isArray(window.members)) return;
      const {data,error}=await window.hfSupabase
        .from('club_members')
        .select('id,name,nickname,full_name,department,dept,position,company,status,role')
        .eq('status','active');
      if(error || !Array.isArray(data)) return;
      const byId=new Map(data.map(m=>[String(m.id),m]));
      let changed=false;
      window.members.forEach(m=>{
        const latest=byId.get(String(m.id));
        if(!latest) return;
        const name=latest.name ?? latest.full_name ?? m.name;
        const nickname=latest.nickname ?? m.nickname ?? m.nick ?? '';
        const dept=latest.department ?? latest.dept ?? m.dept ?? '';
        if(m.name!==name){m.name=name;changed=true;}
        if(m.nickname!==nickname){m.nickname=nickname;changed=true;}
        if(m.nick!==nickname){m.nick=nickname;changed=true;}
        if(m.dept!==dept){m.dept=dept;changed=true;}
        if(latest.position!==undefined && m.position!==latest.position){m.position=latest.position;changed=true;}
        if(latest.company!==undefined && m.company!==latest.company){m.company=latest.company;changed=true;}
      });
      if(changed && window.currentPage && ['ranking','home','record','members'].includes(window.currentPage)){
        window.render(window.currentPage);
      }
    }catch(e){console.warn('nickname sync failed',e)}
  }
  window.hfSyncLatestMemberNames=syncLatestMemberNames;
  window.addEventListener('load',()=>setTimeout(syncLatestMemberNames,150));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncLatestMemberNames();});
})();
