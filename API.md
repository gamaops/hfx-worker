# HFXWorker API Documentation

### Content

* [ITask](#ITask) tasks interfaces
* [createWorkerPool](#createWorkerPool) creates a new worker threads pool
* [pool.getMethod](#pool+getMethod) returns a method caller function
* [exposeWorker](#exposeWorker) exposes worker methods

----------------------

<a name="ITask"></a>

## ITask

```typescript
interface ITask {
	id?: string;
	releaseBefore?: boolean;
	data?: { [key: string]: any };
	buffers?: { [key: string]: BufferLike };
	deadline?: number;
	isTask?: boolean;
}
```

ITask is the interface of tasks to be dispatched by pool for workers.

**Properties**

* **id** - The id of the task, if you don't specify an id one will be generated.
* **releaseBefore** - When you send a task to a worker you can set this parameter to `true` to release the worker from the pool before sending the job, this is useful if the job will not block the code execution, the default value is `false` which will release the worker only after the task's completion.
* **data** - An object with arbitrary data to pass to workers.
* **buffers** - An object with arbitrary buffers to pass to workers, after sent these buffers can't be used.
* **deadline** - An optional number of milliseconds to define a deadline for task's completion, if exceeded an error will be thrown with the `.code` property holding the value `"DEADLINE_EXCEEDED"`.
* **isTask** - Internal field used to identify messages as task.

----------------------

<a name="createWorkerPool"></a>

### createWorkerPool

```typescript
import { createWorkerPool } from 'hfxworker';

const pool = createWorkerPool(scriptPath, options);
```

Creates a new instance of worker pool (see the [generic-pool](https://www.npmjs.com/package/generic-pool) package).

**Arguments**

* **scriptPath** - An script path to be executed as worker, if it's not absolute it will be set as relative to `require.main.filename`.
* **options** - Any option accepted by the **generic-pool** package's `createPool` function.

----------------------

<a name="pool+getMethod"></a>

### pool.getMethod

```typescript
const method = pool.getMethod('method');
const result = await method(task);
```

This is a new method added to **generic-pool** instance implementation which returns an async function to dispatch tasks to worker's exposed methods.

**Arguments**

* **method** - A string with the desired method to send tasks.

----------------------

<a name="exposeWorker"></a>

### exposeWorker

```typescript
import { exposeWorker } from 'hfxworker';

const methods = {
	method: async (task) => {
		return { // The following properties behave like ITask interface defintion
			data: {},
			buffers: {}
		};
	}
};

exposeWorker(methods);
```

Exposes workers methods.

**Arguments**

* **methods** - An object mapping method's names to asynchronous functions returning the result of task's completion, any thrown error will be serialized and rethrown by the pool method's call.