/**
 * Velanio Stage-0 Auto Publisher — isolated Apps Script module.
 * Adds ONLY quality-gated leads to Fach, 20 Zentrale Signalquelle and 14 Deal Engine.
 * Does not change syncVelanio, never writes contacts, never authorizes outreach.
 *
 * One-time setup inside existing Velanio Apps Script project:
 *   1. Paste as a NEW file named VelanioAutoPublish.gs.
 *   2. Execute velanioAutoPublishInstall() once. Existing worker token is reused.
 * No secret is stored in the source code, sheets, or response.
 */
var VA_PUBLISH = {
  spreadsheetId: "10n-vWPuJMUv-TkmjjxupiBKoIgrobfDED1xKWQC0DsA",
  apiUrl: "https://sshyfweyoisankseujpc.supabase.co/functions/v1/agent-intake-bridge",
  timezone: "Europe/Berlin",
  healthTab: "31 Worker Health – PILOT",
  centralTab: "20 Zentrale Signalquelle",
  dealTab: "14 Deal Engine – Opportunities",
  maxPerRun: 8,
  lanes: {
    "Finance":"03 Finance",
    "Financial Services":"04 Financial Services",
    "Legal":"11 Legal",
    "Life Sciences":"05 Life Sciences",
    "IT & Digital":"06 IT & Digital",
    "Engineering":"08 Engineering",
    "HR & People":"10 HR & People",
    "Sales & Marketing":"07 DEAT Sales & Marketing – Consumer Goods & Handel"
  },
  sourceTabs: [
    "01 Interim B2B","02 Befristet Interim","03 Finance","04 Financial Services",
    "05 Life Sciences","06 IT & Digital","07 DEAT Sales & Marketing – Consumer Goods & Handel",
    "08 Engineering","10 HR & People","11 Legal"
  ]
};
function velanioAutoPublishInstall() {
  var token=vaToken_();
  if(!token) throw new Error("AGENT_WORKER_TOKEN oder VELANIO_IMPORT_TOKEN fehlt in Script Properties.");
  var ss=SpreadsheetApp.openById(VA_PUBLISH.spreadsheetId);
  vaHealth_(ss); // Verify existing health tab and header. No write to sync code.
  var preflight=vaPost_(token,{action:"pull_promotable",limit:1});
  if(preflight.status!=="READY_STAGE0_ONLY" || !Array.isArray(preflight.items))
    throw new Error("AUTO_PUBLISH_PREFLIGHT_FAILED");
  var triggers=ScriptApp.getProjectTriggers().filter(function(t){
    return t.getHandlerFunction()==="velanioAutoPublishRun";
  });
  if(triggers.length===0)
    ScriptApp.newTrigger("velanioAutoPublishRun").timeBased().everyHours(1).create();
  return "AUTO_PUBLISH_READY: eigener stündlicher Stage-0-Trigger, keine CRM-/Outreach-Freigabe.";
}
function velanioAutoPublishDryRun() {
  var token=vaToken_();
  var payload=vaPost_(token,{action:"pull_promotable",limit:VA_PUBLISH.maxPerRun});
  if(payload.status!=="READY_STAGE0_ONLY")throw new Error("AUTO_PUBLISH_PREFLIGHT_FAILED");
  return "AUTO_PUBLISH_DRYRUN ready="+payload.items.length+
    " candidatesOnGate="+payload.candidatesOnGate+
    "; ZERO Sheet Writes; nicht mit qualifizierten Mandaten gleichzusetzen.";
}

