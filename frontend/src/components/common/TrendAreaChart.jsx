import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function TrendAreaChart({ data, dataKey = 'emissionKg', color = '#0f9d58' }) {
  if (!data?.length) {
    return <p className="empty-state">No data available for this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="emissionGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.9} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} dy={6} />
        <YAxis tick={{ fontSize: 12 }} width={70} />
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <Tooltip formatter={(value) => [`${value} kg`, 'Emission']} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fill="url(#emissionGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default TrendAreaChart;
