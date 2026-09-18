import type { StockArtifact } from "@/lib/types";
import { Card, CardTitle, fmtInt } from "./ui";
import { DatabaseIcon, AudioWaveIcon, FileIcon, ChatIcon } from "./icons";

/** "Data & Audio Summary" overview card — real counts from the dataset and
 * the earnings media lookup (duration is an estimate per recorded call). */
export default function DataAudioCard({
  data,
  audio,
}: {
  data: StockArtifact;
  audio: { files: number; hours: number; sentiment: { positive: number; neutral: number; negative: number } } | null;
}) {
  const rows: {
    Icon: (p: { size?: number }) => React.ReactElement;
    color: string;
    label: string;
    value: React.ReactNode;
  }[] = [
    {
      Icon: DatabaseIcon,
      color: "#2563eb",
      label: "Daily Stock Data",
      value: `${fmtInt(data.records)} Records`,
    },
    {
      Icon: AudioWaveIcon,
      color: "#7c3aed",
      label: "Audio / Media Files",
      value: audio ? `${fmtInt(audio.files)} Files` : "—",
    },
    {
      Icon: FileIcon,
      color: "#059669",
      label: "Audio Duration",
      value: audio && audio.files > 0 ? `~${fmtInt(audio.hours)} Hours (est.)` : "—",
    },
    {
      Icon: ChatIcon,
      color: "#059669",
      label: "Headline Sentiment",
      value: audio ? (
        <>
          <span style={{ color: "#059669" }}>Positive: {audio.sentiment.positive}%</span>{" "}
          <span style={{ color: "var(--muted)" }}>Neutral: {audio.sentiment.neutral}%</span>{" "}
          <span style={{ color: "#dc2626" }}>Negative: {audio.sentiment.negative}%</span>
        </>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <Card>
      <CardTitle>Data &amp; Audio Summary</CardTitle>
      <ul className="mt-4 space-y-4">
        {rows.map(({ Icon, color, label, value }) => (
          <li key={label} className="flex items-center gap-3">
            <span aria-hidden className="shrink-0" style={{ color }}>
              <Icon size={22} />
            </span>
            <span>
              <span className="block text-sm">{label}</span>
              <span className="block text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                {value}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
