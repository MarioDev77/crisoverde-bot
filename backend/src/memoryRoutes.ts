/**
 * memoryRoutes.ts — o usuário autenticado consulta, corrige e apaga a PRÓPRIA memória.
 *
 * A memória é sempre a do usuário da sessão (req.user.id): não existe parâmetro de id,
 * então não há como acessar a memória de outra pessoa. O `auth` é injetado para facilitar testes.
 */
import { Router, Request, Response, RequestHandler } from "express";
import { applyMemoryEdit, clearMemory, getMemory, memoryView, parseMemoryEdit, saveMemory } from "./memory";
import { logger } from "./logger";

export function createMemoryRouter(auth: RequestHandler): Router {
  const router = Router();

  // GET /me/memory — tudo o que está guardado sobre o usuário
  router.get("/me/memory", auth, async (req: Request, res: Response) => {
    try {
      const memory = await getMemory(req.user!.id);
      return res.status(200).json({ memory: memoryView(memory) });
    } catch (err) {
      logger.error("Erro ao ler memória do usuário", { err: String(err) });
      return res.status(500).json({ error: "Erro ao ler sua memória.", code: "INTERNAL_ERROR" });
    }
  });

  // POST /me/memory — corrigir (set), adicionar (add) ou remover (remove) informações
  // (POST em vez de PATCH porque o CORS do backend só libera GET/POST/DELETE)
  router.post("/me/memory", auth, async (req: Request, res: Response) => {
    const { edit, error } = parseMemoryEdit(req.body);
    if (!edit) return res.status(400).json({ error, code: "INVALID_INPUT" });

    try {
      const current = await getMemory(req.user!.id);
      const { memory, rejected } = applyMemoryEdit(current, edit);
      await saveMemory(req.user!.id, memory, { touch: false });
      // Log sem os valores — só o tipo de operação
      logger.info("Memória editada pelo usuário", {
        userId: req.user!.id,
        ops: Object.keys(edit),
        rejected: rejected.length,
      });
      return res.status(200).json({ memory: memoryView(memory), rejected });
    } catch (err) {
      logger.error("Erro ao editar memória do usuário", { err: String(err) });
      return res.status(500).json({ error: "Erro ao salvar sua memória.", code: "INTERNAL_ERROR" });
    }
  });

  // DELETE /me/memory — apaga tudo
  router.delete("/me/memory", auth, async (req: Request, res: Response) => {
    try {
      await clearMemory(req.user!.id);
      logger.info("Memória apagada pelo usuário", { userId: req.user!.id });
      return res.status(200).json({ message: "Memória apagada.", memory: memoryView(await getMemory(req.user!.id)) });
    } catch (err) {
      logger.error("Erro ao apagar memória do usuário", { err: String(err) });
      return res.status(500).json({ error: "Erro ao apagar sua memória.", code: "INTERNAL_ERROR" });
    }
  });

  return router;
}
