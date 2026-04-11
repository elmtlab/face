export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Listener Dashboard</h1>
        <p className="mt-2 text-zinc-400">
          Manage your social media platform connections and explore trending topics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <a
          href="/settings"
          className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
        >
          <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
            Settings
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Configure API keys for Twitter, Discord, and Telegram. Test
            connections and manage platform credentials.
          </p>
        </a>

        <a
          href="/trending"
          className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
        >
          <h2 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
            Trending
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            View hot topics across your connected platforms. Topics are ranked
            by frequency and cross-platform presence.
          </p>
        </a>
      </div>
    </div>
  );
}
