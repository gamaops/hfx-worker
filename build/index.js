"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const generic_pool_1 = __importDefault(require("generic-pool"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const serialize_error_1 = __importDefault(require("serialize-error"));
const worker_threads_1 = require("worker_threads");
const CPU_COUNT = os_1.default.cpus().length;
exports.generateId = (worker) => {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${worker.threadId}`;
};
exports.getTaskTransferList = (task) => {
    const transferList = [];
    if (task.buffers) {
        for (const key in task.buffers) {
            const buffer = task.buffers[key];
            if (Buffer.isBuffer(buffer)) {
                task.buffers[key] = Uint8Array.from(buffer);
                transferList.push(task.buffers[key].buffer);
            }
            else if (buffer instanceof Uint8Array) {
                transferList.push(buffer.buffer);
            }
        }
    }
    return transferList;
};
exports.createWorkerPool = (script, options = {}) => {
    if (!path_1.default.isAbsolute(script)) {
        script = path_1.default.join(path_1.default.dirname(require.main.filename), script);
    }
    const workerPool = generic_pool_1.default.createPool({
        create: () => {
            const worker = new worker_threads_1.Worker(script);
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
            worker.waitMessage = (method, task) => new Promise((resolve, reject) => {
                let deadline = null;
                if (task.deadline) {
                    deadline = setTimeout(() => {
                        worker.removeAllListeners(task.id);
                        const error = new Error(`Deadline exceeded`);
                        Reflect.set(error, 'code', 'DEADLINE_EXCEEDED');
                        reject(error);
                    }, task.deadline);
                }
                worker.once(task.id, (error, result) => {
                    if (deadline) {
                        clearTimeout(deadline);
                    }
                    if (error) {
                        return reject(error);
                    }
                    resolve(result);
                });
                const transferList = exports.getTaskTransferList(task);
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
    }, {
        min: CPU_COUNT,
        max: CPU_COUNT,
        testOnBorrow: true,
        idleTimeoutMillis: 0,
        ...options,
    });
    workerPool.getMethod = (method) => async (task) => {
        const worker = await workerPool.acquire();
        if (!task.id) {
            task.id = exports.generateId(worker);
        }
        if (task.releaseBefore) {
            await workerPool.release(worker);
        }
        try {
            return await worker.waitMessage(method, task);
        }
        catch (error) {
            throw error;
        }
        finally {
            if (!task.releaseBefore) {
                await workerPool.release(worker);
            }
        }
    };
    workerPool.start();
    return workerPool;
};
exports.exposeWorker = (methods) => {
    if (!worker_threads_1.parentPort) {
        throw new Error(`Not a worker`);
    }
    worker_threads_1.parentPort.on('message', (task) => {
        if (typeof task !== 'object' || !task.isTask) {
            return;
        }
        else if (!(task.method in methods)) {
            worker_threads_1.parentPort.postMessage({
                id: task.id,
                error: serialize_error_1.default(new Error(`Undefined method: ${task.method}`)),
            });
            return;
        }
        methods[task.method](task).then((result) => {
            result = result || {};
            const transferList = exports.getTaskTransferList(result);
            worker_threads_1.parentPort.postMessage({
                id: task.id,
                data: result.data || {},
                buffers: result.buffers || {},
            }, transferList);
        }).catch((error) => {
            if (error instanceof Error) {
                error = serialize_error_1.default(error);
            }
            worker_threads_1.parentPort.postMessage({
                id: task.id,
                error,
            });
        });
    });
};
