import styles from "./BrowserMock.module.css";

interface TileProps {
  x: number;
  y: number;
  /** The first tile is accented so the eye has one place to land. */
  accent?: boolean;
}

const TILE_W = 134;
const TILE_H = 138;

function Tile({ x, y, accent = false }: TileProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={TILE_W}
        height={TILE_H}
        rx="8"
        fill="#ffffff"
        stroke="#e4e4e7"
      />
      {/* Thumbnail area */}
      <rect
        x={x + 10}
        y={y + 10}
        width={TILE_W - 20}
        height="68"
        rx="5"
        fill={accent ? "#fdf4ef" : "#f1f1f2"}
      />
      {accent && (
        <path
          d={`M${x + 51} ${y + 34} ${x + 70} ${y + 44} ${x + 51} ${y + 54}z`}
          fill="#c2410c"
        />
      )}
      {/* Title / meta placeholder lines */}
      <rect
        x={x + 10}
        y={y + 88}
        width="78"
        height="7"
        rx="3.5"
        fill={accent ? "#d9d9dd" : "#e4e4e7"}
      />
      <rect
        x={x + 10}
        y={y + 103}
        width="52"
        height="6"
        rx="3"
        fill="#ececed"
      />
    </g>
  );
}

/**
 * Hero visual: a flat browser frame holding a grid of game tiles.
 *
 * It says what the product is (games that run in a browser page) rather than
 * decorating. Solid fills only, no gradients, blur or animation, so it renders
 * identically in every browser and costs nothing to paint.
 */
export function BrowserMock() {
  return (
    <svg
      className={styles.mock}
      viewBox="0 0 480 380"
      role="img"
      aria-label="Illustration of a browser window showing a grid of game tiles"
    >
      {/* Window frame */}
      <rect
        x="0.5"
        y="0.5"
        width="479"
        height="379"
        rx="14"
        fill="#ffffff"
        stroke="#d1d1d6"
      />

      {/* Title bar */}
      <path d="M0 14A14 14 0 0 1 14 0h452a14 14 0 0 1 14 14v26H0z" fill="#f6f6f7" />
      <path d="M0 40h480" stroke="#e4e4e7" />
      <g fill="#d1d1d6">
        <circle cx="22" cy="20" r="4" />
        <circle cx="38" cy="20" r="4" />
        <circle cx="54" cy="20" r="4" />
      </g>
      {/* Address pill */}
      <rect x="76" y="12" width="150" height="16" rx="8" fill="#ececed" />

      {/* Tile grid: 3 x 2 */}
      <Tile x={24} y={64} accent />
      <Tile x={173} y={64} />
      <Tile x={322} y={64} />
      <Tile x={24} y={218} />
      <Tile x={173} y={218} />
      <Tile x={322} y={218} />
    </svg>
  );
}
