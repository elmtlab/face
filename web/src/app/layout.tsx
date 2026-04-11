import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listener - Social Media Dashboard",
  description: "Manage social media connections and explore trending topics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-8">
            <a href="/" className="text-lg font-semibold text-white">
              Listener
            </a>
            <div className="flex gap-6">
              <a
                href="/settings"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Settings
              </a>
              <a
                href="/trending"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Trending
              </a>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
