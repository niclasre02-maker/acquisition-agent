import { BRANCH_SEGMENTS } from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { SegmentPicker } from "@/components/SegmentPicker";

export default async function EinstellungenPage() {
  const prefs = await getPreferences();

  return (
    <div className="py-6">
      <SegmentPicker
        branchSegments={BRANCH_SEGMENTS}
        initialMode={prefs.mode}
        initialBranches={prefs.branches}
      />
    </div>
  );
}
