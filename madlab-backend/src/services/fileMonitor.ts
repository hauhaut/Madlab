import chokidar from 'chokidar';
import path from 'path';
import { broadcast } from '../server';
import fs from 'fs/promises';
import { CONFIG } from '../config';

export function startFileMonitor(): void {
    console.log(`Starting file monitor on ${CONFIG.MODELS_DIR}`);

    // Ensure models dir exists
    fs.mkdir(CONFIG.MODELS_DIR, { recursive: true }).catch(console.error);

    const watcher = chokidar.watch(CONFIG.MODELS_DIR, {
        persistent: true,
        ignoreInitial: true
    });

    watcher.on('add', async (filePath) => {
        await emitSize(filePath);
    });

    watcher.on('change', async (filePath) => {
        await emitSize(filePath);
    });
}

async function emitSize(filePath: string): Promise<void> {
    try {
        const stats = await fs.stat(filePath);
        const name = path.basename(filePath);
        broadcast({
            type: 'file-size',
            payload: {
                file: name,
                size: stats.size,
                timestamp: Date.now()
            }
        });
    } catch (e) {
        // File might have been deleted, ignore
        console.warn('File stat failed:', e);
    }
}
