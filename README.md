# 🦞 Lobster Protocol

A comprehensive Automated Market Maker (AMM) aggregation and analytics platform for the Stellar/Soroban ecosystem. Lobster integrates with multiple DEX protocols (Phoenix, Soroswap, Aquarius) to provide unified liquidity management, analytics, and automated decision-making.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Components](#components)
  - [SmartContract](#smartcontract)
  - [Query](#query)
  - [DataProcess](#dataprocess)
  - [DecisionTaker](#decisiontaker)
  - [Pool Repository](#pool-repository)
- [Development](#development)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)

## 🎯 Overview

Lobster Protocol is a multi-protocol AMM aggregator that:

- **Aggregates Liquidity** across Phoenix, Soroswap, and Aquarius DEXs
- **Indexes On-Chain Events** using SubQuery for real-time data access
- **Computes Analytics** including prices, volumes, fees, TVL, PnL, APR, and risk metrics
- **Automates Decisions** for optimal pool selection and liquidity migration
- **Provides APIs** for accessing processed metrics and triggering analyses

## 🏗️ Architecture

```
┌─────────────────┐
│  Stellar/Soroban │
│  (Phoenix,       │
│   Soroswap,      │
│   Aquarius)      │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│  Query          │  ← SubQuery Indexer
│  (Event Indexing)│
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│  DataProcess    │  ← Analytics & Metrics
│  (Computations)  │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│  DecisionTaker  │  ← Pool Analysis & Migration
│  (Automation)   │
└─────────────────┘
```

## 📁 Repository Structure

```
Lobster/
├── SmartContract/          # Soroban smart contracts (Rust)
├── Query/                  # SubQuery indexer (TypeScript)
├── DataProcess/            # Analytics & metrics computation (TypeScript)
├── DecisionTaker/          # Pool analysis & migration automation (TypeScript)
├── core/                   # Core Soroswap contracts & utilities
├── phoenix-contracts/      # Phoenix AMM contracts reference
├── soroban-amm/            # AMM contracts reference implementation
├── Bindings/               # TypeScript bindings for contracts
├── BindingsFac/            # Factory contract bindings
├── BindingsTokens/         # Token contract bindings
└── Api/                    # API utilities
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ and npm/yarn
- **Rust** 1.87.0+ with `wasm32v1-none` target
- **Docker** and Docker Compose
- **Soroban CLI**: `cargo install soroban-cli --locked`
- **SubQuery CLI**: `npm install -g @subql/cli`

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Lobster
   ```

2. **Set up environment variables**
   ```bash
   # Copy example env files in each component directory
   cp Query/.env.example Query/.env
   cp DataProcess/.env.example DataProcess/.env
   cp DecisionTaker/.env.example DecisionTaker/.env
   ```

3. **Install dependencies**
   ```bash
   # Query indexer
   cd Query && npm install && cd ..
   
   # Data processing
   cd DataProcess && npm install && cd ..
   
   # Decision automation
   cd DecisionTaker && npm install && cd ..
   ```

4. **Generate pool repositories** (see [Pool Repository](#pool-repository) section)

## 🧩 Components

### SmartContract

Soroban smart contracts for the Lobster protocol, including factory, pool management, and token contracts.

**Location**: `SmartContract/`

**Key Features**:
- Factory contract for pool creation
- Pool management contracts
- Token contracts
- Pool repository generation scripts

**Quick Start**:
```bash
cd SmartContract
make build          # Build all contracts
make test           # Run tests
```

**Pool Repository Scripts**:
- `generate_pools_phoenix.sh` - Generate Phoenix pool list
- `generate_pools_soroswap.sh` - Generate Soroswap pool list  
- `generate_pools_aquarius.sh` - Generate Aquarius pool list

See [Pool Repository](#pool-repository) for details.

**Documentation**: See `SmartContract/README.md`

---

### Query

SubQuery-based indexer that indexes on-chain events from Phoenix, Soroswap, and Aquarius DEXs.

**Location**: `Query/`

**Key Features**:
- Real-time event indexing from multiple DEX protocols
- GraphQL API for querying indexed data
- Pool repository fallback for missing pool data
- WebSocket support for real-time updates

**Quick Start**:
```bash
cd Query
npm install
npm run dev        # Start with Docker (Postgres + indexer + GraphQL)
```

**Access**:
- GraphQL Playground: `http://localhost:3000`
- Health check: `http://localhost:3000/health`

**Configuration**:
- Network settings in `project.ts`
- Event handlers in `src/mappings/mappingHandlers.ts`
- Schema in `schema.graphql`

**Pool Repository Integration**:
The indexer uses pool repository files (`pool_repertory/*.ts`) as fallback when pool data is not found in the database. Set `NETWORK=testnet` or `NETWORK=mainnet` to use the correct pool lists.

**Documentation**: See `Query/README.md`

---

### DataProcess

Analytics service that computes AMM metrics from SubQuery data and stores results in S3-compatible storage.

**Location**: `DataProcess/`

**Key Features**:
- Fetches swap/pool data from SubQuery
- Computes analytical metrics (prices, volumes, fees, TVL, PnL, APR, Sharpe ratio)
- Stores results as compressed JSON in S3
- REST API for accessing metrics

**Quick Start**:
```bash
cd DataProcess
npm install
npm run api        # Start Express API on :8085
```

**Or with Docker**:
```bash
docker compose up -d
# API → http://localhost:8085
# MinIO Console → http://localhost:9001
```

**API Endpoints**:
- `GET /health` - Health check
- `POST /process` - Trigger processing for a token pair
- `GET /data` - Get full metrics snapshot
- `GET /data/last` - Get latest metric values only

**Example**:
```bash
# Process a pair
curl -X POST http://localhost:8085/process \
  -H 'content-type: application/json' \
  -d '{"token0":"CCWHNL...","token1":"CDF3IU...","protocol":"soroswap"}'

# Get results
curl 'http://localhost:8085/data?token0=...&token1=...&protocol=soroswap'
```

**Documentation**: See `DataProcess/README.md`

---

### DecisionTaker

Automated pool analysis and migration service that compares APRs across pools and can trigger multisig migrations.

**Location**: `DecisionTaker/`

**Key Features**:
- Pool analysis comparing APRs across protocols
- Automated liquidity migration decisions
- Multisig support (single, local, external)
- REST API for triggering analyses

**Quick Start**:
```bash
cd DecisionTaker
cp .env.example .env  # Configure your environment
npm install
npm run dev           # Start API on :3334
```

**API Endpoints**:
- `GET /` - Status
- `GET /health` - Health check
- `GET /api/run/all` - Analyze all pools
- `GET /api/run/user/:address` - Analyze user's pools
- `GET /api/run/pool/:poolId` - Analyze specific pool

**Multisig Modes**:
- `single` - Single signer
- `multisig-local` - Local multisig with multiple secrets
- `multisig-external` - External signer APIs

**Docker**:
```bash
# Build
docker build -t decisiontaker-server --target server .
docker build -t decisiontaker-signer --target signer .

# Run
docker run --rm -p 3334:3000 --env-file .env decisiontaker-server
```

**Documentation**: See `DecisionTaker/README.md`

---

### Pool Repository

Generated TypeScript files containing pool addresses and token pairs for Phoenix, Soroswap, and Aquarius protocols.

**Location**: `Query/src/pool_repertory/` and `SmartContract/`

**Files**:
- `phoenix_pools.ts` / `phoenix_pools_testnet.ts`
- `soroswap_pools.ts` / `soroswap_pools_testnet.ts`
- `aquarius_pools.ts` / `aquarius_pools_testnet.ts`

**Generation Scripts** (in `SmartContract/`):

1. **Phoenix Pools**:
   ```bash
   cd SmartContract
   ./generate_pools_phoenix.sh
   ```
   - Configurable via `PHOENIX_FACTORY_ID`, `NETWORK`, `SOURCE_ACCOUNT`
   - Outputs: `phoenix_pools.ts` or `phoenix_pools_testnet.ts`

2. **Soroswap Pools**:
   ```bash
   ./generate_pools_soroswap.sh
   ```
   - Queries factory for pool count
   - Fetches each pool address
   - Gets `token_0` and `token_1` for each pool
   - Outputs: `soroswap_pools.ts` or `soroswap_pools_testnet.ts`

3. **Aquarius Pools**:
   ```bash
   ./generate_pools_aquarius.sh
   ```
   - Queries token sets count
   - Fetches pools in batches
   - Outputs: `aquarius_pools.ts` or `aquarius_pools_testnet.ts`

**Usage in Code**:
```typescript
import { phoenixPools } from '../pool_repertory/phoenix_pools';
import { soroswapPools } from '../pool_repertory/soroswap_pools';
import { aquariusPools } from '../pool_repertory/aquarius_pools';

// Find pool by address
const pool = phoenixPools.find(p => p.pool_address === address);
if (pool) {
  console.log(`Token A: ${pool.token_a}, Token B: ${pool.token_b}`);
}
```

**Network Selection**:
Set `NETWORK=testnet` or `NETWORK=mainnet` environment variable before running scripts or in your application.

---

## 💻 Development

### Workflow

1. **Generate Pool Repositories**
   ```bash
   cd SmartContract
   NETWORK=testnet ./generate_pools_phoenix.sh
   NETWORK=testnet ./generate_pools_soroswap.sh
   NETWORK=testnet ./generate_pools_aquarius.sh
   ```

2. **Start Query Indexer**
   ```bash
   cd Query
   NETWORK=testnet npm run dev
   ```

3. **Start Data Processing**
   ```bash
   cd DataProcess
   npm run api
   ```

4. **Start Decision Service**
   ```bash
   cd DecisionTaker
   npm run dev
   ```

### Testing

```bash
# Smart contracts
cd SmartContract
make test

# Query indexer
cd Query
npm test

# Data processing
cd DataProcess
npm test
```

### Building

```bash
# Smart contracts
cd SmartContract
make build

# TypeScript projects
cd Query && npm run build
cd DataProcess && npm run build
cd DecisionTaker && npm run build
```

---

## 🚢 Deployment

### Smart Contracts

1. Configure network and identity:
   ```bash
   soroban config network add testnet \
     --rpc-url https://soroban-testnet.stellar.org \
     --network-passphrase "Test SDF Network ; September 2015"
   soroban config identity generate lobster-dev
   ```

2. Deploy contracts:
   ```bash
   cd SmartContract
   make deploy  # Or use specific deployment scripts
   ```

### Query Indexer

Deploy to SubQuery hosted service or self-host:
```bash
cd Query
npm run build
# Follow SubQuery deployment docs
```

### DataProcess & DecisionTaker

Deploy as Docker containers or Node.js services:
```bash
# Build images
docker build -t lobster-dataprocess -f DataProcess/Dockerfile .
docker build -t lobster-decisiontaker -f DecisionTaker/Dockerfile .

# Run with environment variables
docker run --env-file .env lobster-dataprocess
docker run --env-file .env lobster-decisiontaker
```

---

## 📚 API Documentation

### Query (GraphQL)

Access at `http://localhost:3000` (GraphQL Playground)

**Example Query**:
```graphql
query {
  swapAquariusEntities(first: 5) {
    nodes {
      id
      contract
      amount0
      amount1
      sender
      block
      timestamp
    }
  }
}
```

### DataProcess (REST)

Base URL: `http://localhost:8085`

- `GET /health` - Health check
- `POST /process` - Process token pair
- `GET /data?token0=...&token1=...&protocol=...` - Get metrics
- `GET /data/last?token0=...&token1=...&protocol=...` - Get latest values

### DecisionTaker (REST)

Base URL: `http://localhost:3334`

- `GET /health` - Health check
- `GET /api/run/all` - Analyze all pools
- `GET /api/run/user/:address` - Analyze user pools
- `GET /api/run/pool/:poolId` - Analyze specific pool

---

## 🔧 Configuration

### Environment Variables

**Query**:
- `NETWORK` - `testnet` or `mainnet`
- `CHAIN_ID` - Network passphrase
- `HORIZON_ENDPOINT` - Horizon RPC URL
- `SOROBAN_ENDPOINT` - Soroban RPC URL

**DataProcess**:
- `PORT` - API port (default: 8085)
- `SUBQUERY_URL` - SubQuery GraphQL endpoint
- `S3_ENDPOINT` - S3 endpoint
- `S3_ACCESS_KEY` - S3 access key
- `S3_SECRET_KEY` - S3 secret key
- `S3_BUCKET` - S3 bucket name

**DecisionTaker**:
- `HOST` - Bind address (default: 0.0.0.0)
- `PORT` - API port (default: 3334)
- `NETWORK` - `testnet` or `mainnet`
- `RPC_URL` - Soroban RPC endpoint
- `NETWORK_PASSPHRASE` - Network passphrase
- `SECRET` - Stellar secret key
- `FACTORY_ID` - Factory contract ID
- `MULTISIG_MODE` - `single`, `multisig-local`, or `multisig-external`

**SmartContract**:
- `SOURCE_ACCOUNT` - Stellar account name (default: alice2)
- `NETWORK` - `testnet` or `mainnet`
- `PHOENIX_FACTORY_ID` - Phoenix factory address
- `SOROSWAP_FACTORY_ID` - Soroswap factory address
- `AQUARIUS_ROUTER_ID` - Aquarius router address

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

### Code Style

- **Rust**: Follow `cargo fmt` and `cargo clippy` standards
- **TypeScript**: Use ESLint and Prettier configurations
- **Commits**: Use conventional commit messages

---

## 📄 License

See individual component directories for license information.

---

## 🔗 Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [SubQuery Documentation](https://academy.subquery.network)
- [Phoenix AMM](https://phoenix.finance/)
- [Soroswap](https://soroswap.finance/)
- [Aquarius](https://aquarius.finance/)

---

## 📞 Support

For issues, questions, or contributions, please open an issue on the repository.

---


