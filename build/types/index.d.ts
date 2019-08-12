/// <reference types="node" />
import pool, { Pool } from 'generic-pool';
import { Worker } from 'worker_threads';
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
    data?: {
        [key: string]: any;
    };
    buffers?: {
        [key: string]: BufferLike;
    };
    deadline?: number;
    isTask?: boolean;
}
export declare type BufferLike = Buffer | Uint8Array;
export declare const generateId: (worker: Worker) => string;
export declare const getTaskTransferList: (task: ITask) => ArrayBuffer[];
export declare const createWorkerPool: (script: string, options?: pool.Options) => IActiveScriptPool;
export declare const exposeWorker: (methods: {
    [key: string]: (task: ITask) => Promise<void | ITask>;
}) => void;
