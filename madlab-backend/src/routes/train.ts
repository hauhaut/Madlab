import express from 'express';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import yaml from 'js-yaml';
import { startTraining, stopTraining, getStatus } from '../services/processManager';
import { buildDataset } from '../services/datasetBuilder';
import { convertToGGUF, evaluateGGUF, judgeModel } from '../services/modelConverter';
import { CONFIG } from '../config';
import type { TrainingConfig, ModelArtifact } from '../types';

const router = express.Router();

// POST /train/start
router.post('/start', async (req, res) => {
    try {
        const { configPath } = req.body;

        // 1. Build dataset
        const count = await buildDataset();
        console.log(`Dataset built with ${count} samples`);

        // 2. Start training
        startTraining(configPath || 'config/train.yaml');

        res.json({ message: 'Training started', datasetSize: count });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Training start failed';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

// POST /train/stop
router.post('/stop', (_req, res) => {
    stopTraining();
    res.json({ message: 'Training stopped' });
});

// GET /train/status
router.get('/status', (_req, res) => {
    res.json(getStatus());
});

// POST /train/convert
router.post('/convert', async (req, res) => {
    try {
        const { modelName, quantization } = req.body;
        await convertToGGUF({ modelName: modelName || 'tuned', quantization: quantization || 'q8_0' });
        res.json({ message: 'Conversion started' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Conversion failed';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

// POST /train/evaluate
router.post('/evaluate', async (req, res) => {
    try {
        const { modelName, quantization, limit } = req.body;
        await evaluateGGUF(modelName || 'tuned', quantization || 'q8_0', limit ? parseFloat(limit) : 1.0);
        res.json({ message: 'Evaluation started' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Evaluation failed';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

// POST /train/judge
router.post('/judge', async (req, res) => {
    try {
        const { modelName, quantization, limit, sharpness } = req.body;
        // Run in background (don't await fully to return response)
        judgeModel(
            modelName || 'tuned',
            quantization || 'q8_0',
            limit ? parseFloat(limit) : 0.2,
            sharpness ? parseInt(sharpness) : 50
        ).catch(e => console.error('Judge Async Error:', e));

        res.json({ message: 'Magic Judge started' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Judge start failed';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

// GET /train/artifacts
router.get('/artifacts', async (_req, res) => {
    try {
        if (!fs.existsSync(CONFIG.MODELS_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(CONFIG.MODELS_DIR).filter(f => f.endsWith('.gguf') || f.endsWith('.json'));
        const artifacts: ModelArtifact[] = files.map(f => ({ name: f, url: `/models/${f}` }));
        res.json(artifacts);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to list artifacts';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

// GET /train/config
router.get('/config', async (_req, res) => {
    try {
        if (!fs.existsSync(CONFIG.CONFIG_PATH)) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Config not found' } });
        }
        const file = await fsPromises.readFile(CONFIG.CONFIG_PATH, 'utf8');
        const doc = yaml.load(file) as TrainingConfig;
        res.json(doc);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to read config';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

// Model History Logic
async function updateModelHistory(modelName: string): Promise<void> {
    try {
        let history: string[] = [];
        if (fs.existsSync(CONFIG.HISTORY_PATH)) {
            const data = await fsPromises.readFile(CONFIG.HISTORY_PATH, 'utf8');
            history = JSON.parse(data);
        }
        if (!history.includes(modelName)) {
            history.unshift(modelName);
            await fsPromises.writeFile(CONFIG.HISTORY_PATH, JSON.stringify(history.slice(0, 20)), 'utf8');
        }
    } catch (e) {
        console.error('Failed to update history', e);
    }
}

router.get('/history', async (_req, res) => {
    try {
        if (!fs.existsSync(CONFIG.HISTORY_PATH)) return res.json([]);
        const data = await fsPromises.readFile(CONFIG.HISTORY_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch {
        res.json([]);
    }
});

// POST /train/config
router.post('/config', async (req, res) => {
    try {
        const newConfig = req.body as TrainingConfig;
        const yamlStr = yaml.dump(newConfig);
        await fsPromises.writeFile(CONFIG.CONFIG_PATH, yamlStr, 'utf8');

        // Update history
        if (newConfig.model && newConfig.model.name) {
            await updateModelHistory(newConfig.model.name);
        }

        res.json({ message: 'Config updated' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to save config';
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
});

export default router;
