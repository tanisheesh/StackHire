const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? "StackHireBot";

const features = [
  {
    icon: "🔍",
    title: "Natural Language Search",
    description: "Just describe what you want — tech stack, role, seniority, location. No forms, no filters.",
  },
  {
    icon: "⚡",
    title: "Live Results",
    description: "Every query triggers a live search across multiple job portals worldwide. Always fresh.",
  },
  {
    icon: "🎯",
    title: "Smart Ranking",
    description: "Results ranked by relevance. The more detail you give, the better the match.",
  },
  {
    icon: "💾",
    title: "Remembers You",
    description: "Your preferences are saved automatically. Next time, just ask.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-violet-600/10 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-cyan-600/8 blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-5xl mx-auto">
        <span className="font-display text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          StackHire
        </span>
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-slate-400 hover:text-white transition"
        >
          Open Bot →
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 pt-16 pb-24 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-800/40 px-4 py-1.5 text-xs text-slate-400 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          Live job search · Powered by Adzuna
        </div>

        <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl leading-none mb-6">
          <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Find dev jobs
          </span>
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
            by just asking.
          </span>
        </h1>

        <p className="max-w-lg text-lg text-slate-400 leading-relaxed mb-10">
          Tell StackHire what you're looking for in plain text.
          It searches job portals live and returns ranked results — right in Telegram.
        </p>

        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-3 rounded-2xl bg-blue-500 px-8 py-4 text-base font-semibold text-white shadow-2xl shadow-blue-500/30 transition hover:bg-blue-400 hover:shadow-blue-400/40 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-400/40 active:scale-95"
          aria-label="Open StackHire on Telegram"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.667l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.978.892z" />
          </svg>
          Open in Telegram
          <span className="text-blue-200 group-hover:translate-x-0.5 transition-transform">→</span>
        </a>

        {/* Example chips */}
        <div className="mt-12 flex flex-wrap justify-center gap-2 max-w-2xl">
          {[
            "Senior TypeScript React, remote",
            "Backend Go engineer Berlin",
            "Junior Python data engineer",
            "DevOps Kubernetes AWS",
          ].map((ex) => (
            <span key={ex} className="rounded-full border border-slate-700/50 bg-slate-800/30 px-3 py-1 text-xs text-slate-500">
              "{ex}"
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 pb-28 max-w-5xl mx-auto">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur hover:border-slate-700 hover:bg-slate-800/50 transition"
            >
              <div className="mb-4 text-2xl">{f.icon}</div>
              <h3 className="font-display text-base font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 pb-24 text-center">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/50 p-12 backdrop-blur">
          <h2 className="font-display text-3xl font-extrabold text-white mb-3">
            Ready to find your next role?
          </h2>
          <p className="text-slate-500 mb-8 text-sm">Free to use. No signup required.</p>
          <a
            href={`https://t.me/${BOT_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-2xl bg-blue-500 px-8 py-4 text-base font-semibold text-white shadow-2xl shadow-blue-500/30 transition hover:bg-blue-400 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-blue-400/40 active:scale-95"
            aria-label="Open StackHire on Telegram"
          >
            Open in Telegram
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 px-6 py-8 text-center">
        <p className="text-xs text-slate-600">
          Developed with ❤️ by{" "}
          <a
            href="https://tanisheesh.is-a.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-300 transition"
          >
            Tanish Poddar
          </a>
        </p>
      </footer>
    </main>
  );
}
