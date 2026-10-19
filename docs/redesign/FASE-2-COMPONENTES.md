# Fase 2 — Mapa de componentes

Nenhum código foi alterado nesta etapa. Baseado na leitura de `frontend/` e `backend/` e na imagem `referencia-visual.png`.

Premissa das decisões pendentes da Fase 1: usei as recomendações (conversas guardadas no banco a partir da Etapa 4a, Projetos/Arquivos escondidos, só tema escuro, áudio via Gemini). Se você decidir diferente, só os itens marcados com ⚠ mudam.

## 1. O que reaproveitar sem mexer

| Arquivo | Por quê |
|---|---|
| `lib/api.ts` | Cliente HTTP com cookie + Bearer. Só ganha `patch` e suporte a `FormData` (hoje força `Content-Type: application/json`, o que quebraria upload). Mudança aditiva. |
| `lib/auth-context.tsx`, `components/AuthGuard.tsx` | Login/sessão já funcionam; o novo layout só consome `useAuth()`. |
| `lib/markdown.ts` | Parser seguro, sem HTML. **Não pode mudar de caminho nem de exports:** `backend/tests/markdown.test.ts` importa `../../frontend/lib/markdown`. |
| `lib/types.ts` | Só recebe tipos novos (conversa, anexo, modo). |
| `app/login`, `app/cadastro`, `app/page.tsx`, `app/painel-x7k9`, `StatCard`, `MetricsChart`, `UsersTable`, `SecurityTable` | Fora do escopo. Não serão tocados. |

## 2. O que reaproveitar com adaptação

| Arquivo | O que muda | Risco |
|---|---|---|
| `components/MessageText.tsx` | Cores fixas do tema claro (`bg-paper` no código inline, `border-forest/30`, `text-ink/70`, bloco de código `bg-ink text-paper`) passam a usar tokens do tema escuro. A lógica de render **não muda** (continua sem `dangerouslySetInnerHTML`). | Baixo. Só é usado no chat. |
| `components/MemoryPanel.tsx` | Continua um modal (`role="dialog"`, Esc fecha, foco no botão fechar). Cores migram para o tema escuro. Passa a abrir pela sidebar e pelo painel direito, além do botão atual. | Baixo. Só é usado no chat. |
| `app/chat/page.tsx` (292 linhas) | A **lógica** é boa e vai para um hook `useChat`: trava síncrona `sendingRef`, `submit/retry`, contagem regressiva, tratamento de `DAILY_LIMIT`, indicador de pesquisa via `/health`. O **JSX** é substituído pelo novo layout. | Médio: é onde regressão aparece. Vou manter a lógica linha a linha. |
| `tailwind.config.ts` | Adicionar tokens `criso.*` (dark) e incluir novas pastas em `content` (`./hooks`, `./lib`), senão classes usadas nelas não são geradas. Os tokens atuais (`paper`, `ink`, `forest`…) **ficam intactos**. | Baixo |
| `app/globals.css` | Adicionar bloco `.criso-*` e variáveis CSS escopadas. **Não alterar** `.btn-primary`, `.btn-secondary`, `.field-input`, `.card`: login, cadastro, home, 404 e admin dependem deles. | Baixo, se eu só acrescentar |
| `app/layout.tsx` | O reference usa fonte sem serifa. `h1–h4` hoje usam Fraunces (serifada) por regra global. No chat, forço a fonte do corpo (Inter) nos títulos; o resto do site mantém Fraunces. | Baixo |
| `next.config.mjs` | **`Permissions-Policy: microphone=()` bloqueia o microfone em todo o site.** Para gravar áudio (Etapa 4c) precisa virar `microphone=(self)`. Mantenho `camera=()` e `geolocation=()`. | Mudança de segurança consciente, restrita ao mesmo domínio |

## 3. Componentes novos (frontend)

Estrutura proposta, dentro das pastas que o Tailwind já varre (`components/chat/`, `hooks/`):

