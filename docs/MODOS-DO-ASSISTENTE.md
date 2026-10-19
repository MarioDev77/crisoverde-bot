# Modos da CRISO.AI e o que é cada coisa na tela

## Como os modos funcionam por dentro

O seletor **Modo** (embaixo da caixa de mensagem) envia um valor junto com a pergunta
(`auto`, `developer`, `teacher`, `sustainability`). O backend (`routes.ts`) coloca uma instrução
curta entre colchetes **antes da sua mensagem** e manda tudo ao Gemini. Dois detalhes:

- O modo vale **só para a mensagem em que foi enviado**. Trocar o modo muda a próxima pergunta.
- Ele **não substitui** a personalidade da CRISO.AI (amigável, em português, educativa) nem as
  regras de segurança: só muda o *jeito* de responder.

| Modo | Instrução enviada (resumo) | Use quando | Resposta tende a ser |
|---|---|---|---|
| **Automático** | nenhuma | Conversa geral. A IA decide pelo assunto (se parece código, usa o jeito técnico) | Curta para dúvida simples, detalhada para problema complexo |
| **Desenvolvedor** | "analise tecnicamente, explique a causa provável e proponha correções seguras e testáveis" | Erros, código, deploy, banco de dados | Causa primeiro, depois correção em trecho; código completo se for arquivo novo; comandos e variáveis de ambiente |
| **Professor** | "explique passo a passo, em linguagem clara, com exemplos e verifique a compreensão" | Estudar, entender um conceito, tirar dúvida de matéria | Passo a passo, com exemplo e uma checagem no final |
| **Socioambiental** | "priorize sustentabilidade, impactos ambientais e soluções práticas; diferencie fatos de estimativas" | Meio ambiente, reciclagem, economia circular, Crisomoeda | Foco em impacto e ações práticas, separando fato de estimativa |

Observação: o conhecimento técnico de desenvolvedora (`prompts/developer.ts`) fica sempre ativo
no *Automático*; o modo **Desenvolvedor** só reforça o foco técnico naquela pergunta.

## O que é cada coisa na tela

- **Bolinha verde (topo):** o servidor respondeu ao `/api/health` (verifica a cada 60 s). Cinza/vermelha = backend fora do ar.
- **Ícone de brilho com nome (topo, telas largas):** modelo de IA configurado no servidor (`GEMINI_MODEL`).
- **Ícone de brilho (botão):** abre o painel lateral de recursos.
- **Buscar nas conversas:** procura no seu histórico salvo.
- **Menu lateral:** novo chat, **Memória** (o que a IA guardou sobre você: ver/corrigir/apagar), Pesquisa, sair.
- **Clipe (Anexar):** até 5 arquivos, 5 MB cada (imagens PNG/JPEG/WEBP, PDF, texto/código).
- **Microfone (Áudio):** fala → texto na caixa. Você revisa e envia.
- **Contador 0/2000:** limite de caracteres por mensagem.
- **Botão de enviar / quadrado:** envia; durante a resposta vira "interromper".
- **"Tentar de novo":** reenvia a última mensagem sem duplicar. Com contagem, espere o tempo indicado.
- **`código: …` sob um erro:** identifica a causa (veja `DIAGNOSTICO-429-E-MICROFONE.md`).
