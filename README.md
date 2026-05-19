# Node.js Fintech Boilerplate 🚀

A production-ready, highly secure, and scalable fintech backend boilerplate built with **Node.js**, **Express**, **TypeScript**, and **PostgreSQL**.

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
  - [Docker Setup (Recommended)](#docker-setup-recommended)
  - [Local Development](#local-development)
- [Architecture](#-architecture)
- [Environment Variables](#-environment-variables)
- [Database Management](#-database-management)
- [API Documentation](#-api-documentation)
- [Security](#-security)
- [License](#-license)

---

## ✨ Features

### 💰 Robust Financial Engine
- **Double-Entry Ledger**: Built-in support for immutable financial records.
- **Balance Tracking**: Automated balance calculations and reconciliation.
- **Transaction Management**: Comprehensive transaction lifecycle with idempotency support.
- **Multi-Currency Support**: Configurable currency systems with external price feed integrations (CoinMarketCap, Fixer).

### 🔐 Advanced Identity & Auth
- **Multi-Strategy Passport**: Support for Local, Custom, Google, and Apple OAuth.
- **MFA & OTP**: Email-based OTP generation and validation.
- **Session Management**: Persistent sessions backed by Redis.
- **RBAC & PBAC**: Fine-grained Role-Based and Permission-Based Access Control.

### 🏗 Infrastructure & Scalability
- **ORM**: High-performance, type-safe queries using **Drizzle ORM**.
- **Caching**: Distributed caching and session management with **Redis**.
- **Background Jobs**: Asynchronous task processing using **Bull CLI**.
- **Real-time**: Bidirectional communication via **Socket.io**.
- **Cloud Native**: Out-of-the-box support for AWS (S3, SES, KMS) and Firebase Admin.

### 🛡 Security & Compliance
- **Signed Audit Logs**: Tamper-evident logs with cryptographic signing (HMAC-SHA256).
- **Data Encryption**: Field-level encryption for PII, MFA, and Finance data.
- **Rate Limiting**: Multi-layer distributed rate limiting (Global, Login, Webhooks).
- **Security Headers**: Hardened with Helmet.js and custom CORS configurations.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript 5
- **Database**: PostgreSQL 16+
- **ORM**: Drizzle ORM
- **Cache/Queue**: Redis (ioredis, Bull)
- **Auth**: Passport.js, JWT
- **Communication**: SendGrid, Mailgun, AWS SES, Telegram Bot API
- **Validation**: Zod, Joi, Express Validator
- **Logging**: Winston

---

## 📋 Prerequisites

- **Required**:
    - [Node.js](https://nodejs.org/) (>= 20.11.1)
    - [pnpm](https://pnpm.io/) (>= 10.8.2)
    - [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- **Optional**:
    - [PostgreSQL](https://www.postgresql.org/) (for local dev)
    - [Redis](https://redis.io/) (for local dev)

---

## 🚀 Getting Started

### Docker Setup (Recommended)

The easiest way to get started is using the pre-configured Docker environment.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/CeoFred/nodejs-fintech-boilerplate.git
   cd nodejs-fintech-boilerplate
   ```

2. **Prepare Environment**:
   ```bash
   cp example.env .env
   ```

3. **Start Infrastructure**:
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

The application will be available at `http://localhost:5012`.

### Local Development

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Run Migrations**:
   ```bash
   pnpm run db:migrate
   ```

3. **Seed Initial Data** (Optional):
   ```bash
   pnpm run db:seed
   ```

4. **Start Dev Server**:
   ```bash
   pnpm run dev
   ```

---

## 📂 Architecture

```text
src/
├── config/         # App configuration & Environment variables
├── controllers/    # Request handlers
├── db/             # Drizzle schemas, migrations, and seeds
├── jobs/           # Cron jobs and background task logic
├── middlewares/    # Express middlewares (auth, rate-limit, localization)
├── queues/         # Bull queue definitions
├── repository/     # Data access layer (Database abstraction)
├── routes/         # API Route definitions
├── services/       # Core business logic (Auth, Email, Finance)
├── types/          # TypeScript definitions & declaration merging
├── utils/          # Shared helpers and utilities
└── validators/     # Input validation schemas (Zod/Joi)
```

---

## 🔧 Environment Variables

A template is provided in `example.env`. Key sections include:

- **Auth**: `JWT_SECRET`, `SESSION_SECRET`, `MASTER_ENC_KEY`
- **DB**: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- **Redis**: `REDIS_URL`
- **Cloud**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FIREBASE_SERVICE_ACCOUNT`
- **Integrations**: `SENDGRID_API_KEY`, `COINMARKETCAP_API_KEY`, `TELEGRAM_BOT_TOKEN`

---

## 🗄️ Database Management

Managed by **Drizzle Kit**.

- **Generate Migration**: `pnpm run db:generate`
- **Push Schema**: `pnpm run db:push`
- **Run Migrations**: `pnpm run db:migrate`
- **Studio**: `pnpm run db:studio` (GUI for DB)

---

## 🔨 Scripts

| Script | Description |
| :--- | :--- |
| `pnpm run dev` | Start development server with Nodemon |
| `pnpm run build` | Compile TypeScript to JavaScript |
| `pnpm run start` | Start production server from `dist/` |
| `pnpm run type-check` | Run static type checking |
| `pnpm run lint` | Run ESLint check |
| `pnpm run format` | Format code with Prettier |

---

## 🛡️ Security

- **Encryption**: All sensitive financial and PII data is encrypted at rest using `AES-256-GCM`.
- **Auditing**: Every critical system action generates a signed audit log to prevent tampering.
- **Protection**: Distributed rate limiting across all public endpoints prevents brute-force and DoS attacks.

---

## 🤝 Contributing

Contributions are welcome! Please check the existing issues or open a new one to discuss changes.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
