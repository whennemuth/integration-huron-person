import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Config } from './Config';

/**
 * Configuration loader for reading configuration from AWS Secrets Manager
 */
export class ConfigFromSecretsManager {
  private client: SecretsManagerClient;

  constructor(region?: string) {
    const { AWS_REGION, REGION } = process.env;
    this.client = new SecretsManagerClient({ 
      region: region || AWS_REGION || REGION || 'us-east-1' 
    });
  }

  /**
   * Load configuration from AWS Secrets Manager
   * @param secretArn - ARN of the secret containing the configuration
   * @returns Parsed configuration object
   * @throws Error if secret doesn't exist, can't be accessed, or contains invalid JSON
   */
  async loadConfig(secretArn: string): Promise<Config> {
    if (!secretArn) {
      throw new Error('Secret ARN is required');
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretArn
      });

      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error(`Secret ${secretArn} does not contain a string value`);
      }

      const parsedConfig = JSON.parse(response.SecretString) as Config;
      
      console.log(`Configuration loaded successfully from Secrets Manager: ${secretArn}`);
      return parsedConfig;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw with more context
        throw new Error(`Failed to load configuration from Secrets Manager (${secretArn}): ${error.message}`);
      }
      throw new Error(`Failed to load configuration from Secrets Manager (${secretArn}): Unknown error`);
    }
  }

  /**
   * Check if a secret exists in Secrets Manager
   * @param secretArn ARN of the secret
   * @returns True if secret exists and is accessible, false otherwise
   */
  async secretExists(secretArn: string): Promise<boolean> {
    try {
      await this.loadConfig(secretArn);
      return true;
    } catch (error) {
      return false;
    }
  }
}


async function main() {
  const secretArn = process.env.SECRET_ARN;
  if (!secretArn) {
    console.error('SECRET_ARN environment variable is not set. Please set it to the ARN of the secret to load.');
    process.exit(1);
  }

  const loader = new ConfigFromSecretsManager();
  console.log('Secret exists:', await loader.secretExists(secretArn));
  
  const config = await loader.loadConfig(secretArn);
  console.log('Loaded configuration:', JSON.stringify(config, null, 2));
}


if (require.main === module) {
  main();
}