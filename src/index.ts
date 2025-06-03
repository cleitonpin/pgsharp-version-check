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
import type { ApkVersionDetails, DownloadedApkData, VersionInfo } from './interfaces/apk';

const { WEBHOOK_URL, VERSION_DISPLAY_PAGE_URL, APK_DOWNLOAD_API_URL } = process.env;

if (!WEBHOOK_URL || !VERSION_DISPLAY_PAGE_URL || !APK_DOWNLOAD_API_URL) {
  console.error('Erro: Variáveis de ambiente WEBHOOK_URL, VERSION_DISPLAY_PAGE_URL e APK_DOWNLOAD_API_URL devem ser definidas.');
  process.exit(1);
}

const KEEP_DOWNLOADED_APK: boolean = false;
const VERSION_SELECTOR_ON_PAGE: string = '#content > div > div > div > div > section.elementor-section.elementor-top-section.elementor-element.elementor-element-46f376a.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default > div > div > div > div > div > div.elementor-element.elementor-element-d81c5e0.elementor-widget.elementor-widget-text-editor > div > div > p:nth-child(1) > span:nth-child(2)'; 

const DOWNLOAD_DIR: string = path.join(process.cwd(), 'downloads');
const VERSION_FILE: string = path.join(process.cwd(), 'last_checked_version.json');
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

    if (manifestEntry) {
      const manifestXml = manifestEntry.getData().toString('utf8');
      const versionCodeMatch = manifestXml.match(/android:versionCode="([^"]+)"/);
      const versionNameMatch = manifestXml.match(/android:versionName="([^"]+)"/);

      const details: ApkVersionDetails = {
        versionCode: versionCodeMatch ? versionCodeMatch[1] : null,
        versionName: versionNameMatch ? versionNameMatch[1] : null,
      };
      console.log(`Versão extraída do manifesto do APK ('${path.basename(apkFilePath)}'): Code='${details.versionCode}', Name='${details.versionName}'`);
      return details;
    } else {
      console.warn('AndroidManifest.xml não encontrado no APK.');
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

async function loadLastVersionInfo(): Promise<VersionInfo> {
  try {
    if (await pathExists(VERSION_FILE)) {
      const fileContent = await fs.readFile(VERSION_FILE, 'utf-8');
      return JSON.parse(fileContent) as VersionInfo;
    }
  } catch (error: any) {
    console.error('Erro ao carregar informações da última versão:', error.message);
  }
  return { scrapedVersion: null, manifestVersionName: null, manifestVersionCode: null, filename: null };
}

async function saveCurrentVersionInfo(info: VersionInfo): Promise<void> {
  try {
    await fs.writeFile(VERSION_FILE, JSON.stringify(info, null, 2), 'utf-8');
    console.log('Informações da versão atual salvas:', info);
  } catch (error: any) {
    console.error('Erro ao salvar informações da versão atual:', error.message);
  }
}

async function checkAndUpdateApk(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Iniciando verificação de nova versão do APK...`);

  const lastVersionInfo = await loadLastVersionInfo();
  console.log('Última versão registrada:', lastVersionInfo);

  const currentScrapedVersion = await getVersionFromPageWithPuppeteer(VERSION_DISPLAY_PAGE_URL!, VERSION_SELECTOR_ON_PAGE);

  if (!currentScrapedVersion) {
    console.error('Não foi possível obter a versão da página. Abortando verificação.');
    return;
  }
  
  if (currentScrapedVersion === lastVersionInfo.scrapedVersion || currentScrapedVersion === lastVersionInfo.manifestVersionName) {
    const dateFormattedPtBR = new Date(lastVersionInfo.updatedAt ?? '').toLocaleDateString('pt-BR', {
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
        value: lastVersionInfo.scrapedVersion || 'Nenhuma',
        inline: true
      },
      {
        name: 'Versão do manifesto',
        value: lastVersionInfo.manifestVersionName || 'Nenhuma',
        inline: true
      }
    ]);
    console.log(`Versão da página (${currentScrapedVersion}) é a mesma da última verificação. Nenhuma ação necessária.`);
    return;
  }

  console.log(`Nova versão detectada na página: ${currentScrapedVersion} (anterior registrada: ${lastVersionInfo.scrapedVersion || lastVersionInfo.manifestVersionName || 'Nenhuma'})`);

  const proposedFilename = `${currentScrapedVersion.replace(/[^a-zA-Z0-9.-]/g, '_')}.apk`; 
  const downloadedApkData = await downloadApkFromApi(APK_DOWNLOAD_API_URL!, proposedFilename);

  if (!downloadedApkData) {
    console.error('Falha no download do APK. Abortando.');
    return;
  }

  const manifestVersionDetails = await getVersionFromApkManifest(downloadedApkData.filePath);

  let finalVersionToStore: VersionInfo = {
    scrapedVersion: currentScrapedVersion,
    manifestVersionName: manifestVersionDetails?.versionName || null,
    manifestVersionCode: manifestVersionDetails?.versionCode || null,
    filename: downloadedApkData.determinedFilename,
    filePath: downloadedApkData.filePath,
    downloadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), 
  };

  let apkPathForCleanup = downloadedApkData.filePath; 

  if (manifestVersionDetails?.versionName && manifestVersionDetails.versionName !== currentScrapedVersion) {
    console.warn(`Versão do manifesto (${manifestVersionDetails.versionName}) difere da raspada (${currentScrapedVersion}).`);
    const manifestBasedFilename = `${APK_BASENAME}-v${manifestVersionDetails.versionName.replace(/[^a-zA-Z0-9.-]/g, '_')}.apk`;
    const newFinalPath = path.join(DOWNLOAD_DIR, manifestBasedFilename);
    if (downloadedApkData.filePath !== newFinalPath) {
      try {
        if (await pathExists(newFinalPath)) await fs.unlink(newFinalPath);
        await fs.rename(downloadedApkData.filePath, newFinalPath);
        console.log(`Arquivo renomeado para usar versão do manifesto: ${manifestBasedFilename}`);
        finalVersionToStore.filename = manifestBasedFilename;
        finalVersionToStore.filePath = newFinalPath;
        apkPathForCleanup = newFinalPath; 
      } catch (renameError: any) {
        console.error(`Erro ao renomear arquivo com base na versão do manifesto: ${renameError.message}`);
      }
    }
  }

  await saveCurrentVersionInfo(finalVersionToStore);
  console.log('NOTIFICAÇÃO: Nova versão do APK disponível e baixada!');
  await sendDiscordMessage(WEBHOOK_URL!, `Nova versão do APK disponível: ${finalVersionToStore.filename}\nVersão raspada: ${finalVersionToStore.scrapedVersion}\nVersão do manifesto: ${finalVersionToStore.manifestVersionName || 'N/A'}\nBaixado em: ${finalVersionToStore.downloadedAt}`);

  if (!KEEP_DOWNLOADED_APK) {
    if (apkPathForCleanup && await pathExists(apkPathForCleanup)) {
      try {
        await fs.unlink(apkPathForCleanup);
        console.log(`APK baixado (${path.basename(apkPathForCleanup)}) foi removido para economizar espaço.`);
        
        await saveCurrentVersionInfo(finalVersionToStore); 
      } catch (cleanupError: any) {
        console.error(`Erro ao remover o APK baixado ${apkPathForCleanup}:`, cleanupError.message);
      }
    }
  } else {
    console.log(`APK baixado (${path.basename(apkPathForCleanup)}) foi mantido em: ${apkPathForCleanup}`);
  }
  
}

console.log('Serviço de verificação de APK (com Puppeteer e análise de manifesto) iniciado.');

(async () => {
  try {
    console.log("Executando teste inicial...");
    await checkAndUpdateApk();
    console.log("Teste inicial concluído.");
  } catch (error) {
    console.error("Erro na execução inicial de teste:", error);
  }
})();
