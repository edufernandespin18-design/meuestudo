# Documentação da Frente 01 — Produto, UX/UI, Aplicação Principal, Integração e PWA

**Projeto:** MeuEstudo v0.3 (UNINASSAU · ADS · EEEP Professor Cesar Campelo)
**Responsável:** Eduardo Fernandes Pinheiro
**Data da execução:** 12/11/2026 (dia 4 do cronograma-base)
**Revisão 1:** 12/11/2026, após receber o Contrato Técnico Compartilhado v0.3 (ver seção 11)
**Referências:** Brief 01, Contrato Técnico Compartilhado v0.3 e Documentação Mestra v0.3 (seções 33–42)

---

## 1. Resumo

Foi entregue a **aplicação-base navegável** do MeuEstudo: casca com cinco telas, design system compartilhado, armazenamento local protegido contra erros, carregador de módulos com o contrato `mount/destroy`, painel inicial (aulas de hoje e próximos compromissos), PWA (manifest, ícones, Service Worker) e testes.

Os três módulos dos colegas (horários/agenda, notas, foco) **não foram escritos**, pois pertencem a outros donos. O shell os carrega por contrato e, enquanto não existirem, mostra uma tela neutra sem quebrar o app.

### Situação dos critérios de aceite do brief

| Critério | Situação | Como foi verificado |
|---|---|---|
| A aplicação abre sem cadastro | Atendido | Navegador automatizado: abre direto no painel |
| Navegação leva às cinco telas sem recarregar nem quebrar estado | Atendido | Clique nas 5 abas: hash, `aria-current` e título corretos |
| Três módulos carregados pelo contrato compartilhado | Atendido no shell; falta integrar módulos reais | Testado com módulos de mentira em cópia temporária (mount, destroy, erro) |
| `storage.js` é a única parte que acessa `localStorage` | Atendido | `grep` em todo o projeto |
| Painel exibe aulas do dia e próximos compromissos | Atendido | Testes unitários + navegador com dados |
| Arquivos essenciais por HTTPS e offline após cache | **Parcial**: offline verificado em `localhost`; **deploy HTTPS não realizado** | Ver seção 8 |
| Ícone/nome aparecem no fluxo de instalação | **Pendente de teste em aparelho real** | Manifest e ícones válidos; instalação não testada |
| App continua funcional com chave vazia ou dado inválido | Atendido | Testes unitários e navegador (JSON corrompido) |

---

