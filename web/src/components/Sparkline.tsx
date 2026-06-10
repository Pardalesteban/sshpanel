interface Props {
  values: number[];
  width?: number;
  height?: number;
  color: string;
  fillOpacity?: number;
  /** Si está seteado, el rango Y siempre va de 0 a este valor. Sino auto-fit. */
  max?: number;
  className?: string;
}

/**
 * Sparkline SVG sin librerías. Renderea una polyline + fill suave debajo,
 * con un dot en el último punto. Color = brand del design system.
 */
export function Sparkline({
  values,
  width = 240,
  height = 64,
  color,
  fillOpacity = 0.12,
  max,
  className,
}: Props) {
  if (values.length === 0) {
    return <div style={{ width, height }} className={className} />;
  }

  const padding = 2;
  const minVal = 0;
  const maxVal = Math.max(max ?? Math.max(...values, 1), 1);
  const range = maxVal - minVal || 1;

  const pts = values.map((v, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * (width - 2 * padding);
    const y =
      padding + (1 - (v - minVal) / range) * (height - 2 * padding);
    return [x, y] as const;
  });

  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const fillPath =
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") +
    ` L${pts[pts.length - 1][0]},${height - padding}` +
    ` L${pts[0][0]},${height - padding} Z`;

  const last = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ overflow: "visible" }}
    >
      <path d={fillPath} fill={color} fillOpacity={fillOpacity} />
      <path
        d={linePath}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}
