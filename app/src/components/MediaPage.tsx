export function MediaPage({ media }: any) {
  if (!media) return null;
  return <div><h3>{media.title?.english || media.title?.romaji || media.title?.native}</h3><p>{media.year}</p></div>;
}
