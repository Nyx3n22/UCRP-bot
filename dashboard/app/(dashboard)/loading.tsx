/** Szkielet ładowania podstron — animowany shimmer w klimacie kart. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Ładowanie…">
      <div className="card mb-8 overflow-hidden p-8">
        <div className="skeleton mb-3 h-3 w-40" />
        <div className="skeleton mb-2 h-9 w-64" />
        <div className="skeleton h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton mb-4 h-3 w-24" />
            <div className="skeleton h-9 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
