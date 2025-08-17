import request from 'supertest';
import http from 'http';
import app, { start } from '../src/index.js';
import { setupTestDB, teardownTestDB } from './helpers.js';

let server: http.Server, token = '', convId = '';

beforeAll(async () => {
  await setupTestDB();
  server = await start();
  await request(server).post('/auth/register').send({ username:'u1', email:'u1@e.com', name:'U1', password:'p' });
  await request(server).post('/auth/register').send({ username:'u2', email:'u2@e.com', name:'U2', password:'p' });
  const login = await request(server).post('/auth/login').send({ username:'u1', password:'p' });
  token = login.body.token;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await teardownTestDB();
});

it('creates a conversation and sends messages, then searches', async () => {
  const conv = await request(server).post('/conversations').set('Authorization', `Bearer ${token}`).send({ participantUsernames:['u2'] });
  expect(conv.status).toBe(201);
  convId = conv.body._id;

  const m1 = await request(server).post(`/conversations/${convId}/messages`).set('Authorization', `Bearer ${token}`).send({ text:'hello world' });
  expect(m1.status).toBe(201);

  const list = await request(server).get(`/conversations/${convId}/messages`).set('Authorization', `Bearer ${token}`);
  expect(list.status).toBe(200);
  expect(list.body.length).toBe(1);
  expect(list.body[0].text).toBe('hello world');

  const search = await request(server).get(`/conversations/search/all?q=world`).set('Authorization', `Bearer ${token}`);
  expect(search.status).toBe(200);
  expect(search.body[0].text).toContain('world');

  const delivered = await request(server).post(`/conversations/${convId}/delivered`).set('Authorization', `Bearer ${token}`);
  expect(delivered.status).toBe(200);
});
