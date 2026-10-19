# Redesign da CRISO.AI — plano de etapas

Cada etapa termina com um zip do projeto inteiro. Nada é considerado pronto sem o que está em "Entrega".

| Etapa | Fase do prompt | O que faz | Entrega | Mexe em código? |
|---|---|---|---|---|
| 1 | Fase 1 | Diagnóstico do projeto real | `FASE-1-DIAGNOSTICO.md` | Não |
| 2 | Fase 2 | Mapa de componentes reaproveitáveis e a criar | `FASE-2-COMPONENTES.md` | Não |
| 3 | Fase 3 | Layout visual: tema escuro, sidebar, tela inicial, barra superior, painel direito, compositor (visual) | Frontend novo em `/chat`, funcionando com o chat atual | Frontend |
| 4a | Fase 4 | Histórico de conversas persistente (tabelas, rotas, sidebar real, Novo chat, renomear, excluir) | Backend + frontend | Sim |
| 4b | Fase 4 | Anexos (imagem, PDF, texto/código) com validação no servidor | Backend + frontend | Sim |
| 4c | Fase 4 | Áudio (gravar, transcrever, revisar, enviar) + modos (dev/professor/socioambiental) | Backend + frontend | Sim |
| 5 | Fase 5 | Responsivo: sidebar em gaveta, painel direito recolhível, teclado virtual, áreas seguras | Frontend | Frontend |
| 6 | Fase 6 | Testes, correção de regressões | Testes novos + relatório honesto | Sim |
| 7 | Fase 7 | Documentação, variáveis de ambiente, limites conhecidos | README/docs atualizados | Docs |

A Fase 4 foi dividida em três porque histórico, anexos e áudio são independentes e cada um mexe no backend de forma diferente.
