(function(){
  function openPage(page){
    const target=page||'event';
    let tries=0;
    const timer=setInterval(function(){
      tries++;
      try{
        if(typeof window.go==='function'){
          clearInterval(timer);
          window.go(target);
          return;
        }
        if(typeof window.render==='function'){
          clearInterval(timer);
          document.querySelectorAll('.navitem').forEach(function(x){x.classList.remove('active')});
          const el=document.querySelector('[data-page="'+target+'"]');
          if(el)el.classList.add('active');
          window.render(target);
          window.scrollTo({top:0,behavior:'auto'});
          return;
        }
      }catch(e){}
      if(tries>=40)clearInterval(timer);
    },250);
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',function(event){
      const data=event.data||{};
      if(data.type==='HF_NOTIFICATION_CLICK')openPage(data.page||'event');
    });
  }

  try{
    const url=new URL(location.href);
    const page=url.searchParams.get('hfPage');
    if(page){
      openPage(page);
      url.searchParams.delete('hfPage');
      history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    }
  }catch(e){}
})();
