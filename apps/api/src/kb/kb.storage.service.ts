import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import { join } from "path";

type SaveUploadArgs = {
  tenantId: string;
  sourceId: string;
  originalName: string;
  buffer: Buffer;
};

type SaveTextArgs = {
  tenantId: string;
  sourceId: string;
  filename: string;
  content: string;
};

@Injectable()
export class KbStorageService {
  constructor(private config: ConfigService) {}

  private baseDir() {
    return this.config.get<string>("KB_STORAGE_DIR") ?? join(process.cwd(), "storage", "kb");
  }

  async saveUpload(args: SaveUploadArgs): Promise<string> {
    const safeName = sanitizeFilename(args.originalName || "upload");
    const dir = join(this.baseDir(), args.tenantId, args.sourceId);
    await fs.mkdir(dir, { recursive: true });

    const storagePath = join(dir, safeName);
    await fs.writeFile(storagePath, args.buffer);
    return storagePath;
  }

  async saveText(args: SaveTextArgs): Promise<string> {
    const buf = Buffer.from(args.content ?? "", "utf8");
    return this.saveUpload({
      tenantId: args.tenantId,
      sourceId: args.sourceId,
      originalName: args.filename,
      buffer: buf,
    });
  }

  // remove all files for a source
  async removeSourceDir(tenantId: string, sourceId: string) {
    const dir = join(this.baseDir(), tenantId, sourceId);
    // force:true => no throw if missing
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
