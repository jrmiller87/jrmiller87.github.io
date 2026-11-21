// No Dice Personnel — public Supabase configuration only. Never store secret/service-role keys here.
// Avoid a static cross-origin import: when the CDN is blocked, it prevents
// the entire module from running and leaves the page stuck on "Checking".
let supabase;
const supabaseConfig = {
  url: 'https://tvftroekdnzpbtgxhxto.supabase.co',
  key: 'sb_publishable_hb2rXU8WaS1RH3-593mC0Q_JJgdGvxU'
};
const timeout = (promise, milliseconds, label) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject) => {
      timer=setTimeout(()=>reject(new Error(label+' timed out. Check your network connection and retry.')),milliseconds);
    })
  ]).finally(()=>clearTimeout(timer));
};
const loadSupabaseSdk = async () => {
  const sources = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm',
    'https://esm.sh/@supabase/supabase-js@2.57.0'
  ];
  return timeout(Promise.any(sources.map(source=>import(source))), 11000, 'Discord sign-in library');
};

const byId = id => document.getElementById(id);
const status = (message, error = false) => {
  const el = byId('account-status');
  el.textContent = message;
  el.classList.toggle('is-error', error);
  el.hidden = !message;
  byId('account-retry').hidden = !error;
  if(!message || error)clearTimeout(window.noDiceAccountStartupTimeout);
};
const safeMessage = error => error?.message || 'Something went wrong. Please try again.';
const formatDate = value => { const date=new Date(value); return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); };
const makeItem = (label, detail) => {
  const entry = document.createElement('div'); entry.className = 'personnel-list-item';
  const strong = document.createElement('strong'); strong.textContent = label;
  const small = document.createElement('small'); small.textContent = detail;
  entry.append(strong, small); return entry;
};
// Dashboard filters are presentation-only; they never award XP or complete missions.
let missionEntries=[];
let missionFilter='available';
const setMissionFilter = filter => {
  if(!['available','completed','all'].includes(filter))return;
  if([...document.querySelectorAll('[data-mission-filter]')].some(button=>button.disabled))return;
  missionFilter=filter;
  document.querySelectorAll('[data-mission-filter]').forEach(button=>{
    const active=button.dataset.missionFilter===filter;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  const visible=missionEntries.filter(entry=>filter==='all'||(filter==='completed'?entry.done:!entry.done));
  displayList('missions-list',visible.map(entry=>entry.node),
    missionEntries.length===0?'No published missions yet.':
    filter==='completed'?'No completed missions yet.':
    filter==='available'?"You're all caught up. No available missions right now.":'No missions to show.');
};
document.querySelectorAll('[data-mission-filter]').forEach(button=>{
  button.addEventListener('click',()=>setMissionFilter(button.dataset.missionFilter));
});
const createTimelineItem=(kind,label,detail)=>{
  const el=document.createElement('div');
  el.className='operator-timeline-item is-'+kind;
  const marker=document.createElement('span');
  marker.className='operator-timeline-marker';
  marker.setAttribute('aria-hidden','true');
  marker.textContent=kind==='badge'?'★':'✦';
  const body=document.createElement('div');
  body.className='operator-timeline-copy';
  const title=document.createElement('strong');title.textContent=label;
  const sub=document.createElement('small');sub.textContent=detail;
  body.append(title,sub);el.append(marker,body);
  return el;
};
const displayList = (id, items, empty) => {
  const node = byId(id); node.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.textContent=empty;node.append(p);return;}
  items.forEach(item=>node.append(item));
};
const setAuthUI = loggedIn => {
  byId('signed-in').hidden = !loggedIn;
  byId('signed-out').hidden = loggedIn;
  document.body.classList.toggle('personnel-is-signed-in', loggedIn);
};
const rankFor = level => level>=50?'CAPTAIN':level>=35?'LIEUTENANT':level>=20?'SERGEANT':level>=10?'CORPORAL':level>=5?'PRIVATE':'RECRUIT';
const rankMilestones=[
  {name:'RECRUIT',minimum:1},
  {name:'PRIVATE',minimum:5},
  {name:'CORPORAL',minimum:10},
  {name:'SERGEANT',minimum:20},
  {name:'LIEUTENANT',minimum:35},
  {name:'CAPTAIN',minimum:50}
];
const trustedDiscordAvatar = input => {
  if(typeof input!=='string'||!input.trim())return null;
  try {
    const url=new URL(input);
    if(url.protocol!=='https:')return null;
    if(!['cdn.discordapp.com','media.discordapp.net','cdn.discord.com'].includes(url.hostname))return null;
    return url.href;
  } catch {return null;}
};
const showOperatorAvatar = (profile,user) => {
  const image=byId('operator-avatar-image'),initials=byId('operator-avatar');
  const avatar=trustedDiscordAvatar(profile.avatar_url)||trustedDiscordAvatar(user.user_metadata?.avatar_url)||trustedDiscordAvatar(user.user_metadata?.picture);
  image.hidden=true;image.removeAttribute('src');initials.hidden=false;
  if(!avatar)return;
  image.onload=()=>{image.hidden=false;initials.hidden=true;};
  image.onerror=()=>{image.hidden=true;image.removeAttribute('src');initials.hidden=false;};
  image.src=avatar;
};


async function loadProfile(user) {
  const {data: profile,error} = await timeout(supabase.from('operator_profiles').select('user_id,display_name,avatar_url,profile_public,equipped_title,equipped_frame').eq('user_id',user.id).single(),8500,'Operator profile');
  // The auth trigger automatically creates profiles on first login.
  if(error) throw new Error('Your profile could not be loaded. ' + safeMessage(error));
  byId('operator-name').textContent = profile.display_name || 'Operator';
  byId('operator-identity').textContent = 'Discord-linked operator account';
  byId('operator-avatar').textContent = (profile.display_name || 'ND').slice(0,2).toUpperCase();
  showOperatorAvatar(profile,user);
  byId('display-name').value = profile.display_name || 'Operator';
  byId('profile-public').checked = !!profile.profile_public;

  const [xpRes, missionsRes, completionsRes, badgesRes] = await Promise.all([
    supabase.from('operations_xp_events').select('amount,source,awarded_at').eq('user_id',user.id).order('awarded_at',{ascending:false}).limit(50),
    supabase.from('operations_missions').select('id,code,title,description,xp_reward,cadence,category').eq('published',true).order('created_at',{ascending:false}).limit(50),
    supabase.from('operations_mission_completions').select('mission_id').eq('user_id',user.id),
    supabase.from('operations_member_badges').select('awarded_at, operations_badges(name,description,visible,rarity)').eq('user_id',user.id).order('awarded_at',{ascending:false})
  ]);
  const failed=[];
  if(xpRes.error)failed.push('XP activity');
  if(missionsRes.error)failed.push('missions');
  if(completionsRes.error)failed.push('mission progress');
  if(badgesRes.error)failed.push('achievements');

  // XP totals are never inferred from the recent 50 events. If the full
  // ledger fails, show an unavailable state instead of an incorrect total.
  let xp=0,offset=0,xpReady=!xpRes.error;
  if(xpReady){
    try {
      while(true){
        const {data:page,error:pageError}=await timeout(supabase.from('operations_xp_events')
          .select('amount').eq('user_id',user.id).range(offset,offset+999),8500,'XP ledger');
        if(pageError)throw pageError;
        xp+=(page||[]).reduce((sum,item)=>sum+(Number(item.amount)||0),0);
        if(!page||page.length<1000)break;
        offset+=1000;
      }
    } catch(error) {
      xpReady=false;
      failed.push('XP totals');
    }
  }
  if(xpReady){
  // Starter progression: 500 verified XP per level, with ranks at set levels.
  const xpPerLevel=500;
  const level=Math.floor(xp/xpPerLevel)+1;
  const intoLevel=xp%xpPerLevel;
  const toNextLevel=xpPerLevel-intoLevel;
  const progressPct=(intoLevel/xpPerLevel)*100;
  const currentRank=rankFor(level);
  byId('operator-rank').textContent=currentRank;
  byId('operator-profile-rank').textContent=currentRank;
  byId('operator-profile-level').textContent=String(level).padStart(2,'0');
  byId('operator-rank-level').textContent=String(level).padStart(2,'0');
  byId('operator-rank-emblem').dataset.rank=currentRank.toLowerCase();
  const nextRank=rankMilestones.find(entry=>entry.minimum>level);
  byId('operator-next-rank').textContent=nextRank?nextRank.name+' · LEVEL '+String(nextRank.minimum).padStart(2,'0'):'CAPTAIN · TOP RANK';
  byId('operator-next-rank-xp').textContent=nextRank?(Math.max(0,(nextRank.minimum-1)*xpPerLevel-xp)).toLocaleString()+' XP TO PROMOTION':'TOP RANK ACHIEVED';
  byId('operator-level').textContent=String(level).padStart(2,'0');
  byId('operator-xp').textContent=xp.toLocaleString();
  byId('level-progress-label').textContent='LEVEL '+String(level).padStart(2,'0')+' PROGRESS';
  byId('level-progress-numbers').textContent=intoLevel.toLocaleString()+' / '+xpPerLevel.toLocaleString()+' XP';
  byId('level-progress-fill').style.width=progressPct+'%';
  byId('level-progress-rail').setAttribute('aria-valuenow',String(intoLevel));
  byId('level-progress-rail').setAttribute('aria-valuetext',intoLevel+' of '+xpPerLevel+' XP toward next level');
  byId('level-progress-next').textContent=toNextLevel.toLocaleString()+' XP TO LEVEL '+String(level+1).padStart(2,'0');

  } else {
    for(const id of ['operator-xp','operator-level','operator-rank','operator-profile-rank','operator-profile-level','operator-rank-level','level-progress-numbers','operator-next-rank','operator-next-rank-xp'])byId(id).textContent='—';
    byId('level-progress-label').textContent='XP PROGRESSION UNAVAILABLE';
    byId('level-progress-next').textContent='Retry to load your progression.';
    byId('level-progress-fill').style.width='0%';
    byId('level-progress-rail').setAttribute('aria-valuenow','0');
    byId('operator-rank-emblem').dataset.rank='recruit';
  }
  if(xpRes.error)displayList('xp-history',[], 'XP activity is temporarily unavailable. Retry the connection.');
  const completed=new Set((completionsRes.data||[]).map(x=>x.mission_id));
  const missionsReady=!missionsRes.error;
  const completionsReady=!completionsRes.error;
  document.querySelectorAll('[data-mission-filter]').forEach(button=>{
    button.disabled=!missionsReady||!completionsReady;
    button.title=button.disabled?'Mission data temporarily unavailable':'';
  });
  const published=missionsRes.data||[];
  // Recurring missions reset their actionable state each period; they must not permanently disappear after a prior verified completion.
  const completedPublished=published.filter(m=>completed.has(m.id)&&!['daily','weekly'].includes(m.cadence)).length;
  byId('operator-mission-count').textContent=missionsReady&&completionsReady?completedPublished+' / '+published.length:'—';
  byId('mission-available-count').textContent=missionsReady&&completionsReady?String(published.length-completedPublished):'—';
  byId('mission-completed-count').textContent=missionsReady&&completionsReady?String(completedPublished):'—';
  byId('mission-total-count').textContent=missionsReady?String(published.length):'—';
  missionEntries=published.map(m=>{
    const isDone=completed.has(m.id)&&!['daily','weekly'].includes(m.cadence);
    const card=document.createElement('article');
    card.className='personnel-mission-item'+(isDone?' is-complete':' is-awaiting');
    card.dataset.missionId=m.id;
    const bar=document.createElement('div');bar.className='personnel-mission-top';
    const title=document.createElement('strong');title.textContent=m.title;
    const reward=document.createElement('span');reward.className='personnel-mission-reward';reward.textContent='+'+m.xp_reward+' XP';
    bar.append(title,reward);
    const description=document.createElement('p');description.textContent=m.description||'Community objective';
    const statusLine=document.createElement('span');statusLine.className='personnel-mission-state';
    statusLine.textContent=isDone?'✓ COMPLETED · REWARD AWARDED':'◇ AWAITING VERIFICATION';
    card.append(bar,description,statusLine);
    const cadence=document.createElement('small');cadence.className='ops2-cadence';
    cadence.textContent=(m.cadence||'once').toUpperCase()+' · '+(m.category||'community').toUpperCase();
    card.append(cadence);
    if(!isDone || ['daily','weekly'].includes(m.cadence)){
      const submit=document.createElement('button');submit.type='button';
      submit.className='ops2-button ops2-mission-submit';submit.dataset.claimMission=m.id;
      submit.textContent='SUBMIT FOR REVIEW ↗';card.append(submit);
    }
    return {done:isDone,node:card};
  });
  if(!missionsReady || !completionsReady){
    const list=byId('missions-list');
    list.replaceChildren();
    const warning=document.createElement('p');
    warning.textContent=missionsReady?'Mission completion status is unavailable. Retry to load verified results.':'Missions are temporarily unavailable. Retry the connection.';
    list.append(warning);
  } else setMissionFilter(missionFilter);
  const earned=(badgesRes.data||[]).filter(x=>x.operations_badges?.visible);
  byId('operator-badges').textContent=badgesRes.error?'—':String(earned.length);
  byId('achievement-collection-count').textContent=badgesRes.error?'UNAVAILABLE':earned.length+' UNLOCKED';
  const featured=earned[0];
  byId('featured-badge').classList.toggle('is-empty',!featured);
  byId('featured-badge').dataset.tier=featured?.operations_badges?.rarity||'common';
  byId('featured-badge-name').textContent=badgesRes.error?'ACHIEVEMENTS UNAVAILABLE':featured?featured.operations_badges.name:'AWAITING FIRST BADGE';
  byId('featured-badge-detail').textContent=badgesRes.error?
    'Badge collection could not be loaded. Retry the connection.':featured?
    (featured.operations_badges.description||'Earned achievement')+' · '+formatDate(featured.awarded_at):
    'Complete verified activities to unlock achievements.';
  const badgeCards=earned.map(x=>{
    const item=document.createElement('div');item.className='personnel-badge-item tier-'+(x.operations_badges.rarity||'common');
    const mark=document.createElement('span');mark.className='personnel-badge-glyph';mark.setAttribute('aria-hidden','true');mark.textContent='✦';
    const copy=document.createElement('div');
    const heading=document.createElement('strong');heading.textContent=x.operations_badges.name;
    const sub=document.createElement('small');sub.textContent=(x.operations_badges.rarity||'common').toUpperCase()+' · '+(x.operations_badges.description||'Earned achievement')+' · '+formatDate(x.awarded_at);
    copy.append(heading,sub);item.append(mark,copy);return item;
  });
  displayList('badges-list',badgeCards,badgesRes.error?'Achievements are temporarily unavailable. Retry the connection.':'No achievements unlocked yet.');
  const events=[
    ...(xpRes.data||[]).map(x=>({kind:'xp',time:Date.parse(x.awarded_at)||0,label:'+'+x.amount+' XP',detail:(x.source||'Verified XP')+' · '+formatDate(x.awarded_at)})),
    ...earned.map(x=>({kind:'badge',time:Date.parse(x.awarded_at)||0,label:'Badge unlocked · '+x.operations_badges.name,detail:formatDate(x.awarded_at)}))
  ].sort((a,b)=>b.time-a.time).slice(0,25);
  if(!xpRes.error || !badgesRes.error){
    displayList('xp-history',events.map(x=>createTimelineItem(x.kind,x.label,x.detail)),
      'No verified activity yet. Your earned XP and badges will appear here.');
  } else {
    displayList('xp-history',[],'Activity is temporarily unavailable. Retry the connection.');
  }
  // Operations 2.0 is optional to the core dashboard and can fail independently.
  try {
    const extra=await import('./operations2.js?v=20261120-ops2');
    await timeout(extra.renderOperations2({supabase,user,profile,xp:xpReady?xp:null}),12000,'Operations 2.0');
  } catch(extraError) {
    const node=byId('ops2-claim-status');
    if(node)node.textContent='Operations 2.0 is temporarily unavailable: '+safeMessage(extraError);
  }
  return [...new Set(failed)];
}
async function refresh() {
  status('Checking your Discord session…');
  let authenticated=false;
  try {
    // A local session check avoids a network request for signed-out visitors.
    const {data:{session},error:sessionError}=await timeout(supabase.auth.getSession(),6000,'Session recovery');
    if(sessionError)throw sessionError;
    if(!session){setAuthUI(false);status('');return;}
    const {data:{user},error}=await timeout(supabase.auth.getUser(),9000,'Account verification');
    if(error)throw error;
    if(!user){setAuthUI(false);status('Your Discord session expired. Sign in again.',true);return;}
    authenticated=true;
    setAuthUI(true);
    status('Loading your operator dashboard…');
    const issues=await timeout(loadProfile(user),30000,'Operator dashboard');
    status(issues.length?'Some sections could not load: '+issues.join(', ')+'. Retry to refresh those sections.':'',issues.length>0);
  } catch(error) {
    // A failed activity query must not erase an authenticated user's identity.
    setAuthUI(authenticated);
    status((authenticated?'Your dashboard could not finish loading. ':'Account connection failed. ')+safeMessage(error),true);
  }
}

byId('discord-signin').addEventListener('click',async()=>{
  const button=byId('discord-signin');button.disabled=true;status('Opening Discord authorization…');
  try {
    if(!supabase)throw new Error('Discord sign-in has not loaded. Use Retry Account Connection.');
    const {error}=await timeout(supabase.auth.signInWithOAuth({
      provider:'discord',
      options:{redirectTo:new URL('account.html',window.location.href).href}
    }),9000,'Discord authorization');
    if(error)throw error;
  } catch(error){status(safeMessage(error),true);button.disabled=false;}
});
byId('signout').addEventListener('click',async()=>{
  status('Signing out…');
  const button=byId('signout');
  button.disabled=true;
  try {
    const {error}=await timeout(supabase.auth.signOut(),9000,'Sign out');
    if(error)throw error;
    setAuthUI(false);status('');
  } catch(error){status(safeMessage(error),true);}
  finally{button.disabled=false;}
});
byId('profile-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=byId('profile-form').querySelector('button[type="submit"]');
  const name=byId('display-name').value.trim();
  if(!name||name.length>40){
    byId('save-message').textContent='Display names must contain 1–40 characters.';
    byId('save-message').classList.remove('is-success');
    byId('save-message').classList.add('is-error');
    return;
  }
  button.disabled=true;button.textContent='SAVING…';
  byId('save-message').textContent='Saving your changes…';
  byId('save-message').classList.remove('is-success','is-error');
  try {
    const {data:{user},error:authError}=await timeout(supabase.auth.getUser(),8500,'Account verification');
    if(authError||!user)throw authError||new Error('Please sign in again.');
    const {data:updated,error}=await timeout(supabase.from('operator_profiles')
      .update({display_name:name,profile_public:byId('profile-public').checked})
      .eq('user_id',user.id).select('user_id').single(),9000,'Profile save');
    if(error)throw error;
    if(!updated)throw new Error('Your changes were not saved. Try again.');
    byId('operator-name').textContent=name;
    byId('operator-avatar').textContent=name.slice(0,2).toUpperCase();
    byId('save-message').textContent='Profile saved successfully.';
    byId('save-message').classList.add('is-success');
  } catch(error){byId('save-message').textContent=safeMessage(error);byId('save-message').classList.add('is-error');}
  finally{button.disabled=false;button.textContent='SAVE PROFILE';}
});
async function startPersonnel() {
  try {
    status('Loading secure Discord sign-in…');
    const sdk=await loadSupabaseSdk();
    if(typeof sdk.createClient!=='function')throw new Error('Discord sign-in library was unavailable.');
    supabase=sdk.createClient(supabaseConfig.url,supabaseConfig.key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    supabase.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){
        setAuthUI(false);
        status('');
      }
      // Avoid database calls directly inside the auth state callback.
    });
    await refresh();
  } catch(error) {
    setAuthUI(false);
    const message=safeMessage(error);
    status('Could not load secure sign-in. '+message,true);
    // The sign-in button should not appear usable if its SDK never loaded.
    byId('discord-signin').disabled=!supabase;
  }
}
startPersonnel();
