export function MediaEmbed() {
  return (
    <aside>
      <h3>Watch</h3>
      <h5>Promo</h5>
      <iframe src="https://example.com/embed/video" width={560} height={315} />
      <video src="/promo.mp4" autoPlay muted />
    </aside>
  );
}
