# Lobster NATS System

This document explains how to use the NATS-based event streaming system that replaces the previous WebSocket implementation.

## Overview

The NATS system provides:
- **Reliable message delivery** with JetStream persistence
- **Scalable pub/sub messaging** for blockchain events
- **Subject-based routing** for different event types
- **Automatic reconnection** and error handling
- **Message acknowledgment** for guaranteed delivery

## Architecture

```
SubQuery GraphQL → NATS Service → NATS Server → NATS Clients
```

1. **SubQuery GraphQL**: Provides blockchain event subscriptions
2. **NATS Service**: Bridges GraphQL subscriptions to NATS messages
3. **NATS Server**: Handles message routing and persistence
4. **NATS Clients**: Consume events for applications

## Event Subjects

The system uses the following subject hierarchy:

- `lobster.events.*` - All Lobster protocol events
- `lobster.events.aquarius.swap` - Aquarius swap events
- `lobster.events.phoenix.swap` - Phoenix swap events
- `lobster.events.pool.*` - Pool-related events

## JetStream Streams

The following streams are automatically created:

- **LOBSTER_EVENTS**: All protocol events
- **AQUARIUS_SWAPS**: Aquarius swap events
- **PHOENIX_SWAPS**: Phoenix swap events
- **POOL_EVENTS**: Pool-related events

## Getting Started

### 1. Start the Services

```bash
# Start all services including NATS
docker-compose up -d

# Check service status
docker-compose ps
```

### 2. Monitor NATS Server

Access the NATS monitoring interface at: http://localhost:8222

### 3. Connect as a Client

```javascript
const { connect } = require('nats');

async function connectToNats() {
  const nc = await connect({ servers: 'nats://localhost:4222' });
  const js = nc.jetstream();
  
  // Subscribe to all events
  const subscription = js.subscribe('lobster.events.*');
  
  for await (const msg of subscription) {
    const data = JSON.parse(new TextDecoder().decode(msg.data));
    console.log('Received event:', data);
    msg.ack(); // Acknowledge message processing
  }
}
```

## Example Client

Use the provided example client:

```bash
# Install dependencies
npm install nats

# Run the example client
node nats-client-example.js
```

## Message Format

All messages follow this structure:

```json
{
  "type": "event_type",
  "data": {
    // Event-specific data
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "subject": "lobster.events.aquarius.swap"
}
```

## Configuration

### Environment Variables

- `NATS_URL`: NATS server URL (default: `nats://localhost:4222`)
- `SUBQUERY_GRAPHQL_URL`: SubQuery GraphQL WebSocket URL

### Docker Compose

The system includes:
- **nats-server**: NATS server with JetStream enabled
- **nats-service**: Bridge service connecting SubQuery to NATS

## Migration from WebSocket

The NATS system provides backward compatibility:

```javascript
// Old WebSocket code (deprecated)
import { getWebSocketService } from './services';
const ws = getWebSocketService();

// New NATS code (recommended)
import { getNatsService } from './services';
const nats = getNatsService();
```

## Benefits over WebSocket

1. **Reliability**: Messages are persisted and can be replayed
2. **Scalability**: Multiple clients can consume the same events
3. **Durability**: Messages survive service restarts
4. **Routing**: Subject-based message routing
5. **Acknowledgment**: Guaranteed message delivery
6. **Monitoring**: Built-in monitoring and metrics

## Troubleshooting

### Connection Issues

```bash
# Check NATS server status
curl http://localhost:8222/healthz

# Check service logs
docker-compose logs nats-server
docker-compose logs nats-service
```

### Message Delivery

- Messages are acknowledged after successful processing
- Failed messages are negatively acknowledged and can be retried
- Use the monitoring interface to check message flow

### Performance

- JetStream provides high-throughput message processing
- Messages are stored for 24 hours by default
- Maximum 1M messages per stream
- Maximum 1GB storage per stream

## Development

### Adding New Event Types

1. Add new subjects to the NATS service
2. Create corresponding JetStream streams
3. Update client subscriptions as needed

### Custom Clients

```javascript
const { connect } = require('nats');

class CustomLobsterClient {
  async connect() {
    this.nc = await connect({ servers: 'nats://localhost:4222' });
    this.js = this.nc.jetstream();
  }
  
  async subscribe(subject, callback) {
    const subscription = this.js.subscribe(subject);
    for await (const msg of subscription) {
      const data = JSON.parse(new TextDecoder().decode(msg.data));
      callback(data);
      msg.ack();
    }
  }
}
```

## Monitoring

Access the NATS monitoring dashboard at http://localhost:8222 to:
- View active connections
- Monitor message flow
- Check stream statistics
- Debug message delivery issues