const { exposeWorker } = require('../../build/index.js');

exposeWorker({
	sum: async (task) => {
		const c = task.data.a + Buffer.from(task.buffers.b).readUInt32LE(0);
		const cBuffer = Buffer.from([0, 0, 0, 0]);
		cBuffer.writeUInt32LE(c, 0);
		return {
			data: {
				c
			},
			buffers: {
				c: cBuffer
			}
		};
	}
});