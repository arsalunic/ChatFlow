import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.ts';
import Conversation from '../models/Conversation.ts';
import Message from '../models/Message.ts';
import { encrypt } from '../utils/crypto.ts';

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/chatflow';

/**
 * Seeds five users (same password), a DM and a group conversation with messages.
 */
const users = [
  { username:'alice', email:'alice@example.com', name:'Alice', avatar:'https://i.pravatar.cc/150?img=1' },
  { username:'bob', email:'bob@example.com', name:'Bob', avatar:'https://i.pravatar.cc/150?img=2' },
  { username:'charlie', email:'charlie@example.com', name:'Charlie', avatar:'https://i.pravatar.cc/150?img=3' },
  { username:'diana', email:'diana@example.com', name:'Diana', avatar:'https://i.pravatar.cc/150?img=4' },
  { username:'eric', email:'eric@example.com', name:'Eric', avatar:'https://i.pravatar.cc/150?img=5' },
];

async function run() {
  await mongoose.connect(MONGO);
  await Promise.all([User.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({})]);

  const passwordHash = await bcrypt.hash('password123', 10);
  const docs = await User.insertMany(users.map(u => ({ ...u, passwordHash })));

  const id = (name: string) => docs.find(d => d.username === name)!._id;

  // DM Alice <-> Bob
  const dm1 = await Conversation.create({ participants: [id('alice'), id('bob')], isGroup: false });
  await Message.create([
    { conversationId: dm1._id, senderId: id('alice'), textEncrypted: encrypt('Hey Bob!'), status:'delivered' },
    { conversationId: dm1._id, senderId: id('bob'), textEncrypted: encrypt('Hi Alice, how are you?'), status:'delivered' },
    { conversationId: dm1._id, senderId: id('alice'), textEncrypted: encrypt('Doing great 😄'), status:'sent' },
  ]);

  // Group Alice + Charlie + Diana
  const grp = await Conversation.create({ participants: [id('alice'), id('charlie'), id('diana')], isGroup: true, name:'Project Crew' });
  await Message.create([
    { conversationId: grp._id, senderId: id('charlie'), textEncrypted: encrypt('Hello team!'), status:'delivered' },
    { conversationId: grp._id, senderId: id('diana'), textEncrypted: encrypt('Kickoff at 3pm'), status:'sent' },
  ]);

  console.log('Seeded users/conversations/messages. Password for all users: password123');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
