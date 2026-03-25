import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';

let bot: TelegramBot | null = null;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export function getBot(): TelegramBot | null {
  return bot;
}

export function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — bot disabled');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram bot started');

  // /start — link Telegram account
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot!.sendMessage(
      chatId,
      `👋 Привет! Я бот TaskPlanner.\n\nЧтобы привязать аккаунт, отправь:\n/link <твой_user_id>\n\nUser ID можно найти в профиле на сайте.`
    );
  });

  // /link <user_id> — link chat to profile
  bot.onText(/\/link (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match![1].trim();

    const { error } = await supabase
      .from('profiles')
      .update({ telegram_chat_id: chatId })
      .eq('id', userId);

    if (error) {
      await bot!.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    } else {
      await bot!.sendMessage(chatId, `✅ Аккаунт привязан! Теперь ты будешь получать уведомления о задачах.`);
    }
  });

  // /tasks — list active personal tasks
  bot.onText(/\/tasks/, async (msg) => {
    const chatId = msg.chat.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .single();

    if (!profile) {
      await bot!.sendMessage(chatId, `❌ Аккаунт не привязан. Используй /link <user_id>`);
      return;
    }

    const { data: tasks } = await supabase
      .from('tasks')
      .select('title, description, deadline, urgency, visibility')
      .eq('created_by', profile.id)
      .eq('visibility', 'personal')
      .eq('status', 'active')
      .order('deadline', { ascending: true });

    if (!tasks || tasks.length === 0) {
      await bot!.sendMessage(chatId, `✨ Нет активных личных задач!`);
      return;
    }

    const urgencyEmoji: Record<string, string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };

    let text = `📋 *Активные личные задачи (${tasks.length}):*\n\n`;
    tasks.forEach((t, i) => {
      const emoji = urgencyEmoji[t.urgency] || '⚪';
      const deadline = t.deadline
        ? `📅 ${new Date(t.deadline).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
        : '📅 Без срока';
      text += `${i + 1}. ${emoji} *${t.title}*\n`;
      if (t.description) text += `   ${t.description.substring(0, 80)}${t.description.length > 80 ? '...' : ''}\n`;
      text += `   ${deadline}\n\n`;
    });

    await bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });

  // /unlink — remove Telegram link
  bot.onText(/\/unlink/, async (msg) => {
    const chatId = msg.chat.id;
    await supabase
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('telegram_chat_id', chatId);

    await bot!.sendMessage(chatId, `✅ Аккаунт отвязан. Уведомления отключены.`);
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error);
  });
}

export async function sendNotification(chatId: number, message: string) {
  if (!bot) return;
  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}
