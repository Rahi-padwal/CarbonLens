import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#0f9d58', '#1abc9c', '#4fc3f7', '#9b59b6'];

function PieBreakdownChart({ data }) {
  if (!data?.length) {
    return <p className="empty-state">No data to display.</p>;
  }

  const total = data.reduce((acc, item) => acc + item.emissionKg, 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="emissionKg"
          nameKey="name"
          innerRadius={60}
          outerRadius={110}
          paddingAngle={4}
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [`${value} kg`, name]}
          labelFormatter={() => `Total: ${total.toFixed(2)} kg`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default PieBreakdownChart;
