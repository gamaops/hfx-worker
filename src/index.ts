import pool, { Pool } from 'generic-pool';
import os from 'os';
import path from 'path';
import serializeError from 'serialize-error';
import { parentPort, Worker } from 'worker_threads';

const CPU_COUNT = os.cpus().length;

export interface IScriptWorker extends Worker {
	exitCode?: number | null;
	error?: Error | null;
	waitMessage?(method: string, task: ITask): Promise<any>;
}

export interface IScriptPool extends Pool<IScriptWorker> {
	getMethod?(method: string): (task: ITask) => Promise<any>;
}

export interface IActiveScriptPool extends Pool<IScriptWorker> {
	getMethod(method: string): (task: ITask) => Promise<any>;
}

export interface ITask {
	id?: string;
	releaseBefore?: boolean;
	data?: { [key: string]: any };
	buffers?: { [key: string]: BufferLike };
	deadline?: number;
	isTask?: boolean;
}

export type BufferLike = Buffer | Uint8Array;

export const generateId = (worker: Worker): string => {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}-${worker.threadId}`;
};

export const getTaskTransferList = (task: ITask): Array<ArrayBuffer> => {
	const transferList: Array<ArrayBuffer> = [];
	if (task.buffers) {
		for (const key in task.buffers) {
			const buffer = task.buffers[key];
			if (Buffer.isBuffer(buffer)) {
				task.buffers[key] = Uint8Array.from(buffer);
				transferList.push(task.buffers[key].buffer);
			} else if (buffer instanceof Uint8Array) {
				transferList.push(buffer.buffer);
			}
		}
	}
	return transferList;
};

export const createWorkerPool = (script: string, options: pool.Options = {}): IActiveScriptPool => {

	if (!path.isAbsolute(script)) {
		script = path.join(
			path.dirname(require.main!.filename),
			script,
		);
	}

	const workerPool: IScriptPool = pool.createPool<IScriptWorker>(
		{
			create: (): Promise<IScriptWorker> => {
				const worker: IScriptWorker = new Worker(script);
				worker.exitCode = null;
				worker.error = null;
				worker.setMaxListeners(Infinity);
				worker.once('exit', (exitCode) => {
					worker.exitCode = exitCode;
				});
				worker.once('error', (error) => {
					worker.error = error;
				});
				worker.on('message', (message) => {
					if (message.id) {
						worker.emit(message.id, message.error, message);
					}
				});
				worker.waitMessage = (method: any, task: ITask): Promise<ITask> => new Promise((resolve, reject) => {

					let deadline: any = null;

					if (task.deadline) {
						deadline = setTimeout(() => {
							worker.removeAllListeners(task.id);
							const error = new Error(`Deadline exceeded`);
							Reflect.set(error, 'code', 'DEADLINE_EXCEEDED');
							reject(error);
						}, task.deadline);
					}

					worker.once(task.id as string, (error: Error | null, result: ITask) => {
						if (deadline) {
							clearTimeout(deadline);
						}
						if (error) {
							return reject(error);
						}
						resolve(result);
					});

					const transferList = getTaskTransferList(task);

					worker.postMessage({
						id: task.id,
						method,
						data: task.data || {},
						buffers: task.buffers || {},
						isTask: true,
					}, transferList);

				});
				return Promise.resolve(worker);
			},
			destroy: (worker) => {
				worker.removeAllListeners();
				worker.postMessage({
					id: null,
					method: 'finish',
				});
				return worker.terminate().then(exitCode => {
					worker.exitCode = exitCode;
				});
			},
			validate: (worker) => Promise.resolve(worker.exitCode === null),
		},
		{
			min: CPU_COUNT,
			max: CPU_COUNT,
			testOnBorrow: true,
			idleTimeoutMillis: 0,
			...options,
		},
	);

	workerPool.getMethod = (method: string) => async (task: ITask): Promise<ITask> => {
		const worker = await workerPool.acquire();
		if (!task.id) {
			task.id = generateId(worker);
		}
		if (task.releaseBefore) {
			await workerPool.release(worker);
		}
		try {
			return await worker.waitMessage!(method, task);
		} catch (error) {
			throw error;
		} finally {
			if (!task.releaseBefore) {
				await workerPool.release(worker);
			}
		}
	};

	workerPool.start();

	return workerPool as IActiveScriptPool;

};

export const exposeWorker = (methods: {
	[key: string]: (task: ITask) => Promise<ITask | void>,
}) => {
	if (!parentPort) {
		throw new Error(`Not a worker`);
	}

	parentPort.on('message', (task) => {

		if (typeof task !== 'object' || !task.isTask) {
			return;
		} else if (!(task.method in methods)) {
			parentPort!.postMessage({
				id: task.id,
				error: serializeError(new Error(`Undefined method: ${task.method}`)),
			});
			return;
		}

		methods[task.method](task).then((result: ITask | void) => {

			result = result || {};

			const transferList = getTaskTransferList(result);

			parentPort!.postMessage({
				id: task.id,
				data: result.data || {},
				buffers: result.buffers || {},
			}, transferList);

		}).catch((error: any) => {

			if (error instanceof Error) {
				error = serializeError(error);
			}

			parentPort!.postMessage({
				id: task.id,
				error,
			});

		});

	});

};
