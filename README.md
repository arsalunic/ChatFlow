# ChatFlow (Monorepo)

Teaching-oriented implementation with inline comments for interview walkthroughs.

## Stack

- **Server**: Node.js, Express, TypeScript, Socket.IO, MongoDB (Mongoose)
- **Client**: React + Vite + TypeScript
- **Features**: JWT auth, conversations (DMs & groups), messages, presence, delivered status,
  search, simple AES-at-rest demo, rate limiting, seed data, tests.

## Quick Start

```bash
# in project root
npm install

# server
cd server
npm install
cp .env.example .env            # adjust MONGO_URI if needed
# (start Mongo locally or via Docker)
# docker run -d -p 27017:27017 --name mongo mongo:6

# seed demo data
cd .. && then run npm run seed

# client
cd client && then run npm install
cd ..

# run both apps
npm run dev
```

- API/server: http://localhost:3000
- Client: http://localhost:3001

## Demo Accounts

Users: alice, bob, charlie, diana, eric  
Password (all): `password123`

## Tests

```bash
npm run test   # runs server tests (mongodb-memory-server)
```
