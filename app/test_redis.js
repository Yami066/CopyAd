import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

// Load the environment variables from your .env file

dotenv.config({ path: "../.env.local" }); // correct path

// Initialize the Redis client using the credentials from your .env
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function testConnection() {
    console.log("Testing Upstash Redis connection...");

    try {
        // 1. Try to set a test value
        console.log("Writing to Redis...");
        await redis.set('test-key', 'Hello from CopyAd!');
        console.log("Successfully wrote to Redis.");

        // 2. Try to read that value back
        console.log("Reading from Redis...");
        const value = await redis.get('test-key');
        console.log(`Value retrieved: ${value}`);

        if (value === 'Hello from CopyAd!') {
            console.log("✅ REDIS IS WORKING PERFECTLY.");
        }

    } catch (error) {
        console.error("❌ Failed to connect to Redis:", error);
    }
}

testConnection();