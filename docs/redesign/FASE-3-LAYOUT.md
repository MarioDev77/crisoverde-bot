# Fase 3 — Layout visual do chat

Escopo: só `frontend/` (e um teste novo em `backend/tests/`). **Nenhuma rota, tabela ou contrato do backend foi alterado.**
A rota `/chat` foi refeita; login, cadastro, home e painel admin não foram tocados.

## O que foi feito

**Tema escuro (só em `/chat`)** — `tailwind.config.ts` ganhou a paleta `criso.*`; `globals.css` ganhou um bloco `.criso-theme` que redefine `.card`, `.field-input`, `.btn-*` apenas dentro do chat. Os tokens antigos (`paper`, `ink`, `forest`…) continuam iguais.

**Estrutura nova** (`components/chat/`)

| Arquivo | Função |
|---|---|
| `ChatApp.tsx` | Monta tudo e guarda o estado de tela (busca, recolher, gaveta, painel, memória) |
| `Sidebar.tsx` + `ConversationList.tsx` | Marca, **Novo chat**, Memória, Pesquisa, conversas agrupadas por Hoje/Ontem/Anteriores, perfil com **Sair**, rodapé Crisoverde Digital. Recolhe no desktop; vira gaveta no celular |
| `TopBar.tsx` | Busca de conversas, selo do modelo **lido do servidor**, ponto de status real |
| `Welcome.tsx` | Mascote, "Olá, eu sou a CRISO.AI!", 4 cartões, exemplos |
| `MessageList.tsx` | Mensagens, fontes, "digitando", **Parar**, erro com **Tentar de novo** |
| `Composer.tsx` | Textarea auto-expansível, Enter envia / Shift+Enter quebra linha, contador, enviar/interromper |
| `RightPanel.tsx` | Status, recursos (cada um com o estado real), sugestões rápidas |
| `Mascot.tsx` | SVG próprio (sem imagem externa) |

**Lógica extraída do `chat/page.tsx` antigo** (preservada, agora em hooks): `hooks/useChat.ts` (trava contra envio duplo, retry sem duplicar balão, contagem regressiva, `DAILY_LIMIT` sem retry), `hooks/useConversations.ts`, `hooks/useHealth.ts`, `lib/format.ts`.

**Reaproveitados com troca só de cores:** `MessageText.tsx` (render seguro intacto, sem `dangerouslySetInnerHTML`) e `MemoryPanel.tsx`.
**Mudanças pequenas e aditivas:** `lib/api.ts` (`post` aceita `signal` para interromper), `AuthGuard.tsx` (prop `dark`, evita piscar branco), `lib/types.ts` (tipos novos).

## Desvios do plano da Fase 2 (e por quê)

- **Item "Chats" da sidebar omitido.** Ele só repetiria o cabeçalho "Conversas recentes", que já mostra o contador. Seria um botão sem função própria.
- **"Pesquisa" na sidebar** leva o foco à busca da barra superior.
- **Botão "Parar" adicionado** (o prompt pede cancelamento). Interrompe a espera no navegador; **o servidor pode já ter contado a mensagem na cota diária.**
- **Ctrl+N não implementado.** Muitos navegadores reservam esse atalho e não dá para interceptá-lo de forma confiável; não mostro um atalho que talvez não funcione.

## O que está "Em breve" de propósito (desabilitado e rotulado, não finge funcionar)

Anexar arquivo (4b) · Gravar áudio (4c) · Análise de arquivos (4b) · Modo professor e Modo socioambiental (4c). O **Modo desenvolvedor** aparece como "Automático", porque é isso que ele é hoje (ativa pelo contexto da pergunta).

## Limites desta etapa (importante)

1. **Conversas só na memória do navegador.** Somem ao recarregar. A sidebar avisa isso. "Novo chat" já funciona de verdade (não apaga as anteriores *da sessão*); persistência vem na 4a.
2. **Cartão "Pesquise na internet" só preenche o campo.** Quem decide pesquisar de fato é o backend, por palavras-chave ("últimas", "notícia", "hoje"…). Não há um "interruptor de pesquisa" por mensagem.
3. **Dois textos ficam desatualizados quando a 4a guardar conversas** e serão corrigidos nela: o `MEMORY_POLICY` do prompt (`prompts/index.ts`) e o texto do `MemoryPanel` ("não guarda o conteúdo das conversas").
4. **Campo de busca do topo** filtra só as conversas da sessão.

## Como foi verificado — e o que NÃO foi

Ambiente sem internet: `npm install` falhou, então **não rodei `next build`, nem o `tsc` do projeto, nem o Tailwind.**

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` com TypeScript global e **declarações simuladas** de react/lucide/next (fora do projeto) | 0 erros. Vale para tipos próprios; os tipos reais do React podem apontar algo que as simulações não pegaram |
| Teste de comportamento: chat empacotado com esbuild, aberto em Chromium headless, **API simulada** (45 verificações) | **45/45** — boas-vindas, modelo/status vindos do `/health`, cartões preenchem e focam o campo, Enter/Shift+Enter, envio com histórico assinado, Novo chat sem apagar, abrir conversa antiga sem duplicar, busca, 503 + retry sem duplicar balão, `DAILY_LIMIT` sem retry, Parar, duplo Enter envia 1 vez, recolher/expandir, Memória abre/Esc fecha, gaveta e painel no celular |
| `backend/tests/format.test.ts` (novo, ligado ao `npm test`) | 9/9 · `markdown.test.ts` continua 9/9 |

**Não verificado:**
- **Aparência.** O teste rodou sem o CSS do Tailwind. Não vi o layout renderizado, então não comparei com a imagem de referência pixel a pixel. As classes de responsividade (`lg:`, `xl:`, `min-[480px]:`) foram conferidas só pelo nome, não renderizadas.
- **Nomes de ícones do `lucide-react@0.383`** (ex.: `PanelLeftClose`, `FileSearch`). São ícones antigos e comuns, mas não consegui checá-los contra o pacote real. Se o build reclamar de algum, é só trocar o nome.
- Gemini real, backend rodando junto, Safari/iOS, leitor de tela.

## Como conferir na sua máquina

```bash
cd frontend && npm install && npm run build   # o build é a verificação que faltou aqui
npm run dev                                   # abra /chat e compare com docs/redesign/referencia-visual.png
cd ../backend && npm test
```
