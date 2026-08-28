export default function Home() {
  return (
    <main className="game-page">
      <iframe
        className="game-embed"
        src="/game/index.html"
        title="Dizident 86"
        allow="autoplay; fullscreen"
      />
    </main>
  );
}
