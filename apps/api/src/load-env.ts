import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

loadDotenv({ path: resolve(__dirname, '../../../.env') });
loadDotenv({ path: resolve(__dirname, '../.env') });
