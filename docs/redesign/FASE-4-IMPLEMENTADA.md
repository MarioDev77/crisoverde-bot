# CRISO.AI — funcionalidades da Etapa 4

## Implementado nesta entrega

- Histórico de conversas em PostgreSQL: criação na primeira resposta, listagem, reabertura, renomeação e exclusão, sempre filtradas pelo usuário autenticado.
- Anexos: até cinco arquivos, 5 MiB por arquivo e 8 MiB combinados; PNG/JPEG/WEBP e PDF enviados como partes multimodais ao Gemini; texto e arquivos de código são lidos e incluídos no contexto.
- Voz: ditado para texto usando SpeechRecognition/webkitSpeechRecognition do navegador em português do Brasil. Exige permissão de microfone e navegador compatível; não grava nem persiste áudio bruto.
- Modos de resposta: Automático, Desenvolvedor, Professor e Socioambiental.
- Latência: modelo Flash configurável, nível de pensamento baixo por padrão no exemplo, saída padrão de 1536 tokens, timeout de 12 segundos e uma repetição curta para falhas transitórias.
- Guia de diagnóstico de 503: `docs/DEPLOY-RAILWAY-503.md`.

## Limitações conhecidas

- Anexos são enviados no corpo da requisição, não em armazenamento permanente. O histórico guarda o texto da mensagem e os nomes dos anexos, não os bytes dos arquivos.
- A transcrição de voz depende da implementação de reconhecimento de fala do navegador e da permissão do usuário. Não é uma chamada de áudio nativa ao Gemini.
- Se o provedor Gemini ou o backend Railway continuar retornando 503, é necessário conferir logs e variáveis no Railway; um ZIP não altera o deploy que já está publicado.
- Build e testes integrados não foram concluídos neste ambiente porque as dependências npm não puderam ser instaladas. A sintaxe dos arquivos TypeScript/TSX modificados foi verificada com o transpiler do TypeScript.