function velanioAutoPublishRun() {
  var started=new Date();
  var runId="AUTO-"+Utilities.formatDate(started,VA_PUBLISH.timezone,"yyyyMMdd-HHmmss");
  var logs=[], created=0, failed=0, pending=0;
  // Read-only API check happens before the shared script lock. Otherwise other
  // Velanio workers may silently prevent both telemetry and polling.
  var token=vaToken_();
  var ss=SpreadsheetApp.openById(VA_PUBLISH.spreadsheetId);
  var health=vaHealth_(ss);
  var preview=vaPost_(token,{action:"pull_promotable",limit:VA_PUBLISH.maxPerRun});
  if(preview.status!=="READY_STAGE0_ONLY" || !Array.isArray(preview.items))
    throw new Error("UNEXPECTED_PUBLISH_API_RESPONSE");
  if(preview.items.length===0) {
    health.appendRow([runId,"PROD-AUTO-PUBLISH",vaStamp_(started),vaStamp_(new Date()),
      "NO_READY_CANDIDATES",0,0,0,0,"",
      "Keine neuen, durch Originalanzeige und Fachfilter freigegebenen Stellen. Keine Writes."]);
    console.log("AUTO_NO_READY: API OK; HEALTH_LOGGED; "+runId);
    return "AUTO_NO_READY "+runId+" HEALTH_LOGGED";
  }
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(60000)) {
    health.appendRow([runId,"PROD-AUTO-PUBLISH",vaStamp_(started),vaStamp_(new Date()),
      "LOCK_BUSY_RETRY",preview.items.length,0,0,0,"SCRIPT_LOCK_BUSY",
      "Andere Velanio-Funktion hält die gemeinsame Schreibsperre; nächster Lauf versucht erneut."]);
    console.warn("AUTO_LOCK_BUSY_RETRY "+runId);
    return "AUTO_LOCK_BUSY_RETRY "+runId;
  }
  try {
    // Recheck the live eligibility gate while holding the write lock.
    var api=vaPost_(token,{action:"pull_promotable",limit:VA_PUBLISH.maxPerRun});
    if(api.status!=="READY_STAGE0_ONLY" || !Array.isArray(api.items))
      throw new Error("UNEXPECTED_PUBLISH_API_RESPONSE");
    var seenUrls=vaKnownUrls_(ss);
    if(!api.items.length){
      logs.push([runId,"PROD-AUTO-PUBLISH",vaStamp_(started),vaStamp_(new Date()),
        "NO_READY_CANDIDATES",0,0,0,0,"",
        "Qualitätsfilter: derzeit keine NEUEN freigegebenen Stage-0-Kandidaten. Kein Write."]);
    }
    api.items.forEach(function(doc){
      var ts=vaStamp_(new Date());
      try {
        vaValidate_(doc);
        var tab=VA_PUBLISH.lanes[doc.lane];
        var ids=vaIds_(doc);
        var hasSource=vaExistingKey_(vaSheet_(ss,tab),1,ids.key);
        var hasCentral=vaExistingKey_(vaSheet_(ss,VA_PUBLISH.centralTab),1,ids.signalId);
        var hasDeal=vaExistingKey_(vaSheet_(ss,VA_PUBLISH.dealTab),1,ids.oppId);
        // Another vacancy already owns this original URL: no second opportunity.
        if(seenUrls.has(vaCanon_(doc.originalUrl)) && !hasSource){
          logs.push([runId,doc.agentKey,ts,vaStamp_(new Date()),
            "DUPLICATE_SOURCE_HOLD",1,0,1,0,"",
            vaCell_(doc.company+" / "+doc.title+" already has original URL in Fach. No write.")]);
          return;
        }
        if(hasSource || hasCentral || hasDeal){
          // Partial earlier run? Reconcile the three deterministic IDs; never append duplicates.
          vaVerifyMatching_(ss,tab,ids,doc,hasSource,hasCentral,hasDeal);
        }
        var added=0;
        added+=vaWriteIfAbsent_(ss,tab,ids.key,vaSource_(doc,ids),"Dedupe Key",doc);
        seenUrls.add(vaCanon_(doc.originalUrl));
        added+=vaWriteIfAbsent_(ss,VA_PUBLISH.centralTab,ids.signalId,
          vaSignal_(doc,ids),"Signal ID",doc);
        added+=vaWriteIfAbsent_(ss,VA_PUBLISH.dealTab,ids.oppId,
          vaDeal_(doc,ids),"Opportunity ID",doc);
        vaVerifyAll_(ss,tab,ids,doc);
        // Receipt sent only after Fach + 20 + 14 exact-key and original-url readback.
        var ack=vaPost_(token,{action:"ack_promotion",receipt:{
          discoveryId:doc.discoveryId,dedupeKey:ids.key,
          opportunityId:ids.oppId,signalId:ids.signalId,sourceTab:tab
        }});
        if(ack.status!=="SHEET_PUBLISHED_PENDING_SYNC")throw new Error("ACK_NOT_CONFIRMED");
        created+=added;pending++;
        logs.push([runId,doc.agentKey,ts,vaStamp_(new Date()),
          "SHEET_PUBLISHED_PENDING_SYNC",1,added,0,added===0?1:0,"",
          "Fach + 20 + 14 geprüft; Velanio-Sync folgt regulär, kein Outreach. "+ids.oppId]);
      } catch(e) {
        failed++;
        logs.push([runId,String(doc.agentKey||"PROD-AUTO-PUBLISH"),ts,vaStamp_(new Date()),
          "PUBLISH_HOLD",1,0,0,0,vaCell_(String(e&&e.message||e)).slice(0,170),
          "Keine Ansprache; eventuell unvollständige Sheet-Zeilen werden beim nächsten Lauf anhand Keys fortgesetzt."]);
      }
    });
    vaWriteHealth_(health,logs);
    return "AUTO_PUBLISH "+runId+" STAGE_ROWS="+created+
      " PENDING_SYNC="+pending+" FAILED="+failed;
  } finally {lock.releaseLock();}
}
function vaToken_() {
  var p=PropertiesService.getScriptProperties();
  var t=p.getProperty("AGENT_WORKER_TOKEN")||p.getProperty("VELANIO_IMPORT_TOKEN");
  if(!t)throw new Error("WORKER_TOKEN_MISSING");
  return t;
}
function vaPost_(token,body) {
  var res=UrlFetchApp.fetch(VA_PUBLISH.apiUrl,{
    method:"post",contentType:"application/json",
    headers:{"x-velanio-token":token},
    payload:JSON.stringify(body),followRedirects:true,muteHttpExceptions:true
  });
  if(res.getResponseCode()!==200)
    throw new Error("PROMOTION_API_HTTP_"+res.getResponseCode()+": "+res.getContentText().slice(0,150));
  return JSON.parse(res.getContentText());
}
function vaStamp_(d){return Utilities.formatDate(d,VA_PUBLISH.timezone,"yyyy-MM-dd HH:mm:ss");}
function vaToday_(){return Utilities.formatDate(new Date(),VA_PUBLISH.timezone,"yyyy-MM-dd");}
function vaCell_(v){
  var s=String(v==null?"":v).slice(0,1000);
  return /^[=+@-]/.test(s)?"'"+s:s;
}
function vaCanon_(v){
  return String(v||"").trim().split(/[?#]/)[0].replace(/\/$/,"").toLowerCase();
}
function vaSlug_(v,n){
  return String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/ß/g,"ss").replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"").slice(0,n).replace(/-+$/,"");
}
function vaIds_(doc){
  var m=String(doc.originalUrl).match(/\/(?:jobs\/)?([0-9]{7,})(?:[/?#-]|$)/);
  if(!m)throw new Error("ATS_ID_NOT_EXTRACTABLE");
  var atsId=m[1];
  var url=vaCanon_(doc.originalUrl);
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,url);
  var hex=bytes.map(function(b){return ("0"+((b+256)%256).toString(16)).slice(-2);}).join("").slice(0,20);
  var city=String(doc.location||"").split(",")[0].split(";")[0];
  var key=vaSlug_(doc.company,26)+"|"+vaSlug_(doc.title,38)+"|"+vaSlug_(city,20)+"|"+atsId;
  if(key.length>150||!key||key.indexOf("||")>=0)throw new Error("BAD_DEDUPE_KEY");
  return {key:key,signalKey:key+"|hiring",signalId:"SIG-AUTO-"+hex,oppId:"DEAT-OPP-AUTO-"+hex,atsId:atsId};
}
function vaValidate_(d){
  if(!d||d.publishingScope!=="STAGE0_ONLY"||d.outreachAllowed!==false
      ||d.qaStatus!=="REVIEW_LIVE_AD_AND_ACCOUNT_OWNERSHIP"
      ||d.ownershipStatus!=="NO_EXACT_TARGET_MATCH_REVIEW")
    throw new Error("NOT_APPROVED_FOR_STAGE0");
  if(!VA_PUBLISH.lanes[d.lane]||!/^https:\/\//.test(String(d.originalUrl||"")))
    throw new Error("SOURCE_OR_LANE_INVALID");
  if(!/^(greenhouse|smartrecruiters|personio)$/.test(String(d.provider||"")))
    throw new Error("OFFICIAL_ATS_NOT_CONFIRMED");
  if(!/^sd-[a-z0-9]{30,65}$/.test(String(d.discoveryId||"")))
    throw new Error("BAD_DISCOVERY_ID");
  if(!String(d.company||"").trim()||!String(d.title||"").trim())
    throw new Error("EMPLOYER_OR_TITLE_MISSING");
  if(/[\/|]/.test(String(d.company||"")))throw new Error("COMPOSITE_ACCOUNT_HOLD");
  if(new Date(d.liveCheckedAt).getTime()<Date.now()-12*3600000)
    throw new Error("LIVE_CHECK_STALE");
}
function vaSheet_(ss,name){var s=ss.getSheetByName(name);if(!s)throw new Error("SHEET_MISSING_"+name);return s;}
function vaHealth_(ss) {
 var s=vaSheet_(ss,VA_PUBLISH.healthTab);
 var h=s.getRange(1,1,1,11).getDisplayValues()[0];
 if(h[0]!=="Run ID"||h[1]!=="Agent"||h[4]!=="Status"||h[9]!=="Fehler")
   throw new Error("WORKER_HEALTH_HEADER_CHANGED");
 return s;
}
function vaKnownUrls_(ss){
 var set=new Set();
 VA_PUBLISH.sourceTabs.forEach(function(name){
  var s=ss.getSheetByName(name);if(!s)return;
  var n=s.getLastRow()-1;if(n<1)return;
  var h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0];
  var pos=h.indexOf("Original- / ATS-Link")+1;
  if(!pos)return;
  var data=s.getRange(2,pos,n,1).getDisplayValues();
  data.forEach(function(row){if(/^https:\/\//i.test(row[0]))set.add(vaCanon_(row[0]));});
 });
 return set;
}
function vaExistingKey_(sheet,col,key){
 var n=sheet.getLastRow()-1;if(n<1)return 0;
 var v=sheet.getRange(2,col,n,1).getDisplayValues();
 for(var i=0;i<v.length;i++)if(v[i][0]===key)return i+2;
 return 0;
}
function vaRecoverPartialSource_(ss,name,row,ids,doc){
 var sheet=vaSheet_(ss,name);
 var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
 var values=sheet.getRange(row,1,1,headers.length).getDisplayValues()[0];
 var keyCol=headers.indexOf("Dedupe Key"),urlCol=headers.indexOf("Original- / ATS-Link");
 if(keyCol!==0||urlCol<0)throw new Error("SOURCE_HEADERS_CHANGED_"+name);
 if(values[0]!==ids.key||values[1]!==doc.company||values[2]!==doc.title||
    values[3]!==doc.lane)throw new Error("SOURCE_PARTIAL_IDENTITY_CONFLICT_"+name);
 if(vaCanon_(values[urlCol])===vaCanon_(doc.originalUrl))return;
 // The legacy script could leave only A:F written before failing on
 // the strict G (Einstufung) dropdown. Repair exactly this known case.
 if(values[urlCol]||values.slice(6).some(function(v){return String(v||"").trim()!=="";}))
   throw new Error("SOURCE_EXISTING_ROW_CONFLICT_"+name);
 var data=vaSource_(doc,ids);
 var mapped=headers.map(function(h){
   return Object.prototype.hasOwnProperty.call(data,h)?vaCell_(data[h]):"";
 });
 if(mapped[0]!==ids.key||mapped[1]!==doc.company||mapped[2]!==doc.title)
   throw new Error("SOURCE_REPAIR_MAPPING_CHANGED_"+name);
 sheet.getRange(row,7,1,headers.length-6).setValues([mapped.slice(6)]);
 SpreadsheetApp.flush();
 vaVerifyRow_(sheet,row,"Dedupe Key",ids.key,"Original- / ATS-Link",doc.originalUrl);
}
function vaVerifyMatching_(ss,tab,ids,doc,existingSource,existingCentral,existingDeal){
 if(existingSource)vaRecoverPartialSource_(ss,tab,existingSource,ids,doc);
 if(existingCentral)vaVerifyRow_(vaSheet_(ss,VA_PUBLISH.centralTab),existingCentral,
    "Signal ID",ids.signalId,"Source URL",doc.originalUrl);
 if(existingDeal)vaVerifyRow_(vaSheet_(ss,VA_PUBLISH.dealTab),existingDeal,
    "Opportunity ID",ids.oppId,"Live Check URL",doc.originalUrl);
}
function vaVerifyRow_(sheet,row,keyColumn,key,urlColumn,url){
 var h=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
 var k=h.indexOf(keyColumn)+1,u=h.indexOf(urlColumn)+1;
 if(!k||!u)throw new Error("MISSING_REQUIRED_COLUMN_"+sheet.getName());
 var gotKey=sheet.getRange(row,k).getDisplayValue();
 var gotUrl=sheet.getRange(row,u).getDisplayValue();
 if(gotKey!==key||vaCanon_(gotUrl)!==vaCanon_(url))
  throw new Error("EXISTING_KEY_URL_CONFLICT_"+sheet.getName());
}
function vaWriteIfAbsent_(ss,name,key,obj,keyCol,doc){
 var sheet=vaSheet_(ss,name),header=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
 var k=header.indexOf(keyCol)+1;if(!k)throw new Error("KEY_HEADER_CHANGED_"+name);
 var row=vaExistingKey_(sheet,k,key);
 var urlHeader=name===VA_PUBLISH.centralTab?"Source URL":
   name===VA_PUBLISH.dealTab?"Live Check URL":"Original- / ATS-Link";
 if(!header.includes(urlHeader))throw new Error("URL_HEADER_CHANGED_"+name);
 var values=header.map(function(h){
  return Object.prototype.hasOwnProperty.call(obj,h)?vaCell_(obj[h]):"";
 });
 if(row){
  if(keyCol==="Dedupe Key")vaRecoverPartialSource_(ss,name,row,{key:key},doc);
  else vaVerifyRow_(sheet,row,keyCol,key,urlHeader,doc.originalUrl);
  return 0;
 }
 var dest=sheet.getLastRow()+1;
 if(dest>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(30,dest-sheet.getMaxRows()));
 sheet.getRange(dest,1,1,header.length).setValues([values]);
 SpreadsheetApp.flush();
 vaVerifyRow_(sheet,dest,keyCol,key,urlHeader,doc.originalUrl);
 return 1;
}
function vaVerifyAll_(ss,tab,ids,doc){
 var pairs=[
  {n:tab,k:"Dedupe Key",v:ids.key,u:"Original- / ATS-Link"},
  {n:VA_PUBLISH.centralTab,k:"Signal ID",v:ids.signalId,u:"Source URL"},
  {n:VA_PUBLISH.dealTab,k:"Opportunity ID",v:ids.oppId,u:"Live Check URL"}
 ];
 pairs.forEach(function(p){
  var s=vaSheet_(ss,p.n);
  var heads=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0];
  var keyCol=heads.indexOf(p.k)+1;
  var row=vaExistingKey_(s,keyCol,p.v);
  if(!row)throw new Error("READBACK_MISSING_"+p.n);
  vaVerifyRow_(s,row,p.k,p.v,p.u,doc.originalUrl);
 });
}
function vaDesc_(d){return String(d.description||"").replace(/<[^>]*>/g," ")
  .replace(/&(?:lt|gt|amp|nbsp|quot|#\d+);/gi," ")
  .replace(/\s+/g," ").trim().slice(0,700);}
function vaSource_(d,ids){
 var desc=vaDesc_(d),now=vaToday_();
 return {
  "Dedupe Key":ids.key,"Unternehmen":d.company,"Position / Projekt":d.title,
  "Bereich":d.lane,"Branche (Primär)":d.industry||"Branche noch prüfen",
  "Consultant Segment":"nicht anwendbar","Einstufung":"Watchlist / Frühindikator",
  "Lead-Status":"Neu","Vertragsart":"Festanstellung laut Originalquelle",
  "Standort":d.location||"Standort nicht bestätigt",
  "Remote / Reise / Auslastung":"nicht öffentlich verifiziert",
  "Erstveröffentlichung":"nicht öffentlich bestätigt",
  "Letzte Aktualisierung / Repost":"Offizieller ATS-Jobstatus aktuell bestätigt",
  "Erstmals gefunden":now,"Zuletzt geprüft":now,
  "Gehalt / Tagessatz":"nicht öffentlich verifiziert",
  "Bewerberzahl / Status":"Bewerberzahl unbekannt; ATS bestätigt aktive Anzeige",
  "Anlass / Trigger":"Aktive Originalanzeige für "+d.title,
  "Aufgaben / Anforderungen":desc||"Titel und offizieller ATS-Eintrag belegt; Aufgabenprofil noch fachlich vertiefen.",
  "Akquise-Signale":"ATS-Originalquelle aktiv; Seniorität "+d.seniority,
  "Akquise-Begründung":"Recruiting-Bedarf durch aktive Arbeitgeberanzeige belegt. Akquise-Zugang, Vergütung und Account-Freigabe vor Ansprache prüfen.",
  "Original- / ATS-Link":d.originalUrl,
  "Entscheiderstatus":"Nicht recherchiert",
  "Interner Check":"Offen – Account, Owner, Off-Limit und Entscheiderzugang prüfen",
  "Owner-Hinweis intern":d.agentKey+" – vorläufiges Funktionsrouting",
  "Check-Datum":now,
  "Check-Notiz (keine Personendaten)":"Automatischer Stage-0-Import; offizieller "+d.provider+
    "-ATS-Check "+d.liveCheckedAt+"; kein bestätigter MASTER-Zielkundenmatch. Kein Outreach.",
  "Letzte Aktion / Notiz":"AUTO-PUBLISH "+ids.oppId+"; 20+14 readback erforderlich"
 };
}
function vaSignal_(d,ids){
 var now=vaToday_();
 return {
  "Signal ID":ids.signalId,"Signal Dedupe Key":ids.signalKey,
  "Unternehmen":d.company,"DealEngine Opportunity ID":ids.oppId,
  "Signal-Typ":"Hiring","Signal-Untertyp":"Neue aktive Arbeitgeber-Stellenausschreibung",
  "Bereich":d.lane,"Branche":d.industry||"noch prüfen",
  "Region":d.location||"nicht bestätigt",
  "Signal-Datum":now,"Gefunden am":now,"Confidence":"Mittel",
  "Evidence Summary":"Originalanzeige "+d.originalUrl+
    "; ATS "+d.provider+"; Stellen-ID "+ids.atsId+
    "; Titel "+d.title+"; fachlicher Account-Zugang noch zu prüfen.",
  "Source Typ":"Original Arbeitgeber / ATS",
  "Source URL":d.originalUrl,"Status":"An Opportunity angehängt",
  "Recommended Use":"Stage 0 – interner Owner-/Off-Limit-Check vor Ansprache",
  "Last Updated":now,"DealEngine Relevanz":"Verarbeitet",
  "Interim Demand Relevanz":"Watch",
  "Executive Search Relevanz":"Watch",
  "Consumer Routing":d.lane,
  "Cross-Feed Note":"Keine automatischen Interim-/Executive-Cross-Feed-Claims.",
  "Discovered By":"PROD-AUTO-PUBLISH / "+d.agentKey,
  "Last Consumer Sync":now
 };
}
function vaDeal_(d,ids){
 var now=vaToday_();
 return {
  "Opportunity ID":ids.oppId,"Source Dedupe Key":ids.key,
  "Source Tab":VA_PUBLISH.lanes[d.lane],
  "Unternehmen":d.company,"Position / Signal":d.title,
  "Service Line":"Perm","Bereich":d.lane,"Branche":d.industry||"noch prüfen",
  "Standort":d.location||"nicht bestätigt","Signal-Typ":"Aktive Senior-/Leadership-Ausschreibung",
  "Why Now":"Aktive Arbeitgeber-ATS-Stelle "+d.title+"; Quelle "+d.originalUrl,
  "Interner Check":"Offen",
  "Priorität":"REVIEW – noch nicht bewertet",
  "Systemtrennung":"Kein CRM Sync","Bestehender Account/Kontakt?":"Unbekannt",
  "Do-not-contact / Off-Limit":"Unbekannt",
  "Check-Notiz (keine CRM-Details)":"Stage 0: keine CRM-/DNC-Freigabe; Vergütungs-, Zugang-, Konzern- und Owner-Prüfung noch offen. Scoring ausstehend.",
  "Stage":"Stage 0 – Company Signal","Entscheiderstatus":"Nicht recherchiert",
  "Consultant / Owner":d.agentKey+" – Routing-Pool (intern bestätigen)",
  "Recommended Action":"Account-/Off-Limit-Check und direkter Ansprechpartnerzugang prüfen, danach fachlich priorisieren.",
  "Outreach Angle":"Spezial-/Führungsprofil gemäß aktiver Arbeitgeber-Stellenausschreibung",
  "Approval Status":"Neu","Opportunity Status":"Open",
  "Next Step":"Interner Account-/Off-Limit-Check, Vergütung und direkter Buyer-Zugang vor Outreach",
  "Last Updated":now,"Job Live Status":"Live",
  "Live Check Timestamp":d.liveCheckedAt,
  "Live Check Evidence":"Offizieller "+d.provider+"-ATS-Job/Titel bestätigt. Kein Outreach ohne Freigabe.",
  "Live Check URL":d.originalUrl
 };
}
function vaWriteHealth_(s,logs){
 if(!logs.length)return;
 var dest=s.getLastRow()+1;
 if(dest+logs.length-1>s.getMaxRows())
  s.insertRowsAfter(s.getMaxRows(),Math.max(30,dest+logs.length-1-s.getMaxRows()));
 s.getRange(dest,1,logs.length,11).setValues(logs);
 SpreadsheetApp.flush();
}
