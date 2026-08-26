const CACHE='hanil-fuji-v4';
const APP_SHELL=['./','./index.html','./manifest.json','./icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hanil-fuji-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html')))
  );
});
self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json()||{}}catch(e){payload={body:event.data?.text()||''}}
  const title=payload.title||'HANIL-FUJI GC';
  const options={
    body:payload.body||'새로운 소식이 있습니다.',
    icon:payload.icon||'./icon.svg',
    badge:payload.badge||'./icon.svg',
    tag:payload.tag||('hf-'+Date.now()),
    renotify:!!payload.renotify,
    data:{url:payload.url||'./',page:payload.page||'event'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'./';
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){
        try{client.postMessage({type:'HF_NOTIFICATION_CLICK',page:event.notification.data?.page||'event'})}catch(e){}
        return client.focus();
      }
    }
    if(clients.openWindow)return clients.openWindow(target);
  })());
});
