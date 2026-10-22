import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// Read-only bridge for an Apps Script intake worker. No production lead writes.
const SUPABASE_BASE_URL = Deno.env.get("SUPABASE_URL") || "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TOKEN = Deno.env.get("VELANIO_IMPORT_TOKEN") || "";
const admin = createClient(SUPABASE_BASE_URL,KEY,{db:{schema:"velanio"},auth:{persistSession:false}});
const owners:Record<string,string | null> = {
  "PROD-SCOUT-COM":"CONSUMER",
  "PROD-SCOUT-FIN":"FIN",
  "PROD-SCOUT-TECH":"TECH",
  "PROD-MASTER":null,
  "PROD-INTERIM-EXEC":null
};
const json = (v:unknown,status=200) => new Response(JSON.stringify(v), {
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

type LiveResult={check_status:string;checked_provider:string;checked_url:string;http_status:number|null;source_title_match:boolean;reason_code:string};
const liveNo=(status:string,provider:string,checkedUrl:string,reason:string,code:number|null=null):LiveResult=>({
 check_status:status,checked_provider:provider,checked_url:checkedUrl,
 http_status:code,source_title_match:false,reason_code:reason
});
function titleTokens(input:string):string[]{
 return String(input||"").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g,"")
  .replace(/<[^>]*>/g," ").replace(/&[a-z]+;/g," ")
  .replace(/[^a-z0-9]+/g," ").split(/\s+/)
  .filter(x=>x.length>=3 && !["und","the","for","with","eine","einer","mwd","full","time","vollzeit","hybrid","office","germany","deutschland","permanent","employee","festanstellung","senior"].includes(x)).slice(0,9);
}
function hasTitleEvidence(queueTitle:string,providerText:string){
 const tokens=titleTokens(queueTitle),body=titleTokens(providerText);
 if(tokens.length<2||body.length<2)return false;
 const used=new Set(body);
 const first=tokens.slice(0,Math.min(tokens.length,5));
 const hits=first.filter(x=>used.has(x)).length;
 return hits>=Math.min(3,first.length) && hits/first.length>=0.7;
}
async function checkOfficialAd(originalUrl:string,expectedTitle:string):Promise<LiveResult>{
 let u:URL;try{u=new URL(originalUrl);}catch{return liveNo("NOT_VERIFIABLE","unknown","","INVALID_URL");}
 if(u.protocol!=="https:"||u.username||u.password)return liveNo("NOT_VERIFIABLE","unknown","","NON_HTTPS_OR_USERINFO");
 const host=u.hostname.toLowerCase(),segs=u.pathname.split("/").filter(Boolean);
 let provider="",apiUrl="";
 if((host==="job-boards.eu.greenhouse.io"||host==="job-boards.greenhouse.io"||host==="boards.greenhouse.io")
  && segs.length>=3 && segs[1]==="jobs" && /^\d{7,}$/.test(segs[2])){
   provider="greenhouse";apiUrl="https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(segs[0])+"/jobs/"+encodeURIComponent(segs[2]);
 }else if(host==="jobs.smartrecruiters.com" && segs.length>=2 && /^\d{9,}$/.test(segs[1])){
   provider="smartrecruiters";apiUrl="https://api.smartrecruiters.com/v1/companies/"+encodeURIComponent(segs[0])+"/postings/"+encodeURIComponent(segs[1]);
 }else if(/^[a-z0-9-]+\.jobs\.personio\.(?:de|com)$/.test(host) && segs.length>=2 && segs[0]==="job" && /^\d{6,}$/.test(segs[1])){
   provider="personio";apiUrl=originalUrl;
 }else if(host==="jobs.lever.co" && segs.length>=2 && /^[0-9a-f-]{16,36}$/i.test(segs[1])){
   provider="lever";apiUrl=originalUrl;
 }else{
   return liveNo("NOT_VERIFIABLE","unsupported","","PROVIDER_NOT_SUPPORTED");
 }
 try{
   const res=await fetch(apiUrl,{method:"GET",redirect:"manual",
    headers:{"accept":provider==="personio"||provider==="lever"?"text/html,application/xhtml+xml":"application/json"},
    signal:AbortSignal.timeout(6000)});
   if(res.status>=300 && res.status<400)return liveNo("LIVE_URL_REDIRECT",provider,apiUrl,"REDIRECT_NEEDS_REVIEW",res.status);
   if(res.status===404||res.status===410)return liveNo("LIVE_NOT_FOUND",provider,apiUrl,"OFFICIAL_SOURCE_NOT_FOUND",res.status);
   if(!res.ok)return liveNo("NOT_VERIFIABLE",provider,apiUrl,"HTTP_NOT_OK",res.status);
   const body=(await res.text()).slice(0,650000);
   if(provider==="greenhouse"||provider==="smartrecruiters"){
     let payload:any;try{payload=JSON.parse(body);}catch{return liveNo("NOT_VERIFIABLE",provider,apiUrl,"INVALID_API_RESPONSE",res.status);}
     const publicTitle=String(payload?.title||payload?.name||"");
     const canonicalPostingId=String(payload?.id||"");
     const requestedId=apiUrl.split("/").pop()||"";
     const titleMatch=hasTitleEvidence(expectedTitle,publicTitle);
     const idMatch=canonicalPostingId===requestedId;
     return {check_status:titleMatch&&idMatch?"LIVE_CONFIRMED":"TITLE_MISMATCH",
       checked_provider:provider,checked_url:apiUrl,http_status:res.status,
       source_title_match:titleMatch,reason_code:!idMatch?"ATS_ID_NOT_CONFIRMED":titleMatch?"OFFICIAL_ACTIVE_POSTING":"OFFICIAL_TITLE_NOT_MATCHED"};
   }
   // HTML rendered ATS pages are never promoted on HTTP 200 alone. Require title tokens in HTML.
   const titleMatch=hasTitleEvidence(expectedTitle,body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," "));
   return {check_status:"NOT_VERIFIABLE",
      checked_provider:provider,checked_url:apiUrl,http_status:res.status,
      source_title_match:titleMatch,reason_code:titleMatch?"HTML_TITLE_PRESENT_APPLICATION_NOT_CONFIRMED":"PAGE_SHELL_OR_TITLE_MISSING"};
 }catch(e){
  return liveNo("FETCH_ERROR",provider,apiUrl,e instanceof Error&&e.name==="TimeoutError"?"TIMEOUT":"FETCH_FAILED");
 }
}
async function getOrCheckLive(discoveryId:string,originalUrl:string,title:string):Promise<LiveResult>{
 const {data:old}=await admin.schema("velanio").from("agent_original_livecheck_v1")
  .select("check_status,checked_provider,checked_url,http_status,source_title_match,reason_code,checked_at,original_url")
  .eq("discovery_id",discoveryId).maybeSingle();
 if(old && old.original_url===originalUrl && old.reason_code!=="INVALID_URL" && Date.now()-new Date(old.checked_at).getTime()<6*3600000){
  return {check_status:old.check_status,checked_provider:old.checked_provider,
   checked_url:old.checked_url,http_status:old.http_status,
   source_title_match:old.source_title_match,reason_code:old.reason_code};
 }
 const evidence=await checkOfficialAd(originalUrl,title);
 const {error}=await admin.schema("velanio").from("agent_original_livecheck_v1").upsert({
  discovery_id:discoveryId,original_url:originalUrl,check_status:evidence.check_status,
  checked_at:new Date().toISOString(),checked_provider:evidence.checked_provider,
  checked_url:evidence.checked_url,http_status:evidence.http_status,
  source_title_match:evidence.source_title_match,reason_code:evidence.reason_code,
  check_version:"LIVE-1.0"
 },{onConflict:"discovery_id"});
 if(error){
  console.error("LIVE_CHECK_STORE",error.code);
  return liveNo("NOT_VERIFIABLE",evidence.checked_provider,evidence.checked_url,"CHECK_NOT_PERSISTED");
 }
 return evidence;
}

