export function SetupNotice({
  kind,
  detail,
}: {
  kind: "not-configured" | "access-error";
  detail?: string;
}) {
  return (
    <div className="max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <h2 className="mb-2 text-base font-semibold">
        {kind === "not-configured"
          ? "Google-Sheets-Zugriff noch nicht konfiguriert"
          : "Zugriff auf das Sheet fehlgeschlagen"}
      </h2>
      {kind === "not-configured" ? (
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Service-Account in der Google Cloud Console anlegen und einen
            JSON-Key erzeugen.
          </li>
          <li>
            Beide Google Sheets mit der Service-Account-E-Mail (read-only)
            teilen.
          </li>
          <li>
            <code className="rounded bg-black/10 px-1 dark:bg-white/10">
              GOOGLE_SERVICE_ACCOUNT_EMAIL
            </code>{" "}
            und{" "}
            <code className="rounded bg-black/10 px-1 dark:bg-white/10">
              GOOGLE_PRIVATE_KEY
            </code>{" "}
            als Umgebungsvariablen setzen (siehe README).
          </li>
        </ol>
      ) : (
        <p>
          Die Zugangsdaten sind gesetzt, aber der API-Aufruf ist
          fehlgeschlagen. Häufigste Ursache: Das Sheet wurde nicht mit der
          Service-Account-E-Mail geteilt, oder der Tab-Name stimmt nicht mehr
          exakt.
        </p>
      )}
      {detail && (
        <p className="mt-3 rounded bg-black/5 p-2 font-mono text-xs break-all dark:bg-white/5">
          {detail}
        </p>
      )}
    </div>
  );
}
