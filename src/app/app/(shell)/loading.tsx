export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ width: 260, height: 28, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: 420, height: 16, marginBottom: 28 }} />
      <div className="skeleton" style={{ height: 104, marginBottom: 20 }} />
      <div className="cols-2"><div className="skeleton" style={{ height: 280 }} /><div className="skeleton" style={{ height: 280 }} /></div>
    </div>
  );
}
