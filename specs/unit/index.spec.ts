import { expect } from 'chai';
import sinon from 'sinon';

declare const requireUncached: any;
declare const mockUncached: any;

describe(
	'index',
	() => {

		let index: any;
		let serializeError: any;
		let path: any;
		let os: any;
		let pool: any;
		let poolInstance: any;
		let parentPort: any;
		let Worker: any;
		let workerInstance: any;
		let clock: any;

		beforeEach(
			() => {

				serializeError = sinon.stub();

				clock = sinon.useFakeTimers();

				path = {
					isAbsolute: sinon.stub(),
					join: sinon.stub(),
					dirname: sinon.stub(),
				};

				os = {
					cpus: sinon.stub().returns([0, 0]),
				};

				workerInstance = {
					terminate: sinon.stub(),
					postMessage: sinon.stub(),
					once: sinon.stub(),
					on: sinon.stub(),
					emit: sinon.stub(),
					setMaxListeners: sinon.stub(),
					removeAllListeners: sinon.stub(),
				};

				poolInstance = {
					acquire: sinon.stub().resolves(workerInstance),
					release: sinon.stub(),
					start: sinon.stub(),
				};

				pool = {
					createPool: sinon.stub().returns(poolInstance),
				};

				Worker = sinon.stub().returns(workerInstance);

				parentPort = {};
				parentPort.on = sinon.stub();
				parentPort.postMessage = sinon.stub();

				mockUncached('generic-pool', pool);
				mockUncached('os', os);
				mockUncached('path', path);
				mockUncached('serialize-error', serializeError);
				mockUncached('worker_threads', {
					parentPort,
					Worker,
				});

				index = requireUncached('@src/index.ts');

			},
		);

		afterEach(() => {
			clock.restore();
		});

		it(
			'Should export object',
			() => {
				expect(index).to.be.an('object');
				expect(index.generateId).to.be.a('function');
				expect(index.getTaskTransferList).to.be.a('function');
				expect(index.createWorkerPool).to.be.a('function');
				expect(index.exposeWorker).to.be.a('function');
			},
		);

		describe(
			'generateId',
			() => {

				it(
					'Should generate unique task id',
					() => {

						const id1 = index.generateId({
							threadId: 0,
						});
						const id2 = index.generateId({
							threadId: 1,
						});

						expect(id1).to.be.a('string');
						expect(id2).to.be.a('string');
						expect(id1).to.not.be.equal(id2);

					},
				);

			},
		);

		describe(
			'getTaskTransferList',
			() => {

				it(
					'Should extract task transfer list',
					() => {

						const task = {
							buffers: {
								k1: Buffer.from('hello'),
								k2: Uint8Array.from([1, 2, 3]),
								k3: 'hello',
							},
						};

						const transferList = index.getTaskTransferList(task);

						expect(transferList).to.be.an('array');
						expect(transferList.length).to.be.equal(2);
						expect(transferList[0]).to.be.instanceOf(ArrayBuffer);
						expect(Buffer.from(transferList[0]).toString('utf8')).to.be.equal('hello');
						expect(transferList[1]).to.be.instanceOf(ArrayBuffer);
						const bufferArray = Array.from(Buffer.from(transferList[1]).values());
						expect(bufferArray.length).to.be.equal(3);
						expect(bufferArray[0]).to.be.equal(1);
						expect(bufferArray[1]).to.be.equal(2);
						expect(bufferArray[2]).to.be.equal(3);

					},
				);

			},
		);

		describe(
			'createWorkerPool',
			() => {

				it(
					'Should create a worker pool',
					async () => {

						const script = Symbol();
						const dirname = Symbol();
						path.isAbsolute.returns(false);
						path.join.returns(script);
						path.dirname.returns(dirname);

						let callArgs: any;

						expect(index.createWorkerPool('myscript')).to.be.equal(poolInstance);

						sinon.assert.calledOnce(path.isAbsolute);
						callArgs = path.isAbsolute.getCall(0).args;
						expect(callArgs[0]).to.be.equal('myscript');

						sinon.assert.calledOnce(path.dirname);
						callArgs = path.dirname.getCall(0).args;
						expect(callArgs[0]).to.be.a('string');

						sinon.assert.calledOnce(path.join);
						callArgs = path.join.getCall(0).args;
						expect(callArgs[0]).to.be.equal(dirname);
						expect(callArgs[1]).to.be.equal('myscript');

						sinon.assert.calledOnce(poolInstance.start);

						sinon.assert.calledOnce(pool.createPool);
						callArgs = pool.createPool.getCall(0).args;
						expect(callArgs[0]).to.be.an('object');
						expect(callArgs[1]).to.be.an('object');
						const poolArg = callArgs[0];
						expect(poolArg.create).to.be.a('function');
						expect(poolArg.destroy).to.be.a('function');
						expect(poolArg.validate).to.be.a('function');

						expect(await poolArg.create()).to.be.equal(workerInstance);

						sinon.assert.calledOnce(Worker);
						callArgs = Worker.getCall(0).args;
						expect(callArgs[0]).to.be.equal(script);

						expect(workerInstance.exitCode).to.be.equal(null);
						expect(workerInstance.error).to.be.equal(null);
						expect(workerInstance.waitMessage).to.be.a('function');

						sinon.assert.calledOnce(workerInstance.setMaxListeners);
						callArgs = workerInstance.setMaxListeners.getCall(0).args;
						expect(callArgs[0]).to.be.equal(Infinity);

						sinon.assert.calledTwice(workerInstance.once);
						callArgs = workerInstance.once.getCall(0).args;
						expect(callArgs[0]).to.be.equal('exit');
						expect(callArgs[1]).to.be.a('function');
						callArgs[1](1);
						expect(workerInstance.exitCode).to.be.equal(1);

						callArgs = workerInstance.once.getCall(1).args;
						expect(callArgs[0]).to.be.equal('error');
						expect(callArgs[1]).to.be.a('function');
						const error: any = Symbol();
						callArgs[1](error);
						expect(workerInstance.error).to.be.equal(error);

						const method: any = Symbol();
						let task: any = {
							id: Symbol(),
						};
						const result: any =  Symbol();

						workerInstance.once = sinon.spy((id, callback) => {
							callback(null, result);
						});

						expect(await workerInstance.waitMessage(method, task)).to.be.equal(result);

						sinon.assert.calledOnce(workerInstance.postMessage);
						callArgs = workerInstance.postMessage.getCall(0).args;
						expect(callArgs[0]).to.be.an('object');
						expect(callArgs[1]).to.be.an('array');

						const callbackError: any = Symbol();

						workerInstance.once = sinon.spy((id, callback) => {
							callback(callbackError);
						});

						let catchError: any = null;
						try {
							await workerInstance.waitMessage(method, task);
						} catch (error) {
							catchError = error;
						}
						expect(catchError).to.be.equal(callbackError);

						workerInstance.once = sinon.stub();

						task.deadline = 500;
						workerInstance.once = sinon.spy(() => {
							clock.tick(510);
						});

						try {
							await workerInstance.waitMessage(method, task);
						} catch (error) {
							catchError = error;
						}
						expect(catchError).to.be.instanceOf(Error);

						sinon.assert.calledOnce(workerInstance.removeAllListeners);
						callArgs = workerInstance.removeAllListeners.getCall(0).args;
						expect(callArgs[0]).to.be.equal(task.id);

						expect(poolInstance.getMethod).to.be.a('function');

						const methodCaller = poolInstance.getMethod(method);
						expect(methodCaller).to.be.a('function');

						task = {
							id: Symbol(),
							releaseBefore: true,
						};

						workerInstance.waitMessage = sinon.stub().resolves();

						await methodCaller(task);

						sinon.assert.calledOnce(poolInstance.acquire);

					},
				);

			},
		);

		describe(
			'exposeWorker',
			() => {

				it(
					'Should expose worker methods',
					async () => {

						const mockedPromise: any = {};
						mockedPromise.then = sinon.stub().returns(mockedPromise);
						mockedPromise.catch = sinon.stub();
						const methods: any = {
							mymethod: sinon.stub().returns(mockedPromise),
						};

						index.exposeWorker(methods);

						let callArgs: any;

						sinon.assert.calledOnce(parentPort.on);
						callArgs = parentPort.on.getCall(0).args;
						expect(callArgs[0]).to.be.equal('message');
						expect(callArgs[1]).to.be.a('function');

						const taskProcessor: any = callArgs[1];

						taskProcessor('hello');

						sinon.assert.notCalled(parentPort.postMessage);

						taskProcessor({
							isTask: true,
							id: Symbol(),
							method: 'notmethod',
						});

						sinon.assert.calledOnce(parentPort.postMessage);
						sinon.assert.calledOnce(serializeError);

						serializeError.reset();
						parentPort.postMessage.reset();

						taskProcessor({
							isTask: true,
							id: Symbol(),
							method: 'mymethod',
						});

						sinon.assert.calledOnce(mockedPromise.then);
						sinon.assert.calledOnce(mockedPromise.catch);

						callArgs = mockedPromise.then.getCall(0).args;
						expect(callArgs[0]).to.be.a('function');

						callArgs[0]({});

						sinon.assert.calledOnce(parentPort.postMessage);

						parentPort.postMessage.reset();

						callArgs = mockedPromise.catch.getCall(0).args;
						expect(callArgs[0]).to.be.a('function');

						const error: any = new Error();
						callArgs[0](error);

						sinon.assert.calledOnce(serializeError);
						callArgs = serializeError.getCall(0).args;
						expect(callArgs[0]).to.be.equal(error);

						sinon.assert.calledOnce(parentPort.postMessage);

					},
				);

			},
		);

	},
);
