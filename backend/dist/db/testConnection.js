import { Pool } from 'pg';
import { env } from '../config/env.js';
const main = async () => {
    if (!env.databaseUrl) {
        console.error('DATABASE_URL is not set.');
        process.exitCode = 1;
        return;
    }
    const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });
    try {
        const client = await pool.connect();
        const { rows } = await client.query('SELECT NOW() AS current_time');
        console.log('Connected to PostgreSQL. Current time:', rows[0]?.current_time);
        client.release();
    }
    catch (error) {
        console.error('Failed to connect to PostgreSQL:', error);
        process.exitCode = 1;
    }
    finally {
        await pool.end();
    }
};
main().catch((error) => {
    console.error('Unexpected error testing PostgreSQL connection:', error);
    process.exitCode = 1;
});
//# sourceMappingURL=testConnection.js.map