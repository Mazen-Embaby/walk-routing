import { Pool, neonConfig } from '@neondatabase/serverless';
import { WebSocket } from 'ws';
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://fake' });
pool.query('SELECT 1').catch(e => console.error(e));
