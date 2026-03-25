import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// GET /api/tasks — list tasks (personal or shared)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { visibility } = req.query;
  
  let query = supabase
    .from('tasks')
    .select(`
      *,
      profiles:created_by (id, username, avatar_url),
      task_tags (tag_id, tags (id, name, color)),
      task_comments (id, content, created_at, profiles:user_id (id, username, avatar_url))
    `)
    .order('created_at', { ascending: false });

  if (visibility === 'personal') {
    query = query.eq('visibility', 'personal').eq('created_by', req.userId!);
  } else if (visibility === 'shared') {
    query = query.eq('visibility', 'shared');
  } else {
    query = query.or(`visibility.eq.shared,and(visibility.eq.personal,created_by.eq.${req.userId})`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// POST /api/tasks — create task
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, description, visibility, deadline, urgency, repeat_interval, tag_ids } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      visibility: visibility || 'personal',
      deadline: deadline || null,
      urgency: urgency || 'medium',
      repeat_interval: repeat_interval || null,
      created_by: req.userId!,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Attach tags
  if (tag_ids && tag_ids.length > 0) {
    await supabase.from('task_tags').insert(
      tag_ids.map((tag_id: string) => ({ task_id: task.id, tag_id }))
    );
  }

  return res.status(201).json(task);
});

// PATCH /api/tasks/:id — update task
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, visibility, deadline, urgency, status, repeat_interval, tag_ids } = req.body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (visibility !== undefined) updates.visibility = visibility;
  if (deadline !== undefined) updates.deadline = deadline;
  if (urgency !== undefined) updates.urgency = urgency;
  if (repeat_interval !== undefined) updates.repeat_interval = repeat_interval;
  if (status !== undefined) {
    updates.status = status;
    updates.completed_at = status === 'completed' ? new Date().toISOString() : null;
    // Reset notified flags when re-activating
    if (status === 'active') {
      updates.notified_soon = false;
      updates.notified_overdue = false;
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('created_by', req.userId!)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Update tags
  if (tag_ids !== undefined) {
    await supabase.from('task_tags').delete().eq('task_id', id);
    if (tag_ids.length > 0) {
      await supabase.from('task_tags').insert(
        tag_ids.map((tag_id: string) => ({ task_id: id, tag_id }))
      );
    }
  }

  return res.json(data);
});

// DELETE /api/tasks/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('created_by', req.userId!);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: id, user_id: req.userId!, content })
    .select('*, profiles:user_id (id, username, avatar_url)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// GET /api/tasks/tags — list user tags
router.get('/tags', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('created_by', req.userId!);

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// POST /api/tasks/tags
router.post('/tags', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, color } = req.body;

  const { data, error } = await supabase
    .from('tags')
    .insert({ name, color: color || '#6366f1', created_by: req.userId! })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

export default router;
