import { expect } from 'chai';
import path from 'path';
import { createWorkerPool } from '../../src';

describe(
	'pool',
	() => {

		it(
			'Should execute task',
			async () => {

				const pool = createWorkerPool(
					path.join(__dirname, 'worker.js'),
				);

				const sum = pool.getMethod('sum');

				const b = Buffer.from([0, 0, 0, 0]);
				b.writeUInt32LE(2, 0);

				const result = await sum({
					releaseBefore: false,
					data: {
						a: 1,
					},
					buffers: {
						b,
					},
				});

				expect(result.data.c).to.be.equal(3);
				expect(Buffer.from(result.buffers.c).readUInt32LE(0)).to.be.equal(3);

				await pool.drain();
				await pool.clear();

			},
		);

	},
);
