export class LogTailBuffer {
	private readonly lines: string[] = [];

	constructor(private readonly maxLines: number) {}

	append(prefix: string, chunk: string): void {
		const split = chunk.split(/\r?\n/);
		for (const rawLine of split) {
			const line = rawLine.trimEnd();
			if (!line) {
				continue;
			}
			this.lines.push(`[${prefix}] ${line}`);
			if (this.lines.length > this.maxLines) {
				this.lines.shift();
			}
		}
	}

	snapshot(): string[] {
		return [...this.lines];
	}
}

export function normalizeReason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
