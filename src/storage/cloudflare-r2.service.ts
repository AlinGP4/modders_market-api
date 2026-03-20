import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class CloudflareR2Service {
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly avatarPrefix: string;
  private readonly jobPrefix: string;
  private readonly chatPrefix: string;
  private readonly client: S3Client | null;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = (this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME') ?? '').trim();
    this.publicBaseUrl = (this.configService.get<string>('CLOUDFLARE_R2_PUBLIC_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    this.avatarPrefix =
      (this.configService.get<string>('CLOUDFLARE_R2_AVATAR_PREFIX') ?? 'avatars')
        .trim()
        .replace(/^\/+|\/+$/g, '') || 'avatars';
    this.jobPrefix =
      (this.configService.get<string>('CLOUDFLARE_R2_JOB_PREFIX') ?? 'jobs')
        .trim()
        .replace(/^\/+|\/+$/g, '') || 'jobs';
    this.chatPrefix =
      (this.configService.get<string>('CLOUDFLARE_R2_CHAT_PREFIX') ?? 'chats')
        .trim()
        .replace(/^\/+|\/+$/g, '') || 'chats';

    const accountId = (this.configService.get<string>('CLOUDFLARE_R2_ACCOUNT_ID') ?? '').trim();
    const accessKeyId = (
      this.configService.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID') ?? ''
    ).trim();
    const secretAccessKey = (
      this.configService.get<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY') ?? ''
    ).trim();
    const configuredEndpoint = (this.configService.get<string>('CLOUDFLARE_R2_ENDPOINT') ?? '')
      .trim()
      .replace(/\/+$/, '');

    const endpoint = configuredEndpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
    const hasCredentials = !!(endpoint && accessKeyId && secretAccessKey && this.bucketName);

    this.client = hasCredentials
      ? new S3Client({
          region: 'auto',
          endpoint,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        })
      : null;
  }

  isConfigured(): boolean {
    return !!this.client && !!this.publicBaseUrl;
  }

  async uploadAvatar(params: {
    supabaseUserId: string;
    originalName: string;
    mimeType: string;
    fileBuffer: Buffer;
  }): Promise<string> {
    if (!this.client || !this.bucketName || !this.publicBaseUrl) {
      throw new InternalServerErrorException(
        'Cloudflare R2 is not configured. Set CLOUDFLARE_R2_* variables in .env.',
      );
    }

    const key = this.buildAvatarKey(params.supabaseUserId, params.originalName, params.mimeType);
    await this.uploadObject(key, params.fileBuffer, params.mimeType);

    return `${this.publicBaseUrl}/${key}`;
  }

  async uploadJobImage(params: {
    supabaseUserId: string;
    jobId: string;
    originalName: string;
    mimeType: string;
    fileBuffer: Buffer;
  }): Promise<string> {
    if (!this.client || !this.bucketName || !this.publicBaseUrl) {
      throw new InternalServerErrorException(
        'Cloudflare R2 is not configured. Set CLOUDFLARE_R2_* variables in .env.',
      );
    }

    const key = this.buildJobImageKey(
      params.supabaseUserId,
      params.jobId,
      params.originalName,
      params.mimeType,
    );
    await this.uploadObject(key, params.fileBuffer, params.mimeType);

    return `${this.publicBaseUrl}/${key}`;
  }

  async uploadChatImage(params: {
    supabaseUserId: string;
    conversationId: string;
    originalName: string;
    mimeType: string;
    fileBuffer: Buffer;
  }): Promise<string> {
    if (!this.client || !this.bucketName || !this.publicBaseUrl) {
      throw new InternalServerErrorException(
        'Cloudflare R2 is not configured. Set CLOUDFLARE_R2_* variables in .env.',
      );
    }

    const key = this.buildChatImageKey(
      params.supabaseUserId,
      params.conversationId,
      params.originalName,
      params.mimeType,
    );
    await this.uploadObject(key, params.fileBuffer, params.mimeType);

    return `${this.publicBaseUrl}/${key}`;
  }

  private async uploadObject(key: string, fileBuffer: Buffer, mimeType: string): Promise<void> {
    if (!this.client || !this.bucketName) {
      throw new InternalServerErrorException(
        'Cloudflare R2 is not configured. Set CLOUDFLARE_R2_* variables in .env.',
      );
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  private buildAvatarKey(supabaseUserId: string, originalName: string, mimeType: string): string {
    const safeUserId = supabaseUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseNameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const safeBaseName =
      baseNameWithoutExt
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'avatar';

    const extension = this.resolveFileExtension(originalName, mimeType);
    const uniqueSuffix = `${Date.now()}-${randomUUID().split('-')[0]}`;
    return `${this.avatarPrefix}/${safeUserId}/${uniqueSuffix}-${safeBaseName}${extension}`;
  }

  private buildJobImageKey(
    supabaseUserId: string,
    jobId: string,
    originalName: string,
    mimeType: string,
  ): string {
    const safeUserId = supabaseUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseNameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const safeBaseName =
      baseNameWithoutExt
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'job-image';

    const extension = this.resolveFileExtension(originalName, mimeType);
    const uniqueSuffix = `${Date.now()}-${randomUUID().split('-')[0]}`;
    return `${this.jobPrefix}/${safeUserId}/${safeJobId}/${uniqueSuffix}-${safeBaseName}${extension}`;
  }

  private buildChatImageKey(
    supabaseUserId: string,
    conversationId: string,
    originalName: string,
    mimeType: string,
  ): string {
    const safeUserId = supabaseUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeConversationId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseNameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const safeBaseName =
      baseNameWithoutExt
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'chat-image';

    const extension = this.resolveFileExtension(originalName, mimeType);
    const uniqueSuffix = `${Date.now()}-${randomUUID().split('-')[0]}`;
    return `${this.chatPrefix}/${safeUserId}/${safeConversationId}/${uniqueSuffix}-${safeBaseName}${extension}`;
  }

  private resolveFileExtension(originalName: string, mimeType: string): string {
    const extension = extname(originalName).toLowerCase();
    if (extension) {
      return extension;
    }

    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    return '.bin';
  }
}
