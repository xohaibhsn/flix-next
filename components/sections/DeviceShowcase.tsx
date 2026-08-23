const POSTER_TONES = [
  "from-rose-700 to-red-950",
  "from-amber-600 to-orange-950",
  "from-sky-600 to-indigo-950",
  "from-emerald-600 to-teal-950",
  "from-violet-600 to-fuchsia-950",
];

export type DeviceShowcaseContent = {
  brand: string;
  eyebrow: string;
  title: string;
  meta: string;
  rowLabel: string;
  posters: { id: string; title: string }[];
};

const FALLBACK: DeviceShowcaseContent = {
  brand: "THE FLIX",
  eyebrow: "Featured",
  title: "City Lights",
  meta: "4K · Drama · 2026",
  rowLabel: "Continue Watching",
  posters: [
    { id: "p1", title: "Nightfall" },
    { id: "p2", title: "Empire" },
    { id: "p3", title: "Aurora" },
    { id: "p4", title: "Crown" },
    { id: "p5", title: "Pulse" },
  ],
};

function PosterRow({ posters }: { posters: { id: string; title: string }[] }) {
  return (
    <div className="mt-2 flex gap-1.5 px-2">
      {posters.slice(0, 5).map((poster, index) => (
        <div
          key={poster.id}
          className={`h-16 w-[22%] shrink-0 rounded-sm bg-gradient-to-b ${POSTER_TONES[index % POSTER_TONES.length]} p-1.5 shadow-md`}
        >
          <p className="text-[7px] font-bold tracking-wide text-white/90 uppercase">
            {poster.title}
          </p>
        </div>
      ))}
    </div>
  );
}

function TvScreen({ content }: { content: DeviceShowcaseContent }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0c10] text-white">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-extrabold tracking-widest text-brand">
          {content.brand}
        </span>
        <div className="flex gap-3 text-[8px] text-white/60">
          <span>Home</span>
          <span>Live</span>
          <span>Movies</span>
        </div>
      </div>
      <div className="relative mx-2 h-[46%] overflow-hidden rounded-sm bg-gradient-to-r from-red-800 via-rose-700 to-orange-600">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,transparent_20%,rgba(0,0,0,0.55))]" />
        <div className="absolute bottom-2 left-3">
          <p className="text-[8px] font-semibold tracking-[0.2em] text-white/80 uppercase">
            {content.eyebrow}
          </p>
          <p className="text-sm leading-none font-extrabold">{content.title}</p>
          <p className="mt-1 text-[8px] text-white/80">{content.meta}</p>
        </div>
      </div>
      <p className="mt-2 px-3 text-[8px] font-semibold text-white/50">
        {content.rowLabel}
      </p>
      <PosterRow posters={content.posters} />
    </div>
  );
}

export function DeviceShowcase({ content = FALLBACK }: { content?: DeviceShowcaseContent }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[540px]" aria-hidden="true">
      <div className="absolute inset-8 rounded-full bg-brand/25 blur-3xl" />
      <div className="float-slow absolute top-[4%] right-[8%] left-[6%]">
        <div className="rounded-[14px] bg-gradient-to-b from-neutral-700 to-neutral-950 p-[7px] shadow-2xl shadow-black/50">
          <div className="overflow-hidden rounded-[8px] border border-white/5">
            <div className="aspect-video">
              <TvScreen content={content} />
            </div>
          </div>
        </div>
        <div className="mx-auto h-3 w-16 bg-neutral-800" />
        <div className="mx-auto h-2 w-28 rounded-b-md bg-neutral-900" />
      </div>
      <div className="absolute bottom-[18%] left-[4%] w-[38%] rotate-[-8deg] rounded-[18px] bg-neutral-900 p-1.5 shadow-2xl ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[12px] bg-[#0c0c10]">
          <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-white/20" />
          <div className="aspect-[3/4]">
            <TvScreen content={content} />
          </div>
        </div>
      </div>
      <div className="absolute right-[10%] bottom-[14%] w-[22%] rotate-[8deg] rounded-[18px] bg-neutral-950 p-1 shadow-2xl ring-1 ring-white/15">
        <div className="overflow-hidden rounded-[14px]">
          <div className="mx-auto mt-1.5 h-1 w-6 rounded-full bg-white/25" />
          <div className="aspect-[9/16] bg-gradient-to-b from-zinc-900 to-black p-2">
            <p className="text-[8px] font-extrabold text-brand">{content.brand}</p>
            <div className="mt-2 h-16 rounded bg-gradient-to-br from-red-700 to-rose-950" />
            <div className="mt-2 grid grid-cols-2 gap-1">
              <div className="h-10 rounded bg-indigo-800" />
              <div className="h-10 rounded bg-amber-800" />
              <div className="h-10 rounded bg-emerald-800" />
              <div className="h-10 rounded bg-violet-800" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute right-[36%] bottom-[6%] h-24 w-8 rounded-full bg-gradient-to-b from-neutral-600 to-neutral-900 p-1 shadow-xl ring-1 ring-white/10">
        <div className="mx-auto mt-1 h-3 w-3 rounded-full bg-brand" />
        <div className="mx-auto mt-2 grid grid-cols-2 gap-1 px-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
        </div>
      </div>
      <div className="absolute bottom-[8%] left-[38%] h-7 w-16 rounded-md bg-neutral-800 shadow-lg ring-1 ring-white/10">
        <div className="mx-auto mt-1.5 h-1 w-8 rounded-full bg-brand/80" />
      </div>
    </div>
  );
}
