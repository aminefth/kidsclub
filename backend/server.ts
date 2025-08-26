import * as dotenv from 'dotenv';
import { app } from './app';
import connectDB from './utils/db';
import Logging from './library/Logging';
import logger from './library/logger';

// Load environment variables
dotenv.config();

// create server
const isProduction = process.env.NODE_ENV === 'production';
const port = isProduction ? process.env.DOMAIN : process.env.PORT;

app.listen(port, () => {
  const protocol = isProduction ? 'https' : 'http';
  const url = isProduction ? `${protocol}://${port}` : `${protocol}://localhost:${port}`;

  console.log(`🚀 Server ready at ${url}`);
  connectDB();
  Logging.info(`Server is running on port ${port}`);
  logger.info(`Server is running on port ${port}`);
});