const { connect } = require('nats');

async function listen() {
  try {
    const nc = await connect({ servers: 'nats://localhost:4222' });
    console.log('Connected to NATS, listening for messages...');
    
    const sub = nc.subscribe('>');  // This listens to everything
    for await (const msg of sub) {
      console.log(`\n=== Received on ${msg.subject} ===`);
      try {
        const data = JSON.parse(msg.data.toString());
        console.log(JSON.stringify(data, null, 2));
      } catch (e) {
        console.log(msg.data.toString());
      }
      console.log('---');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

listen();