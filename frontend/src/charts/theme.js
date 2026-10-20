// Chart colors mirror the tokens in styles/tokens.css. Recharts needs literal
// values for SVG attributes, so they are repeated here.
export const CHART = {
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#e6e9f0',
  axis: '#5b6579',
  text: '#1b2333',
  fontSize: 12,
};

export const axisProps = {
  stroke: CHART.grid,
  tick: { fill: CHART.axis, fontSize: CHART.fontSize },
  tickLine: false,
};

export function truncate(text, max = 32) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
