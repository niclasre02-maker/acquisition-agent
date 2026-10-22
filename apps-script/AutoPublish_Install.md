# Velanio Auto-Publish — Installation und Abnahme (22.10.2026)

## Ziel
Qualifizierte neue Arbeitgeberanzeigen fließen automatisch in **Fach-Tab → 20 Zentrale Signalquelle → 14 Deal Engine → bestehenden `syncVelanio` → Velanio**. Keine Personenrecherche und keine automatische Ansprache.

## Voraussetzungen
- Bereits bestehendes Google Apps Script-Projekt **Velanio** (mit produktivem `syncVelanio`).
- Die Script Property `AGENT_WORKER_TOKEN` oder `VELANIO_IMPORT_TOKEN` existiert bereits und funktioniert.
- Die drei bestehenden Tabellenblätter der produktiven Open-Market-Akquise bleiben vorhanden.
- Supabase `agent-intake-bridge` Version 8 oder neuer aktiv.

## Einmalige Installation
1. Im bestehenden Projekt `Velanio` **Dateien → + → Skript** auswählen und **VelanioAutoPublish** nennen.
2. Die gesamte Datei [VelanioAutoPublish.gs](./VelanioAutoPublish.gs) in dieses neue Skript kopieren. **`Code.gs`, `syncVelanio` und `VelanioWorkerPilot.gs` nicht bearbeiten.**
3. Speichern.
4. Optional zunächst `velanioAutoPublishDryRun` ausführen. Die Funktion liest nur den serverseitigen Freigabefilter; sie schreibt nichts.
5. `velanioAutoPublishInstall` **einmal** ausführen. Dieser Installer prüft den Datenbankzugriff und legt genau einen zusätzlichen stündlichen Zeit-Trigger für `velanioAutoPublishRun` an.
6. `velanioAutoPublishRun` **einmal manuell testen** und im Tab `31 Worker Health – PILOT` den Eintrag für `PROD-AUTO-PUBLISH` bzw. für die Fachagenten lesen.

## Technische Regeln
- Supabase liefert nur explizit als Stage-0-kandidaten zulässige, nicht bereits synchronisierte Originalanzeigen.
- Aktuell werden ausschließlich offiziell bestätigte Greenhouse- und SmartRecruiters-Anzeigen für DE/AT berücksichtigt; andere ATS-Anbieter bleiben im REVIEW.
- Der Script-Worker vergleicht Original-URLs und stabile Schlüssel mit den Fach-Tabs, schreibt erst Fach, dann 20, dann 14 und prüft alle drei Original-URLs und Keys per Readback.
- Bei einem Teilfehler setzt der nächste Lauf die fehlenden Stufen anhand derselben deterministischen Schlüssel fort. Bestehende widersprüchliche Datensätze werden nicht überschrieben.
- Nach Erfolg sendet der Worker die Referenzen an ein geschütztes Receipt-Log in Supabase; der separate Cron-Job überprüft später die Übernahme ins produktive Velanio.
- Der produktive `syncVelanio` bleibt unverändert und führt die letzte Stufe aus.
- **Keine automatische CRM-/Owner-Freigabe, keine automatische Kontaktansprache, keine künstlichen Scores.** Alles beginnt in `Stage 0 – Company Signal`.

## Erwartete erste Ergebnisse
Die beiden zuvor manuell geschriebenen Stellen **Scalable Capital – Head of Engineering** und **GetYourGuide – Senior Technical Recruiter** werden vom neuen Freigabefilter bewusst nicht erneut veröffentlicht. Es kann daher zunächst `NO_READY_CANDIDATES` erscheinen. Das ist kein Fehlschlag; der erste echte automatische Neu-Write ist erst mit dem nächsten qualifizierten, dedupe-freien Treffer möglich.

## Abnahme
Nach einem erfolgreich hinzugefügten neuen Auto-Publish-Treffer:
1. Fach-Tab: richtiger Dedupe-Key + Original-URL.
2. Zentrale Signalquelle: Signal-ID + richtige Verknüpfung zur Opportunity.
3. DealEngine: Opportunity-ID + `Stage 0` + `Job Live Status: Live`.
4. Nach regulärem `syncVelanio`: Datensatz per demselben Dedupe-Key in `velanio.opportunities` vorhanden; Receipt = `SYNC_CONFIRMED`.
5. Ein wiederholter Lauf fügt **keine** Duplikate hinzu.

## Grenzen
Die alten fünf ChatGPT-Rechercheagenten sind damit nicht wiederhergestellt; hier wird die gesicherte vorhandene Supabase-Discovery für FIN, COM und TECH angebunden. MASTER und Interim/Executive benötigen weiterhin eigene autonome Recherchequellen und Qualitätsschranken.
