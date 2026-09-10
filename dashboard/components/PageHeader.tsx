/**
 * Wspólny nagłówek podstron — eyebrow + tytuł z gradientem + opis + slot na akcje.
 * Lekka animacja wejścia wbudowana (klasy .animate-enter).
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label-eyebrow animate-enter mb-2">{eyebrow}</p>
        <h1 className="font-display animate-enter enter-d1 text-3xl leading-tight">{title}</h1>
        {description && (
          <p className="animate-enter enter-d2 mt-2 max-w-2xl text-sm text-parchment/55">{description}</p>
        )}
      </div>
      {actions && <div className="animate-enter enter-d2 flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
