/**
 * Velanio External Worker Pilot — Google Apps Script
 * Intake + traceability only. NEVER promotes entries to Fach/20/14 or Velanio.
 * Install inside the existing Open Market spreadsheet's Apps Script project.
 */
var VELANIO_WORKER_CFG = {
  spreadsheetId: "10n-vWPuJMUv-TkmjjxupiBKoIgrobfDED1xKWQC0DsA",
  apiUrl: "https://sshyfweyoisankseujpc.supabase.co/functions/v1/agent-intake-bridge",
  tz: "Europe/Berlin",
  intakeSheet: "30 Worker Intake – REVIEW",
  healthSheet: "31 Worker Health – PILOT",
  maxPerOwner: 12,
  owners: ["PROD-MASTER","PROD-SCOUT-COM","PROD-SCOUT-FIN","PROD-SCOUT-TECH","PROD-INTERIM-EXEC"],
  // Only read original-ad URLs. Never write into any existing production source tab.
  sourceSheets: [
    "01 Interim B2B","02 Befristet Interim","03 Finance","04 Financial Services",
    "05 Life Sciences","06 IT & Digital",
    "07 DEAT Sales & Marketing – Consumer Goods & Handel",
    "08 Engineering","10 HR & People","11 Legal"
  ]
};
var VELANIO_WORKER_INTAKE_HEADER = [
  "Run ID","Agent","Discovery ID","Lane","Unternehmen","Stelle",
  "Standort","Originalanzeige","Queue Fresh At","Aufnahmezeit","Status",
  "Dublettenprüfung","Vertragsindikator","Prüfnotiz (ohne Personendaten)"
];
var VELANIO_WORKER_HEALTH_HEADER = [
  "Run ID","Agent","Started At","Finished At","Status",
  "Queue erhalten","Neue Review-Zeilen","Bereits vorhandene Anzeigen",
  "Schon in Intake","Fehler","Nächster Schritt"
];

function velanioWorkerPilotInstall() {
  var props=PropertiesService.getScriptProperties();
  var token=props.getProperty("AGENT_WORKER_TOKEN") || props.getProperty("VELANIO_IMPORT_TOKEN");
  if (!token) throw new Error("Bitte in Apps Script > Projekteinstellungen > Skripteigenschaften AGENT_WORKER_TOKEN hinterlegen. Schlüssel niemals in Zellen oder Code schreiben.");
  var ss=SpreadsheetApp.openById(VELANIO_WORKER_CFG.spreadsheetId);
  velanioWorkerEnsureSheet_(ss,VELANIO_WORKER_CFG.intakeSheet,VELANIO_WORKER_INTAKE_HEADER);
  velanioWorkerEnsureSheet_(ss,VELANIO_WORKER_CFG.healthSheet,VELANIO_WORKER_HEALTH_HEADER);
  var old=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==="velanioWorkerPilotRun";});
  if (!old.length) ScriptApp.newTrigger("velanioWorkerPilotRun").timeBased().everyHours(1).create();
  return "Worker-Pilot installiert. Quelle nur READ-ONLY; Ergebnisse ausschließlich REVIEW/HEALTH; ein stündlicher Trigger.";
}

