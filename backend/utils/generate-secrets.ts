import { randomBytes } from 'crypto';

// Generate secure random strings for secrets
const generateSecret = (length = 64): string => {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

// Generate secrets for different environments
const generateSecrets = () => {
  const secrets = `# JWT Authentication
ACCESS_TOKEN=${generateSecret(64)}
REFRESH_TOKEN=${generateSecret(64)}
JWT_EXPIRES_IN_ACCESS=300
JWT_EXPIRES_IN_REFRESH=604800
JWT_EXPIRES_IN_ACCESS_MINUTES=5m
JWT_EXPIRES_IN_REFRESH_MINUTES=7d
ACTIVATION_SECRET=${generateSecret(64)}`;

  return secrets;
};

// Log the generated secrets
console.log('🔒 Generated secure secrets:');
console.log(generateSecrets());
console.log('\n⚠️  WARNING: Keep these secrets secure! Do not commit them to version control.');
