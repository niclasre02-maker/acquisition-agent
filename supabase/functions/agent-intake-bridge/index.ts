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
    .select("discovery_id,status,block_reasons,original_url,job_title,company_name,evaluated_at,production_write_allowed")
    .in("discovery_id",ids);
  if(gateError){
    console.error("AGENT_QUAL_GATE_READ",owner,gateError.code);
    return json({agentKey:owner,error:"QUALIFICATION_GATE_READ_FAILED"},503);
  }
  const gateById=new Map((qualified||[]).map(x=>[String(x.discovery_id),x]));
  let heldForGate=0,blockedByGate=0;
  const items=[];
  for(const x of candidates){
    const qa=gateById.get(String(x.discovery_id));
    const gateFresh=qa && new Date(qa.evaluated_at).getTime()>Date.now()-3*60*60*1000;
    const sourceCovered=qa && qa.original_url===x.url && qa.job_title===x.title && qa.company_name===x.company_name;
    if(!qa || !gateFresh || !sourceCovered){heldForGate++;continue;}
    if(qa.production_write_allowed || qa.status==="BLOCKED" || !String(qa.status).startsWith("REVIEW_")){
      blockedByGate++;continue;
    }
    items.push({
      discoveryId:x.discovery_id,lane:x.lane,company:x.company_name,title:x.title,
      location:x.location,originalUrl:x.url,queueFreshAt:x.queue_fresh_at,
      contractHint:x.contract_hint,sourceCountry:x.source_country,
      qaStatus:qa.status,qaVersion:"QG-1.0",qaReasons:qa.block_reasons,
      productionWriteAllowed:false
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
    heldForGate,blockedByGate,source:"velanio.perm_search_queue"
  });
});
