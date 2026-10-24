import { useId, useRef, useState } from 'react';
import type { SeatBounds } from '../model/types';
import { boundsText, downloadText, number, percent } from './display';

export interface StudyChartPoint {
  xUnits: number;
  otherUnits: number;
  lc: SeatBounds;
  r: SeatBounds;
  pair?: SeatBounds | null;
}

const COLORS = { lc: '#12786e', r: '#b94f35', pair: '#45578b' };
const WIDTH = 920;
const HEIGHT = 385;
const LEFT = 62;
const RIGHT = 22;
const TOP = 80;
const BOTTOM = 83;

/** Export the exact rendered SVG, with inline drawing styles and its source caption. */
function exportSvg(svg: SVGSVGElement | null, filename: string): void {
  if (!svg) return;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  downloadText(
    filename,
    new XMLSerializer().serializeToString(copy),
    'image/svg+xml;charset=utf-8',
  );
}

function stepPath(
  points: StudyChartPoint[],
  value: (point: StudyChartPoint) => number,
  x: (units: number) => number,
  y: (seats: number) => number,
): string {
  return points
    .map((point, index) =>
      index === 0
        ? `M${x(point.xUnits)},${y(value(point))}`
        : `H${x(point.xUnits)}V${y(value(point))}`,
    )
    .join(' ');
}

