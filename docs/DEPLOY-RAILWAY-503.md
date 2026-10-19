# Corrigir HTTP 503 no `/api/chat`

O frontend não consegue corrigir um HTTP 503 emitido pelo backend. A rota `/api/chat` devolve 503 quando o provedor de IA excede o tempo limite ou fica indisponível. Depois de publicar este código, siga estes passos no Railway:

1. Abra o serviço **backend** e consulte **Deployments → Logs** no momento do erro. Procure por `Erro ao chamar Gemini`, `timeout`, `unavailable`, `429`, `GEMINI_API_KEY` e `modelo`.
2. Em **Variables**, confirme `GEMINI_API_KEY` (somente no backend) e configure `GEMINI_MODEL` com um identificador que apareça disponível no Google AI Studio para a mesma chave. O exemplo deste pacote usa `gemini-3.8-flash` com `GEMINI_THINKING_LEVEL=low`; se a sua conta não o disponibilizar, escolha um modelo Flash disponível.
3. Deixe `GEMINI_THINKING_LEVEL` vazio para evitar enviar configuração de raciocínio incompatível com modelos que não a suportam.
4. Use `GEMINI_TIMEOUT_MS=12000` e `GEMINI_MAX_OUTPUT_TOKENS=1536` como ponto de partida para reduzir espera. Se o modelo escolhido precisar de mais tempo, aumente o timeout gradualmente.
5. Opcionalmente configure `GEMINI_FALLBACK_MODEL` para outro modelo realmente disponível. Não use o mesmo identificador do modelo principal.
6. Após redeploy, abra `https://SEU-BACKEND/api/health`. O endpoint deve retornar JSON com `status: ok` e o modelo configurado. Isso confirma que o servidor responde, mas não garante que a chamada de geração tenha sucesso.
7. Teste o chat. Se continuar 503, use os logs do backend para distinguir cota/instabilidade do provedor de um problema de rede. Não publique chaves em screenshots nem no frontend.

## Novas funcionalidades desta entrega

- Histórico persistido no PostgreSQL e vinculado ao usuário autenticado.
- Reabrir, renomear e excluir conversas.
- Anexar até cinco arquivos por envio, com limite de 5 MiB por arquivo e 8 MiB agregado; imagens PNG/JPEG/WEBP e PDF são enviados como conteúdo multimodal ao modelo, e arquivos de texto/código são incluídos como texto.
- Ditado por voz através da API de reconhecimento de fala do navegador, quando suportada e autorizada. O áudio é transcrito no navegador e enviado como texto; não é guardado como gravação.
- Modos Automático, Desenvolvedor, Professor e Socioambiental.

A persistência usa as tabelas `conversations` e `conversation_messages`, criadas automaticamente no boot do backend usando a conexão PostgreSQL já configurada.
