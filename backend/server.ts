import * as dotenv from 'dotenv';
import { app } from './app';
import connectDB from './utils/db';
import Logging from './library/Logging';
import logger from './library/logger';
import { createServer } from 'http';
import RealtimeService from './services/realtime.service';

// Load environment variables
dotenv.config();

// create HTTP server for WebSocket integration
const server = createServer(app);

// Initialize real-time service
const realtimeService = new RealtimeService(server);

// create server
const isProduction = process.env.NODE_ENV === 'production';
const port = isProduction ? process.env.DOMAIN : process.env.PORT;

server.listen(port, () => {
  const protocol = isProduction ? 'https' : 'http';
  const url = isProduction ? `${protocol}://${port}` : `${protocol}://localhost:${port}`;

  console.log(`🚀 Server ready at ${url}`);
  console.log(`🔄 WebSocket server initialized`);
  connectDB();
  Logging.info(`Server is running on port ${port}`);
  logger.info(`Server is running on port ${port}`);
});

// Export realtime service for use in controllers
export { realtimeService };