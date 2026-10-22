# Velanio: externer Agent-Worker (Pilot, 22.10.2026)

## Was produktiv eingerichtet ist
- Supabase Cron: `velanio-agent-worker-preflight-pilot`, Job 24, stündlich um Minute :03 UTC.
- Private Tabelle `velanio_private.agent_worker_preflight_v1` und Funktion `velanio_private.refresh_agent_worker_preflight_v1()`.
- Geschützte, ausschließlich lesende Edge Function: `agent-intake-bridge` (POST, Token im `x-velanio-token`-Header).
- Zwei neue Tabs in Open Market: `30 Worker Intake – REVIEW` und `31 Worker Health – PILOT`.
- Apps-Script-Quellcode: `apps-script/VelanioAgentWorkerPilot.gs`.

**Wichtig:** Die Backend-Prüfung läuft. Die Google-Sheets-Ausführung per Apps Script muss einmalig in einem autorisierten Google-Apps-Script-Projekt aktiviert werden; dieser Zugriff lässt sich nicht über die verbundene Google-Drive-App delegieren.

## Einmalige Einrichtung am PC (keine Geheimnisse im Chat versenden)

1. [Open Market Sheet](https://docs.google.com/spreadsheets/d/10n-vWPuJMUv-TkmjjxupiBKoIgrobfDED1xKWQC0DsA/edit) öffnen → **Erweiterungen → Apps Script**.
2. Im vorhandenen Script-Projekt **eine neue Skriptdatei** `VelanioAgentWorkerPilot.gs` erstellen und den Quellcode aus dem gleichnamigen Repository-Pfad einfügen. Vorhandenen Sheet→Velanio-Sync und dessen Trigger nicht verändern.
3. Unter **Projekteinstellungen → Skripteigenschaften** sicherstellen, dass `AGENT_WORKER_TOKEN` auf dem serverseitig vorhandenen `VELANIO_IMPORT_TOKEN`-Wert basiert. Falls `VELANIO_IMPORT_TOKEN` bereits eine Skripteigenschaft im selben Projekt ist, wird sie automatisch verwendet. Tokens **niemals** in das Sheet, GitHub oder den Chat schreiben.
4. `velanioWorkerPilotInstall` einmal ausführen und Google-Zugriffe für das eigene Script genehmigen. Diese Funktion erstellt die beiden Review-Tabs nötigenfalls und **nur einen** stündlichen Trigger für `velanioWorkerPilotRun`.
5. `velanioWorkerPilotRun` einmal manuell ausführen, dann die beiden Tabs kontrollieren. In Health muss `INTAKE_STAGED_NOT_QUALIFIED` für COM/FIN/TECH oder ein konkreter `BLOCKED`-Fehler erscheinen; MASTER/IX zeigen `NO_AUTONOMOUS_SOURCE`.

## Sicherheits- und Abnahmegrenzen
- Der Pilot **liest** `velanio.perm_search_queue` sowie vorhandene Original-URLs aus den Fach-Tabs, aber schreibt ausschließlich in die beiden neuen Intake-/Health-Tabs.
- Queue-Treffer sind **keine** fachlich bestätigten Leads. Der Pilot schreibt niemals neue Zeilen in Fach-Tab, `20 Zentrale Signalquelle`, `14 Deal Engine – Opportunities` oder Velanio. Für diese Freigabe fehlen noch vollständige Live-Anzeigen-Prüfung, Zielkunden-/Gruppenownership, Kostenkontrolle, Abgleich aktiver + archivierter Leads und genau ein bestätigter Source→Central→Deal→Sync-Durchlauf.
- MASTER und Interim/Executive brauchen eigene autonome Primärquellen; die vorhandene Perm-Queue deckt diese Bereiche nicht ab.
- Alte ChatGPT-Zeitpläne bleiben zunächst unverändert. Kein zusätzlicher ChatGPT-Agent.
- App Script besitzt **keine** DB-Admin-Keys. Die Edge-Funktion akzeptiert einen separaten Token-Header und lässt ausschließlich `pull`-Reads zu.
- Bei 401/503: Skripteigenschaft und Edge-Konfiguration prüfen. **Nicht** JWT-Verifikation oder Quellberechtigungen pauschal deaktivieren, keine Credentials ins Protokoll schreiben.
- Erst nach mehreren realen stündlichen Health-Readbacks und Verifikation eines echten Leads kann ein späterer Cutover zur produktiven Qualifizierung geplant werden.

## Technische Architektur
`pg_cron` → private Preflight-Daten in Supabase (5 Owners; nur technische Statuswerte)

`Google Apps Script Stunden-Trigger` → token-authentifizierte Edge Function `agent-intake-bridge` → `perm_search_queue` (3h Fresh) → Quelle/ATS-URL-Dedupe → `30 Worker Intake – REVIEW` + `31 Worker Health – PILOT`

Künftige, **noch nicht implementierte** Produktionsstufen:
`Original-ATS-Liveprüfung` → `fachliche KI-Qualifizierung + Ownership + Archive-Dedupe` → `Fach` → `20` → `14` → `Apps Script Sync` → `Velanio`.

Letztes bestätigtes Ergebnis ist niemals aus einem Cron-Start oder einem Queue-Hit abzuleiten.
