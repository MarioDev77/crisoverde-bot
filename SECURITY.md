<<<<<<< HEAD
# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.
=======
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
>>>>>>> 7c8a338 (feat mudança na ia)
