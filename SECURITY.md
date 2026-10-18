# Política de segurança

## Como reportar uma vulnerabilidade

Não abra uma *issue* pública com detalhes de falhas. Use os **avisos de segurança privados do GitHub**
(aba *Security → Report a vulnerability*) neste repositório ou fale diretamente com os mantenedores do projeto.
Inclua: o que acontece, passos para reproduzir e o impacto que você enxerga.

## O que já existe

Autenticação por cookie HttpOnly + JWT, papel `admin` validado no servidor, limite de requisições por IP,
limite diário de mensagens (custo), histórico assinado (HMAC), memória isolada por usuário, chave do Gemini
somente no backend e respostas de erro sem detalhes internos.

## Limites conhecidos (sem promessa de segurança absoluta)

Os riscos remanescentes e o que ainda depende de configuração estão em `docs/ARQUITETURA.md`
(seção *Riscos remanescentes*). Em especial: a detecção de prompt injection por padrões é uma heurística
e não generaliza bem para ataques novos; a defesa principal é a separação entre instruções e dados e o
comportamento do modelo.
