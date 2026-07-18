export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-10 text-center">
        <p className="label-eyebrow mb-3 text-burgundy">Brak dostępu</p>
        <h1 className="font-display text-2xl mb-2">Nie masz uprawnień do panelu</h1>
        <p className="text-parchment/60 text-sm">
          Twoje role na serwerze nie są powiązane z kluczem <code>DASHBOARD_ACCESS</code>.
          Skontaktuj się z Zarządem Projektu lub Developmentem.
        </p>
      </div>
    </div>
  );
}
