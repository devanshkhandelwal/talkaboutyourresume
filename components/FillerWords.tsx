import type { FillerMatch } from "@/lib/fillers";

/** Text with filler spans wrapped in <mark>. */
export function Highlighted({ text, matches }: { text: string; matches?: FillerMatch[] }) {
  if (!matches?.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  matches.forEach((m, i) => {
    if (m.start > at) parts.push(text.slice(at, m.start));
    parts.push(
      <mark key={i} className="filler">
        {text.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
