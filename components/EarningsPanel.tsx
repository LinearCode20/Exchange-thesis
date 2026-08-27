"use client";

import { useState } from "react";
import type { EarningsResponse } from "@/lib/types";

const PREVIEW_CHARS = 3500;

export default function EarningsPanel({ data }: { data: EarningsResponse }) {
  const [expanded, setExpanded] = useState(false);
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.youtubeQuery)}`;
  const transcript = data.transcript;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {/* Transcript */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="font-semibold">Earnings call transcript</h2>
        {transcript ? (
          <>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              Q{transcript.quarter} {transcript.year}
              {transcript.date ? ` · ${transcript.date.slice(0, 10)}` : ""} · via Financial
              Modeling Prep
            </p>
            <div
              className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-sm leading-6"
              style={{ background: "var(--wash)", color: "var(--ink-2)" }}
            >
              {expanded || transcript.content.length <= PREVIEW_CHARS
                ? transcript.content
                : `${transcript.content.slice(0, PREVIEW_CHARS)}…`}
            </div>
            {transcript.content.length > PREVIEW_CHARS && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 text-sm font-medium"
                style={{ color: "var(--accent)" }}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        ) : (
          <div
            className="mt-3 rounded-lg p-4 text-sm"
            style={{ background: "var(--wash)", color: "var(--ink-2)" }}
          >
            {data.transcriptAvailable ? (
              <p>No transcript was found for the recent quarters of this symbol.</p>
            ) : (
              <>
                <p className="font-medium" style={{ color: "var(--ink)" }}>
                  Transcript text needs a free API key
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    Create a free key at{" "}
                    <a
                      className="underline"
                      href="https://site.financialmodelingprep.com/developer/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      financialmodelingprep.com
                    </a>
                  </li>
                  <li>
                    Put it in <code>.env.local</code> as <code>FMP_API_KEY=…</code>
                  </li>
                  <li>Restart the dev server</li>
                </ol>
                <p className="mt-2" style={{ color: "var(--muted)" }}>
                  Everything else works without it — use the audio link in the meantime.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Audio / video / news */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="font-semibold">Audio, video &amp; news</h2>
        <a
          href={ytUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          <span aria-hidden>▶</span> Listen to the latest earnings call
        </a>
        <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Opens a YouTube search for the full webcast audio/recording.
        </p>

        {data.videos.length > 0 && (
          <>
            <h3
              className="mt-5 text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--muted)" }}
            >
              Video
            </h3>
            <ul className="mt-2 space-y-2">
              {data.videos.map((v) => (
                <li key={v.link}>
                  <a
                    href={v.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {v.title}
                  </a>{" "}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    · {v.publisher}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {data.news.length > 0 && (
          <>
            <h3
              className="mt-5 text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--muted)" }}
            >
              Latest news
            </h3>
            <ul className="mt-2 space-y-2">
              {data.news.map((n) => (
                <li key={n.link}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {n.title}
                  </a>{" "}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    · {n.publisher}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
