// No Dice Operations 2.0 — browser-only UI; all rewards and permissions verified by Supabase RPC.
let state;
const $ = id => document.getElementById(id);
const node = (tag, className, value) => {
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(value!==undefined)el.textContent=String(value);
 return el;
};
const tell=(id,message,error=false)=>{
 const el=$(id);if(!el)return;
 el.textContent=message;
 el.classList.toggle('is-error',Boolean(error));
};
const fmt=value=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const fail=error=>error?.message||'The request could not be completed. Please retry.';
const requireData=(response)=>{if(response.error)throw response.error;return response.data||[]};
async function showClaims(){
 try{
  const data=requireData(await state.supabase.from('operations_mission_claims')
   .select('mission_id,period_key,status,created_at').eq('user_id',state.user.id)
   .order('created_at',{ascending:false}).limit(30));
  const root=$('ops2-my-claims');root.replaceChildren();
  if(!data.length){root.append(node('p','','No submissions yet. Choose a mission above and send it for staff review.'));return;}
  for(const claim of data){
   const item=node('div','ops2-submission');
   const tag=node('strong','',claim.status.toUpperCase());
   tag.classList.add('ops2-status-'+claim.status);
   const detail=node('small','',claim.period_key+' · Submitted '+fmt(claim.created_at));
   item.append(tag,detail);root.append(item);
  }
  // Pending submissions remain pending until staff decide; never imply XP was awarded.
  // Match each claim to the current UTC day/week. Older verified weekly
  // submissions must not block a new week's mission.
  const now=new Date();
  const day=now.toISOString().slice(0,10);
  const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const week=monday.toISOString().slice(0,10);
  window.noDiceRefreshMissionState=()=>{
   document.querySelectorAll('[data-claim-mission]').forEach(button=>{
    const cadence=button.closest('[data-mission-id]')?.dataset.missionCadence||'once';
    const period=cadence==='daily'?day:cadence==='weekly'?week:'once';
    const claim=data.find(x=>x.mission_id===button.dataset.claimMission&&x.period_key===period);
    button.disabled=Boolean(claim);
    button.textContent=claim?(claim.status==='approved'?'VERIFIED THIS PERIOD':claim.status==='rejected'?'REVIEWED THIS PERIOD':'PENDING STAFF REVIEW'):'SUBMIT FOR REVIEW ↗';
   });
  };
  window.noDiceRefreshMissionState();
 }catch(error){$('ops2-my-claims').textContent='Submissions unavailable: '+fail(error);}
}
function missionClicks(){
 const root=$('missions-list');
 if(root.dataset.ops2Bound)return;
 root.dataset.ops2Bound='1';
 root.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-claim-mission]');
  if(!btn || btn.disabled)return;
  const mission=btn.closest('[data-mission-id]');
  if(!mission)return;
  const existing=mission.querySelector('.ops2-note-form');
  if(existing){existing.remove();return;}
  const form=node('form','ops2-note-form');
  const label=node('label','','Tell staff what you completed (optional, 500 characters maximum):');
  const textarea=node('textarea');textarea.maxLength=500;textarea.rows=3;
  textarea.placeholder='How did you contribute or participate?';
  const send=node('button','ops2-button ops2-submit-send','SEND FOR VERIFICATION');
  send.type='submit';
  const cancel=node('button','ops2-button ops2-muted','CANCEL');cancel.type='button';
  cancel.addEventListener('click',()=>form.remove());
  label.append(textarea);form.append(label,send,cancel);
  form.addEventListener('submit',async e=>{
   e.preventDefault();send.disabled=true;tell('ops2-claim-status','Submitting your mission…');
   try{
    requireData(await state.supabase.rpc('op2_claim_mission',{p_mission:btn.dataset.claimMission,p_note:textarea.value.trim()}));
    tell('ops2-claim-status','Mission submitted for staff verification. XP is awarded only after approval.');
    btn.disabled=true;btn.textContent='PENDING STAFF REVIEW';form.remove();
    await showClaims();
   }catch(error){tell('ops2-claim-status',fail(error),true);send.disabled=false;}
  });
  mission.append(form);textarea.focus();
 });
}
async function showLeaderboard(period='month'){
 const ranking=$('ops2-ranking');ranking.replaceChildren(node('li','','Loading standings…'));
 document.querySelectorAll('[data-leader-period]').forEach(button=>{
  const active=button.dataset.leaderPeriod===period;
  button.classList.toggle('is-current',active);button.setAttribute('aria-pressed',String(active));
 });
 try{
  const rows=requireData(await state.supabase.rpc('op2_leaderboard',{p_period:period,p_limit:15}));
  ranking.replaceChildren();
  if(!rows.length){ranking.append(node('li','','No opted-in operators have verified XP in this period yet.'));return;}
  rows.forEach(row=>{
   const item=node('li','ops2-leader-row');
   item.append(node('span','ops2-place','#'+row.place_number),
    node('strong','',row.display_name),node('small','',Number(row.earned_xp).toLocaleString()+' XP · LEVEL '+row.level));
   ranking.append(item);
  });
 }catch(error){ranking.replaceChildren(node('li','','Leaderboard unavailable: '+fail(error)));}
}
async function showRewards(){
 try{
  const [catalogue,unlocks]=await Promise.all([
   state.supabase.from('operations_cosmetics').select('id,category,label,min_level,tier').order('min_level'),
   state.supabase.from('operations_cosmetic_unlocks').select('cosmetic_id').eq('user_id',state.user.id)
  ]);
  const rewards=requireData(catalogue),unlocked=new Set(requireData(unlocks).map(x=>x.cosmetic_id));
  const root=$('ops2-rewards');root.replaceChildren();
  const equipped={title:state.profile.equipped_title,frame:state.profile.equipped_frame};
  const level=state.xp===null?null:Math.floor(state.xp/500)+1;
  const equippedTitle=rewards.find(x=>x.id===equipped.title);
  const callsign=$('ops2-callsign-title');
  if(callsign)callsign.textContent=equippedTitle?equippedTitle.label:'VERIFIED OPERATOR';
  const profile=$('operator-dossier');
  profile.dataset.frame=equipped.frame||'default';
  rewards.forEach(reward=>{
   const item=node('div','ops2-reward tier-'+reward.tier);
   const copy=node('div','ops2-reward-copy');
   copy.append(node('strong','',reward.label),
    node('small','',reward.category.toUpperCase()+' · '+reward.tier.toUpperCase()+' · LEVEL '+reward.min_level));
   const action=node('button','ops2-button');
   const owned=unlocked.has(reward.id),active=equipped[reward.category]===reward.id;
   action.textContent=active?'EQUIPPED':owned?'EQUIP':level===null?'XP UNAVAILABLE':level>=reward.min_level?'UNLOCK':'LOCKED';
   action.disabled=active||level===null||(!owned&&level<reward.min_level);
   action.type='button';
   action.addEventListener('click',async()=>{
    action.disabled=true;tell('ops2-reward-status','Updating your reward…');
    try{
     if(!owned){
      requireData(await state.supabase.rpc('op2_my_cosmetic_claim',{p_cosmetic:reward.id}));
     } else {
      requireData(await state.supabase.rpc('op2_equip_cosmetic',{p_category:reward.category,p_cosmetic:reward.id}));
      state.profile[reward.category==='title'?'equipped_title':'equipped_frame']=reward.id;
     }
     tell('ops2-reward-status',owned?'Cosmetic equipped.':'Reward unlocked! Press Equip to display it.');
     await showRewards();
    }catch(error){tell('ops2-reward-status',fail(error),true);action.disabled=false;}
   });
   item.append(copy,action);root.append(item);
  });
 }catch(error){$('ops2-rewards').textContent='Reward vault unavailable: '+fail(error);}
}
async function showCrew(){
 try{
  const rows=requireData(await state.supabase.rpc('op2_crew_progress'));
  const progress=Number(rows[0]?.approved_this_month||0),goal=Number(rows[0]?.crew_goal||10);
  $('ops2-crew-count').firstChild.textContent=progress+' / '+goal+' ';
  $('ops2-crew-fill').style.width=Math.min(100,progress/goal*100)+'%';
 }catch(error){$('ops2-crew-count').textContent='CREW PROGRESS UNAVAILABLE';}
}
async function showChronicle(){
 try{
  const res=await state.supabase.from('operations_xp_events').select('awarded_at')
   .eq('user_id',state.user.id).order('awarded_at',{ascending:false}).limit(500);
  const records=requireData(res);
  const weekStart=date=>{
   const d=new Date(date);d.setUTCHours(0,0,0,0);
   d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
   return d.toISOString().slice(0,10);
  };
  const weeks=new Set(records.map(r=>weekStart(r.awarded_at)));
  const current=new Date();let start=weekStart(current);
  if(!weeks.has(start)){const prev=new Date(start+'T00:00:00Z');prev.setUTCDate(prev.getUTCDate()-7);start=prev.toISOString().slice(0,10);}
  let streak=0,cursor=new Date(start+'T00:00:00Z');
  while(streak<500&&weeks.has(cursor.toISOString().slice(0,10))){streak++;cursor.setUTCDate(cursor.getUTCDate()-7);}
  $('ops2-active-weeks').textContent=String(streak).padStart(2,'0');
 }catch(error){$('ops2-active-weeks').textContent='—';}
}

