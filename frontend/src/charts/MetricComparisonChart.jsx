import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMetric, metricLabel, metricUnit } from '../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';
import { axisProps, CHART, truncate } from './theme.js';

/** Horizontal grouped bars: best and latest value of one metric per experiment. */
export default function MetricComparisonChart({ rows, metric, lowerIsBetter }) {
  const data = rows.map((row) => ({
    label: truncate(row.experiment.name, 30),
    fullName: row.experiment.name,
    best: row.best_value,
    latest: row.latest_value,
  }));
  const height = Math.max(220, data.length * 52 + 70);
  const axisTitle = `${metricLabel(metric)} (${metricUnit(metric)})${lowerIsBetter ? ' — lower is better' : ''}`;

  return (
    <figure className="chart" aria-label={`Bar chart of ${metricLabel(metric)} by experiment`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 28, left: 8 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis
            type="number"
            {...axisProps}
            tickFormatter={formatMetric}
            label={{ value: axisTitle, position: 'insideBottom', offset: -16, fill: CHART.axis, fontSize: CHART.fontSize }}
          />
          <YAxis type="category" dataKey="label" width={210} {...axisProps} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(42, 120, 214, 0.06)' }}
            content={<ChartTooltip title={(point) => point.fullName} />}
          />
          <Legend verticalAlign="top" align="right" iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          <Bar dataKey="best" name="Best run" fill={CHART.series1} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />
          <Bar dataKey="latest" name="Latest run" fill={CHART.series2} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
