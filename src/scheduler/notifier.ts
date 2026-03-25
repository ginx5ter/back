import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '../bot/telegram';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const SOON_THRESHOLD_HOURS = 2; // notify 2h before deadline

export function startScheduler() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await checkDeadlines();
  });

  console.log('⏰ Deadline scheduler started (every 5 minutes)');
}

async function checkDeadlines() {
  const now = new Date();
  const soonTime = new Date(now.getTime() + SOON_THRESHOLD_HOURS * 60 * 60 * 1000);

  // Tasks approaching deadline (within 2 hours), not yet notified
  const { data: soonTasks } = await supabase
    .from('tasks')
    .select('id, title, description, deadline, urgency, created_by, profiles:created_by(telegram_chat_id)')
    .eq('status', 'active')
    .eq('notified_soon', false)
    .not('deadline', 'is', null)
    .lte('deadline', soonTime.toISOString())
    .gte('deadline', now.toISOString());

  for (const task of soonTasks || []) {
    const profile = (task.profiles as unknown) as { telegram_chat_id: number | null } | null;
    if (!profile?.telegram_chat_id) continue;

    const deadline = new Date(task.deadline!);
    const minutesLeft = Math.round((deadline.getTime() - now.getTime()) / 60000);

    const message =
      `⚠️ *Скоро дедлайн!*\n\n` +
      `📌 *${task.title}*\n` +
      `${task.description ? `📝 ${task.description}\n` : ''}` +
      `⏰ Осталось: ${minutesLeft} мин\n` +
      `📅 Дедлайн: ${deadline.toLocaleString('ru-RU')}`;

    await sendNotification(profile.telegram_chat_id, message);
    await supabase.from('tasks').update({ notified_soon: true }).eq('id', task.id);
  }

  // Overdue tasks, not yet notified
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('id, title, description, deadline, urgency, created_by, profiles:created_by(telegram_chat_id)')
    .eq('status', 'active')
    .eq('notified_overdue', false)
    .not('deadline', 'is', null)
    .lt('deadline', now.toISOString());

  for (const task of overdueTasks || []) {
    const profile = (task.profiles as unknown) as { telegram_chat_id: number | null } | null;
    if (!profile?.telegram_chat_id) continue;

    const deadline = new Date(task.deadline!);
    const hoursAgo = Math.round((now.getTime() - deadline.getTime()) / 3600000);

    const message =
      `🔴 *Задача просрочена!*\n\n` +
      `📌 *${task.title}*\n` +
      `${task.description ? `📝 ${task.description}\n` : ''}` +
      `📅 Была: ${deadline.toLocaleString('ru-RU')}\n` +
      `😬 Просрочено на: ${hoursAgo}ч`;

    await sendNotification(profile.telegram_chat_id, message);
    await supabase.from('tasks').update({ notified_overdue: true }).eq('id', task.id);
  }
}
