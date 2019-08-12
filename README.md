# HFXWorker

**HFXWorker** is a worker_threads pool implementation that supports passing buffers.

* Focused on performance
* Uses [generic-pool](https://www.npmjs.com/package/generic-pool)
* Unit and E2E tested

```bash
npm install --save hfxworker
```

----------------------

## Quick Start

Create a file named `pool.js`:

```typescript
import { createWorkerPool } from 'hfxworker';
import path from 'path';

const execute = async () => {

	const pool = createWorkerPool(
		path.join(__dirname, 'worker.js')
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
	
	console.log(Buffer.from(result.buffers.c).readUInt32LE(0));
	console.log(result.data.c);

	await pool.drain();
	await pool.clear();

}

execute().catch((error) => console.error(error));
```

And another file as **worker.js**:

```typescript
import { exposeWorker } from 'hfxworker';

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
```

Now you just need to run `node pool.js`!

----------------------

## API Documentation

Your can learn more about HFXWorker API [clicking here](https://github.com/gamaops/hfx-worker/blob/master/API.md).

----------------------

## Related Projects

* [HFXBus](https://github.com/gamaops/hfx-bus) - Redis backed high frequency exchange bus for NodeJS.
* [HFXEventStash](https://github.com/gamaops/hfx-eventstash) - A high performance event store to persist commands (CQRS).