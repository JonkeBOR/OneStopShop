'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import { fitnessStrings } from '@/lib/strings/fitness';
import {
  type ChartDomain,
  type ChartPoint,
  formatChartDateWithYear,
  type ProgramBand,
  tickFormatterFor,
} from '../domain/progress-chart';
import { formatKg } from '../domain/values';
import styles from './ProgressLineChart.module.css';

type ProgressLineChartProps = {
  label: string;
  points: readonly ChartPoint[];
  domain: ChartDomain;
  bands?: readonly ProgramBand[];
};

const CHART_HEIGHT = 220;
const INITIAL_WIDTH = 320;
const chartMargin = { top: 8, right: 16, bottom: 0, left: 0 };

const bandClasses = [styles.band0, styles.band1, styles.band2, styles.band3];

function ChartTooltip({ active, label, payload }: TooltipContentProps) {
  const kg = payload[0]?.value;
  if (!active || typeof label !== 'number' || typeof kg !== 'number') {
    return null;
  }
  return (
    <p className={styles.tooltip}>
      {fitnessStrings.progress.tooltip(formatChartDateWithYear(label), formatKg(kg))}
    </p>
  );
}

export function ProgressLineChart({ label, points, domain, bands = [] }: ProgressLineChartProps) {
  return (
    <figure className={styles.figure} aria-label={label}>
      <ResponsiveContainer
        width="100%"
        height={CHART_HEIGHT}
        initialDimension={{ width: INITIAL_WIDTH, height: CHART_HEIGHT }}
      >
        <LineChart data={[...points]} margin={chartMargin}>
          <CartesianGrid className={styles.grid} vertical={false} />
          {bands.map((band) => (
            <ReferenceArea
              key={`${band.programId}-${band.from}`}
              className={bandClasses[band.colorIndex] ?? styles.band0}
              x1={band.from}
              x2={band.to}
            />
          ))}
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={domain}
            tickFormatter={tickFormatterFor(domain)}
            className={styles.axis}
            tickLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={formatKg}
            className={styles.axis}
            width="auto"
            tickLine={false}
          />
          <Tooltip content={ChartTooltip} cursor={{ className: styles.cursor }} />
          <Line
            dataKey="kg"
            className={styles.line}
            isAnimationActive={false}
            dot={{ className: styles.dot }}
            activeDot={{ className: styles.activeDot }}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
