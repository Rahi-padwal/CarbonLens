const API_BASE = import.meta.env.VITE_API_BASE || '';

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  return query.toString() ? `?${query.toString()}` : '';
}

export async function fetchActivities({ userEmail, userId, start, end, limit = 200 }) {
  const query = buildQuery({
    userEmail,
    userId,
    since: start,
    until: end,
    limit,
  });
  const url = API_BASE ? `${API_BASE}/api/activities${query}` : `/api/activities${query}`;
  console.log('[API] Fetching activities from:', url);
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    console.error('[API] Error response:', message);
    throw new Error(message || 'Failed to fetch activities');
  }
  const data = await response.json();
  console.log('[API] Full Response:', JSON.stringify(data, null, 2));
  console.log('[API] Response Summary:', { 
    success: data.success, 
    count: data.count, 
    activitiesLength: data.activities?.length || 0,
    firstActivity: data.activities?.[0] || null
  });
  return data;
}

export async function fetchInsights({ userEmail, userId, period = 'weekly' }) {
  const query = buildQuery({
    userEmail,
    userId,
    period,
  });
  const url = API_BASE ? `${API_BASE}/api/insights${query}` : `/api/insights${query}`;
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch insights');
  }
  return response.json();
}
