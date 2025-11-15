import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import duration from 'dayjs/plugin/duration';

dayjs.extend(isoWeek);
dayjs.extend(duration);

export function buildAggregations({ activities = [], range }) {
  const summary = buildSummary(activities);
  const charts = buildCharts(activities);
  const emailInsights = buildEmailStats(activities);
  const meetingInsights = buildMeetingStats(activities);
  const storageInsights = buildStorageStats(activities);

  return {
    summary,
    charts,
    emailInsights,
    meetingInsights,
    storageInsights,
    range,
  };
}

function buildSummary(activities) {
  if (!activities.length) {
    return {
      totalEmissionKg: 0,
      totalActivities: 0,
      lastActivityAt: null,
      byType: {},
      averageEmailEmissionKg: 0,
    };
  }

  let totalEmissionKg = 0;
  let lastActivityAt = null;
  const byType = {};
  let emailEmission = 0;
  let emailCount = 0;

  activities.forEach((activity) => {
    // Use the new user-provided formula for email emissions when possible:
    // CO2 (grams) ≈ C + A × S where C=0.3 g, A=15 g/MB, S=attachment MB
    let emission = activity.emission_kg || activity.emissionKg || 0;
    try {
      const type = activity.activity_type || activity.activityType || 'unknown';
      if (type === 'email') {
        const payload = activity.payload || {};
        const attachmentBytes = payload.attachment_bytes || payload.attachmentBytes || 0;
        const attachmentMb = (attachmentBytes || 0) / 1_000_000;
        const C = 0.3; // grams
        const A = 15; // grams per MB
        const grams = C + A * Math.max(0, attachmentMb);
        emission = grams / 1000; // convert to kg
      }
    } catch (e) {
      // fallback to stored emission
      emission = activity.emission_kg || activity.emissionKg || 0;
    }
    totalEmissionKg += emission;

    if (activity.timestamp) {
      const ts = dayjs(activity.timestamp);
      if (!lastActivityAt || ts.isAfter(lastActivityAt)) {
        lastActivityAt = ts;
      }
    }

    const type = activity.activity_type || activity.activityType || 'unknown';
    byType[type] = byType[type] || { count: 0, emissionKg: 0 };
    byType[type].count += 1;
    byType[type].emissionKg += emission;

    if (type === 'email') {
      emailCount += 1;
      emailEmission += emission;
    }
  });

  return {
    totalEmissionKg: round(totalEmissionKg),
    totalActivities: activities.length,
    lastActivityAt,
    byType,
    averageEmailEmissionKg: emailCount ? round(emailEmission / emailCount) : 0,
  };
}

function buildCharts(activities) {
  const byDay = {};
  const byType = {};

  activities.forEach((activity) => {
    const dateKey = dayjs(activity.timestamp).format('YYYY-MM-DD');
    const type = activity.activity_type || activity.activityType || 'unknown';
    const emission = activity.emission_kg || activity.emissionKg || 0;

    byDay[dateKey] = byDay[dateKey] || { date: dateKey, emissionKg: 0, count: 0 };
    byDay[dateKey].emissionKg += emission;
    byDay[dateKey].count += 1;

    byType[type] = byType[type] || { name: typeLabel(type), emissionKg: 0, count: 0 };
    byType[type].emissionKg += emission;
    byType[type].count += 1;
  });

  const dailySeries = Object.values(byDay)
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((item) => ({
      ...item,
      emissionKg: round(item.emissionKg),
    }));

  const typeSeries = Object.values(byType).map((item) => ({
    ...item,
    emissionKg: round(item.emissionKg),
  }));

  return {
    dailySeries,
    typeSeries,
  };
}

