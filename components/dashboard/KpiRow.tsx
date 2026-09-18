import type { StockArtifact } from "@/lib/types";
import { Card, fmtInt } from "./ui";
import { DatabaseIcon, FileIcon, AudioWaveIcon, CalendarIcon, NetworkIcon } from "./icons";

interface KpiProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
}

function Kpi({ icon, iconBg, iconColor, label, value, sub }: KpiProps) {
  return (
    <Card className="flex items-start gap-3 !p-4">
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm" style={{ color: "var(--muted)" }}>
          {label}
        </span>
        <span className="block text-xl font-bold tracking-tight">{value}</span>
        {sub && (
          <span className="block text-xs" style={{ color: "var(--muted)" }}>
            {sub}
          </span>
        )}
      </span>
    </Card>
  );
}

export default function KpiRow({
  data,
  audioFiles,
}: {
  data: StockArtifact;
  audioFiles: number | null;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Kpi
        icon={<DatabaseIcon size={22} />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        label="Historical Data"
        value={`${data.dataPeriod.years} Years`}
        sub={`(${data.dataPeriod.start} to ${data.dataPeriod.end})`}
      />
      <Kpi
        icon={<FileIcon size={22} />}
        iconBg="#ecfdf5"
        iconColor="#059669"
        label="Total Records"
        value={fmtInt(data.records)}
        sub="Daily Records"
      />
      <Kpi
        icon={<AudioWaveIcon size={22} />}
        iconBg="#f5f3ff"
        iconColor="#7c3aed"
        label="Audio Files"
        value={audioFiles == null ? "—" : fmtInt(audioFiles)}
        sub="Processed"
      />
      <Kpi
        icon={<CalendarIcon size={22} />}
        iconBg="#fff7ed"
        iconColor="#ea580c"
        label="Prediction Horizon"
        value={`${data.config.horizon} Days`}
        sub="Future Prediction"
      />
      <Kpi
        icon={<NetworkIcon size={22} />}
        iconBg="#eff6ff"
        iconColor="#2563eb"
        label="Models"
        value="SRNN (Baseline)"
        sub="GRU & LSTM (Proposed)"
      />
    </section>
  );
}
