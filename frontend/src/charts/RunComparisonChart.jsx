import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMetric, metricLabel, metricUnit } from '../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';
import { axisProps, CHART } from './theme.js';

/** One bar per selected run for a single metric (one series, so one color). */
export default function RunComparisonChart({ runs, metric }) {
  const data = runs
    .filter((run) => typeof run.metrics?.[metric] === 'number')
    .map((run) => ({ name: run.name, value: run.metrics[metric] }));

  if (data.length === 0) {
    return <p className="muted">None of the selected runs report {metricLabel(metric)}.</p>;
  }

  return (
    <figure className="chart" aria-label={`Bar chart comparing ${metricLabel(metric)} across runs`}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 16 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="name"
            {...axisProps}
            interval={0}
            label={{ value: 'Run', position: 'insideBottom', offset: -16, fill: CHART.axis, fontSize: CHART.fontSize }}
          />
          <YAxis
            {...axisProps}
            axisLine={false}
            tickFormatter={formatMetric}
            width={64}
            label={{ value: `${metricLabel(metric)} (${metricUnit(metric)})`, angle: -90, position: 'insideLeft', dx: -6, style: { textAnchor: 'middle' }, fill: CHART.axis, fontSize: CHART.fontSize }}
          />
          <Tooltip cursor={{ fill: 'rgba(42, 120, 214, 0.06)' }} content={<ChartTooltip title={(point) => point.name} />} />
          <Bar dataKey="value" name={metricLabel(metric)} fill={CHART.series1} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
