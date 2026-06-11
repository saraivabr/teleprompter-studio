# Roteiro Studio

Criador de roteiros prontos para teleprompter, em português do Brasil. Você descreve uma ideia bruta, escolhe a plataforma (Reels, TikTok, Shorts, YouTube longo, aula ou podcast) e a duração — e recebe o texto do roteiro com hook, desenvolvimento e fechamento, já marcado com pausas, tons e ênfases para leitura em câmera. Copie o texto e cole no app de teleprompter que você já usa.

## Marcações que o roteiro usa

| Marcação | Significado |
|---|---|
| `/` `//` `///` | pausa de ~1s, ~2s, ~3s |
| `[R]` | respiração / troca de bloco |
| `↑` `↓` `→` | subir, baixar ou manter o tom |
| `**texto**` | ênfase forte |
| `_texto_` | ênfase suave |

A visualização renderiza essas marcações (pílulas de pausa, setas coloridas, círculo de respiração); o botão **Copiar texto** copia o roteiro bruto com as marcações originais.

## Como rodar

Pré-requisitos: Node.js 20+ e o [Claude Code](https://claude.com/claude-code) instalado e logado (o comando `claude` precisa funcionar no terminal). A geração usa o Claude CLI — **não precisa de chave de API**.

```bash
npm install
npm run dev
# abre em http://localhost:5173 (frontend) + http://localhost:3939 (API)
```

Para rodar a versão de produção (um processo só):

```bash
npm run build
npm start
# abre em http://localhost:3939
```

## Funcionalidades

- **Criar** — descreva a ideia, escolha plataforma e duração; o roteiro chega em streaming, com as seções e marcações formatadas.
- **Moral da história** — informe o que você quer vender/ensinar/fazer o público acreditar, e o roteiro inteiro é desenhado para apontar sutilmente até lá.
- **Capa do tema** — escolha o tipo de "capa" que chama atenção antes de entrar no assunto: tema universal (relacionamento, família, morte e vida…), tema do momento ou cultura pop.
- **Gatilhos psicológicos** — todo roteiro aplica deliberadamente gatilhos de retenção (Efeito A-HA, contraste de emoções, lacuna da curiosidade, imagens mentais) e storytelling de conflito → mudança.
- **🧠 Estratégia do roteiro** — cada roteiro termina com um bloco analítico mostrando qual capa foi usada, qual a moral da história e quais gatilhos foram aplicados em cada parte — para você treinar o olho e enxergar os mecanismos.
- **Copiar texto** — copia o roteiro bruto para colar em qualquer teleprompter.
- **Biblioteca** — salve roteiros no navegador (localStorage) e reabra depois.

## Estrutura

```
server/
├── index.ts      # Express + POST /api/generate (spawna `claude -p` com streaming JSON)
└── prompt.ts     # System prompt do roteirista
src/
├── lib/          # parser das marcações, tipos, biblioteca (localStorage)
├── hooks/        # streaming SSE
└── components/
    ├── create/   # formulário + resultado em streaming
    ├── script/   # renderização do roteiro com marcações
    └── library/  # roteiros salvos
```

Por padrão usa o modelo configurado no seu Claude Code. Para forçar outro, defina a variável de ambiente `CLAUDE_MODEL` (ex.: `CLAUDE_MODEL=opus npm run dev`).

## Expondo na rede (opcional)

Se for acessar o app de fora da sua máquina (ex.: via túnel), defina `APP_PASSWORD` para ativar autenticação básica — sem isso, qualquer pessoa com o link gera roteiros usando a sua conta do Claude:

```bash
APP_PASSWORD=sua-senha npm start
```

## Licença

[MIT](./LICENSE)
