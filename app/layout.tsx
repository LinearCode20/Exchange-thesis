import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Prediction Dashboard",
  description:
    "Thesis dashboard comparing a Simple RNN baseline with GRU & LSTM models for stock price prediction (10-year dataset, 80/20 train/test, 60-day horizon).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
