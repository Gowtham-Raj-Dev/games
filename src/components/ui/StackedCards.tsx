import styles from "./StackedCards.module.css";

/**
 * Flat placeholder artwork for the Featured slot: three game cards stacked and
 * fanned. Abstract on purpose - it holds the composition until real key art
 * replaces it, and never pretends to be a screenshot of a finished game.
 */
export function StackedCards() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 520 380"
      role="img"
      aria-label="Illustration of three stacked game cards"
    >
      {/* Back and middle cards, fanned out behind the front one */}
      <rect
        x="160"
        y="65"
        width="200"
        height="250"
        rx="14"
        fill="#ececed"
        transform="rotate(-9 260 195)"
      />
      <rect
        x="160"
        y="65"
        width="200"
        height="250"
        rx="14"
        fill="#e0e0e3"
        transform="rotate(-4.5 260 195)"
      />

      {/* Front card */}
      <rect
        x="160"
        y="65"
        width="200"
        height="250"
        rx="14"
        fill="#ffffff"
        stroke="#d1d1d6"
      />
      <rect x="176" y="81" width="168" height="120" rx="8" fill="#fdf4ef" />
      <path d="M250 129 272 141 250 153z" fill="#c2410c" />

      {/* Title / meta placeholder lines */}
      <rect x="176" y="218" width="120" height="9" rx="4.5" fill="#d9d9dd" />
      <rect x="176" y="238" width="86" height="8" rx="4" fill="#e9e9eb" />
      <rect x="176" y="272" width="64" height="24" rx="12" fill="#f1f1f2" />
    </svg>
  );
}
