// Line icons (24px grid, 1.75 stroke), the same set as the landing page.
const paths = {
  inbox: "M4 13l2.5-7h11L20 13v6H4zM4 13h4.5l1 2.5h5l1-2.5H20",
  calendar: "M4 6h16v14H4zM4 10h16M8.5 3.5v4M15.5 3.5v4",
  clock: "M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2",
  chart: "M4 20V10M10 20V4M16 20v-7M21 20H3",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  palette: "M12 3a9 9 0 100 18c1.2 0 1.5-1 1-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 004-4C21 7 17 3 12 3zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  bell: "M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  code: "M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5l-3 14",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 4.5a3.5 3.5 0 010 6.5M18 14.8c1.8.7 3 2.6 3 5.2",
  plus: "M12 5v14M5 12h14",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  phone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};

export type IconName = keyof typeof paths;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

/** The Snippo mark: the chat bubble on an indigo tile, as on the landing page. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 ${className}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-700/30">
        <Icon name="chat" className="size-4.5" />
      </span>
      snippo
    </span>
  );
}
