import ImageKit from 'imagekit';
import config from '../config';
// Using console for logging to avoid import issues
// The actual logger can be integrated later if needed

// Strict types
export interface ImageKitConfig {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
}

export interface UploadOptions {
  fileName?: string;
  folder?: string;
  useUniqueFileName?: boolean;
  tags?: string[] | string;
  isPrivateFile?: boolean;
  isPublished?: boolean;
  customCoordinates?: string;
  responseFields?: string | string[];
  extensions?: Array<{ name: string; [key: string]: any }> | string;
  webhookUrl?: string;
  overwriteFile?: boolean;
  overwriteAITags?: boolean;
  overwriteTags?: boolean;
  transformation?: TransformationOption[];
  customMetadata?: Record<string, string | number | boolean>;
  checks?: string;
}

export interface TransformationOption {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpg' | 'jpeg' | 'png' | 'webp' | 'avif';
  crop?: 'maintain_ratio' | 'force' | 'at_least' | 'at_max';
  [key: string]: any;
}

export interface UploadResult {
  success: boolean;
  data?: {
    url: string;
    fileId: string;
    name: string;
    filePath: string;
    thumbnailUrl?: string;
    height?: number;
    width?: number;
    size?: number;
    fileType?: string;
    versionInfo?: {
      id: string;
      name: string;
    };
  };
  error?: string;
  metadata?: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    uploadTime: number;
  };
}

export interface AuthParams {
  success: boolean;
  data?: {
    token: string;
    expire: number;
    signature: string;
  };
  error?: string;
}

// Constants for production limits
const PRODUCTION_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_MIME_TYPES: [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf'
  ],
  MAX_DIMENSION: 4096,
  DEFAULT_QUALITY: 85,
  WEBP_QUALITY: 80,
} as const;

/**
 * Production-ready ImageKit service
 */
class ImageKitService {
  private readonly client: ImageKit;
  private authCache: { data: any; expires: number } | null = null;

  constructor(config: ImageKitConfig) {
    this.validateConfig(config);
    
    this.client = new ImageKit({
      publicKey: config.publicKey,
      privateKey: config.privateKey,
      urlEndpoint: config.urlEndpoint,
    });
    
    // Logger is already imported and initialized
  }

  private validateConfig(config: ImageKitConfig): void {
    const required = ['publicKey', 'privateKey', 'urlEndpoint'] as const;
    for (const key of required) {
      if (!config[key]) {
        throw new Error(`ImageKit config missing: ${key}`);
      }
    }
  }

