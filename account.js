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
const formatDate = value => new Date(value).toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'});
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
  let {data: profile,error} = await supabase.from('operator_profiles').select('user_id,display_name,avatar_url,profile_public').eq('user_id',user.id).single();
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
    supabase.from('operations_missions').select('id,code,title,description,xp_reward').eq('published',true).order('created_at',{ascending:false}).limit(50),
    supabase.from('operations_mission_completions').select('mission_id').eq('user_id',user.id),
    supabase.from('operations_member_badges').select('awarded_at, operations_badges(name,description,visible)').eq('user_id',user.id).order('awarded_at',{ascending:false})
  ]);
  for(const result of [xpRes,missionsRes,completionsRes,badgesRes])if(result.error)throw result.error;

  // Paginate XP history so total XP remains correct beyond the 50 most recent events.
  let xp=0, offset=0;
  while(true){
    const {data:page,error:pageError}=await supabase.from('operations_xp_events')
      .select('amount').eq('user_id',user.id).range(offset,offset+999);
    if(pageError)throw pageError;
    xp+=(page||[]).reduce((sum,item)=>sum+item.amount,0);
    if(!page||page.length<1000)break;
    offset+=1000;
  }
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

  const completed=new Set((completionsRes.data||[]).map(x=>x.mission_id));
  const published=missionsRes.data||[];
  const completedPublished=published.filter(m=>completed.has(m.id)).length;
  byId('operator-mission-count').textContent=completedPublished+' / '+published.length;
  byId('mission-available-count').textContent=String(published.length-completedPublished);
  byId('mission-completed-count').textContent=String(completedPublished);
  byId('mission-total-count').textContent=String(published.length);
  missionEntries=published.map(m=>{
    const isDone=completed.has(m.id);
    const card=document.createElement('article');
    card.className='personnel-mission-item'+(isDone?' is-complete':' is-awaiting');
    const bar=document.createElement('div');bar.className='personnel-mission-top';
    const title=document.createElement('strong');title.textContent=m.title;
    const reward=document.createElement('span');reward.className='personnel-mission-reward';reward.textContent='+'+m.xp_reward+' XP';
    bar.append(title,reward);
    const description=document.createElement('p');description.textContent=m.description||'Community objective';
    const statusLine=document.createElement('span');statusLine.className='personnel-mission-state';
    statusLine.textContent=isDone?'✓ COMPLETED · REWARD AWARDED':'◇ AWAITING VERIFICATION';
    card.append(bar,description,statusLine);
    return {done:isDone,node:card};
  });
  setMissionFilter(missionFilter);
  const earned=(badgesRes.data||[]).filter(x=>x.operations_badges?.visible);
  byId('operator-badges').textContent=String(earned.length);
  byId('achievement-collection-count').textContent=earned.length+' UNLOCKED';
  const featured=earned[0];
  byId('featured-badge').classList.toggle('is-empty',!featured);
  byId('featured-badge-name').textContent=featured?featured.operations_badges.name:'AWAITING FIRST BADGE';
  byId('featured-badge-detail').textContent=featured?
    (featured.operations_badges.description||'Earned achievement')+' · '+formatDate(featured.awarded_at):
    'Complete verified activities to unlock achievements.';
  const badgeCards=earned.map(x=>{
    const item=document.createElement('div');item.className='personnel-badge-item';
    const mark=document.createElement('span');mark.className='personnel-badge-glyph';mark.setAttribute('aria-hidden','true');mark.textContent='✦';
    const copy=document.createElement('div');
    const heading=document.createElement('strong');heading.textContent=x.operations_badges.name;
    const sub=document.createElement('small');sub.textContent=(x.operations_badges.description||'Earned achievement')+' · '+formatDate(x.awarded_at);
    copy.append(heading,sub);item.append(mark,copy);return item;
  });
  displayList('badges-list',badgeCards,'No achievements unlocked yet.');
  const events=[
    ...(xpRes.data||[]).map(x=>({kind:'xp',time:Date.parse(x.awarded_at)||0,label:'+'+x.amount+' XP',detail:(x.source||'Verified XP')+' · '+formatDate(x.awarded_at)})),
    ...earned.map(x=>({kind:'badge',time:Date.parse(x.awarded_at)||0,label:'Badge unlocked · '+x.operations_badges.name,detail:formatDate(x.awarded_at)}))
  ].sort((a,b)=>b.time-a.time).slice(0,25);
  displayList('xp-history',events.map(x=>createTimelineItem(x.kind,x.label,x.detail)),
    'No verified activity yet. Your earned XP and badges will appear here.');

}
async function refresh() {
  status('Checking your Discord session…');
  try {
    const {data:{user},error} = await timeout(supabase.auth.getUser(), 9000, 'Account session check');
    if(error)throw error;
    if(!user){setAuthUI(false);status('');return;}
    setAuthUI(true);
    await loadProfile(user);
    status('');
  } catch(error) {
    setAuthUI(false);
    status(safeMessage(error),true);
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
    const {error}=await supabase.auth.signOut();
    if(error)throw error;
    setAuthUI(false);status('');
  } catch(error){status(safeMessage(error),true);}
  finally{button.disabled=false;}
});
byId('profile-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=byId('profile-form').querySelector('button[type="submit"]');
  const name=byId('display-name').value.trim();
  if(!name||name.length>40){byId('save-message').textContent='Display names must contain 1–40 characters.';return;}
  button.disabled=true;button.textContent='SAVING…';
  byId('save-message').textContent='Saving your changes…';
  byId('save-message').classList.remove('is-success','is-error');
  try {
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user)throw authError||new Error('Please sign in again.');
    const {error}=await supabase.from('operator_profiles').update({display_name:name,profile_public:byId('profile-public').checked}).eq('user_id',user.id);
    if(error)throw error;
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
      if(event==='SIGNED_OUT'){setAuthUI(false);status('');}
      // Avoid querying Supabase inside this synchronous auth callback.
    });
    await refresh();
  } catch(error) {
    setAuthUI(false);
    const message=safeMessage(error);
    status('Could not connect to Personnel. '+message,true);
    // The sign-in button should not appear usable if its SDK never loaded.
    byId('discord-signin').disabled=!supabase;
  }
}
startPersonnel();
