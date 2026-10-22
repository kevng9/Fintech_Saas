import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { DemoStateProvider } from "@/components/DemoStateProvider";

export const metadata: Metadata = {
  title: {
    default: "Northstar Payments Intelligence",
    template: "%s · Northstar",
  },
  description:
    "Live payment operations intelligence powered by SingleStore and Aura Analyst.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <DemoStateProvider>
          <AppShell>{children}</AppShell>
        </DemoStateProvider>
      </body>
    </html>
  );
}
