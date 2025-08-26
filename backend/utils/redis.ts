
import { Redis as UpstashRedis } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Upstash Redis configuration is missing. Please check your environment variables.');
}

// Create a Redis client using Upstash REST API
export const redis = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Test connection on startup
(async () => {
    try {
        const pong = await redis.ping();
        console.log('✅ Successfully connected to Upstash Redis:', pong);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to connect to Upstash Redis:', errorMessage);
    }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down Redis client...');
    process.exit(0);
});
