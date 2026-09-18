"use client";

import { HomeIcon, DataInfoIcon, ModelsIcon, PredictionsIcon, ResultsIcon, AboutIcon } from "./icons";

export type TabKey = "overview" | "data" | "models" | "predictions" | "results" | "about";

export const TAB_ITEMS: { key: TabKey; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { key: "overview", label: "Overview", Icon: HomeIcon },
  { key: "data", label: "Data Info", Icon: DataInfoIcon },
  { key: "models", label: "Models", Icon: ModelsIcon },
  { key: "predictions", label: "Predictions", Icon: PredictionsIcon },
  { key: "results", label: "Results", Icon: ResultsIcon },
  { key: "about", label: "About", Icon: AboutIcon },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof TAB_ITEMS)[number];
  active: boolean;
  onClick: () => void;
}) {
  const { Icon } = item;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--primary-soft)", color: "var(--primary)" }
          : { color: "var(--ink-2)" }
      }
    >
      <Icon size={19} />
      {item.label}
    </button>
  );
}

export default function Sidebar({
  tab,
  onTab,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
}) {
  return (
    <>
      {/* Vertical sidebar (desktop) */}
      <nav
        className="sticky top-6 hidden h-fit w-56 shrink-0 flex-col gap-1 rounded-xl p-3 lg:flex"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        aria-label="Dashboard sections"
      >
        {TAB_ITEMS.map((item) => (
          <NavButton key={item.key} item={item} active={tab === item.key} onClick={() => onTab(item.key)} />
        ))}
      </nav>

      {/* Horizontal tab bar (mobile) */}
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl p-2 lg:hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        aria-label="Dashboard sections"
      >
        {TAB_ITEMS.map((item) => {
          const { Icon } = item;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTab(item.key)}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={
                active
                  ? { background: "var(--primary-soft)", color: "var(--primary)" }
                  : { color: "var(--ink-2)" }
              }
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
