import { connect, NatsConnection, JetStreamManager, JetStreamClient, Subscription, Empty } from 'nats';
import { AckPolicy } from "nats";

// Standardized event message format
export interface LobsterEvent {
  event_type: string;
  event_data: any;
  metadata?: {
    block?: number;
    timestamp?: string;
    dex?: string;
    chain?: string;
    [key: string]: any;
  };
  published_at: string;
}

// Simplified NATS service for streaming blockchain events
// - start(): connects to NATS server and sets up JetStream
// - publishEvent(eventType, eventData, metadata): publishes standardized events
// - subscribeToEvents(subject, callback): subscribes to events from subjects
// - stop(): closes NATS connection
export class NatsService {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private isConnected: boolean = false;

  // Connect to NATS server and initialize JetStream
  async start(serverUrl: string = 'nats://nats-server:4222'): Promise<void> {
    try {
      logger.info(`🚀 Connecting to NATS server at ${serverUrl}...`);
      
      // Add timeout to the entire start process
      const startPromise = this._doStart(serverUrl);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('NATS start timeout after 15 seconds')), 15000)
      );
      
      await Promise.race([startPromise, timeoutPromise]);
      
    } catch (error) {
      console.error('❌ Failed to connect to NATS server:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private async _doStart(serverUrl: string): Promise<void> {
    this.nc = await connect({ servers: serverUrl });
    this.isConnected = true;
    logger.info('✅ NATS connection established');

    // Initialize JetStream
    this.jsm = await this.nc.jetstreamManager();
    this.js = this.nc.jetstream();
    logger.info('✅ JetStream initialized');

    // Create streams for different event types
    logger.info('🔧 Setting up JetStream streams...');
    await this.setupStreams();
    logger.info('✅ Stream setup completed');

    this.nc.closed().then(() => {
      logger.info('🔌 NATS connection closed');
      this.isConnected = false;
    });

    logger.info('✅ NATS service connected and JetStream initialized');
    logger.info("////////////////////////////////////////////////////////////");
  }

  // Set up single JetStream stream for all events
  private async setupStreams(): Promise<void> {
    try {
      await this.jsm!.streams.add({
        name: 'LOBSTER_EVENTS',
        subjects: ['lobster.events.*'],
        description: 'All Lobster protocol events',
        retention: 'limits' as any,
        max_age: 24 * 60 * 60 * 1000 * 1000 * 1000, // 24 hours in nanoseconds
        max_msgs: 1000000,
        max_bytes: 1024 * 1024 * 1024, // 1GB
        storage: 'file' as any
      });
      logger.info('✅ Created stream: LOBSTER_EVENTS');
    } catch (error) {
      // Stream might already exist, which is fine
      if ((error as any).message && (error as any).message.includes('stream name already in use')) {
        logger.info('ℹ️  Stream already exists: LOBSTER_EVENTS');
      } else {
        console.error('❌ Error creating stream LOBSTER_EVENTS:', error);
      }
    }
  }

  // Universal event publisher with standardized format
  async publishEvent(eventType: string, eventData: any, metadata?: any): Promise<void> {
    if (!this.isConnected || !this.js) {
      console.error('❌ NATS service not connected');
      return;
    }

    try {
      // Create standardized event message
      const event: LobsterEvent = {
        event_type: eventType,
        event_data: eventData,
        metadata: {
          timestamp: new Date().toISOString(),
          chain: 'stellar',
          ...metadata
        },
        published_at: new Date().toISOString()
      };

      // Create subject based on event type
      const subject = `lobster.events.${eventType}`;
      const message = JSON.stringify(event);
      // Try publishing with just the string message
      await this.js.publish(subject, message);
      console.log(`📡 Published ${eventType} event to subject: ${subject}`);
      console.log(`/////////////////////////////////////////////////////////////`);
    } catch (error) {
      console.error(`❌ Error publishing ${eventType} event:`, error);
    }
  }

    // // Subscribe to events from a specific subject
    // async subscribeToEvents(subject: string, callback: (event: LobsterEvent) => void): Promise<void> {
    //   if (!this.isConnected || !this.js) {
    //     console.error('❌ NATS service not connected');
    //     return;
    //   }

    //   try {
    //     const subscription = this.js.subscribe(subject);
    //     this.subscriptions.set(subject, subscription as any);

    //     console.log(`🎯 Subscribed to subject: ${subject}`);

    //     // Process messages
    //     (async () => {
    //       for await (const msg of subscription) {
    //         try {
    //           const event: LobsterEvent = JSON.parse(Buffer.from(msg.data).toString('utf8'));
    //           callback(event);
    //           msg.ack(); // Acknowledge message processing
    //         } catch (error) {
    //           console.error(`❌ Error processing message from ${subject}:`, error);
    //           msg.nak(); // Negative acknowledgment
    //         }
    //       }
    //     })();
    //   } catch (error) {
    //     console.error(`❌ Error subscribing to subject ${subject}:`, error);
    //   }
    // }


    // Subscribe to events from a specific subject
async subscribeToEvents(subject: string, callback: (event: LobsterEvent) => void): Promise<void> {
  if (!this.isConnected || !this.jsm || !this.js) {
    console.error('❌ NATS service not connected');
    return;
  }

  try {
    // Create or reuse a durable consumer
    const durableName = `consumer_${subject.replace(/\./g, '_')}`;
    await this.jsm.consumers.add("LOBSTER_EVENTS", {
      durable_name: durableName,
      ack_policy: AckPolicy.Explicit,
      filter_subject: subject,
    });

    // Attach to the consumer and start consuming messages
    const consumer = await this.js.consumers.get("LOBSTER_EVENTS", durableName);
    const messages = await consumer.consume();

    this.subscriptions.set(subject, messages as any);
    console.log(`🎯 Subscribed to subject (via consumer): ${subject}`);

    (async () => {
      for await (const msg of messages) {
        try {
          const event: LobsterEvent = JSON.parse(Buffer.from(msg.data).toString('utf8'));
          callback(event);
          msg.ack();
        } catch (error) {
          console.error(`❌ Error processing message from ${subject}:`, error);
          msg.nak();
        }
      }
    })();
  } catch (error) {
    console.error(`❌ Error subscribing to subject ${subject}:`, error);
  }
}

async subscribeToMultipleSubjects(
  subjects: string[],
  callback: (subject: string, event: LobsterEvent) => void
): Promise<void> {
  if (!this.isConnected || !this.js || !this.jsm) {
    console.error("❌ NATS service not connected");
    return;
  }

  try {
    for (const subject of subjects) {
      const durableName = `consumer_${subject.replace(/\./g, "_")}`;

      // Create or reuse a durable consumer for each subject
      await this.jsm.consumers.add("LOBSTER_EVENTS", {
        durable_name: durableName,
        ack_policy: AckPolicy.Explicit,
        filter_subject: subject,
      });

      // Attach to the consumer and start consuming messages
      const consumer = await this.js.consumers.get("LOBSTER_EVENTS", durableName);
      const messages = await consumer.consume();

      this.subscriptions.set(subject, messages as any);
      console.log(`🎯 Subscribed to subject (via consumer): ${subject}`);

      (async () => {
        for await (const msg of messages) {
          try {
            const event: LobsterEvent = JSON.parse(Buffer.from(msg.data).toString('utf8'));
            callback(msg.subject, event);
            msg.ack();
          } catch (error) {
            console.error(`❌ Error processing message from ${msg.subject}:`, error);
            msg.nak();
          }
        }
      })();
    }
  } catch (error) {
    console.error("❌ Error subscribing to subjects:", error);
  }
}
  // Subscribe to multiple subjects with a single callback
  // async subscribeToMultipleSubjects(subjects: string[], callback: (subject: string, event: LobsterEvent) => void): Promise<void> {
  //   if (!this.isConnected || !this.js) {
  //     console.error('❌ NATS service not connected');
  //     return;
  //   }

  //   try {
  //     const subscription = await this.js.subscribe(subjects.join(','));
  //     this.subscriptions.set(subjects.join(','), subscription as any);

  //     console.log(`🎯 Subscribed to subjects: ${subjects.join(', ')}`);

  //     // Process messages
  //     (async () => {
  //       for await (const msg of subscription) {
  //         try {
  //           const event: LobsterEvent = JSON.parse(Buffer.from(msg.data).toString('utf8'));
  //           callback(msg.subject, event);
  //           msg.ack(); // Acknowledge message processing
  //         } catch (error) {
  //           console.error(`❌ Error processing message from ${msg.subject}:`, error);
  //           msg.nak(); // Negative acknowledgment
  //         }
  //       }
  //     })();
  //   } catch (error) {
  //     console.error(`❌ Error subscribing to subjects:`, error);
  //   }
  // }

  // Convenience methods for common event types
  async publishAquariusSwap(swapData: any, metadata?: any): Promise<void> {
    await this.publishEvent('aquarius_swap', swapData, { dex: 'aquarius', ...metadata });
  }

  async publishPhoenixSwap(swapData: any, metadata?: any): Promise<void> {
    await this.publishEvent('phoenix_swap', swapData, { dex: 'phoenix', ...metadata });
  }

  async publishPoolEvent(eventType: string, poolData: any, metadata?: any): Promise<void> {
    await this.publishEvent(`pool_${eventType}`, poolData, { pool_type: 'liquidity', ...metadata });
  }

  // Get connection status
  isServiceConnected(): boolean {
    return this.isConnected;
  }

  // Get active subscriptions count
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  // Stop the NATS service and close all connections
  async stop(): Promise<void> {
    try {
      // Close all subscriptions
      for (const [subject, subscription] of this.subscriptions) {
        subscription.unsubscribe();
        console.log(`🔌 Unsubscribed from: ${subject}`);
      }
      this.subscriptions.clear();

      // Close NATS connection
      if (this.nc) {
        await this.nc.close();
        this.nc = null;
      }

      this.isConnected = false;
      console.log('👋 NATS service stopped');
    } catch (error) {
      console.error('❌ Error stopping NATS service:', error);
    }
  }
}