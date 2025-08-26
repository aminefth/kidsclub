declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: 'development' | 'production' | 'test';
        PORT?: string;
        DB_URL?: string;
        DB_URL_ATLAS?: string;
        IMAGEKIT_PUBLIC_KEY: string;
        IMAGEKIT_PRIVATE_KEY: string;
        IMAGEKIT_URL_ENDPOINT: string;
        // Add other environment variables as needed
    }
}

interface ImageKitConfig {
    publicKey: string;
    privateKey: string;
    urlEndpoint: string;
}

interface Config {
    port: number;
    env: string;
    stage: string;
    imagekit: ImageKitConfig;
    // Add other config properties as needed
}