  /** Check if string is a valid URL */
  private isValidUrl(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Validate file before upload */
  private validateFile(file: Buffer | string): { valid: boolean; error?: string; size?: number } {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    // If it's a string, check if it's a valid base64 or URL
    if (typeof file === 'string') {
      if (this.isValidUrl(file)) {
        return { valid: true, size: 0 }; // Can't validate size of URL
      }
      
      // Basic base64 validation
      if (!/^data:[a-z]+\/[a-z0-9-+.]+(;[a-z-]+=[a-z0-9-]+)*?;base64,([a-z0-9+/]+={0,2})?$/i.test(file)) {
        return { valid: false, error: 'Invalid file format. Must be a valid base64 string or URL' };
      }
      
      const size = Math.ceil((file.length * 3) / 4); // Approximate size in bytes
      return { valid: true, size };
    }
    
    // If it's a Buffer, check size
    if (Buffer.isBuffer(file)) {
      if (file.length > PRODUCTION_LIMITS.MAX_FILE_SIZE) {
        return { 
          valid: false, 
          error: `File size exceeds ${PRODUCTION_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB limit` 
        };
      }
      return { valid: true, size: file.length };
    }
    
    return { valid: false, error: 'Invalid file type. Must be Buffer or base64 string' };
  }

  /** Generate optimized transformations */
  private getOptimizedTransformations(userTransforms?: TransformationOption[]): TransformationOption[] {
    const transforms: TransformationOption[] = userTransforms ? [...userTransforms] : [];
    const hasQuality = transforms.some(t => t.quality !== undefined);
    if (!hasQuality) transforms.push({ quality: PRODUCTION_LIMITS.DEFAULT_QUALITY });
    const hasResize = transforms.some(t => t.width || t.height);
    if (!hasResize) transforms.push({ width: PRODUCTION_LIMITS.MAX_DIMENSION, height: PRODUCTION_LIMITS.MAX_DIMENSION, crop: 'at_max' });
    const hasFormat = transforms.some(t => t.format !== undefined);
    if (!hasFormat) transforms.push({ format: 'webp', quality: PRODUCTION_LIMITS.WEBP_QUALITY });
    return transforms;
  }

  /** Remove undefined/null values */
  private cleanPayload(payload: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    
    // Remove undefined values and empty strings
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        cleaned[key] = value;
      }
    });
    
    return cleaned as UploadOptions;
  }

  /** Upload file with production optimizations */
  async uploadFile(file: Buffer | string, options: UploadOptions = {}): Promise<UploadResult> {
    const startTime = Date.now();
    try {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        console.warn(`Validation failed - ${validation.error}`);
        return { success: false, error: validation.error };
      }
      const originalSize = validation.size || 0;
      const filePayload = Buffer.isBuffer(file) ? file.toString('base64') : file;
      const payload = this.cleanPayload({
        file: filePayload,
        fileName: options.fileName || `file_${Date.now()}`,
        folder: options.folder || 'uploads',
        useUniqueFileName: options.useUniqueFileName ?? true,
        tags: options.tags,
        isPrivateFile: options.isPrivateFile ?? false,
        isPublished: options.isPublished ?? true,
        customCoordinates: options.customCoordinates,
        responseFields: options.responseFields,
        extensions: options.extensions,
        webhookUrl: options.webhookUrl,
        overwriteFile: options.overwriteFile ?? false,
        overwriteAITags: options.overwriteAITags,
        overwriteTags: options.overwriteTags,
        transformation: this.getOptimizedTransformations(options.transformation),
        customMetadata: options.customMetadata,
        checks: options.checks || `"file.size" < "${PRODUCTION_LIMITS.MAX_FILE_SIZE}"`,
      });

      console.log(`Uploading file: ${payload.fileName} (${(originalSize / 1024).toFixed(2)}KB) to ${payload.folder}`);

      // Upload to ImageKit
      // Cast to any to handle SDK response type issues
      // Using type assertion to handle SDK response
      interface ImageKitUploadResponse {
        url: string;
        fileId: string;
        name: string;
        filePath: string;
        thumbnailUrl?: string;
        height?: number;
        width?: number;
        size?: number;
        fileType?: string;
        versionInfo?: any;
      }
      
      const response = await this.client.upload(payload as any) as unknown as ImageKitUploadResponse;
      const uploadTime = Date.now() - startTime;
      
      const result: UploadResult = {
        success: true,
        data: {
          url: response.url,
          fileId: response.fileId,
          name: response.name,
          filePath: response.filePath,
          thumbnailUrl: response.thumbnailUrl,
          height: response.height,
          width: response.width,
          size: response.size,
          fileType: response.fileType,
          versionInfo: response.versionInfo,
        },
        metadata: {
          originalSize,
          compressedSize: response.size || 0,
          compressionRatio: response.size && originalSize > 0 ? Math.round((1 - response.size / originalSize) * 100) : 0,
          uploadTime,
        },
      };

      console.log(`Upload successful - ID: ${response.fileId}, Size: ${((response.size || 0) / 1024).toFixed(2)}KB, Time: ${uploadTime}ms`);
      return result;
    } catch (error) {
      const uploadTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      
      console.error(`Upload failed: ${errorMessage} (${uploadTime}ms)`);
      
      return { success: false, error: errorMessage };
    }
  }

  /** Upload from a remote URL */
  async uploadFromUrl(url: string, options: Omit<UploadOptions, 'file'> = {}): Promise<UploadResult> {
    const startTime = Date.now();
    try {
      if (!url || !this.isValidUrl(url)) {
        console.warn(`Invalid URL provided: ${url}`);
        return { success: false, error: 'Invalid URL provided' };
      }
      const payload = this.cleanPayload({
        file: url,
        fileName: options.fileName || `remote_${Date.now()}`,
        folder: options.folder || 'remote-uploads',
        useUniqueFileName: options.useUniqueFileName ?? true,
        tags: options.tags,
        isPrivateFile: options.isPrivateFile ?? false,
        isPublished: options.isPublished ?? true,
        customCoordinates: options.customCoordinates,
        responseFields: options.responseFields,
        extensions: options.extensions,
        webhookUrl: options.webhookUrl,
        overwriteFile: options.overwriteFile ?? false,
        overwriteAITags: options.overwriteAITags,
        overwriteTags: options.overwriteTags,
        transformation: this.getOptimizedTransformations(options.transformation),
        customMetadata: options.customMetadata,
        checks: options.checks || `"file.size" < "${PRODUCTION_LIMITS.MAX_FILE_SIZE}"`,
      });
      console.log(`ImageKit: uploading from URL ${url}`);
      
      interface ImageKitUploadResponse {
        url: string;
        fileId: string;
        name: string;
        filePath: string;
        thumbnailUrl?: string;
        height?: number;
        width?: number;
        size?: number;
        fileType?: string;
        versionInfo?: any;
      }
      
      const response = await this.client.upload(payload as any) as unknown as ImageKitUploadResponse;
      const uploadTime = Date.now() - startTime;
      return {
        success: true,
        data: {
          url: response.url,
          fileId: response.fileId,
          name: response.name,
          filePath: response.filePath,
          thumbnailUrl: response.thumbnailUrl,
          height: response.height,
          width: response.width,
          size: response.size,
          fileType: response.fileType,
          versionInfo: response.versionInfo,
        },
        metadata: {
          originalSize: 0,
          compressedSize: response.size || 0,
          compressionRatio: 0,
          uploadTime,
        },
      };
    } catch (error) {
      const uploadTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      
      console.error(`Upload from URL failed: ${errorMessage} (${uploadTime}ms)`);
      
      return { success: false, error: errorMessage };
    }
  }

  /** Get authentication parameters with simple caching */
  getAuthenticationParameters(): AuthParams {
    try {
      const now = Date.now();
      if (this.authCache && now < this.authCache.expires) {
        return { success: true, data: this.authCache.data };
      }
      const auth = this.client.getAuthenticationParameters();
      this.authCache = { data: auth, expires: now + 10 * 60 * 1000 };
      return { success: true, data: auth };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Auth generation failed';
      console.error(`Auth params failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if the ImageKit service is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.getAuthenticationParameters();
      return { healthy: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      console.error(`Health check failed: ${errorMessage}`);
      return { 
        healthy: false, 
        error: errorMessage
      };
    }
  }
}

// Singleton instance
let imageKitService: ImageKitService | null = null;

// Export a default instance
const imageKitConfig: ImageKitConfig = {
  publicKey: config.imagekit.publicKey,
  privateKey: config.imagekit.privateKey,
  urlEndpoint: config.imagekit.urlEndpoint
};

// Create the singleton instance
const imageKitInstance = new ImageKitService(imageKitConfig);

export const createImageKitService = (config: ImageKitConfig): ImageKitService => {
  if (!imageKitService) {
    imageKitService = new ImageKitService({
      publicKey: config.publicKey,
      privateKey: config.privateKey,
      urlEndpoint: config.urlEndpoint,
    });
  }
  return imageKitService;
};

export const getImageKitService = (): ImageKitService => {
  if (!imageKitService) {
    throw new Error('ImageKit service not initialized. Call createImageKitService first.');
  }
  return imageKitService;
};

// Export the singleton instance
export const imageKit = imageKitInstance;

// Export default instance with config
export default imageKitInstance;
