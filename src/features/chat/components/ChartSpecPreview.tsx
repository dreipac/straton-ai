import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import type { ChartOptions } from 'chart.js'
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2'
import type { ChartSpecType, ChartSpecV1 } from '../chart/chartSpec'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
)

const SERIES_COLORS = [
  'rgba(59, 130, 246, 0.82)',
  'rgba(16, 185, 129, 0.82)',
  'rgba(245, 158, 11, 0.82)',
  'rgba(168, 85, 247, 0.82)',
  'rgba(236, 72, 153, 0.82)',
  'rgba(20, 184, 166, 0.82)',
  'rgba(239, 68, 68, 0.82)',
  'rgba(99, 102, 241, 0.82)',
  'rgba(132, 204, 22, 0.82)',
  'rgba(14, 165, 233, 0.82)',
]

function colorAt(index: number, alpha = 0.82): string {
  const base = SERIES_COLORS[index % SERIES_COLORS.length]
  if (alpha === 0.82) {
    return base
  }
  return base.replace(/[\d.]+\)$/, `${alpha})`)
}

function buildChartJsData(spec: ChartSpecV1) {
  const isCircular = spec.type === 'pie' || spec.type === 'doughnut'
  return {
    labels: spec.labels,
    datasets: spec.datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      ...(isCircular
        ? {
            backgroundColor: spec.labels.map((_, li) => colorAt(li)),
            borderColor: 'rgba(255,255,255,0.9)',
            borderWidth: 1,
          }
        : {
            backgroundColor: colorAt(i),
            borderColor: colorAt(i, 1),
            borderWidth: spec.type === 'line' ? 2 : 1,
            fill: spec.type === 'line' ? false : undefined,
          }),
    })),
  }
}

function buildOptions(spec: ChartSpecV1): ChartOptions {
  const unit = spec.options?.unit?.trim()
  const stacked = spec.options?.stacked === true && (spec.type === 'bar' || spec.type === 'line')
  const beginAtZero = spec.options?.beginAtZero !== false
  const isCircular = spec.type === 'pie' || spec.type === 'doughnut'

  return {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: isCircular ? 1.35 : 1.8,
    plugins: {
      legend: {
        display: spec.datasets.length > 1 || isCircular,
        position: 'bottom',
      },
      title: {
        display: Boolean(spec.title?.trim()),
        text: spec.title?.trim() ?? '',
        font: { size: 14, weight: 'bold' },
      },
      tooltip: unit
        ? {
            callbacks: {
              label(context) {
                const raw = context.parsed
                const y =
                  typeof raw === 'object' && raw !== null && 'y' in raw
                    ? (raw as { y: number }).y
                    : typeof raw === 'number'
                      ? raw
                      : 0
                const label = context.dataset.label ?? ''
                return `${label}: ${y} ${unit}`.trim()
              },
            },
          }
        : undefined,
    },
    scales: isCircular
      ? undefined
      : {
          x: { stacked },
          y: {
            stacked,
            beginAtZero,
            ticks: unit
              ? {
                  callback(value) {
                    return `${value} ${unit}`
                  },
                }
              : undefined,
          },
        },
  }
}

type Props = {
  spec: ChartSpecV1
}

export function ChartSpecPreviewBuilding() {
  return (
    <div className="chart-spec-preview chart-spec-preview--building" role="status" aria-live="polite">
      <p className="word-outline-paper__building-hint">Diagramm wird aufgebaut …</p>
    </div>
  )
}

export function ChartSpecPreview({ spec }: Props) {
  const data = buildChartJsData(spec)
  const options = buildOptions(spec)
  const chartType = spec.type as ChartSpecType

  return (
    <div className="chart-spec-preview" role="region" aria-label="Diagramm-Vorschau">
      {chartType === 'line' ? (
        <Line data={data} options={options as ChartOptions<'line'>} />
      ) : chartType === 'pie' ? (
        <Pie data={data} options={options as ChartOptions<'pie'>} />
      ) : chartType === 'doughnut' ? (
        <Doughnut data={data} options={options as ChartOptions<'doughnut'>} />
      ) : (
        <Bar data={data} options={options as ChartOptions<'bar'>} />
      )}
    </div>
  )
}