## 2. Arquivos entregues

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura base: cabeçalho, `<main id="app">`, barra inferior, região de avisos (toast), metatags PWA/iOS |
| `css/base.css` | Tokens de design (cores, tipografia, espaçamento) e componentes: botões, campos, cartões, listas, selos, estados vazios, avisos, toast |
| `css/layout.css` | Cabeçalho, área principal, navegação inferior, painel inicial, ajustes para telas maiores |
| `js/app.js` | Roteamento por hash, carregador de módulos (`mount`/`destroy`), painel inicial, botão "Instalar app", registro do Service Worker |
| `js/storage.js` | Única porta de acesso ao `localStorage`: `read`, `write`, `remove`, `isPersistent`, `lastError`, `KEYS` |
| `js/ui.js` | Utilitários compartilhados: escape de HTML, datas/horas, toast, ids, seletores do painel |
| `manifest.webmanifest` | Nome, ícones, `start_url`, `scope`, `display: standalone`, cores, idioma |
| `sw.js` | Pré-cache versionado, navegação "rede primeiro", arquivos estáticos "cache primeiro" |
| `assets/icons/` | `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (gerados por script) |
| `css/modules/*.css` | **Placeholders** (só comentário, com os prefixos do contrato) para os donos dos módulos, evitando 404 |
| `README.md` | Como rodar, estrutura, donos, contrato de módulo, chaves de dados, deploy, limitações |
| `package.json` | Marca o projeto como ES module e define `npm test` (sem dependências) |
| `tests/shell.test.mjs` | 23 testes automatizados de `storage.js` e `ui.js` |
| `docs/DOCUMENTACAO_FRENTE_01.md` | Este documento |

Adições além da lista do brief: `README.md`, `package.json`, `tests/`, `docs/` e os três CSS placeholders. Nenhuma altera a estrutura congelada de pastas.

---

## 3. Produto e UX/UI

### 3.1 Mapa de navegação

```text
Início (#/inicio) ── padrão
├── Horários (#/horarios) ─┐ mesmo arquivo: horarios-agenda.js
├── Agenda   (#/agenda)   ─┘ (diferenciado por services.route)
├── Notas    (#/notas)
└── Foco     (#/foco)
```

Rotas desconhecidas voltam ao Início.

### 3.2 Wireframes (celular, retrato, 320–360 px)

**Início**

```text
┌────────────────────────────┐
│ [logo] MeuEstudo [Instalar]│  ← "Instalar" só aparece se o navegador permitir
├────────────────────────────┤
│ Boa noite!                 │
│ quinta-feira, 12 de novembro│
│ ┌ Aulas de hoje ─────────┐ │
│ │ 07:30–08:20  Português │ │
│ │ 09:00–09:50  Matemática│ │
│ └────────────────────────┘ │
│ ┌ Próximos compromissos ─┐ │
│ │ Prova de Química       │ │
│ │ Amanhã        [Pendente]│ │
│ └────────────────────────┘ │
│ ┌ Ir para ───────────────┐ │
│ │ [Horários]  [Agenda]   │ │
│ │ [Notas]     [Foco]     │ │
│ └────────────────────────┘ │
│ ┌ Sobre seus dados... ───┐ │
│ │ ▸ Onde meus dados ficam│ │
│ │ ▸ Como instalar        │ │
│ │ ▸ Funciona sem internet│ │
├────────────────────────────┤
│ Início Horários Agenda Notas Foco │ ← barra inferior fixa
└────────────────────────────┘
```

**Horários / Agenda / Notas / Foco (estrutura-guia para os módulos)**

```text
┌────────────────────────────┐
│ <h1> Título da tela        │
│ [ação primária]            │
│ ┌ cartão / lista ────────┐ │
│ │ item ........ [editar] │ │
│ └────────────────────────┘ │
│ (estado vazio com instrução)│
├────────────────────────────┤
│ barra inferior             │
└────────────────────────────┘
```

### 3.3 Design system

- **Paleta:** verde-azulado (`#0f766e`) como cor de marca, fundo neutro claro, azul para informação, âmbar para avisos. Vermelho só para erro real de formulário; **atraso nunca é vermelho**.
- **Tipografia:** fontes do sistema (nenhum download), escala de 0,8125 a 1,625 rem.
- **Espaçamento:** escala de 4 a 32 px. **Áreas de toque:** mínimo 44 px (botões pequenos 36 px).
- **Componentes:** `.btn` (+ `--secondary`, `--ghost`, `--danger`, `--small`, `--block`), `.field` / `.input` / `.select` / `.textarea`, `.card`, `.list`, `.badge`, `.empty`, `.notice`, `.toast`.
- **Acessibilidade:** link "Ir para o conteúdo", foco visível de 3 px, rótulos associados, ícones sempre com texto, status em palavras, região `aria-live`, respeito a `prefers-reduced-motion`, foco movido ao `<h1>` a cada troca de tela.
- **Tom:** "Pendente", "reagende", "quando quiser". Pendências antigas aparecem como convite neutro: "Você tem N itens pendentes de datas anteriores. Quando quiser, reagende na Agenda."

---

## 4. Arquitetura

### 4.1 Roteamento e carregador de módulos

- Rotas por hash (`#/notas`). Funciona em hospedagem estática e em subpasta, sem configuração de servidor.
- A cada troca: `destroy()` do módulo anterior → título e aba ativa atualizados → `import()` dinâmico → `mount(container, services)`.
- **Proteção contra corrida:** se o usuário trocar de tela enquanto um módulo carrega, o resultado antigo é descartado.
- **Falhas tratadas:** módulo ausente (tela neutra), módulo sem `mount` (mensagem), `mount` que lança erro (mensagem com "Tentar de novo"). O app nunca fica em branco.

### 4.2 Contrato de `services`

```js
services = {
  storage: { read, write, remove, isPersistent, KEYS },
  ui,                 // js/ui.js
  navigate(route),
  route               // 'horarios' | 'agenda' | 'notas' | 'foco'
}
```

### 4.3 Armazenamento (`storage.js`)

| Situação | Comportamento |
|---|---|
| Chave ausente | Devolve o `fallback` |
| JSON corrompido | Devolve o `fallback`, sem erro |
| Tipo diferente do esperado (ex.: objeto onde se esperava array) | Devolve o `fallback` |
| Valor não serializável | `write` devolve `false` |
| Armazenamento bloqueado (aba privada, política do navegador) | Usa memória; `isPersistent()` devolve `false`; o painel avisa que os dados valem só até fechar a aba |
| Cota cheia | `write` devolve `false`; valor mantido em memória na sessão |

Nunca usa `localStorage.clear()`. Chaves versionadas `meuestudo:v1:*`, conforme a seção 36.5 da documentação mestra.

### 4.4 Painel inicial

- **Aulas de hoje:** filtra `weekday` pelo dia atual (0 = domingo), ignora aulas sem matéria e ordena por horário inicial.
- **Próximos compromissos:** pendentes com data de hoje em diante, por data e depois horário (sem horário vai para o fim do dia); até 5.
- **Pendências antigas:** contadas à parte e exibidas como convite neutro.
- Todo texto do usuário passa por `escapeHTML`.

---

## 5. PWA

- **Manifest:** `display: standalone`, `start_url` e `scope` relativos (funciona em subpasta), ícones 192/512 como `any` e `maskable`, `lang: pt-BR`.
- **Service Worker (`meuestudo-v1`):**
  - Pré-cache de 17 arquivos estáticos; usa `allSettled`, então módulos ainda não entregues não impedem a instalação.
  - Navegação: rede primeiro, cai para o cache offline.
  - Arquivos do mesmo site: cache primeiro, atualizando em segundo plano.
  - Não intercepta outros domínios nem requisições que não sejam GET (não cacheia páginas de terceiros nem dados pessoais).
  - `skipWaiting` + `clients.claim` e limpeza de caches antigos `meuestudo-*`.
- **Instalação:** botão "Instalar app" aparece quando o navegador dispara `beforeinstallprompt` (Android/Chrome); instruções para iPhone ficam na área "Como instalar no celular?".
- **Ícones:** gerados por script (quadrado verde-azulado com folha de caderno). São provisórios; podem ser trocados mantendo os mesmos nomes.

---

## 6. Testes executados

### 6.1 Automatizados (`npm test`): 23 testes, todos passaram

- **storage.js (11):** ida e volta, ausente, JSON corrompido, tipo incompatível, `null` salvo, valor circular, `remove` seletivo, chaves do contrato, armazenamento bloqueado, cota cheia.
- **ui.js (12, usando os valores de `status` do contrato):** aulas do dia e ordenação, entradas inválidas, próximos compromissos (ordem e limite), pendências antigas, variações de status concluído, data local, datas inexistentes (ex.: 30/02), rótulos Hoje/Amanhã, escape de HTML, validação de horário, saudação.

### 6.2 Navegador automatizado (Chromium, 360×740 e 320×640)

| Teste do brief | Resultado |
|---|---|
| Abrir pela primeira vez sem dados | Passou: painel com estado vazio |
| Navegar pelas cinco telas e voltar | Passou |
| Inserir dados e verificar o painel | Passou: ordem, "Amanhã", convite a reagendar, HTML escapado |
| Atualizar a página e conferir persistência | Passou |
| Dado inválido recuperável | Passou: JSON corrompido na agenda, sem tela branca |
| Abrir offline depois de cachear | Passou em `localhost`: recarrega e navega sem rede |
| Chamadas de rede inesperadas / dados pessoais | Passou: **zero** requisições externas; nenhum dado pessoal solicitado |
| Layout em viewport estreito | Passou: sem rolagem horizontal em 320 px |
| Contrato de módulo | Passou com módulos de mentira (em cópia temporária, não no projeto): `mount` recebe `storage, ui, navigate, route`; `destroy` roda ao sair; `mount` com erro mostra mensagem e não derruba as outras telas |

Os únicos erros de console são 404 dos três arquivos de módulo JS que ainda não existem (esperado).

### 6.3 Bug encontrado e corrigido durante os testes

O botão "Instalar app" aparecia mesmo sem ser instalável, porque `.btn { display: inline-flex }` anulava o atributo `hidden`. Corrigido com a regra `[hidden] { display: none !important; }` em `base.css`, e verificado de novo.

---

## 7. O que **não** foi feito (e por quê)

| Item | Motivo / próximo passo |
|---|---|
| Módulos horários/agenda, notas e foco | Pertencem a Eduardo Levy, Kauê e Marcelo, conforme a divisão de trabalho |
| **Publicação em HTTPS** | Não foi possível publicar daqui. Escolher hospedagem (GitHub Pages / Netlify / Cloudflare Pages) e publicar a pasta `meuestudo/` |
| **Teste de instalação em Android real** | Não há aparelho nesta sessão. Fazer depois do deploy (critério G3, dia 11) |
| **Teste em iPhone** | Idem. Se não houver aparelho, **não declarar iOS testado** |
| Integração com os módulos reais e regressão final | Depende da entrega dos módulos |
| Wireframe em ferramenta gráfica | Wireframes entregues em texto (seção 3.2); suficientes para orientar os módulos |
| Backup/exportação de dados | Fora do P0, conforme a seção 35.1 |

---

## 8. Próximos passos e checklist de entrega ao time

1. **Repositório e deploy:** criar o repositório, subir `meuestudo/`, publicar em HTTPS e registrar a URL.
2. **Compartilhar com os donos:** `README.md` (contrato de módulo, chaves, classes CSS e prefixos).
3. **Receber os módulos** e integrar por branches/revisão cruzada. Checar:
   - o painel exibe dados criados nos módulos (aula com `weekday` numérico 0–6, `startTime` `HH:MM`; atividade com `date` `YYYY-MM-DD` e `status`);
   - sem timers duplicados ao navegar e voltar;
   - módulos não usam `localStorage` diretamente.
4. **Antes de cada deploy:** aumentar `CACHE_VERSION` em `sw.js`.
5. **Testar instalação** em pelo menos um Android real; iPhone se houver aparelho.
6. **Regressão final** (T-01 a T-14 da seção 42.1 da documentação mestra) e congelamento da release no dia 14.

---

## 9. Decisões e premissas

| # | Decisão / premissa | Motivo |
|---|---|---|
| 1 | Na primeira versão, o contrato `00_...` não estava anexado e usei as seções 36.2–36.6 da Documentação Mestra. **Agora o contrato oficial foi recebido e conferido** (seção 11). Em dúvida, ele prevalece. | Evitar bloqueio e depois conferir |
| 2 | `horarios-agenda.js` atende duas rotas (`#/horarios` e `#/agenda`) e recebe `services.route` para saber qual tela abrir. **`route` é uma extensão além do contrato**, que só prevê `services.storage`. | O contrato lista um único arquivo para as duas áreas, sem dizer como diferenciá-las. **Precisa ser combinado com o Eduardo Levy** |
| 3 | `status` oficial: `pendente` ou `concluida` (contrato, seção 6). O painel trata como concluída `concluida` e, por tolerância, `concluído`, `done` e `completed`; qualquer outro valor é pendente. | Evita itens "sumindo" por diferença de grafia |
| 4 | Roteamento por hash, sem biblioteca. | Funciona em hospedagem estática e em subpasta; zero dependências |
| 5 | Caminhos relativos em todo o projeto. | Permite publicar em subpasta (ex.: GitHub Pages de projeto) |
| 6 | CSS dos módulos carregados no `index.html` pelo shell. | Evita que cada módulo injete estilos; arquivos placeholder evitam 404 |
| 7 | `package.json` com `"type": "module"` apenas para testes locais. | Não afeta a hospedagem estática |

---

## 10. Limitações conhecidas

- Dados ficam no navegador e no aparelho: não sincronizam; limpar dados do site ou usar aba privada pode apagá-los (explicado na tela inicial).
- A primeira visita precisa de internet; depois, a estrutura abre offline.
- A instalação como app depende do navegador e da versão do sistema; nada foi testado em aparelho real.
- Timers em segundo plano podem ser limitados pelo navegador (relevante para o módulo de foco).
- Ícones provisórios.
- O PWA não é aplicativo publicado nas lojas.

---

## 11. Conformidade com o Contrato Técnico Compartilhado v0.3

O contrato oficial chegou depois da primeira entrega. Foi feita uma conferência item a item.

| Seção do contrato | Situação |
|---|---|
| 2. Stack congelada (HTML, CSS, JS com ES Modules, sem framework/bundler/biblioteca externa) | Conforme |
| 3. Estrutura de arquivos | Conforme. Extras que não alteram a estrutura: `apple-touch-icon.png`, `README.md`, `package.json`, `tests/`, `docs/` |
| 4. Donos dos arquivos | Conforme. Os três CSS de módulo existem como placeholder para evitar 404 |
| 5. Contrato de montagem (`mount(container, services)` + `destroy`) e `services.storage.read/write` | Conforme. Extras opcionais: `remove`, `isPersistent`, `KEYS`, `ui`, `navigate`, `route` |
| 6. Chaves e modelos de dados | Conforme. O painel lê `horarios` e `agenda` com os campos do contrato |
| 7. Navegação (`inicio`, `horarios`, `agenda`, `notas`, `foco`; botões com `data-route`; módulos não criam navegação global) | Conforme. O shell cria o contêiner e chama `mount` |
| 8. CSS e acessibilidade (prefixos, rótulos, foco visível, 320 px, sem fontes externas) | **Corrigido nesta revisão**: os prefixos dos placeholders eram `.ha-`/`.nt-`/`.fc-`; agora seguem o contrato (`schedule-`/`agenda-`, `grade-`, `focus-`) |
| 9. Git e IA | Orientação de processo, sem código |
| 10. Definição de pronto | Aplica-se aos módulos; o README repassa os pontos relevantes |

### Alterações da revisão 1

1. **Prefixos de CSS** nos placeholders e no README corrigidos para o contrato.
2. **Valores de `status`**: o README e os testes agora usam `pendente`/`concluida`; `ui.js` mantém tolerância às outras grafias.
3. **README** passou a citar o contrato como autoridade, marcou o que é exigido (`read`/`write`) e o que é extensão (`route` etc.) e documentou os valores de `type`, `priority` e `status`.
4. **Documentação**: decisões 1–3 atualizadas e esta seção adicionada.

Não houve mudança em `index.html`, `app.js`, `storage.js`, `base.css`, `layout.css`, manifest, Service Worker nem ícones. Os 23 testes continuam passando.

### Ponto que ainda exige alinhamento

- `services.route` não existe no contrato. Se o Eduardo Levy preferir outra forma de diferenciar Horários e Agenda (por exemplo, dois arquivos), basta avisar o integrador; o ajuste no shell é pequeno.