| Componente / hook | Responsabilidade | Dados reais | Etapa em que fica funcional |
|---|---|---|---|
| `components/chat/ChatShell.tsx` | Grade geral: sidebar · coluna central · painel direito; controla recolher/abrir | estado de UI | 3 |
| `components/chat/Sidebar.tsx` | Logo, Novo chat, navegação, conversas recentes, perfil | `useAuth`, `useConversations` | 3 (lista em memória) → 4a (banco) |
| `components/chat/ConversationList.tsx` | Itens com título e data; abrir, renomear, excluir | `useConversations` | 3 (abrir) → 4a (renomear/excluir) |
| `components/chat/TopBar.tsx` | Busca, selo do modelo, indicador de status | `/api/health` | 3 |
| `components/chat/Welcome.tsx` | Mascote, saudação, 4 cartões, exemplos | estático + `onPick(texto)` | 3 |
| `components/chat/MessageList.tsx` + `MessageBubble.tsx` | Mensagens, fontes, erro, "digitando", rolagem | `useChat` | 3 |
| `components/chat/Composer.tsx` | Textarea auto-expansível, Enter/Shift+Enter, contador, enviar | `useChat` | 3 |
| `components/chat/AttachmentTray.tsx` | Prévia, nome/tipo/tamanho, remover, progresso | upload | 4b |
| `components/chat/VoiceRecorder.tsx` | Permissão, gravar/parar/cancelar, ouvir, transcrição para revisar | `MediaRecorder` + rota | 4c |
| `components/chat/RightPanel.tsx` | Status da CRISO.AI, recursos, modos, sugestões rápidas | `/api/health`, estado dos modos | 3 (status) → 4c (modos) |
| `components/chat/Mascot.tsx` | Ícone da CRISO.AI em SVG | — | 3 |
| `hooks/useChat.ts` | Envio, retry, erros, busy (lógica extraída de `chat/page.tsx`) | `/api/chat` | 3 |
| `hooks/useConversations.ts` | Lista, criar, abrir, renomear, excluir | em memória → `/api/conversations` | 3 → 4a |
| `hooks/useHealth.ts` | Lê `/api/health` uma vez: modelo, pesquisa on/off, status | `/api/health` | 3 |

## 4. Cada elemento da imagem de referência: o que vira o quê

**Barra lateral**

| Elemento na imagem | Decisão |
|---|---|
| Logo + "Sua assistente inteligente" + botão recolher | Mantém. Recolher é real (guarda estado no componente). |
| **Novo chat** (atalho Ctrl+N) | Real. Cria conversa nova sem apagar as outras. Atalho: ver nota ao final. |
| Chats (com contador "12") | Real: contador = número de conversas da lista. |
| **Projetos** ⚠ | **Escondido.** Sem backend. |
| **Arquivos** ⚠ | **Escondido.** Sem backend (anexos ficam dentro da conversa, não numa biblioteca). |
| Memória | Real: abre o `MemoryPanel`. |
| Pesquisa | Real a partir da 4a: busca nas conversas. Na Etapa 3, aponta para o campo da barra superior filtrando a lista em memória. |
| Configurações | **Escondido** nas Etapas 3–4: não há configurações para mudar. Se aparecer algo concreto (ex.: modo padrão), entra depois. A engrenagem no perfil some pelo mesmo motivo. |
| Conversas recentes (título + "Hoje às 15:42") | Real. Agrupa por data. |
| Perfil (iniciais, nome, "Estudante") | Real: iniciais e nome vêm de `useAuth`. **O rótulo "Estudante" não existe no sistema**; mostro o e-mail ou nada. |
| Rodapé "Crisoverde Digital — Tecnologia que transforma" | Mantém como marca (texto). |

**Barra superior**

