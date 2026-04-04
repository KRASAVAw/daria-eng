const SHARED_ID='daria-all-lists';
let client=null;
let pushTimer=0;
function text(v){return String(v?v:'').trim();}
function getConfig(){var s=window.DARIA_SUPABASE_CONFIG;if(!s||typeof s!=='object')return null;var u=text(s.url),k=text(s.anonKey),t=text(s.table)||'daria_word_lists';return u&&k?{url:u,anonKey:k,table:t}:null;}
async function ensureClient(){if(client)return client;var c=getConfig();if(!c)return null;try{var m=await import('https://esm.sh/@supabase/supabase-js@2');client=m.createClient(c.url,c.anonKey);return client;}catch(e){console.warn('supabase init',e);return null;}}
async function pullFromCloud(){var c=await ensureClient();if(!c)return null;try{var res=await c.from('daria_word_lists').select('payload').eq('shared_id',SHARED_ID).maybeSingle();var lists=res.error||!res.data||!res.data.payload?[]:(res.data.payload.lists||[]);var prev=window.__dclCloudLists?window.__dclCloudLists.length:0;window.__dclCloudLists=lists;window.dispatchEvent(new CustomEvent('dcl-cloud-sync',{detail:{listCount:lists.length,prevCount:prev}}));return lists;}catch(e){console.warn('pull err',e);return null;}}
async function pushToCloud(lists){var c=await ensureClient();if(!c)return;try{await c.from('daria_word_lists').upsert({shared_id:SHARED_ID,payload:{lists:lists||[],updatedAt:Date.now()},updated_at_ms:Date.now()},{onConflict:'shared_id'});window.__dclCloudLists=lists;}catch(e){console.warn('push err',e);}}
function schedulePush(lists){clearTimeout(pushTimer);pushTimer=setTimeout(function(){pushTimer=0;pushToCloud(lists);},250);}
window.__dclCloudLists=[];
window.__dclPullFromCloud=pullFromCloud;
window.__dclPushToCloud=pushToCloud;
window.__dclSchedulePush=schedulePush;
window.__dclGetCloudLists=function(){return window.__dclCloudLists?window.__dclCloudLists.slice():[];};
window.__dclCloudReady=pullFromCloud().catch(function(e){console.warn('hydrate err',e);return null;});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){clearTimeout(pushTimer);if(window.__dclCloudLists.length)pushToCloud(window.__dclCloudLists);return;}pullFromCloud().catch(function(){return null;});});
window.setInterval(function(){if(document.visibilityState==='visible'){pullFromCloud().catch(function(){return null;});}},30000);
window.addEventListener('beforeunload',function(){clearTimeout(pushTimer);if(window.__dclCloudLists.length)pushToCloud(window.__dclCloudLists);});
