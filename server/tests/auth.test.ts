import request from 'supertest';
import http from 'http';
import app, { start } from '../src/index.js';
import { setupTestDB, teardownTestDB } from './helpers.js';

let server: http.Server;

beforeAll(async () => {
  await setupTestDB();
  server = await start();
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await teardownTestDB();
});

it('registers and logs in a user', async () => {
  const reg = await request(server).post('/auth/register').send({ username:'u', email:'u@e.com', name:'U', password:'p' });
  expect(reg.status).toBe(201);
  expect(reg.body.token).toBeTruthy();

  const login = await request(server).post('/auth/login').send({ username:'u', password:'p' });
  expect(login.status).toBe(200);
  expect(login.body.token).toBeTruthy();

  const me = await request(server).get('/users/me').set('Authorization', `Bearer ${login.body.token}`);
  expect(me.status).toBe(200);
  expect(me.body.username).toBe('u');
});
