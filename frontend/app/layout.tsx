import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roamio — AI trip planner for Pakistan",
  description: "Tell it your days, budget and vibe — get a full day-by-day Pakistan trip plan in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