export function StudySeatChart({
  points,
  title,
  targetLabel,
  donorLabel,
  source,
  filename,
  currentUnits,
  pairOnly = false,
}: {
  points: StudyChartPoint[];
  title: string;
  targetLabel: string;
  donorLabel: string;
  source: string;
  filename: string;
  currentUnits?: number;
  pairOnly?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const initialIndex = points.findIndex((point) => point.xUnits === currentUnits);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, initialIndex));
  const selected = points[Math.min(selectedIndex, points.length - 1)];
  const keys: ('lc' | 'r' | 'pair')[] = pairOnly ? ['pair'] : ['lc', 'r'];
  const values = points.flatMap((point) =>
    keys.flatMap((key) => {
      const bound = point[key];
      return bound ? [bound.lower, bound.upper] : [];
    }),
  );
  const floor = pairOnly
    ? Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10)
    : Math.min(220, Math.max(0, Math.floor((Math.min(...values) - 10) / 20) * 20));
  const ceiling = pairOnly
    ? Math.ceil((Math.max(...values) + 5) / 10) * 10
    : Math.max(240, Math.min(460, Math.ceil((Math.max(...values) + 10) / 20) * 20));
  const total = points.at(-1)?.xUnits ?? 1;
  const x = (units: number) => LEFT + (units / total) * (WIDTH - LEFT - RIGHT);
  const y = (seats: number) =>
    TOP + ((ceiling - seats) / (ceiling - floor)) * (HEIGHT - TOP - BOTTOM);
  const ticks = Array.from({ length: 5 }, (_, index) => floor + ((ceiling - floor) * index) / 4);
  const xTicks = [0, total / 4, total / 2, (total * 3) / 4, total];
  return (
    <figure className={`study-chart ${pairOnly ? 'study-chart-secondary' : ''}`}>
      <div className="study-chart-toolbar">
        <figcaption>{title}</figcaption>
        <button className="study-export" onClick={() => exportSvg(ref.current, filename)}>
          Pobierz SVG
        </button>
      </div>
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        style={{ fontFamily: 'Arial, sans-serif', background: '#fffefa' }}
      >
        <title id={titleId}>{title}</title>
        <desc>
          Oś X: {targetLabel}, od 0 do {percent(total / 1_000_000)}. Oś Y: mandaty. Schodki łączą
          próbki; nie wyznaczają dokładnych granic zmian między próbkami. {source}
        </desc>
        <text x={LEFT} y={22} fontSize={16} fill="#172b36" fontWeight="bold">
          {title}
        </text>
        <text x={LEFT} y={41} fontSize={11} fill="#68757a">
          {source}
        </text>
        {keys.map((key, index) => (
          <g key={`legend-${key}`}>
            <line
              x1={LEFT + index * 160}
              x2={LEFT + index * 160 + 25}
              y1={62}
              y2={62}
              stroke={COLORS[key]}
              strokeWidth={3}
              strokeDasharray={key === 'r' ? '7 3' : undefined}
            />
            <text x={LEFT + index * 160 + 33} y={66} fontSize={12} fill={COLORS[key]}>
              {key === 'lc' ? 'Blok L+C' : key === 'r' ? 'Blok R' : 'Łącznie badana para'}
            </text>
          </g>
        ))}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} stroke="#d9dedb" />
            <text x={LEFT - 10} y={y(tick) + 4} textAnchor="end" fontSize={12} fill="#68757a">
              {number(tick)}
            </text>
          </g>
        ))}
        {!pairOnly && (
          <g>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(231)}
              y2={y(231)}
              stroke="#172e3b"
              strokeDasharray="5 5"
            />
            <text
              x={WIDTH - RIGHT - 4}
              y={y(231) - 7}
              textAnchor="end"
              fontSize={11}
              fill="#172e3b"
            >
              231 · większość
            </text>
          </g>
        )}
        {xTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={HEIGHT - BOTTOM}
              y2={HEIGHT - BOTTOM + 5}
              stroke="#68757a"
            />
            <text
              x={x(tick)}
              y={HEIGHT - BOTTOM + 21}
              textAnchor="middle"
              fontSize={12}
              fill="#68757a"
            >
              {number(tick / 1_000_000, 3)}%
            </text>
          </g>
        ))}
        <text
          x={(WIDTH + LEFT - RIGHT) / 2}
          y={HEIGHT - 35}
          textAnchor="middle"
          fontSize={12}
          fill="#172b36"
        >
          Poparcie: {targetLabel} ↑ · {donorLabel} ↓ · stała suma {percent(total / 1_000_000)}
        </text>
        <text x={LEFT} y={HEIGHT - 12} fontSize={10} fill="#68757a">
          Schodki łączą obliczone próbki; możliwe przejścia między punktami. Model scenariuszowy.
        </text>
        {currentUnits !== undefined && (
          <g>
            <line
              x1={x(currentUnits)}
              x2={x(currentUnits)}
              y1={TOP}
              y2={HEIGHT - BOTTOM}
              stroke="#8a762e"
              strokeDasharray="3 4"
            />
            <text
              x={Math.min(x(currentUnits) + 5, WIDTH - 100)}
              y={TOP + 12}
              fontSize={10}
              fill="#756325"
            >
              Sondaż
            </text>
          </g>
        )}
        {keys.map((key) => (
          <g key={key}>
            <path
              d={stepPath(points, (point) => point[key]?.lower ?? 0, x, y)}
              fill="none"
              stroke={COLORS[key]}
              strokeWidth={2.5}
              strokeDasharray={key === 'r' ? '7 3' : undefined}
            />
            {points
              .filter((point) => point[key] && point[key]!.upper !== point[key]!.lower)
              .map((point) => (
                <line
                  key={point.xUnits}
                  x1={x(point.xUnits)}
                  x2={x(point.xUnits)}
                  y1={y(point[key]!.lower)}
                  y2={y(point[key]!.upper)}
                  stroke={COLORS[key]}
                  strokeWidth={4}
                  opacity={0.45}
                />
              ))}
            {selected && (
              <circle
                cx={x(selected.xUnits)}
                cy={y(selected[key]?.lower ?? 0)}
                r={4.5}
                fill={COLORS[key]}
                stroke="#fffefa"
                strokeWidth={1.5}
              />
            )}
          </g>
        ))}
      </svg>
      <div className="study-chart-legend">
        {keys.map((key) => (
          <span key={key} style={{ color: COLORS[key] }}>
            <i style={{ background: COLORS[key] }} />
            {key === 'lc' ? 'Blok L+C' : key === 'r' ? 'Blok R' : 'Łącznie badana para'}
          </span>
        ))}
      </div>
      <label className="study-sample-control">
        Wybierz obliczoną próbkę
        <input
          type="range"
          min={0}
          max={points.length - 1}
          value={selectedIndex}
          step={1}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
          aria-label={`Próbka: ${title}`}
        />
      </label>
      {selected && (
        <p className="study-selected-point" aria-live="polite">
          <span>
            {targetLabel}: <strong>{percent(selected.xUnits / 1_000_000, 6)}</strong> · {donorLabel}
            : <strong>{percent(selected.otherUnits / 1_000_000, 6)}</strong>
          </span>
          <span>
            {pairOnly ? (
              <>
                Badana para: <strong>{boundsText(selected.pair ?? { lower: 0, upper: 0 })}</strong>{' '}
                mandatów
              </>
            ) : (
              <>
                L+C <strong>{boundsText(selected.lc)}</strong> : R{' '}
                <strong>{boundsText(selected.r)}</strong>
              </>
            )}
          </span>
        </p>
      )}
    </figure>
  );
}

export function StudyOutcomeBar({
  lc,
  r,
  label,
}: {
  lc: SeatBounds;
  r: SeatBounds;
  label: string;
}) {
  return (
    <div
      className="study-outcome-bar"
      aria-label={`${label}: L+C ${boundsText(lc)}, R ${boundsText(r)} mandatów`}
    >
      <div className="study-outcome-label">
        <span>{label}</span>
        <strong>
          L+C {boundsText(lc)} <span>:</span> R {boundsText(r)}
        </strong>
      </div>
      <div className="study-stacked-track" aria-hidden="true">
        <i style={{ width: `${(lc.lower / 460) * 100}%`, background: COLORS.lc }} />
        <i style={{ width: `${(r.lower / 460) * 100}%`, background: COLORS.r }} />
        <b style={{ left: `${(231 / 460) * 100}%` }} />
      </div>
    </div>
  );
}
