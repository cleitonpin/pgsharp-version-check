import { Schema, type Model } from "mongoose";
import mongoose from "mongoose";

interface IVersionInfo extends Document {
  sourceIdentifier: string; 
  scrapedVersion?: string | null;
  manifestVersionName?: string | null;
  manifestVersionCode?: string | null;
  filename?: string | null;
  downloadedAt: string | Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const versionInfoSchema = new Schema<IVersionInfo>({
  sourceIdentifier: { type: String, required: true, unique: true, index: true },
  scrapedVersion: { type: String },
  manifestVersionName: { type: String },
  manifestVersionCode: { type: String },
  filename: { type: String },
  downloadedAt: { type: Date, required: true },
}, {
  timestamps: true
});

const VersionInfoModel: Model<IVersionInfo> = mongoose.models.VersionInfo || mongoose.model<IVersionInfo>('VersionInfo', versionInfoSchema);

export { VersionInfoModel };
export type { IVersionInfo };