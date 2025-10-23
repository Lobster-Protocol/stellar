import { NatsService } from './natsService';

// Initialize NATS service
let natsService: NatsService | null = null;

export function getNatsService(): NatsService {
  if (!natsService) {
    natsService = new NatsService();
  }
  return natsService;
}

export async function initializeNats(serverUrl: string = 'nats://nats-server:4222'): Promise<void> {
  
  logger.info(`////////////////////////////////////////////////////////`);
  if (!natsService) {
    natsService = new NatsService();
  }
  await natsService.start(serverUrl);
  logger.info(`////////////////////////////////////////////////////////`);
}

export async function stopNats(): Promise<void> {
  if (natsService) {
    await natsService.stop();
    natsService = null;
  }
}
