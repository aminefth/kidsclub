import winston from 'winston';
import chalk from 'chalk';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      const levelColor = (level: string) => {
        switch (level) {
          case 'info':
            return chalk.blueBright(level);
          case 'warn':
            return chalk.yellowBright(level);
          case 'error':
            return chalk.redBright(level);
          default:
            return level;
        }
      };

      return `${timestamp} [${levelColor(level)}]: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

export default logger;