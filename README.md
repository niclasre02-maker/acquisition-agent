# Acquisition Agent Dashboard

Live-Dashboard (Next.js) für zwei Google-Sheets-basierte Akquise-Radare:

- **Interim Demand Radar** – Interim-Management-Bedarfssensor mit Startliste
  (`Interim Zielunternehmen`) und freier DACH-Suche
  (`Interim Demand Radar`), gepflegt im Sheet
  `MASTER – Morgan Philips Agent Memory – LIVE`.
- **Open Market Akquise Radar** – freie DACH-Lead-Suche über 10
  Fachbereiche, gepflegt im Sheet `MASTER – Open Market Akquise Radar – LIVE`.

Beide Sheets bleiben die einzige Quelle der Wahrheit (Single Source of
Truth) und werden weiterhin von den bestehenden Agenten-Läufen
beschrieben. Diese App liest die Daten nur lesend aus und stellt sie als
durchsuchbares, filterbares Dashboard dar.

## Google Sheets Zugriff einrichten

Die App liest die Sheets über einen **Google Service Account** (read-only),
damit keine persönlichen Zugangsdaten oder OAuth-Flows nötig sind.

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein
   Projekt wählen/anlegen und die **Google Sheets API** aktivieren.
2. Unter *IAM & Admin → Service Accounts* einen neuen Service Account
   anlegen (z. B. `acquisition-dashboard`).
3. Für diesen Service Account einen **JSON-Key** erzeugen und
   herunterladen.
4. Beide Google Sheets öffnen und über *Freigeben* die
   **E-Mail-Adresse des Service Accounts** (aus dem JSON-Key,
   `client_email`) mit der Rolle **Betrachter (read-only)** hinzufügen:
   - `MASTER – Morgan Philips Agent Memory – LIVE`
   - `MASTER – Open Market Akquise Radar – LIVE`
5. Aus dem JSON-Key zwei Werte in die Umgebungsvariablen übernehmen
   (siehe `.env.example`):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email`
   - `GOOGLE_PRIVATE_KEY` = `private_key` (Zeilenumbrüche als `\n`
     belassen, in Anführungszeichen setzen)

Ohne diese Variablen zeigt das Dashboard auf jeder Seite einen
Einrichtungshinweis anstelle der Daten – es stürzt nicht ab.

## Lokal starten

```bash
npm install
cp .env.example .env.local   # und die echten Werte eintragen
npm run dev
```

Dashboard läuft dann unter <http://localhost:3000>.

## Deployment auf Vercel

1. Repository in Vercel importieren (Next.js wird automatisch erkannt).
2. Unter *Project Settings → Environment Variables* `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   und `GOOGLE_PRIVATE_KEY` setzen (Value des Private Keys mit den `\n`
   Escape-Sequenzen genau wie in `.env.example` einfügen).
3. Deploy auslösen.

Daten werden serverseitig mit einer kurzen Cache-Zeit (60 Sekunden) neu
geladen (`export const revalidate = 60` je Route) und zusätzlich in
einem einfachen In-Memory-Cache mit derselben TTL gehalten, um die
Google-Sheets-API-Quota zu schonen.

## Struktur

```
lib/googleSheets.ts   Auth + Fetch einzelner Tabs (Service Account, Cache)
lib/loadTab.ts         Fehlerbehandlung (nicht konfiguriert / Zugriffsfehler)
lib/config.ts          Spreadsheet-IDs und Tab-Namen
lib/fields.ts           Tolerante Spalten-Lookups + Aggregationen
components/DataTable    Generische Such-/Filter-/Sortier-Tabelle
components/Badge        Farbige Status-/Prioritäts-Badges
components/SetupNotice  Hinweis bei fehlender/fehlerhafter Sheets-Anbindung
app/                    Seiten: Übersicht, Interim Radar, Zielunternehmen,
                        Open Market (10 Segmente + Suchläufe + Agent State),
                        Regelwerk
```

Die Tab-Namen und Spreadsheet-IDs sind in `lib/config.ts` hinterlegt und
können bei Bedarf über `INTERIM_SPREADSHEET_ID` /
`OPEN_MARKET_SPREADSHEET_ID` per Umgebungsvariable überschrieben werden.
