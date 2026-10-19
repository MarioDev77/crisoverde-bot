# Fase 1 — Diagnóstico (projeto `crisoverde-bot-gemini-etapa4-limpo`)

Nenhum código foi alterado nesta etapa. Só leitura.

## Como está hoje

**Backend** (`backend/`): Express + TypeScript + PostgreSQL. Gemini chamado por REST (`ai/gemini.ts`), sem SDK.
Autenticação por JWT (cookie HttpOnly + header `Authorization` como reserva para Safari/iOS). Rotas em `src/routes.ts`.

**Frontend** (`frontend/`): Next.js 14 (App Router) + Tailwind + `lucide-react`. Páginas: `/`, `/login`, `/cadastro`, `/chat`, `/painel-x7k9` (admin).

**Chat atual** (`frontend/app/chat/page.tsx`, ~270 linhas): uma página só, tema claro ("paper/forest"), cabeçalho simples, lista de mensagens, textarea e botão enviar. Já tem coisas boas que vou preservar:

- trava contra envio duplo, "Tentar de novo" com contagem regressiva, tratamento de `DAILY_LIMIT`;
- markdown seguro sem `dangerouslySetInnerHTML` (`MessageText` + `lib/markdown.ts`), com botão Copiar nos blocos de código;
- indicador "Pesquisando na internet…" só quando `/api/health` diz `search: "on"`;
- painel de Memória completo (`MemoryPanel`) ligado a `/api/me/memory`;
- `100dvh`, `aria-live`, textarea que cresce.

**Fluxo de `POST /api/chat`:** login → `injectionGuard` → validação (máx. 2000 caracteres) → cota diária → memória → histórico → pesquisa (se configurada) → Gemini → resposta com assinatura.

## O que o prompt pede e o projeto NÃO tem hoje

| Pedido do prompt | Situação real | Impacto |
|---|---|---|
| Conversas persistentes, lista, abrir, renomear, excluir | **Não existe.** A conversa vive só na memória do navegador e some ao atualizar. Foi uma escolha de privacidade: README e `ARQUITETURA.md` dizem que o conteúdo das conversas não é guardado. | Exige tabelas novas e muda a política de privacidade. **Decisão sua (ver abaixo).** |
| "Novo chat sem apagar as anteriores" | Hoje não há "anteriores" para preservar. Depende do item acima. | Idem |
| Anexos (imagem, PDF, código) | **Não existe.** `/api/chat` só aceita texto; `express.json` limita o corpo a **50 kb**; `ai/gemini.ts` só monta partes de texto (`parts: [{ text }]`), sem `inlineData`. | Rota nova, limite de tamanho próprio, e adaptar o cliente Gemini. |
| Áudio e transcrição | **Não existe.** | Rota nova + verificação do que o modelo configurado aceita. |
| Modo desenvolvedor / professor / socioambiental | Só o "modo desenvolvedora" existe, **automático** pelo contexto (`prompts/developer.ts`). Professor e socioambiental não existem; não há seletor. | Posso criar um parâmetro `mode` real que acrescenta instruções ao prompt. |
| Notificações | Sem backend. | Não vou mostrar o sino (seria decorativo). |
| Projetos, Arquivos | Sem backend. | Ver decisões. |
| Pesquisa (barra superior/sidebar) | Não há busca de conversas. Se a persistência for feita, busca por título/conteúdo é simples. | Depende da persistência. |
| Controle de tema | Só existe o tema claro. | Ver decisões. |
| Indicador real do modelo | `/api/health` já devolve `engine: "Gemini — <modelo>"`. | Dá para ler o modelo real, sem texto fixo. |
| Indicador real de disponibilidade | `/api/health` existe (`status: ok`). | Dá para usar. |

## Conflitos entre o prompt e o código que preciso resolver

1. **Texto do prompt do sistema desatualizaria.** `prompts/index.ts` (`MEMORY_POLICY`) manda a IA dizer que "o histórico da conversa atual só existe enquanto a página estiver aberta". Se eu persistir conversas, essa frase passa a ser falsa e a IA mentiria ao usuário. Preciso corrigi-la junto.
2. **Histórico assinado (HMAC).** Hoje o cliente devolve o histórico e o servidor só aceita turnos `assistant` assinados. Com conversas guardadas no servidor, o histórico passa a vir do banco, e esse mecanismo deixa de ser necessário para conversas salvas (continua valendo para o modo sem persistência).
3. **CORS** em `index.ts` só libera `GET, POST, DELETE`. Renomear conversa com `PATCH` exige liberar `PATCH` (ou usar `POST`).
4. **Limites existentes:** rate limit geral de 30 req/min por IP e limite diário de mensagens (`chat_events`). Upload e áudio precisam de limites próprios; anexos grandes não podem passar pelo parser de 50 kb.
5. **Conteúdo de arquivo é entrada não confiável.** O texto extraído de um PDF ou arquivo de código pode conter instruções para a IA. Vai entrar delimitado como dado, igual ao que o projeto já faz com resultados de pesquisa; o `injectionGuard` atual só olha a mensagem digitada.
6. **Nome:** a imagem de referência escreve "Chris AI"; o prompt e o projeto usam **CRISO.AI**. Vou usar CRISO.AI em todo o texto.
7. **Tema:** o Tailwind atual define só a paleta clara, e login, cadastro e painel admin usam esses tokens. O tema escuro será aplicado **somente em `/chat`**, com tokens próprios, para não quebrar as outras telas.

## O que não consegui verificar

- O zip não inclui `node_modules` e o ambiente onde trabalho está sem acesso à internet. Por isso **não rodei `tsc`, testes nem build** nesta fase. Nesta fase não precisava, pois nada foi alterado. Antes de entregar a Etapa 3 vou ver se consigo instalar as dependências; se não conseguir, vou dizer claramente que o código não foi compilado.
- Não há como testar o Gemini real aqui (o README já avisa o mesmo). O que o `gemini-3.8-flash` aceita de áudio/PDF vou conferir na documentação oficial na Etapa 4, em vez de supor.

## Decisões que preciso de você antes da Etapa 4 (a Etapa 3 não depende delas)

1. **Guardar conversas no banco?** Necessário para histórico, renomear, excluir, abrir conversa antiga e busca. Custo: o projeto deixa de ser "não guardamos o conteúdo das conversas", e isso precisa constar na política de privacidade. Recomendação: **sim**, com exclusão real (apagar do banco) e conversas visíveis só ao dono.
2. **Projetos e Arquivos na sidebar:** sem backend. Opções: (a) mostrar desabilitados com selo "Em breve"; (b) esconder. Recomendação: **(b) esconder** até existir de verdade, para seguir a regra de não ter controle decorativo.
3. **Tema claro/escuro:** manter só o escuro no chat, ou criar também o claro. Recomendação: **só escuro por enquanto**; sol/lua só entra quando o tema claro do chat existir.
4. **Áudio:** transcrever com o próprio Gemini (sem serviço novo, usa a mesma chave) ou com outro serviço. Recomendação: **Gemini**, após eu confirmar na documentação que o modelo configurado aceita áudio.
