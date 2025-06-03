# check-v

## Descrição

O projeto **check-v** é um serviço automatizado para monitoramento de versões de um APK (aplicativo Android) disponibilizado no site da PGSharp. Ele verifica periodicamente se há uma nova versão do APK, faz o download automático, extrai informações do AndroidManifest.xml para garantir a versão correta e envia uma notificação para um canal do Discord via webhook sempre que uma nova versão é detectada.

## Funcionalidades

- Raspa a versão do APK exibida na página oficial da PGSharp usando Puppeteer.
- Baixa o APK diretamente da API oficial.
- Extrai `versionName` e `versionCode` do AndroidManifest.xml dentro do APK para validação.
- Salva informações da última versão verificada em um arquivo JSON.
- Envia notificações automáticas para um canal do Discord usando webhook.
- Remove o APK baixado após o processamento (opcionalmente pode manter o arquivo).

## Tecnologias Utilizadas

- [Bun](https://bun.sh) — Runtime JavaScript/TypeScript rápido e moderno.
- [Puppeteer](https://pptr.dev/) — Automação de navegador para scraping.
- [Axios](https://axios-http.com/) — Requisições HTTP.
- [adm-zip](https://www.npmjs.com/package/adm-zip) — Leitura de arquivos ZIP (APK).
- [dotenv](https://www.npmjs.com/package/dotenv) — Gerenciamento de variáveis de ambiente.

## Estrutura dos Arquivos

- `index.ts` — Script principal de verificação, download e notificação.
- `discord.ts` — Função utilitária para envio de mensagens ao Discord.
- `last_checked_version.json` — Armazena informações da última versão verificada.
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
   ```

   Substitua `SEU_WEBHOOK_AQUI` pela URL do webhook do seu canal do Discord.

3. **(Opcional) Ajuste o seletor CSS da versão:**

   Se o site da PGSharp mudar o layout, atualize a constante `VERSION_SELECTOR_ON_PAGE` em `index.ts` para o seletor correto do elemento que exibe a versão.

## Como Usar

Para executar o serviço manualmente:

```bash
bun run index.ts
```

O script irá:

- Buscar a versão atual na página da PGSharp.
- Comparar com a última versão registrada.
- Se houver nova versão, baixar o APK, extrair informações do manifesto, notificar no Discord e (opcionalmente) remover o APK baixado.

## Personalização

- Para manter o APK baixado, altere a constante `KEEP_DOWNLOADED_APK` para `true` em `index.ts`.
- Para agendar execuções automáticas, utilize a função comentada de agendamento (cron) no final do arquivo `index.ts`.

## Observações

- O projeto foi criado usando `bun init` com Bun v1.1.43.
- O serviço pode ser adaptado para monitorar outros APKs, bastando ajustar as URLs e seletores.
- O arquivo `last_checked_version.json` é atualizado automaticamente a cada verificação bem-sucedida.

## Licença

Este projeto é de uso pessoal e educacional. Consulte o autor para outros usos.
