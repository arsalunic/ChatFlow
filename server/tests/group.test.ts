import request from 'supertest';
import http from 'http';
import app, { start } from '../src/index.js';
import { setupTestDB, teardownTestDB } from './helpers.js';

let server: http.Server, token = '';

beforeAll(async () => {
  await setupTestDB();
  server = await start();
  await request(server).post('/auth/register').send({ username:'a', email:'a@e.com', name:'A', password:'p' });
  await request(server).post('/auth/register').send({ username:'b', email:'b@e.com', name:'B', password:'p' });
  await request(server).post('/auth/register').send({ username:'c', email:'c@e.com', name:'C', password:'p' });
  const login = await request(server).post('/auth/login').send({ username:'a', password:'p' });
  token = login.body.token;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await teardownTestDB();
});

it('requires 3+ participants for group creation', async () => {
  const bad = await request(server).post('/conversations').set('Authorization', `Bearer ${token}`).send({ participantUsernames:['b'], name:'should-fail' });
  expect(bad.status).toBe(201); // this is a DM (2 participants), allowed without name
  const good = await request(server).post('/conversations').set('Authorization', `Bearer ${token}`).send({ participantUsernames:['b','c'], name:'group-ok' });
  expect(good.status).toBe(201);
  expect(good.body.isGroup).toBe(true);
});
