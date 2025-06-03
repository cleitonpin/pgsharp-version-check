declare module 'app-info-parser' {
  class AppInfoParser {
    constructor(filePath: string);
    parse(): Promise<any>;
  }
  export = AppInfoParser;
}