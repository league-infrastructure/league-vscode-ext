
/**
 * @file FixedQueue.ts
 * @description Fixed size queue for computing running averages. The queue is
 * needed instead of a cumulative average, because we want to the average to 
 * be zero when the last use report is older than the averaging window. 
 */
class FixedQueue<T> {
	protected queue: T[];
	private maxSize: number;

	constructor(maxSize: number) {
		this.queue = [];
		this.maxSize = maxSize;
	}

	enqueue(item: T): void {
		if (this.queue.length >= this.maxSize) {
			this.queue.pop();
		}
		this.queue.unshift(item);
	}

	dequeue(): T | undefined {
		return this.queue.pop();
	}

	getItems(): T[] {
		return this.queue;
	}
}

class NumberQueue extends FixedQueue<number> {
	constructor(maxSize: number) {
		super(maxSize);
	}

	sum(len: number | undefined = undefined): number {
		const itemsToSum = len !== undefined ? this.queue.slice(0, len) : this.queue;
		return itemsToSum.reduce((acc, curr) => acc + curr, 0);
	}
}

export { FixedQueue, NumberQueue };