Deno.serve(async (req:Request) => {
  if (req.method!=="POST") return json({error:"METHOD_NOT_ALLOWED"},405);
  if (!TOKEN || !KEY || !SUPABASE_BASE_URL) return json({error:"WORKER_NOT_CONFIGURED"},503);
  if ((req.headers.get("x-velanio-token")||"")!==TOKEN) return json({error:"UNAUTHORIZED"},401);
  let input:any;
  try { input=await req.json(); } catch { return json({error:"BAD_JSON"},400); }

  if (input?.action==="pull_promotable") {
    // Fully separate from the read-only REVIEW intake. No production writes happen here.
    const reqLimit=Math.max(1,Math.min(12,Number(input?.limit)||8));
    const {data,error}=await admin.schema("velanio").from("agent_stage0_publish_ready_v1")
      .select("discovery_id,owner_agent,lane,company_name,title,location,company_industry,company_sector,seniority,contract_hint,source_country,classified_geo,raw_score,original_url,ats,source_id,description,first_seen_at,queue_fresh_at,qualification_status,ownership_status,proposed_owner_agent,live_status,checked_provider,checked_at,publish_scope")
      .order("raw_score",{ascending:false}).limit(40);
    if(error){console.error("PROMOTABLE_VIEW_READ",error.code);return json({error:"PUBLISH_GATE_READ_FAILED"},503);}
    const ids=(data||[]).map(x=>x.discovery_id);
    let already=new Set<string>();
    if(ids.length){
      const {data:seen,error:seenErr}=await admin.schema("velanio").from("agent_stage0_publish_receipts_v1")
        .select("discovery_id").in("discovery_id",ids);
      if(seenErr){console.error("PUBLISH_RECEIPT_READ",seenErr.code);return json({error:"PUBLISH_RECEIPT_READ_FAILED"},503);}
      already=new Set((seen||[]).map(x=>String(x.discovery_id)));
    }
    const docs=(data||[]).filter(x=>!already.has(String(x.discovery_id))).slice(0,reqLimit).map(x=>({
      discoveryId:x.discovery_id,agentKey:owners["PROD-SCOUT-"+(x.owner_agent==="CONSUMER"?"COM":x.owner_agent)]?"PROD-SCOUT-"+(x.owner_agent==="CONSUMER"?"COM":x.owner_agent):x.proposed_owner_agent,
      lane:x.lane,company:x.company_name,title:x.title,location:x.location,
      industry:x.company_industry||x.company_sector||"",
      seniority:x.seniority,contractHint:x.contract_hint,
      originalUrl:x.original_url,description:String(x.description||"").slice(0,7000),
      firstSeenAt:x.first_seen_at,rawScore:x.raw_score,
      liveCheckedAt:x.checked_at,provider:x.checked_provider,
      qaStatus:x.qualification_status,ownershipStatus:x.ownership_status,
      publishingScope:"STAGE0_ONLY",outreachAllowed:false
    }));
    return json({status:"READY_STAGE0_ONLY",items:docs,produced:docs.length,
      candidatesOnGate:(data||[]).length,qualifiedLeads:0,
      notes:"Sheet worker must exact-dedupe, write Fach/20/14, verify readback, then report receipt. Outreach requires internal approval."});
  }
  if(input?.action==="ack_promotion"){
    const row=input?.receipt||{};
    const discoveryId=String(row.discoveryId||"");
    const dedupeKey=String(row.dedupeKey||"");
    const opportunityId=String(row.opportunityId||"");
    const signalId=String(row.signalId||"");
    const sourceTab=String(row.sourceTab||"");
    const tabs=new Set(["03 Finance","04 Financial Services","05 Life Sciences","06 IT & Digital",
      "07 DEAT Sales & Marketing – Consumer Goods & Handel","08 Engineering","10 HR & People","11 Legal"]);
    if(!/^sd-[a-z0-9]{30,65}$/.test(discoveryId) ||
       !/^[a-z0-9|_-]{12,150}$/.test(dedupeKey) ||
       !/^DEAT-OPP-AUTO-[a-f0-9]{20}$/.test(opportunityId) ||
       !/^SIG-AUTO-[a-f0-9]{20}$/.test(signalId) || !tabs.has(sourceTab)){
      return json({error:"INVALID_RECEIPT"},400);
    }
    const {data:eligible,error:checkErr}=await admin.schema("velanio")
      .from("agent_stage0_publish_ready_v1").select("discovery_id,lane")
      .eq("discovery_id",discoveryId).maybeSingle();
    if(checkErr)return json({error:"ELIGIBILITY_RECHECK_FAILED"},503);
    if(!eligible)return json({error:"NO_LONGER_PUBLISHABLE"},409);
    const ownerToTab:Record<string,string>={"Finance":"03 Finance","Financial Services":"04 Financial Services",
      "Legal":"11 Legal","Life Sciences":"05 Life Sciences","IT & Digital":"06 IT & Digital",
      "Engineering":"08 Engineering","HR & People":"10 HR & People",
      "Sales & Marketing":"07 DEAT Sales & Marketing – Consumer Goods & Handel"};
    if(ownerToTab[eligible.lane]!==sourceTab)return json({error:"SOURCE_TAB_WRONG"},409);
    const {data:old,error:oldErr}=await admin.schema("velanio")
      .from("agent_stage0_publish_receipts_v1")
      .select("dedupe_key,opportunity_id,signal_id,source_tab").eq("discovery_id",discoveryId).maybeSingle();
    if(oldErr)return json({error:"RECEIPT_PRECHECK_FAILED"},503);
    if(old && (old.dedupe_key!==dedupeKey || old.opportunity_id!==opportunityId ||
      old.signal_id!==signalId || old.source_tab!==sourceTab))return json({error:"RECEIPT_CONFLICT"},409);
    const {error:ackErr}=await admin.schema("velanio").from("agent_stage0_publish_receipts_v1")
      .upsert({discovery_id:discoveryId,dedupe_key:dedupeKey,
        opportunity_id:opportunityId,signal_id:signalId,source_tab:sourceTab,
        stage:"SHEET_PUBLISHED_PENDING_SYNC",reported_at:new Date().toISOString()},
        {onConflict:"discovery_id"});
    if(ackErr){console.error("PUBLISH_RECEIPT_WRITE",ackErr.code);return json({error:"RECEIPT_WRITE_FAILED"},503);}
    return json({status:"SHEET_PUBLISHED_PENDING_SYNC",discoveryId,sourceTab});
  }

  if (input?.action!=="pull") return json({error:"ACTION_NOT_SUPPORTED"},400);
  const owner=String(input?.agentKey||"");
  if (!Object.hasOwn(owners,owner)) return json({error:"INVALID_AGENT_KEY"},400);
  const queryOwner=owners[owner];
  if (!queryOwner) return json({agentKey:owner,status:"NO_AUTONOMOUS_SOURCE",items:[],qualifiedLeads:0});
  const limit=Math.max(1,Math.min(15,Number(input?.limit)||10));
  const after=new Date(Date.now()-3*60*60*1000).toISOString();

  // Fail closed: intake only after the independent SQL quality gate has processed each discovery.
  // Source rows never become productive leads through this endpoint.
  const {data,error}=await admin.schema("velanio").from("perm_search_queue")
    .select("discovery_id,lane,company_name,title,location,url,queue_fresh_at,contract_hint,source_country")
    .eq("owner_agent",queryOwner).eq("prefilter_relevant",true)
    .gte("queue_fresh_at",after).order("queue_fresh_at",{ascending:false}).limit(100);
  if (error) {
    console.error("AGENT_INTAKE_PULL",owner,error.code);
    return json({agentKey:owner,error:"QUEUE_READ_FAILED"},503);
  }
  const candidates=(data||[]).filter(x=>typeof x.url==="string" && /^https:\/\//i.test(x.url));
  if (!candidates.length) return json({
    agentKey:owner,status:"INTAKE_ONLY",items:[],
    qualifiedLeads:0,heldForGate:0,blockedByGate:0,source:"velanio.perm_search_queue"
  });
  const ids=[...new Set(candidates.map(x=>x.discovery_id))];
  const {data:qualified,error:gateError}=await admin.schema("velanio").from("agent_candidate_review_readonly_v1")
    .select("discovery_id,status,block_reasons,original_url,job_title,company_name,evaluated_at,production_write_allowed,ownership_status,proposed_owner_agent,ownership_checked_at,account_route_block")
    .in("discovery_id",ids);
  if(gateError){
    console.error("AGENT_QUAL_GATE_READ",owner,gateError.code);
    return json({agentKey:owner,error:"QUALIFICATION_GATE_READ_FAILED"},503);
  }
  const gateById=new Map((qualified||[]).map(x=>[String(x.discovery_id),x]));
  let heldForGate=0,blockedByGate=0,heldForOwnership=0,divertedMaster=0;
  const items=[];
  for(const x of candidates){
    const qa=gateById.get(String(x.discovery_id));
    const gateFresh=qa && new Date(qa.evaluated_at).getTime()>Date.now()-3*60*60*1000;
    const sourceCovered=qa && qa.original_url===x.url && qa.job_title===x.title && qa.company_name===x.company_name;
    if(!qa || !gateFresh || !sourceCovered){heldForGate++;continue;}
    if(qa.production_write_allowed || qa.status==="BLOCKED" || !String(qa.status).startsWith("REVIEW_")){
      blockedByGate++;continue;
    }
    // Every candidate needs a current account ownership check before it reaches REVIEW.
    if(!qa.ownership_status || !qa.ownership_checked_at ||
       Date.now()-new Date(qa.ownership_checked_at).getTime()>3*60*60*1000){
      heldForOwnership++;continue;
    }
    // MASTER-only target accounts and excluded targets must never enter a perm scout's intake.
    if(qa.ownership_status==="MASTER_EXACT_TARGET"){
      divertedMaster++;continue;
    }
    if(qa.ownership_status==="TARGET_LIST_EXCLUDED_HOLD" ||
       qa.ownership_status==="TARGET_LIST_CONFLICT_HOLD"){
      heldForOwnership++;continue;
    }
    const ownershipNeedsReview=qa.ownership_status!=="NO_EXACT_TARGET_MATCH_REVIEW";
    if(!ownershipNeedsReview && qa.proposed_owner_agent!==owner){
      heldForOwnership++;continue;
    }
    items.push({
      discoveryId:x.discovery_id,lane:x.lane,company:x.company_name,title:x.title,
      location:x.location,originalUrl:x.url,queueFreshAt:x.queue_fresh_at,
      contractHint:x.contract_hint,sourceCountry:x.source_country,
      qaStatus:ownershipNeedsReview?"REVIEW_OWNERSHIP_HOLD":qa.status,
      qaVersion:"QG-1.0",qaReasons:qa.block_reasons,
      ownershipStatus:qa.ownership_status,proposedOwnerAgent:qa.proposed_owner_agent||"",
      accountRouteBlock:true,productionWriteAllowed:false
    });
    if(items.length>=limit)break;
  }
  // Live evidence is stored separately and cannot authorize an opportunity write.
  const auditedItems=await Promise.all(items.map(async x=>{
    const live=await getOrCheckLive(String(x.discoveryId),String(x.originalUrl),String(x.title));
    return {...x,liveCheckStatus:live.check_status,liveCheckReason:live.reason_code,
      liveCheckSource:live.checked_url,productionWriteAllowed:false};
  }));
  return json({
    agentKey:owner,status:"INTAKE_ONLY",items:auditedItems,qualifiedLeads:0,
    heldForGate,blockedByGate,heldForOwnership,divertedMaster,source:"velanio.perm_search_queue"
  });
});
