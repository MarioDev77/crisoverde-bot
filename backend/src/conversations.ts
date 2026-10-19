import { Router, Request, Response } from "express";
import { authPool } from "./auth";
import { requireAuth } from "./authMiddleware";
import { logger } from "./logger";

export async function initConversationsDB(): Promise<void> {
  await authPool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Nova conversa',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await authPool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      sig TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await authPool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)`);
  await authPool.query(`CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id, id)`);
}

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.get("/conversations", async (req: Request, res: Response) => {
  try {
    const q = await authPool.query(
      `SELECT c.id, c.title, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
       (SELECT COUNT(*)::int FROM conversation_messages m WHERE m.conversation_id=c.id) AS "messageCount"
       FROM conversations c WHERE c.user_id=$1 ORDER BY c.updated_at DESC LIMIT 100`, [req.user!.id]);
    res.json({ conversations: q.rows });
  } catch (e) { logger.error("Falha ao listar conversas", { error: String(e) }); res.status(500).json({ error: "Não foi possível carregar o histórico." }); }
});

conversationsRouter.get("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const conv = await authPool.query(`SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM conversations WHERE id=$1 AND user_id=$2`, [req.params.id, req.user!.id]);
    if (!conv.rowCount) return res.status(404).json({ error: "Conversa não encontrada." });
    const messages = await authPool.query(`SELECT role, content, sig, created_at AS "createdAt" FROM conversation_messages WHERE conversation_id=$1 AND user_id=$2 ORDER BY id ASC`, [req.params.id, req.user!.id]);
    res.json({ ...conv.rows[0], messages: messages.rows });
  } catch (e) { logger.error("Falha ao abrir conversa", { error: String(e) }); res.status(500).json({ error: "Não foi possível abrir a conversa." }); }
});

conversationsRouter.patch("/conversations/:id", async (req: Request, res: Response) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : "";
  if (!title) return res.status(400).json({ error: "Informe um título válido." });
  try {
    const q = await authPool.query(`UPDATE conversations SET title=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING id,title,updated_at AS "updatedAt"`, [title, req.params.id, req.user!.id]);
    if (!q.rowCount) return res.status(404).json({ error: "Conversa não encontrada." });
    res.json(q.rows[0]);
  } catch (e) { logger.error("Falha ao renomear conversa", { error: String(e) }); res.status(500).json({ error: "Não foi possível renomear." }); }
});

conversationsRouter.delete("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const q = await authPool.query(`DELETE FROM conversations WHERE id=$1 AND user_id=$2 RETURNING id`, [req.params.id, req.user!.id]);
    if (!q.rowCount) return res.status(404).json({ error: "Conversa não encontrada." });
    res.json({ ok: true });
  } catch (e) { logger.error("Falha ao excluir conversa", { error: String(e) }); res.status(500).json({ error: "Não foi possível excluir a conversa." }); }
});

/** Persiste um turno e cria a conversa na primeira mensagem, sempre vinculada ao usuário autenticado. */
export async function persistTurn(userId: string, conversationId: string | undefined, userText: string, assistantText: string, sig?: string): Promise<string> {
  const client = await authPool.connect();
  try {
    await client.query("BEGIN");
    let id = conversationId;
    if (id) {
      const owned = await client.query(`SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, userId]);
      if (!owned.rowCount) throw new Error("CONVERSATION_NOT_FOUND");
    } else {
      const title = userText.replace(/\s+/g, " ").trim().slice(0, 60) || "Nova conversa";
      const created = await client.query(`INSERT INTO conversations(user_id,title) VALUES($1,$2) RETURNING id`, [userId, title]);
      id = created.rows[0].id;
    }
    await client.query(`INSERT INTO conversation_messages(conversation_id,user_id,role,content) VALUES($1,$2,'user',$3)`, [id, userId, userText]);
    await client.query(`INSERT INTO conversation_messages(conversation_id,user_id,role,content,sig) VALUES($1,$2,'assistant',$3,$4)`, [id, userId, assistantText, sig ?? null]);
    await client.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1 AND user_id=$2`, [id, userId]);
    await client.query("COMMIT");
    return id!;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
