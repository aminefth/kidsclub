import mongoose, { ConnectOptions } from 'mongoose';
import config from '../config';

// Get the database URL from the config
const dbUrl = config.dbUrl;

/**
 * Connect to the MongoDB database
 */
const connectToDB = async (): Promise<void> => {
  try {
    const connectionOptions: ConnectOptions = {
      autoIndex: true, // Enable auto-indexing
    };
    await mongoose.connect(dbUrl, connectionOptions);
    const isAtlas = mongoose.connection.host.includes('mongodb.net');
    const serverType = isAtlas ? 'MongoDB Atlas' : 'localhost';
    console.log(`✅ Connected to ${serverType} (${mongoose.connection.host})`);
  } catch (error: any) {
    console.log(error.message);
    // Retry connection after 5 seconds in case of error
    setTimeout(connectToDB, 5000);
  }
};

export default connectToDB;