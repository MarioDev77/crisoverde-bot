# CRISO.AI — interface de chat aplicada

Este pacote contém a interface de chat redesenhada integrada ao projeto existente. A implementação mantém o frontend Next.js/React, o backend, autenticação, histórico de conversas, estado de saúde do serviço e integração Gemini já presentes no projeto.

## O que foi aplicado

- Layout escuro com identidade Crisoverde e destaque verde/ciano.
- Sidebar com novo chat, navegação, histórico e perfil.
- Barra superior com pesquisa no histórico, modelo configurado e estado do serviço.
- Tela inicial com cartões de sugestões.
- Área de mensagens com estados de carregamento, erro, repetição e interrupção.
- Compositor de mensagem com acabamento visual refinado, textarea expansível e botão de envio.
- Painel contextual e painel de memória.
- Adaptação para telas menores.

## Limitações que continuam explícitas

No componente `frontend/components/chat/Composer.tsx`, os controles de anexar arquivo e gravar áudio continuam desabilitados e identificados como “Em breve”, porque o fluxo atual de chat envia texto JSON para `/api/chat` e não implementa upload de arquivos nem transcrição de áudio. Não foi criada uma falsa funcionalidade visual. Para ativá-los, será necessário implementar e proteger os fluxos correspondentes no backend, validar os tipos e tamanhos de arquivo e configurar um serviço/modelo compatível com áudio.

## Como executar

Consulte o `README.md` da raiz e os arquivos `.env.example` do projeto. Instale as dependências do frontend e backend e configure as variáveis de ambiente antes de iniciar. Não coloque chaves reais em arquivos enviados ao GitHub.

## Validação

O ZIP foi preparado a partir do pacote `crisoverde-redesign-etapa3-layout.zip`. Não foi executado build nem teste automatizado neste ambiente; valide localmente com as dependências instaladas antes de publicar.
