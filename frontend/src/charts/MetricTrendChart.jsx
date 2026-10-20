import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateTime, formatMetric, formatShortDate, metricLabel, metricUnit } from '../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';
import { axisProps, CHART } from './theme.js';

/** One metric across an experiment's completed runs, ordered by start time. */
export default function MetricTrendChart({ runs, metric }) {
  const data = runs
    .filter((run) => run.status === 'completed' && typeof run.metrics?.[metric] === 'number')
    .map((run) => ({ time: new Date(run.started_at).getTime(), value: run.metrics[metric], name: run.name }))
    .sort((a, b) => a.time - b.time);

  if (data.length === 0) {
    return <p className="muted">No completed runs report {metricLabel(metric)} yet.</p>;
  }

  return (
    <figure className="chart" aria-label={`Line chart of ${metricLabel(metric)} over runs`}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 28, left: 16 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            padding={{ left: 16, right: 16 }}
            tickFormatter={(value) => formatShortDate(new Date(value).toISOString())}
            {...axisProps}
            label={{ value: 'Run start date', position: 'insideBottom', offset: -16, fill: CHART.axis, fontSize: CHART.fontSize }}
          />
          <YAxis
            {...axisProps}
            axisLine={false}
            tickFormatter={formatMetric}
            width={64}
            domain={['auto', 'auto']}
            label={{ value: `${metricLabel(metric)} (${metricUnit(metric)})`, angle: -90, position: 'insideLeft', offset: 0, dx: -6, style: { textAnchor: 'middle' }, fill: CHART.axis, fontSize: CHART.fontSize }}
          />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={<ChartTooltip title={(point) => `${point.name} · ${formatDateTime(new Date(point.time).toISOString())}`} />}
          />
          <Line
            type="linear"
            dataKey="value"
            name={metricLabel(metric)}
            stroke={CHART.series1}
            strokeWidth={2}
            dot={{ r: 4, fill: CHART.series1, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
