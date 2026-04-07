declare module "mammoth" {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface InputOptions {
    buffer: Buffer;
  }

  function extractRawText(options: InputOptions): Promise<ExtractResult>;
}