function velanioWorkerPilotRun() {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)) return "SKIPPED_LOCK";
  var started=new Date();
  var runId="WORKER-"+Utilities.formatDate(started,VELANIO_WORKER_CFG.tz,"yyyyMMdd-HHmmss");
  try {
    var props=PropertiesService.getScriptProperties();
    var token=props.getProperty("AGENT_WORKER_TOKEN") || props.getProperty("VELANIO_IMPORT_TOKEN");
    if (!token) throw new Error("WORKER_TOKEN_MISSING");
    var ss=SpreadsheetApp.openById(VELANIO_WORKER_CFG.spreadsheetId);
    var intake=velanioWorkerEnsureSheet_(ss,VELANIO_WORKER_CFG.intakeSheet,VELANIO_WORKER_INTAKE_HEADER);
    var health=velanioWorkerEnsureSheet_(ss,VELANIO_WORKER_CFG.healthSheet,VELANIO_WORKER_HEALTH_HEADER);
    var known=velanioWorkerKnownUrls_(ss);
    var staged=velanioWorkerExistingDiscovery_(intake);
    var newRows=[], logs=[];
    VELANIO_WORKER_CFG.owners.forEach(function(owner){
      var ts=velanioWorkerStamp_(new Date()), count=0,already=0,stagedN=0;
      try {
        var payload=velanioWorkerPull_(token,owner);
        if(payload.status==="NO_AUTONOMOUS_SOURCE"){
          logs.push([runId,owner,ts,velanioWorkerStamp_(new Date()),"NO_AUTONOMOUS_SOURCE",0,0,0,0,"",
            "Für diesen Owner fehlt eine unabhängige Discovery-Quelle; kein PASS."]);
          return;
        }
        if(payload.status!=="INTAKE_ONLY" || !Array.isArray(payload.items)) throw new Error("UNEXPECTED_PAYLOAD");
        count=payload.items.length;
        payload.items.forEach(function(item){
          var discoveryId=String(item.discoveryId||"");
          if(!discoveryId)return;
          var marker=owner+"|"+discoveryId;
          if(staged.has(marker)){stagedN++;return;}
          var url=String(item.originalUrl||"");
          var canonical=velanioWorkerCanonical_(url);
          var exists=known.has(canonical);
          if(exists)already++;
          newRows.push([
            runId,owner,discoveryId,
            velanioWorkerCell_(item.lane),velanioWorkerCell_(item.company),
            velanioWorkerCell_(item.title),velanioWorkerCell_(item.location),
            velanioWorkerCell_(url),velanioWorkerCell_(item.queueFreshAt),
            velanioWorkerStamp_(new Date()),
            exists?"BEREITS_IN_QUELLE_PRÜFEN":"REVIEW_NOT_QUALIFIED",
            exists?"EXAKTE_ORIGINAL_URL_VORHANDEN":"KEIN_EXAKTER_URL_TREFFER",
            velanioWorkerCell_(item.contractHint),"Nur Quelleingang; keine fachliche/Live-Verifikation"
          ]);
          staged.add(marker);
        });
        logs.push([runId,owner,ts,velanioWorkerStamp_(new Date()),"INTAKE_STAGED_NOT_QUALIFIED",
          count,count-stagedN,already,stagedN,"","Fachliche Live-Prüfung und R129-Ownership erforderlich; NICHT produktiv."]);
      } catch (e) {
        logs.push([runId,owner,ts,velanioWorkerStamp_(new Date()),"BLOCKED",
          count,0,already,stagedN,velanioWorkerCell_(String(e && e.message || e)).slice(0,180),
          "Zugriff oder Quelle prüfen. Keine ungeprüften Lead-Writes."]);
      }
    });
    if(newRows.length){
      intake.getRange(intake.getLastRow()+1,1,newRows.length,VELANIO_WORKER_INTAKE_HEADER.length).setValues(newRows);
      SpreadsheetApp.flush();
      // Confirm last appended run ID; do not claim run success on missing readback.
      var got=intake.getRange(intake.getLastRow()-newRows.length+1,1,newRows.length,1).getDisplayValues();
      if(got.length!==newRows.length || got.some(function(row){return row[0]!==runId;}))
        throw new Error("INTAKE_READBACK_MISMATCH");
    }
    health.getRange(health.getLastRow()+1,1,logs.length,VELANIO_WORKER_HEALTH_HEADER.length).setValues(logs);
    SpreadsheetApp.flush();
    return "WORKER_INTAKE_RUN "+runId+" REVIEW_ROWS="+newRows.length;
  } finally {lock.releaseLock();}
}
function velanioWorkerPull_(token,owner){
  var response=UrlFetchApp.fetch(VELANIO_WORKER_CFG.apiUrl,{
    method:"post",contentType:"application/json",
    headers:{"x-velanio-token":token},
    payload:JSON.stringify({action:"pull",agentKey:owner,limit:VELANIO_WORKER_CFG.maxPerOwner}),
    muteHttpExceptions:true,followRedirects:true
  });
  if(response.getResponseCode()!==200)
    throw new Error("BRIDGE_HTTP_"+response.getResponseCode());
  var body=JSON.parse(response.getContentText());
  if(body.agentKey!==owner)throw new Error("OWNER_MISMATCH");
  return body;
}
function velanioWorkerEnsureSheet_(ss,name,header){
  var s=ss.getSheetByName(name);
  if(!s){s=ss.insertSheet(name);s.getRange(1,1,1,header.length).setValues([header]);s.setFrozenRows(1);}
  var existing=s.getRange(1,1,1,header.length).getDisplayValues()[0];
  if(existing.join("|")!==header.join("|"))
    throw new Error("HEADER_MISMATCH_"+name);
  return s;
}
function velanioWorkerKnownUrls_(ss){
  var known=new Set();
  VELANIO_WORKER_CFG.sourceSheets.forEach(function(name){
    var s=ss.getSheetByName(name);
    if(!s)return;
    var header=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0];
    var col=header.findIndex(function(h){return /Original.*ATS.*Link|Original.*Link/i.test(h);})+1;
    if(!col)return;
    var n=Math.max(0,Math.min(s.getLastRow()-1,10000));
    if(!n)return;
    s.getRange(2,col,n,1).getDisplayValues().forEach(function(row){
      var key=velanioWorkerCanonical_(row[0]);if(key)known.add(key);
    });
  });
  return known;
}
function velanioWorkerExistingDiscovery_(s){
  var keys=new Set(),n=s.getLastRow()-1;
  if(n>0){
    s.getRange(2,2,n,2).getDisplayValues().forEach(function(row){
      if(row[0]&&row[1])keys.add(row[0]+"|"+row[1]);
    });
  }
  return keys;
}
function velanioWorkerCanonical_(v){
  var s=String(v||"").trim();
  if(!/^https:\/\//i.test(s))return "";
  return s.split(/[?#]/)[0].replace(/\/$/,"").toLowerCase();
}
function velanioWorkerCell_(v){
  var s=String(v==null?"":v).slice(0,1000);
  return /^[=+@-]/.test(s)?"'"+s:s;
}
function velanioWorkerStamp_(date){
  return Utilities.formatDate(date,VELANIO_WORKER_CFG.tz,"yyyy-MM-dd HH:mm:ss");
}
