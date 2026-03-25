import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// GET /api/users/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.userId!)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// PATCH /api/users/me
router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { username, avatar_url, bg_desktop_url, bg_mobile_url, telegram_chat_id } = req.body;

  const updates: Record<string, unknown> = {};
  if (username !== undefined) updates.username = username;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (bg_desktop_url !== undefined) updates.bg_desktop_url = bg_desktop_url;
  if (bg_mobile_url !== undefined) updates.bg_mobile_url = bg_mobile_url;
  if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', req.userId!)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// GET /api/users/all — list all users (for shared tasks UI)
router.get('/all', authMiddleware, async (_req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url');

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

export default router;