function buildEmailStats(activities) {
  const emails = activities.filter((item) => (item.activity_type || item.activityType) === 'email');
  if (!emails.length) {
    return {
      total: 0,
      emissionKg: 0,
      avgRecipients: 0,
      attachments: 0,
      series: [],
      attachmentsTable: [],
    };
  }

  let totalRecipients = 0;
  let attachments = 0;

  const seriesByDay = {};
  const attachmentsRows = [];

  emails.forEach((email) => {
    const emission = email.emission_kg || email.emissionKg || 0;
    const dateKey = dayjs(email.timestamp).format('YYYY-MM-DD');
    const recipients = email.payload?.recipients || [];
    const attachmentCount = email.payload?.attachment_count || email.payload?.attachmentCount || 0;
    const attachmentBytes = email.payload?.attachment_bytes || email.payload?.attachmentBytes || 0;

    totalRecipients += recipients.length;
    attachments += attachmentCount;

    seriesByDay[dateKey] = seriesByDay[dateKey] || { date: dateKey, emails: 0, emissionKg: 0 };
    seriesByDay[dateKey].emails += 1;
    seriesByDay[dateKey].emissionKg += emission;

    if (attachmentCount > 0) {
      attachmentsRows.push({
        subject: email.payload?.subject || '(no subject)',
        attachmentCount,
        attachmentSizeMb: round(attachmentBytes / 1_000_000),
        date: dateKey,
      });
    }
  });

  return {
    total: emails.length,
    emissionKg: round(sum(emails.map((item) => item.emission_kg || item.emissionKg || 0))),
    avgRecipients: round(totalRecipients / emails.length || 0, 2),
    attachments,
    series: Object.values(seriesByDay).map((item) => ({
      ...item,
      emissionKg: round(item.emissionKg),
    })),
    attachmentsTable: attachmentsRows.slice(0, 10),
  };
}

function buildMeetingStats(activities) {
  const meetings = activities.filter((item) => (item.activity_type || item.activityType) === 'meeting');
  if (!meetings.length) {
    return {
      total: 0,
      emissionKg: 0,
      totalMinutes: 0,
      avgParticipants: 0,
      series: [],
    };
  }

  let totalMinutes = 0;
  let totalParticipants = 0;
  const series = {};

  meetings.forEach((meeting) => {
    const emission = meeting.emission_kg || meeting.emissionKg || 0;
    const dateKey = dayjs(meeting.timestamp).format('YYYY-MM-DD');
    const durationMinutes = meeting.payload?.duration_minutes || meeting.payload?.durationMinutes || 0;
    const participants = meeting.payload?.participants_count || meeting.payload?.participantsCount || 1;

    totalMinutes += durationMinutes;
    totalParticipants += participants;

    series[dateKey] = series[dateKey] || { date: dateKey, minutes: 0, emissionKg: 0 };
    series[dateKey].minutes += durationMinutes;
    series[dateKey].emissionKg += emission;
  });

  return {
    total: meetings.length,
    emissionKg: round(sum(meetings.map((meeting) => meeting.emission_kg || meeting.emissionKg || 0))),
    totalMinutes,
    avgParticipants: round(totalParticipants / meetings.length || 0, 1),
    series: Object.values(series).map((item) => ({
      ...item,
      emissionKg: round(item.emissionKg),
    })),
  };
}

function buildStorageStats(activities) {
  const storage = activities.filter((item) => (item.activity_type || item.activityType) === 'storage');
  if (!storage.length) {
    return {
      total: 0,
      emissionKg: 0,
      uploadedMb: 0,
      actions: [],
    };
  }

  let uploadedMb = 0;
  const actions = storage.map((item) => {
    const sizeMb = item.payload?.size_mb || item.payload?.sizeMb || 0;
    uploadedMb += sizeMb;
    return {
      date: dayjs(item.timestamp).format('YYYY-MM-DD'),
      action: item.payload?.action || 'update',
      sizeMb: round(sizeMb, 2),
      emissionKg: round(item.emission_kg || item.emissionKg || 0),
    };
  });

  return {
    total: storage.length,
    emissionKg: round(sum(storage.map((item) => item.emission_kg || item.emissionKg || 0))),
    uploadedMb: round(uploadedMb, 2),
    actions: actions.slice(0, 10),
  };
}

function typeLabel(type) {
  const mapping = {
    email: 'Email',
    meeting: 'Meetings',
    storage: 'Storage',
    browsing: 'Web Browsing',
  };
  return mapping[type] || type;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function round(value, precision = 3) {
  return Number.parseFloat(value || 0).toFixed(precision) * 1;
}
