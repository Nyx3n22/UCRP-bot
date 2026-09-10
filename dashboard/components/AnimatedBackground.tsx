/**
 * Animowane tło całego dashboardu — dryfujące poświaty (złoto / bordo / indygo)
 * na siatce + winieta. Czysty CSS, zero JS, warstwa pod treścią (z-index: -1).
 */
export default function AnimatedBackground() {
  return (
    <div aria-hidden className="bg-stage">
      <div className="bg-orb bg-orb-gold" />
      <div className="bg-orb bg-orb-wine" />
      <div className="bg-orb bg-orb-ink" />
    </div>
  );
}