function bindPublisher(){
 const form=$('ops2-publish-form');
 if(!form || form.dataset.ops2Bound || state.user.app_metadata?.operations_admin!==true)return;
 form.dataset.ops2Bound='1';
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  const data=new FormData(form);
  button.disabled=true;tell('ops2-admin-status','Publishing your new mission…');
  try{
   const expiry=String(data.get('expires')||'');
   const expires=expiry?new Date(expiry).toISOString():null;
   const response=await state.supabase.rpc('op2_admin_publish_mission',{
    p_title:String(data.get('title')||'').trim(),
    p_description:String(data.get('description')||'').trim(),
    p_xp:Number(data.get('xp')),
    p_cadence:String(data.get('cadence')||'event'),
    p_category:String(data.get('category')||'community'),
    p_expires:expires
   });
   requireData(response);
   form.reset();
   tell('ops2-admin-status','Mission published. Reload the page to see it on the Mission Board.');
  }catch(error){tell('ops2-admin-status',fail(error),true);}
  finally{button.disabled=false;}
 });
}
async function showAdmin(){
 const root=$('ops2-admin');if(state.user.app_metadata?.operations_admin!==true)return;
 root.hidden=false;
 try{
  const claims=requireData(await state.supabase.rpc('op2_admin_claims'));
  const queue=$('ops2-review-queue');queue.replaceChildren();
  if(!claims.length){queue.append(node('p','','No submissions awaiting review.'));return;}
  for(const claim of claims){
   const item=node('div','ops2-submission');
   item.append(node('strong','',claim.operator_name+' · '+claim.mission_title),
    node('small','',claim.note||'No submission note provided'));
   const buttons=node('div','ops2-controls');
   for(const approve of [true,false]){
    const button=node('button','ops2-button'+(approve?'':' ops2-muted'),approve?'APPROVE + AWARD XP':'REJECT');
    button.type='button';
    button.addEventListener('click',async()=>{
     if(!window.confirm((approve?'Approve':'Reject')+' this submission?'))return;
     button.disabled=true;
     try{
      requireData(await state.supabase.rpc('op2_admin_review_claim',{p_claim:claim.id,p_approve:approve}));
      tell('ops2-admin-status',approve?'Submission approved; verified XP awarded.':'Submission rejected.');
      await showAdmin();
     }catch(error){tell('ops2-admin-status',fail(error),true);button.disabled=false;}
    });
    buttons.append(button);
   }
   item.append(buttons);queue.append(item);
  }
 }catch(error){tell('ops2-admin-status','Unable to load staff queue: '+fail(error),true);}
}
export async function renderOperations2(input){
 state={...input};
 const title=$('ops2-callsign-title');
 if(title)title.textContent='VERIFIED OPERATOR';
 missionClicks();
 bindPublisher();
 const toggles=document.querySelectorAll('[data-leader-period]');
 toggles.forEach(btn=>{
  if(btn.dataset.ops2Bound)return;
  btn.dataset.ops2Bound='1';
  btn.addEventListener('click',()=>showLeaderboard(btn.dataset.leaderPeriod));
 });
 await Promise.allSettled([showClaims(),showLeaderboard(),showRewards(),showCrew(),showChronicle(),showAdmin()]);
}
