import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import analyzeProject from './analyzer.js';
import optimizeProject from './optimizer.js';
import benchmarkProject from './benchmark.js';
import generateBadge from './badge.js';

function setCorsHeaders(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
	res.statusCode = statusCode;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	setCorsHeaders(res);
	res.end(JSON.stringify(payload));
}

function sendSseData(res, data) {
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function startServer(dirPath) {
	const targetRoot = path.resolve(dirPath);
	const here = path.dirname(fileURLToPath(import.meta.url));
	const webIndexPath = path.resolve(here, '../web/index.html');

	const server = http.createServer(async (req, res) => {
		const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost:3000'}`);

		if (req.method === 'OPTIONS') {
			res.statusCode = 204;
			setCorsHeaders(res);
			res.end();
			return;
		}

		try {
			if (req.method === 'GET' && requestUrl.pathname === '/') {
				const html = await readFile(webIndexPath, 'utf8');
				res.statusCode = 200;
				res.setHeader('Content-Type', 'text/html; charset=utf-8');
				setCorsHeaders(res);
				res.end(html);
				return;
			}

			if (req.method === 'GET' && requestUrl.pathname === '/api/analyze') {
				const result = await analyzeProject(targetRoot);
				sendJson(res, 200, result);
				return;
			}

			if (req.method === 'GET' && requestUrl.pathname === '/api/memory') {
				sendJson(res, 200, process.memoryUsage());
				return;
			}

			if (req.method === 'GET' && requestUrl.pathname === '/api/badge') {
				const result = await generateBadge(targetRoot);
				sendJson(res, 200, { score: result.score, grade: result.grade, badgePath: result.badgePath });
				return;
			}

			if (req.method === 'POST' && requestUrl.pathname === '/api/optimize') {
				res.statusCode = 200;
				res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
				res.setHeader('Cache-Control', 'no-cache, no-transform');
				res.setHeader('Connection', 'keep-alive');
				setCorsHeaders(res);

				sendSseData(res, { progress: 0, message: 'Starting optimization...' });

				let progress = 0;
				const ticker = setInterval(() => {
					progress = Math.min(progress + 10, 90);
					sendSseData(res, { progress, message: 'Optimizing project...' });
				}, 350);

				try {
					const result = await optimizeProject(targetRoot);
					clearInterval(ticker);
					sendSseData(res, { progress: 100, message: 'Optimization complete' });
					sendSseData(res, { done: true, result });
					res.end();
				} catch (error) {
					clearInterval(ticker);
					sendSseData(res, { done: true, error: error.message });
					res.end();
				}
				return;
			}

			if (req.method === 'GET' && requestUrl.pathname === '/api/benchmark') {
				const result = await benchmarkProject(targetRoot);
				sendJson(res, 200, result);
				return;
			}

			sendJson(res, 404, { error: 'Not found' });
		} catch (error) {
			sendJson(res, 500, { error: error.message });
		}
	});

	await new Promise((resolve) => {
		server.listen(3000, resolve);
	});

	console.log(chalk.green('OptiDash running at http://localhost:3000'));
	return server;
}
