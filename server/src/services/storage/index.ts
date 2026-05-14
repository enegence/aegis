export interface UploadPacketInput {
  switchId: number;
  packetId: number;
  version: number;
  encryptedBytes: Buffer;
  encryptedObjectHash: string;
}

export interface UploadPacketResult {
  objectKey: string;
  versionId: string | undefined;
  etag: string | undefined;
  sizeBytes: number;
}

export interface VerifyPacketInput {
  objectKey: string;
  expectedSizeBytes: number;
}

export interface VerifyPacketResult {
  ok: boolean;
  reason?: string;
  actualSizeBytes?: number;
  versionId?: string;
}

export interface DownloadPacketInput {
  objectKey: string;
}

export interface DeletePacketInput {
  objectKey: string;
}

export interface PacketStorageProvider {
  uploadPacket(input: UploadPacketInput): Promise<UploadPacketResult>;
  verifyPacket(input: VerifyPacketInput): Promise<VerifyPacketResult>;
  downloadPacket(input: DownloadPacketInput): Promise<Buffer>;
  deletePacket(input: DeletePacketInput): Promise<void>;
}
