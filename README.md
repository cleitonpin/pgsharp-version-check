# check-v

## Descrição

O projeto **check-v** é um serviço automatizado para monitoramento de versões de um APK (aplicativo Android) disponibilizado no site da PGSharp. Ele verifica periodicamente se há uma nova versão do APK, faz o download automático, extrai informações do AndroidManifest.xml para garantir a versão correta, salva os dados em um banco MongoDB e envia uma notificação para um canal do Discord via webhook sempre que uma nova versão é detectada.

## Funcionalidades

- Raspa a versão do APK exibida na página oficial da PGSharp usando Puppeteer.
- Baixa o APK diretamente da API oficial.
- Extrai `versionName` e `versionCode` do AndroidManifest.xml dentro do APK para validação.
- Salva informações da última versão verificada no MongoDB.
- Envia notificações automáticas para um canal do Discord usando webhook.
- Remove o APK baixado após o processamento (opcionalmente pode manter o arquivo).
- Permite personalizar o seletor CSS da versão e o comportamento de remoção do APK.

## Tecnologias Utilizadas

- [Bun](https://bun.sh) — Runtime JavaScript/TypeScript rápido e moderno.
- [Puppeteer](https://pptr.dev/) — Automação de navegador para scraping.
- [Axios](https://axios-http.com/) — Requisições HTTP.
- [adm-zip](https://www.npmjs.com/package/adm-zip) — Leitura de arquivos ZIP (APK).
- [dotenv](https://www.npmjs.com/package/dotenv) — Gerenciamento de variáveis de ambiente.
- [node-cron](https://www.npmjs.com/package/node-cron) — Agendamento de tarefas (opcional).
- [MongoDB](https://www.mongodb.com/) — Armazenamento das versões verificadas.

## Estrutura dos Arquivos

- `src/index.ts` — Script principal de verificação, download, extração e notificação.
- `src/discord.ts` — Função utilitária para envio de mensagens ao Discord.
- `src/db/connection.ts` — Conexão com o banco MongoDB.
- `src/db/schemas/versionInfo.ts` — Schema do MongoDB para informações de versão.
- `src/interfaces/apk.ts` — Tipos para dados do APK.
- `downloads/` — Pasta temporária para armazenar APKs baixados.
- `.env` — Variáveis de ambiente (exemplo abaixo).

## Configuração

1. **Clone o repositório e instale as dependências:**

   ```bash
   bun install
   ```

2. **Configure o arquivo `.env`:**

   Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:

   ```env
   WEBHOOK_URL='https://discord.com/api/webhooks/SEU_WEBHOOK_AQUI'
   VERSION_DISPLAY_PAGE_URL='https://www.pgsharp.com/'
   APK_DOWNLOAD_API_URL='https://api.pgsharp.com/download'
   MONGODB_URI='mongodb+srv://usuario:senha@host/db?options'
   ```

   Substitua os valores conforme necessário para seu ambiente.

3. **(Opcional) Ajuste o seletor CSS da versão:**

   Se o site da PGSharp mudar o layout, atualize a constante `VERSION_SELECTOR_ON_PAGE` em `src/index.ts` para o seletor correto do elemento que exibe a versão.

## Como Usar

Para executar o serviço manualmente:

```bash
bun run src/index.ts
```

O script irá:

- Buscar a versão atual na página da PGSharp.
- Comparar com a última versão registrada no MongoDB.
- Se houver nova versão, baixar o APK, extrair informações do manifesto, salvar no banco, notificar no Discord e (opcionalmente) remover o APK baixado.

## Personalização

- Para manter o APK baixado, altere a constante `KEEP_DOWNLOADED_APK` para `true` em `src/index.ts`.
- Para agendar execuções automáticas, utilize a biblioteca `node-cron` (veja exemplos no código).
- Para monitorar outros APKs, ajuste as URLs e seletores no `.env` e no código.

## Observações

- O projeto foi criado usando `bun init` com Bun v1.1.43.
- O serviço pode ser adaptado para monitorar outros APKs, bastando ajustar as URLs e seletores.
- O banco MongoDB é utilizado para persistência das versões verificadas.
- O arquivo `downloads/` é utilizado apenas como cache temporário.

## Licença

MIT License — Consulte o arquivo LICENSE para mais detalhes.