| Elemento | Decisão |
|---|---|
| Campo "Pergunte algo…" | **Não vira um segundo campo de mensagem.** Duplicaria o compositor. Vira busca de conversas (real a partir da 4a). |
| Selo "Gemini 3.8 Flash" com seta | Mostra o modelo **real** lido de `/api/health`. Sem seta/menu, porque o modelo é configuração do servidor e o usuário não troca. |
| Sino | **Escondido** (sem notificações no sistema). |
| Sol/lua | **Escondido** (só tema escuro). ⚠ |
| Ponto verde | Real: verde se `/health` respondeu ok, cinza/vermelho se não. |

**Tela inicial e cartões**

| Elemento | Decisão |
|---|---|
| Mascote, "Olá, eu sou a **CRISO.AI**!", subtítulo, descrição | Mantém, com o nome CRISO.AI (a imagem diz "Chris AI"). |
| Cartão "Tire dúvidas" | Preenche o campo com uma sugestão e foca nele. |
| Cartão "Resolva problemas" | Idem, sugestão de código/erro. |
| Cartão "Pesquise na internet" | Idem. **Se a pesquisa estiver desligada (`search: off`), o cartão mostra "Pesquisa não configurada"** em vez de fingir. |
| Cartão "Anexe arquivos" | Abre o seletor de arquivos a partir da 4b. Antes disso: desabilitado com selo "Em breve". |
| Chips "Exemplos de como você pode pedir" | Preenchem o campo. |

**Compositor**

| Elemento | Decisão |
|---|---|
| Textarea, Enter/Shift+Enter, enviar | Real (já existe hoje). |
| Anexar arquivo | Etapa 3: botão desabilitado com "Em breve". Etapa 4b: real. |
| Gravar áudio | Etapa 3: desabilitado com "Em breve". Etapa 4c: real. |
| Ícone de ajustes (sliders) ao lado do enviar | **Escondido.** Não há ajustes. |
| Dicas "Shift + Enter…" | Mantém. |

**Painel direito** (cada linha mostra o estado real)

| Recurso | Estado real |
|---|---|
| Online / "Sempre pronta para te ajudar" | `/health` ok → "Online"; falha → "Indisponível". |
| Análise de arquivos | "Em breve" até 4b; depois "Disponível: imagens, PDF, texto/código". |
| Pesquisa na web | "Ativa" se `search: on`; senão "Não configurada". |
| Memória inteligente | "Ativa" (existe). Clicar abre o `MemoryPanel`. |
| Modo desenvolvedor | Já existe, mas **automático**. Etapa 3: mostro como "Automático" (sem toggle). Etapa 4c: vira seletor real. |
| Modo professor / socioambiental | **Não existem.** "Em breve" até 4c, quando criar instruções de prompt reais. |
| Sugestões rápidas | Preenchem o campo. |
| "Juntos por um futuro mais verde" | Arte decorativa, declarada como tal (sem ação). |

## 5. Pontos de atenção para não regredir

1. **Contrato de `/api/chat` e suas mensagens de erro:** o `useChat` replica o mapeamento de erros atual (`DAILY_LIMIT` sem retry, 429/5xx com retry e contagem).
2. **Testes que já dependem do frontend:** `markdown.test.ts` (importa `frontend/lib/markdown`). Mantenho caminho e exports.
3. **Classes só nos novos diretórios:** adicionar `./hooks/**` e, se eu criar, `./lib/**` ao `content` do Tailwind.
4. **Tela de carregamento do `AuthGuard`** usa `bg-paper` (claro). Para `/chat` isso pisca branco antes do tema escuro. Vou dar fundo escuro ao carregamento da rota `/chat`.
5. **iOS Safari:** o Bearer em `localStorage` continua sendo o caminho de autenticação; upload com `FormData` precisa enviar o mesmo header (a função `request` já adiciona `Authorization`, mas hoje força JSON).
6. **Atalho Ctrl+N:** em vários navegadores `Ctrl+N` abre nova janela e não dá para interceptar de forma confiável. Mostro o atalho só se funcionar nos meus testes; senão, uso outro (ex.: `Alt+N`) ou removo o rótulo.

## 6. Limites desta fase

Mapeamento feito por leitura do código; nada foi compilado nem executado.
