/**
 * Petite bibliothèque de graphiques en SVG (aucune dépendance externe).
 *
 * Règles de lecture appliquées :
 *  - une seule échelle par graphique (jamais deux axes Y) ;
 *  - couleurs catégorielles en ordre fixe, jamais recyclées ;
 *  - libellés de valeur directs + vue tableau, de sorte que l'information ne
 *    repose jamais sur la seule couleur ;
 *  - survol : infobulle sur chaque marque.
 */
import { type ReactNode, useId, useState } from "react";
import { Box, Card, CardContent, Stack, Tooltip, Typography } from "@mui/material";
import { CHART_INK, SERIES_COLORS } from "../../theme";

export function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  const toneColor = {
    neutral: CHART_INK.primary,
    good: "#1b7f4d",
    warning: "#a16207",
    critical: "#b3261e",
  }[tone];
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
          {label}
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 0.5 }}>
          <Typography variant="h4" fontWeight={700} sx={{ color: toneColor, lineHeight: 1.1 }}>
            {value}
          </Typography>
          {unit && (
            <Typography variant="body2" color="text.secondary">
              {unit}
            </Typography>
          )}
        </Stack>
        {hint && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyChart({ message = "Aucune donnée sur la période sélectionnée." }: { message?: string }) {
  return (
    <Box sx={{ py: 4, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color?: string | null;
  secondaryValue?: number | null;
  tooltip?: string;
}

/** Barres horizontales : comparaison de magnitudes entre catégories. */
export function HBarChart({
  data,
  valueSuffix = "",
  color,
  maxBars = 12,
  onSelect,
}: {
  data: BarDatum[];
  valueSuffix?: string;
  color?: string;
  maxBars?: number;
  onSelect?: (key: string) => void;
}) {
  if (data.length === 0) return <EmptyChart />;
  const shown = data.slice(0, maxBars);
  const max = Math.max(...shown.map((d) => d.value), 1);

  return (
    <Stack spacing={1.25}>
      {shown.map((datum) => (
        <Box
          key={datum.key}
          onClick={onSelect ? () => onSelect(datum.key) : undefined}
          sx={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
            <Typography variant="caption" sx={{ color: CHART_INK.secondary }} noWrap title={datum.label}>
              {datum.label}
            </Typography>
            <Typography variant="caption" fontWeight={700} sx={{ color: CHART_INK.primary }}>
              {formatNumber(datum.value)}
              {valueSuffix}
            </Typography>
          </Stack>
          <Tooltip title={datum.tooltip ?? `${datum.label} : ${formatNumber(datum.value)}${valueSuffix}`}>
            <Box sx={{ height: 10, bgcolor: CHART_INK.grid, borderRadius: "5px", overflow: "hidden" }}>
              <Box
                sx={{
                  height: "100%",
                  width: `${Math.max((datum.value / max) * 100, datum.value > 0 ? 2 : 0)}%`,
                  bgcolor: datum.color || color || SERIES_COLORS[0],
                  borderRadius: "5px",
                }}
              />
            </Box>
          </Tooltip>
        </Box>
      ))}
      {data.length > maxBars && (
        <Typography variant="caption" color="text.secondary">
          + {data.length - maxBars} autre(s) — affinez les filtres pour les voir.
        </Typography>
      )}
    </Stack>
  );
}

export interface GroupedDatum {
  key: string;
  label: string;
  values: (number | null)[];
}

/** Barres groupées (2 séries maximum) : planifié vs réel, une seule échelle. */
export function GroupedBarChart({
  data,
  seriesLabels,
  valueSuffix = " j",
  maxGroups = 10,
}: {
  data: GroupedDatum[];
  seriesLabels: string[];
  valueSuffix?: string;
  maxGroups?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const shown = data.slice(0, maxGroups);
  const max = Math.max(...shown.flatMap((d) => d.values.map((v) => v ?? 0)), 1);

  return (
    <Box>
      <ChartLegend items={seriesLabels.map((label, i) => ({ label, color: SERIES_COLORS[i] }))} />
      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        {shown.map((group) => (
          <Box key={group.key}>
            <Typography variant="caption" sx={{ color: CHART_INK.secondary }} noWrap title={group.label}>
              {group.label}
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.25 }}>
              {group.values.map((value, index) => (
                <Stack key={index} direction="row" alignItems="center" spacing={1}>
                  <Tooltip title={`${group.label} — ${seriesLabels[index]} : ${value === null ? "non renseigné" : formatNumber(value) + valueSuffix}`}>
                    <Box sx={{ flexGrow: 1, height: 8, bgcolor: CHART_INK.grid, borderRadius: "4px" }}>
                      <Box
                        sx={{
                          height: "100%",
                          width: `${((value ?? 0) / max) * 100}%`,
                          bgcolor: SERIES_COLORS[index],
                          borderRadius: "4px",
                        }}
                      />
                    </Box>
                  </Tooltip>
                  <Typography variant="caption" sx={{ width: 62, textAlign: "right", color: CHART_INK.primary }}>
                    {value === null ? "—" : `${formatNumber(value)}${valueSuffix}`}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export interface LineSeries {
  label: string;
  points: number[];
}

/** Courbes temporelles avec curseur de survol (une seule échelle Y). */
export function LineChart({
  labels,
  series,
  height = 220,
  valueSuffix = "",
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  valueSuffix?: string;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (labels.length === 0 || series.length === 0) return <EmptyChart />;

  const width = 720;
  const padding = { top: 12, right: 16, bottom: 28, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...series.flatMap((s) => s.points), 1);
  const stepX = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;

  const x = (i: number) => padding.left + i * stepX;
  const y = (value: number) => padding.top + innerHeight - (value / maxValue) * innerHeight;

  const ticks = [0, 0.5, 1].map((r) => Math.round(maxValue * r));
  const labelEvery = Math.ceil(labels.length / 12);

  return (
    <Box>
      <ChartLegend items={series.map((s, i) => ({ label: s.label, color: SERIES_COLORS[i] }))} />
      <Box sx={{ width: "100%", overflowX: "auto", mt: 1 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={`Évolution : ${series.map((s) => s.label).join(", ")}`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={padding.left} y={padding.top} width={innerWidth} height={innerHeight} />
            </clipPath>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={CHART_INK.grid}
                strokeWidth={1}
              />
              <text x={padding.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={10} fill={CHART_INK.muted}>
                {tick}
              </text>
            </g>
          ))}

          {series.map((serie, index) => (
            <polyline
              key={serie.label}
              clipPath={`url(#${clipId})`}
              fill="none"
              stroke={SERIES_COLORS[index]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={serie.points.map((value, i) => `${x(i)},${y(value)}`).join(" ")}
            />
          ))}

          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={padding.top + innerHeight}
              stroke={CHART_INK.muted}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
          {hover !== null &&
            series.map((serie, index) => (
              <circle
                key={serie.label}
                cx={x(hover)}
                cy={y(serie.points[hover] ?? 0)}
                r={4}
                fill={SERIES_COLORS[index]}
                stroke={CHART_INK.surface}
                strokeWidth={2}
              />
            ))}

          {labels.map((label, i) => (
            <g key={label + i}>
              <rect
                x={x(i) - stepX / 2}
                y={padding.top}
                width={Math.max(stepX, 8)}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {i % labelEvery === 0 && (
                <text x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={CHART_INK.muted}>
                  {label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </Box>
      {hover !== null && (
        <Box sx={{ mt: 1, px: 1.5, py: 1, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={700} display="block">
            {labels[hover]}
          </Typography>
          {series.map((serie, index) => (
            <Stack key={serie.label} direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: SERIES_COLORS[index] }} />
              <Typography variant="caption" sx={{ color: CHART_INK.secondary }}>
                {serie.label} : <strong>{formatNumber(serie.points[hover] ?? 0)}{valueSuffix}</strong>
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
      {items.map((item) => (
        <Stack key={item.label} direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: item.color }} />
          <Typography variant="caption" sx={{ color: CHART_INK.secondary }}>
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  return `${Math.round(ratio * 100)} %`;
}
