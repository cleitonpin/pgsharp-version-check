import 'dotenv/config';
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Writable } from 'stream';
import puppeteer, { Browser, Page } from 'puppeteer';
import AdmZip from 'adm-zip';
import * as fsSync from 'fs';
import { sendDiscordMessage } from './discord';
import type { ApkVersionDetails, DownloadedApkData } from './interfaces/apk';
import { requestConnection } from './db/connection';
import { VersionInfoModel, type IVersionInfo } from './db/schemas/versionInfo';
import AppInfoParser from 'app-info-parser';

const { WEBHOOK_URL, VERSION_DISPLAY_PAGE_URL, APK_DOWNLOAD_API_URL, MONGODB_URI } = process.env;

if (!WEBHOOK_URL || !VERSION_DISPLAY_PAGE_URL || !APK_DOWNLOAD_API_URL || !MONGODB_URI) {
  console.error('Erro: Variáveis de ambiente WEBHOOK_URL, VERSION_DISPLAY_PAGE_URL e APK_DOWNLOAD_API_URL devem ser definidas.');
  process.exit(1);
}

const KEEP_DOWNLOADED_APK: boolean = false;
const VERSION_SELECTOR_ON_PAGE: string = '#content > div > div > div > div > section.elementor-section.elementor-top-section.elementor-element.elementor-element-46f376a.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default > div > div > div > div > div > div.elementor-element.elementor-element-d81c5e0.elementor-widget.elementor-widget-text-editor > div > div > p:nth-child(1) > span:nth-child(2)'; 
const APK_SOURCE_IDENTIFIER = 'pgsharp_apk_check'
const DOWNLOAD_DIR: string = path.join(process.cwd(), 'downloads');
const APK_BASENAME: string = 'apk_pgsharp'; 

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function getVersionFromPageWithPuppeteer(pageUrl: string, versionSelector: string): Promise<string | null> {
  let browser: Browser | null = null;
  try {
    console.log(`Iniciando Puppeteer para buscar versão em: ${pageUrl}`);
    browser = await puppeteer.launch({
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page: Page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: 'networkidle2' }); 

    await page.waitForSelector(versionSelector, { timeout: 15000 }); 
    const versionString = await page.$eval(versionSelector, el => el.textContent?.trim());

    if (!versionString) {
      console.warn(`Seletor '${versionSelector}' encontrado, mas sem conteúdo de texto para versão.`);
      return null;
    }
    console.log(`Versão detectada na página (Puppeteer): ${versionString}`);
    return versionString;
  } catch (error: any) {
    console.error('Erro ao buscar versão com Puppeteer:', error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function getVersionFromApkManifest(apkFilePath: string): Promise<ApkVersionDetails | null> {
  try {
    if (!await pathExists(apkFilePath)) {
      console.warn(`Arquivo APK não encontrado em: ${apkFilePath} para extração de manifesto.`);
      return null;
    }
    const zip = new AdmZip(apkFilePath);
    const manifestEntry = zip.getEntry('AndroidManifest.xml');

    // caso o arquivo APK não contenha o manifesto esperado
    // zip.extractAllTo(DOWNLOAD_DIR, true);
    const parser = new AppInfoParser(apkFilePath); // Passe o caminho do arquivo APK
    const result = await parser.parse();

    const versionCode = result.versionCode !== undefined && result.versionCode !== null ? String(result.versionCode) : null;
    const versionName = typeof result.versionName === 'string' ? result.versionName : null;

    if (versionCode || versionName) {
      const details: ApkVersionDetails = {
        versionCode: versionCode,
        versionName: versionName,
      };
      console.log(`Versão extraída do manifesto (app-info-parser): Code='${details}', Name='${details.versionName}'`);
      // console.log(`Versão extraída do manifesto (app-info-parser): Code='<span class="math-inline">\{details\.versionCode\}', Name\='</span>{details.versionName}'`);
      return details;
    } else {
      console.warn('Não foi possível extrair versionCode/versionName do manifesto do APK usando app-info-parser.');
      return null;
    }

  } catch (error: any) {
    console.error(`Erro ao ler o manifesto do APK '${apkFilePath}':`, error.message);
  }
  return null;
}

async function downloadApkFromApi(apiUrl: string, desiredFilename: string): Promise<DownloadedApkData | null> {
  try {
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    const tempFilePath = path.join(DOWNLOAD_DIR, `temp_${APK_BASENAME}_${Date.now()}.apk`); 

    console.log(`Baixando APK de ${apiUrl} para ${tempFilePath}...`);
    const response: AxiosResponse<Writable> = await axios({
      method: 'get',
      url: apiUrl,
      responseType: 'stream',
    });

    const writer: Writable = response.data;
    const fileStream = fsSync.createWriteStream(tempFilePath);
    writer.pipe(fileStream);

    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
      writer.on('error', reject);
    });

    console.log('APK baixado (temporariamente) com sucesso!');

    const finalFilePath = path.join(DOWNLOAD_DIR, desiredFilename);
    if (await pathExists(finalFilePath)) { 
      console.warn(`Arquivo ${finalFilePath} já existe. Removendo antes de renomear.`);
      await fs.unlink(finalFilePath);
    }
    await fs.rename(tempFilePath, finalFilePath);
    console.log(`APK salvo como: ${finalFilePath}`);

    return { filePath: finalFilePath, determinedFilename: desiredFilename };

  } catch (error: any) {
    console.error('Erro ao baixar o APK da API:', error.message);
    if (error.response) {
      console.error('Detalhes do erro da resposta:', error.response.status, error.response.data);
    }
    
    const tempFilePath = path.join(DOWNLOAD_DIR, `temp_${APK_BASENAME}_${Date.now()}.apk`); 
    if (await pathExists(tempFilePath)) {
      try { await fs.unlink(tempFilePath); } catch (e) { }
    }
    return null;
  }
}

async function loadLastVersionInfoFromDB() {
  try {
    const lastInfo = await VersionInfoModel.findOne({ sourceIdentifier: APK_SOURCE_IDENTIFIER }).lean();
    if (lastInfo) {
      console.log('Última versão carregada do DB:', {
        scrapedVersion: lastInfo.scrapedVersion,
        manifestVersionName: lastInfo.manifestVersionName,
        downloadedAt: lastInfo.downloadedAt,
      });
      return lastInfo;
    }
    console.log('Nenhuma informação de versão encontrada no DB para o identificador:', APK_SOURCE_IDENTIFIER);
  } catch (error: any) {
    console.error('Erro ao carregar informações da última versão do DB:', error.message);
  }
  return null;
}

async function saveCurrentVersionInfoToDB(info: Omit<IVersionInfo, keyof Document | 'sourceIdentifier'> & { sourceIdentifier?: string }): Promise<void> {
  const dataToSave = {
    ...info,
    sourceIdentifier: APK_SOURCE_IDENTIFIER,
    downloadedAt: new Date()
  };
  try {
    await VersionInfoModel.findOneAndUpdate(
      { sourceIdentifier: APK_SOURCE_IDENTIFIER },
      dataToSave,
      { upsert: true, new: true, setDefaultsOnInsert: true } 
    );
    console.log('Informações da versão atual salvas no DB:', {
      scrapedVersion: dataToSave.scrapedVersion,
      manifestVersionName: dataToSave.manifestVersionName
    });
  } catch (error: any) {
    console.error('Erro ao salvar informações da versão atual no DB:', error.message);
  }
}

async function checkAndUpdateApk(): Promise<void> {
  await requestConnection(process.env.MONGODB_URI!)
  console.log(`\n[${new Date().toISOString()}] Iniciando verificação de nova versão do APK...`);

  const lastVersionInfo = await loadLastVersionInfoFromDB();

  const currentScrapedVersion = await getVersionFromPageWithPuppeteer(process.env.VERSION_DISPLAY_PAGE_URL!, VERSION_SELECTOR_ON_PAGE);

  if (!currentScrapedVersion) {
    console.error('Não foi possível obter a versão da página. Abortando verificação.');
    return;
  }

  const versionToCompareLast = lastVersionInfo?.manifestVersionName || lastVersionInfo?.scrapedVersion;

  console.log(`Versão raspada atual: ${currentScrapedVersion} | Versão do manifesto: ${lastVersionInfo?.manifestVersionName || 'Nenhuma'} | Versão do DB: ${versionToCompareLast || 'Nenhuma'}`);
  
  if (currentScrapedVersion.includes(lastVersionInfo?.manifestVersionName ?? '')) {
    const dateFormattedPtBR = new Date(lastVersionInfo?.updatedAt ?? '').toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    await sendDiscordMessage(WEBHOOK_URL!, `Nenhuma nova versão do APK detectada. Versão atual: ${currentScrapedVersion}.`, [
      {
        name: 'Última verificação',
        value: dateFormattedPtBR,
        inline: true
      },
      {
        name: 'Versão raspada',
        value: lastVersionInfo?.scrapedVersion || 'Nenhuma',
        inline: true
      },
      {
        name: 'Versão do manifesto',
        value: lastVersionInfo?.manifestVersionName || 'Nenhuma',
        inline: true
      }
    ]);
    console.log(`Versão da página (${currentScrapedVersion}) é a mesma da última verificação. Nenhuma ação necessária.`);

    return;
  }

  console.log(`Nova versão detectada na página: ${currentScrapedVersion} (anterior registrada: ${lastVersionInfo?.scrapedVersion || lastVersionInfo?.manifestVersionName || 'Nenhuma'})`);

  const proposedFilename = `${currentScrapedVersion.replace(/[^a-zA-Z0-9.-]/g, '_')}.apk`; 
  const downloadedApkData = await downloadApkFromApi(APK_DOWNLOAD_API_URL!, proposedFilename);

  if (!downloadedApkData) {
    console.error('Falha no download do APK. Abortando.');
    return;
  }

  const manifestVersionDetails = await getVersionFromApkManifest(downloadedApkData.filePath);

  const currentInfoToSave: Partial<IVersionInfo> = {
    scrapedVersion: currentScrapedVersion,
    manifestVersionName: manifestVersionDetails?.versionName,
    manifestVersionCode: manifestVersionDetails?.versionCode,
    filename: downloadedApkData.determinedFilename,
  };

  await saveCurrentVersionInfoToDB(currentInfoToSave as any);

  console.log('NOTIFICAÇÃO: Nova versão do APK disponível e baixada!');

  await sendDiscordMessage(WEBHOOK_URL!, `Nova versão do APK disponível: ${currentInfoToSave.filename}\nBaixado em: ${currentInfoToSave.downloadedAt}`, [
    {
      name: 'Versão raspada',
      value: currentInfoToSave.scrapedVersion || 'Nenhuma',
      inline: true
    },
    {
      name: 'Versão do manifesto',
      value: currentInfoToSave.manifestVersionName || 'Nenhuma',
      inline: true
    },
    {
      name: 'Versão do manifesto (código)',
      value: currentInfoToSave.manifestVersionCode || 'Nenhum',
      inline: true
    },
    {
      name: 'Arquivo baixado',
      value: currentInfoToSave.filename || 'Nenhum',
      inline: true
    }
  ]);

  if (!KEEP_DOWNLOADED_APK && await pathExists(downloadedApkData.filePath)) {
    try {
      await fs.unlink(downloadedApkData.filePath); 
      console.log(`APK baixado (${path.basename(downloadedApkData.filePath)}) foi removido.`);
    } catch (cleanupError: any) {
      console.error(`Erro ao remover APK: ${cleanupError.message}`);
    }
  }
  
}

console.log('Serviço de verificação de APK (com Puppeteer e análise de manifesto) iniciado.');

(async () => {
  try {
    await checkAndUpdateApk();
    process.exit(0);
  } catch (error) {
    console.error("Erro na execução inicial de teste:", error);
  }
})();
