// src/components/AnalysisChartRenderer.tsx
// Renders analysis responses that may contain inline ==CHART==...==END_CHART== blocks
// alongside regular markdown text.

import { useState, useEffect, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from "recharts";
import { renderMarkdown } from "./ChatComponents";

// ============================================================================
// TYPES
// ============================================================================

interface ChartData {
  type: "pie" | "bar" | "line" | "table";
  title?: string;
  data: Array<Record<string, unknown>>;
  xKey?: string;
  yKey?: string;
  nameKey?: string;
  valueKey?: string;
}

type Segment =
  | { type: "markdown"; content: string }
  | { type: "chart"; data: ChartData };

interface AnalysisChartRendererProps {
  text: string;
  isLatestAi?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHART_COLORS = [
  "#101113", "#4a7c4e", "#d4a574", "#8b9a46", "#c9a87c", "#6b8e4e",
  "#7c6f64", "#a67c52", "#5e8c61", "#3d5a45",
];

// ============================================================================
// PARSING
// ============================================================================

function parseResponseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const chartRegex = /==CHART==\n?([\s\S]*?)\n?==END_CHART==/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = chartRegex.exec(text)) !== null) {
    // Add markdown before this chart block
    if (match.index > lastIndex) {
      const md = text.slice(lastIndex, match.index).trim();
      if (md) segments.push({ type: "markdown", content: md });
    }

    // Parse chart JSON
    try {
      const chartData = JSON.parse(match[1]) as ChartData;
      if (chartData.type && chartData.data && Array.isArray(chartData.data)) {
        segments.push({ type: "chart", data: chartData });
      } else {
        // Invalid structure — render as markdown
        segments.push({ type: "markdown", content: match[0] });
      }
    } catch {
      // JSON parse failed — render raw block as markdown
      segments.push({ type: "markdown", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last chart
  if (lastIndex < text.length) {
    const md = text.slice(lastIndex).trim();
    if (md) segments.push({ type: "markdown", content: md });
  }

  return segments;
}

// ============================================================================
// AUTO-DETECT KEYS
// ============================================================================

function detectKeys(data: Array<Record<string, unknown>>, nameKeyHint?: string, valueKeyHint?: string) {
  if (!data.length) return { nameKey: "name", valueKey: "value" };

  const first = data[0];
  const keys = Object.keys(first);

  let nameKey = nameKeyHint || keys.find(k => typeof first[k] === "string") || keys[0];
  let valueKey = valueKeyHint || keys.find(k => typeof first[k] === "number" && k !== nameKey) || keys[1];

  return { nameKey, valueKey };
}

// ============================================================================
// CHART COMPONENTS
// ============================================================================

function PieChartBlock({ chart }: { chart: ChartData }) {
  const { nameKey, valueKey } = detectKeys(chart.data, chart.nameKey, chart.valueKey);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chart.data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={(props: PieLabelRenderProps) => {
            const name = String(props.name ?? "");
            const percent = Number(props.percent ?? 0);
            return `${name} ${(percent * 100).toFixed(0)}%`;
          }}
        >
          {chart.data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BarChartBlock({ chart }: { chart: ChartData }) {
  const { nameKey, valueKey } = detectKeys(chart.data, chart.xKey, chart.yKey);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chart.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,17,19,0.08)" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey={valueKey} radius={[4, 4, 0, 0]}>
          {chart.data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartBlock({ chart }: { chart: ChartData }) {
  const { nameKey, valueKey } = detectKeys(chart.data, chart.xKey, chart.yKey);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chart.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(16,17,19,0.08)" />
        <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey={valueKey}
          stroke="#101113"
          strokeWidth={2}
          dot={{ fill: "#101113", r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TableBlock({ chart }: { chart: ChartData }) {
  if (!chart.data.length) return null;
  const headers = Object.keys(chart.data[0]);

  return (
    <table className="analysis_chartTable">
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chart.data.map((row, i) => (
          <tr key={i}>
            {headers.map(h => (
              <td key={h}>{String(row[h] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartBlock({ chart }: { chart: ChartData }) {
  switch (chart.type) {
    case "pie":   return <PieChartBlock chart={chart} />;
    case "bar":   return <BarChartBlock chart={chart} />;
    case "line":  return <LineChartBlock chart={chart} />;
    case "table": return <TableBlock chart={chart} />;
    default:      return <p>Unknown chart type: {chart.type}</p>;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AnalysisChartRenderer({ text, isLatestAi = false }: AnalysisChartRendererProps) {
  // Typewriter effect (same pattern as MessageBubble)
  const shouldType = isLatestAi;
  const [typedLength, setTypedLength] = useState(() => shouldType ? 0 : text.length);
  const hasTypedRef = useRef(!shouldType);

  useEffect(() => {
    if (!isLatestAi || hasTypedRef.current) return;

    const total = text.length;
    if (total === 0) { hasTypedRef.current = true; return; }

    const tickMs = 14;
    const totalTicks = Math.max(20, Math.min(60, Math.ceil(total / 8)));
    const charsPerTick = Math.ceil(total / totalTicks);

    let current = 0;
    const timer = setInterval(() => {
      current += charsPerTick;
      if (current >= total) {
        setTypedLength(total);
        hasTypedRef.current = true;
        clearInterval(timer);
      } else {
        setTypedLength(current);
      }
    }, tickMs);

    return () => clearInterval(timer);
  }, [isLatestAi, text]);

  const isTyping = typedLength < text.length;
  const displayText = isTyping ? text.slice(0, typedLength) : text;
  const segments = parseResponseSegments(displayText);

  return (
    <div className="analysis_chartRenderer">
      {segments.map((seg, i) =>
        seg.type === "markdown" ? (
          <div key={i} className="dash_messageText">
            {renderMarkdown(seg.content)}
          </div>
        ) : (
          <div key={i} className="analysis_chartBlock">
            {seg.data.title && (
              <h4 className="analysis_chartTitle">{seg.data.title}</h4>
            )}
            <div className="analysis_chartContainer">
              <ChartBlock chart={seg.data} />
            </div>
          </div>
        )
      )}
      {isTyping && <span className="dash_typingCursor" />}
    </div>
  );
}
