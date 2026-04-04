const SHARED_ID='daria-all-lists';
let client=null;
let channel=null;
let pushTimer=0;
let isSubscribed=false;

function text(v){return String(v?v:'').trim();}
function getConfig(){var s=window.DARIA_SUPABASE_CONFIG;if(!s||typeof s!=='object')return null;var u=text(s.url),k=text(s.anonKey),t=text(s.table)||'daria_word_lists';return u&&k?{url:u,anonKey:k,table:t}:null;}

async function ensureClient(){
  if(client)return client;
  var c=getConfig();if(!c)return null;
  try{
    var m=await import('https://esm.sh/@supabase/supabase-js@2');
    client=m.createClient(c.url,c.anonKey);
    return client;
  }catch(e){console.warn('supabase init',e);return null;}
}

// Read lists from shared Supabase row
async function pullFromCloud(){
  var c=await ensureClient();if(!c)return null;
  try{
    var res=await c.from('daria_word_lists').select('payload').eq('shared_id',SHARED_ID).maybeSingle();
    var lists=res.error||!res.data||!res.data.payload?[]:(res.data.payload.lists||[]);
    var prev=window.__dclCloudLists?window.__dclCloudLists.length:0;
    window.__dclCloudLists=lists;
    window.dispatchEvent(new CustomEvent('dcl-cloud-sync',{detail:{listCount:lists.length,prevCount:prev}}));
    return lists;
  }catch(e){console.warn('pull err',e);return null;}
}

// Push lists to shared Supabase row (debounced by default)
async function pushToCloud(lists,force){
  var c=await ensureClient();if(!c)return;
  var data={lists:lists||[],updatedAt:Date.now()};
  try{
    await c.from('daria_word_lists').upsert({shared_id:SHARED_ID,payload:data,updated_at_ms:Date.now()},{onConflict:'shared_id'});
    window.__dclCloudLists=data.lists.slice();
  }catch(e){console.warn('push err',e);}
}

function schedulePush(lists,force){
  // Force push immediately for critical operations like delete
  if(force){clearTimeout(pushTimer);pushToCloud(lists,true);return;}
  clearTimeout(pushTimer);
  pushTimer=setTimeout(function(){pushTimer=0;pushToCloud(lists);},400);
}

// Subscribe to realtime changes on the shared row
function subscribeToChanges(){
  if(isSubscribed)return;
  isSubscribed=true;
  ensureClient().then(function(c){
    if(!c)return;
    channel=c.channel('lists-changes')
      .on('postgres_changes',
        {event:'*',schema:'public',table:'daria_word_lists',filter:'shared_id=eq.'+SHARED_ID},
        function(){
          // Any change in the shared row — refetch ALL data
          pullFromCloud().catch(function(){return null;});
        })
      .subscribe(function(status){
        if(status==='SUBSCRIBED'){
          pullFromCloud().catch(function(){return null;});
        }
      });
  });
}

// Exposed globals
window.__dclCloudLists=[];
window.__dclPullFromCloud=pullFromCloud;
window.__dclPushToCloud=pushToCloud;
window.__dclSchedulePush=schedulePush;
window.__dclGetCloudLists=function(){return window.__dclCloudLists?window.__dclCloudLists.slice():[];};

// Init: pull first, then subscribe
window.__dclCloudReady=pullFromCloud().then(function(){
  subscribeToChanges();
}).catch(function(e){
  console.warn('hydrate err',e);
  subscribeToChanges();
  return null;
});

// Push before hiding, pull when showing
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){
    clearTimeout(pushTimer);
    if(window.__dclCloudLists&&window.__dclCloudLists.length)pushToCloud(window.__dclCloudLists,true);
  }else{
    pullFromCloud().catch(function(){return null;});
  }
});
window.addEventListener('beforeunload',function(){
  clearTimeout(pushTimer);
  if(window.__dclCloudLists&&window.__dclCloudLists.length)pushToCloud(window.__dclCloudLists,true);
});
