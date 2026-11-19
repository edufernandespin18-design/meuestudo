# MeuEstudo — PWA (v0.3)

Protótipo de extensão (UNINASSAU · ADS · EEEP Professor Cesar Campelo). PWA em HTML, CSS e JavaScript (módulos ES), **sem cadastro, sem backend**, com dados salvos no próprio aparelho.

## Rodar localmente

```bash
cd meuestudo
python3 -m http.server 8000      # ou: npx serve .
# abrir http://localhost:8000
npm test                         # testes da casca (Node, sem dependências)
```

O Service Worker só funciona em HTTPS ou `localhost`. Abrir o `index.html` por duplo clique (`file://`) não funciona, porque módulos ES exigem servidor.

## Estrutura (congelada)

```text
meuestudo/
├── index.html                  [Eduardo Fernandes]
├── manifest.webmanifest        [Eduardo Fernandes]
├── sw.js                       [Eduardo Fernandes]
├── assets/icons/               [Eduardo Fernandes]
├── css/
│   ├── base.css                [Eduardo Fernandes]  tokens + componentes
│   ├── layout.css              [Eduardo Fernandes]  cabeçalho, nav, painel
│   └── modules/
│       ├── horarios-agenda.css [Eduardo Levy]       prefixos .schedule- e .agenda-
│       ├── notas.css           [Eduardo Fernandes]          prefixo .grade-
│       └── foco.css            [Eduardo Fernandes]    prefixo .focus-
└── js/
    ├── app.js                  [Eduardo Fernandes]
    ├── storage.js              [Eduardo Fernandes]
    ├── ui.js                   [Eduardo Fernandes]
    └── modules/
        ├── horarios-agenda.js  [Eduardo Levy]
        ├── notas.js            [Eduardo Fernandes]
        └── foco.js             [Eduardo Fernandes]
```

Estrutura e donos seguem o **Contrato Técnico Compartilhado v0.3** (`00_Contrato_...md`), que prevalece em caso de dúvida. Cada arquivo tem **um único dono**. Não edite arquivos de outro dono sem combinar. Os três CSS de módulo existem só como placeholder (comentário): substitua o conteúdo pelo seu.

> Além de `read` e `write` (únicos itens exigidos pelo contrato), o shell oferece `remove`, `isPersistent`, `KEYS`, `ui`, `navigate` e `route` como conveniências opcionais.

## Onde o seu módulo entra

| Rota | Arquivo carregado | Observação |
|---|---|---|
| `#/horarios` | `js/modules/horarios-agenda.js` | `services.route === 'horarios'` |
| `#/agenda` | `js/modules/horarios-agenda.js` | `services.route === 'agenda'` |
| `#/notas` | `js/modules/notas.js` | |
| `#/foco` | `js/modules/foco.js` | |

Se o arquivo ainda não existir, o app mostra uma tela neutra "ainda está sendo preparada" e o resto segue funcionando.

## Contrato de módulo

```js
// js/modules/<seu-modulo>.js
export function mount(container, services) {
  // 1. Renderize SOMENTE dentro de `container` (já vazio).
  // 2. Leia/grave dados por services.storage (nunca localStorage direto).
  // 3. Registre seus eventos aqui.
  return function destroy() {
    // 4. Remova listeners, setInterval/setTimeout etc.
  };
}
```

`services`:

| Campo | O que é |
|---|---|
| `services.storage.read(key, fallback)` | **(contrato)** Lê; devolve `fallback` se ausente, corrompido ou de tipo diferente |
| `services.storage.write(key, value)` | **(contrato)** Grava; devolve `true`/`false`, nunca lança erro |
| `services.storage.remove(key)` | Remove só a chave indicada |
| `services.storage.isPersistent()` | `false` se o navegador bloqueou o armazenamento |
| `services.storage.KEYS` | `{ horarios, agenda, notas, foco }` com as chaves versionadas |
| `services.ui` | Utilitários de `js/ui.js` (`escapeHTML`, `todayISO`, `formatDateShort`, `normalizeTime`, `newId`, `toast`, ...) |
| `services.navigate(route)` | Vai para `'inicio' \| 'horarios' \| 'agenda' \| 'notas' \| 'foco'` |
| `services.route` | Rota atual. **Extensão além do contrato**, pensada para `horarios-agenda.js` saber se abre Horários ou Agenda; combinar com o Eduardo Levy |

`destroy()` é chamado ao sair da tela (e antes de qualquer nova montagem). Se o `mount` lançar erro, o shell mostra uma mensagem neutra com botão "Tentar de novo" e as outras telas continuam funcionando.

### Boas práticas para módulos

- Sempre use `services.ui.escapeHTML()` ao colocar texto do usuário em `innerHTML`.
- Classes CSS com o prefixo do contrato (`.schedule-` / `.agenda-`, `.grade-`, `.focus-`). Não redefina `body`, `button` nem `input` globalmente. Reutilize `.btn`, `.field`, `.input`, `.card`, `.list`, `.badge`, `.empty`, `.notice` de `base.css`.
- Primeira linha da tela: um `<h1>` (o shell leva o foco até ele, o que ajuda leitores de tela).
- Texto de status sempre em palavras (Pendente, Concluído, Reagendado), não só cor. Tom neutro, sem culpa.
- Use `ui.toast('Salvo')` para confirmações e `ui.toast('...', 'error')` para erros.

## Chaves de armazenamento

| Chave | Conteúdo |
|---|---|
| `meuestudo:v1:horarios` | array de aulas: `id, weekday (0=dom..6=sáb), subject, startTime, endTime, room?` |
| `meuestudo:v1:agenda` | array de atividades: `id, title, type, date (YYYY-MM-DD), time?, subject?, priority, status, notes?` — `type`: atividade/prova/trabalho/compromisso; `priority`: baixa/normal/alta; `status`: `pendente` ou `concluida` |
| `meuestudo:v1:notas` | disciplinas/boletim: `id, subject, targetAverage, totalAssessments, grades[]` |
| `meuestudo:v1:foco` | estado/configuração do timer (opcional) |

**O painel inicial lê `horarios` e `agenda`.** Para aparecerem lá:

- Aula: `weekday` numérico 0–6, `subject` não vazio e `startTime` no formato `HH:MM`.
- Atividade: `title` não vazio e `date` em `YYYY-MM-DD`. Conta como concluída se `status` for `concluida` (valor do contrato; por tolerância também `concluído`, `done` e `completed`). Qualquer outro valor é tratado como pendente.

## Instalação do app

- **Android (Chrome):** menu ⋮ → "Instalar app" / "Adicionar à tela inicial".
- **iPhone (Safari):** Compartilhar → "Adicionar à Tela de Início".
- Os passos variam conforme versão do sistema e do navegador.

## Publicação (HTTPS gratuito)

Qualquer hospedagem estática serve (GitHub Pages, Netlify, Cloudflare Pages). Todos os caminhos são **relativos**, então funciona também em subpasta (`usuario.github.io/meuestudo/`). Raiz do site = pasta `meuestudo/`.

