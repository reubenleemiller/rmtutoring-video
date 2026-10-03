export default function NotFound() {
  return (
    <main className="empty-state">
      <section className="state-panel">
        <h1>Room unavailable</h1>
        <p>
          This meeting room does not exist, has been cancelled, or has already
          been cleaned up.
        </p>
      </section>
    </main>
  );
}
